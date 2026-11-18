import { useQuery, type QueryKey } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useClient } from "../../lib/useClient";
import { compressImage, imageExtension, type Compressed } from "./compress-image";
import type { Idea, IdeaKind, IdeaPlatform, SourceSnapshot } from "./idea-rules";

export const IDEA_BUCKET = "idea-images";

// creator: ideas.created_by → profiles. planned: ideas.planned_card_id → calendar_cards, named by its
// foreign key because calendar_cards.idea_id links the same two tables the other way.
// Both are many-to-one, so PostgREST returns one object (supabase-js without generated types
// guesses an array, hence the cast).
const COLUMNS =
  "id, kind, note, image_path, image_width, image_height, link_url, source_snapshot, platform, format, tags, planned_card_id, created_at, creator:profiles(full_name), planned:calendar_cards!ideas_planned_card_fk(id, date)";

export const ideasKey = (clientId: string | undefined): QueryKey => ["ideas", clientId];

/** The client's ideas, newest first. RLS: the team has full access. */
export function useIdeas() {
  const client = useClient();
  const clientId = client.data?.id;
  return useQuery({
    queryKey: ideasKey(clientId),
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ideas")
        .select(COLUMNS)
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Idea[];
    },
  });
}

/** Signed URLs (1 hour) for idea images in the private bucket, keyed by path. */
export function useIdeaImages(paths: string[]) {
  const key = [...new Set(paths)].sort();
  return useQuery({
    queryKey: ["idea-images", key],
    enabled: key.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(IDEA_BUCKET).createSignedUrls(key, 3600);
      if (error) throw error;
      return new Map((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path!, d.signedUrl]));
    },
  });
}

export type NewIdea = {
  kind: IdeaKind;
  note: string | null;
  link_url?: string | null;
  platform?: IdeaPlatform | null;
  format?: string | null;
  tags: string[];
  /** Already compressed WebP or JPEG (compress-image.ts), with its pixel size. */
  image?: Blob | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  /** Saved from a competitor's post (06d): the post, and a copy of what it said. */
  source_post_id?: string | null;
  source_snapshot?: SourceSnapshot | null;
};

/**
 * Saves an idea. With an image: the id is made here so the file can be stored at
 * {client_id}/{id}.webp (or .jpg when the browser can't make WebP) first; if saving the row then fails, the file is removed again.
 */
export async function createIdea(clientId: string, idea: NewIdea): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  let imagePath: string | null = null;

  if (idea.image) {
    imagePath = `${clientId}/${id}.${imageExtension(idea.image.type)}`;
    const { error } = await supabase.storage
      .from(IDEA_BUCKET)
      .upload(imagePath, idea.image, { contentType: idea.image.type, upsert: false });
    if (error) throw error;
  }

  const { error } = await supabase.from("ideas").insert({
    id,
    client_id: clientId,
    kind: idea.kind,
    note: idea.note,
    link_url: idea.link_url ?? null,
    platform: idea.platform ?? null,
    format: idea.format ?? null,
    tags: idea.tags,
    image_path: imagePath,
    image_width: imagePath ? (idea.imageWidth ?? null) : null,
    image_height: imagePath ? (idea.imageHeight ?? null) : null,
    source_post_id: idea.source_post_id ?? null,
    source_snapshot: idea.source_snapshot ?? null,
  });
  if (error) {
    if (imagePath) await supabase.storage.from(IDEA_BUCKET).remove([imagePath]);
    throw error;
  }
  return { id };
}

// ───────────────────────────── comments (14c)

export type IdeaComment = {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  author: { full_name: string | null } | null;
};

export const commentsKey = (ideaId: string | null): QueryKey => ["idea_comments", ideaId];

/** An idea's team comments, oldest first. RLS: the team has full access. */
export function useIdeaComments(ideaId: string | null) {
  return useQuery({
    queryKey: commentsKey(ideaId),
    enabled: !!ideaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("idea_comments")
        .select("id, body, created_at, author_id, author:profiles(full_name)")
        .eq("idea_id", ideaId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as IdeaComment[];
    },
  });
}

export const COMMENT_MAX = 1000;

/** author_id defaults to auth.uid() in the database. */
export async function addComment(ideaId: string, body: string): Promise<void> {
  const { error } = await supabase
    .from("idea_comments")
    .insert({ idea_id: ideaId, body: body.trim().slice(0, COMMENT_MAX) });
  if (error) throw error;
}

// ───────────────────────────── edit / delete (14c)

export async function updateIdeaTags(id: string, tags: string[]): Promise<void> {
  const { error } = await supabase.from("ideas").update({ tags }).eq("id", id);
  if (error) throw error;
}

/**
 * Deletes the idea (its comments go with it; a calendar card made from it stays and just loses the
 * link), then its image. The row goes first: if that fails nothing is lost. If only the image
 * removal fails, the file is left behind (no one can reach it) rather than failing the delete.
 */
export async function deleteIdea(idea: Pick<Idea, "id" | "image_path">): Promise<void> {
  const { error } = await supabase.from("ideas").delete().eq("id", idea.id);
  if (error) throw error;
  if (idea.image_path) await supabase.storage.from(IDEA_BUCKET).remove([idea.image_path]);
}

// ───────────────────────────── Plan it (14d) → plan_idea (migration *_plan_idea.sql)

export class PlanError extends Error {
  constructor(
    message: string,
    readonly reason: "already-planned" | "not-found" | "other",
  ) {
    super(message);
    this.name = "PlanError";
  }
}

/**
 * Creates the calendar card (status Idea, linked to the idea) and marks the idea Planned, in one
 * database transaction. Returns the new card's id and day.
 */
export async function planIdea(args: {
  ideaId: string;
  date: string;
  platform: IdeaPlatform | null;
  format: string | null;
  title: string;
}): Promise<{ id: string; date: string }> {
  const { data, error } = await supabase.rpc("plan_idea", {
    p_idea_id: args.ideaId,
    p_date: args.date,
    p_platform: args.platform,
    p_format: args.format,
    p_title: args.title,
  });
  if (error) {
    if (error.message.includes("idea_already_planned"))
      throw new PlanError("This idea is already on the calendar.", "already-planned");
    if (error.message.includes("idea_not_found"))
      throw new PlanError("This idea isn’t on the board any more.", "not-found");
    throw new PlanError("Couldn’t plan it. Check your connection and try again.", "other");
  }
  const card = data as { id: string; date: string };
  return { id: card.id, date: card.date };
}

/**
 * A copy of a post's thumbnail for an idea (CLAUDE.md rule 7: old pulls and their thumbnails are
 * deleted, so the idea keeps its own). Reads the signed thumbnail URL and compresses it like any
 * other image. Null if there's no thumbnail or it can't be read: the idea is then saved without one.
 */
export async function copyThumbnail(url: string | undefined): Promise<Compressed | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await compressImage(await res.blob());
  } catch {
    return null;
  }
}
