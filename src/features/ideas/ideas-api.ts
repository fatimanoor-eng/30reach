import { useQuery, type QueryKey } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useClient } from "../../lib/useClient";
import type { Idea, IdeaKind, IdeaPlatform } from "./idea-rules";

export const IDEA_BUCKET = "idea-images";

// creator: ideas.created_by → profiles. planned: ideas.planned_card_id → calendar_cards, named by its
// foreign key because calendar_cards.idea_id links the same two tables the other way.
// Both are many-to-one, so PostgREST returns one object (supabase-js without generated types
// guesses an array, hence the cast).
const COLUMNS =
  "id, kind, note, image_path, link_url, source_snapshot, platform, format, tags, planned_card_id, created_at, creator:profiles(full_name), planned:calendar_cards!ideas_planned_card_fk(id, date)";

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
  /** Already compressed WebP (compress-image.ts). */
  image?: Blob | null;
};

/**
 * Saves an idea. With an image: the id is made here so the file can be stored at
 * {client_id}/{id}.webp first; if saving the row then fails, the file is removed again.
 */
export async function createIdea(clientId: string, idea: NewIdea): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  let imagePath: string | null = null;

  if (idea.image) {
    imagePath = `${clientId}/${id}.webp`;
    const { error } = await supabase.storage
      .from(IDEA_BUCKET)
      .upload(imagePath, idea.image, { contentType: "image/webp", upsert: false });
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
  });
  if (error) {
    if (imagePath) await supabase.storage.from(IDEA_BUCKET).remove([imagePath]);
    throw error;
  }
  return { id };
}
