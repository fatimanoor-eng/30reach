// Slice 17c: client settings, archive / restore, permanent delete, manual Add client.
// Writes go straight to the tables (RLS: team full access on clients / client_platforms / client-logos);
// only the permanent delete needs an Edge Function (storage files + the row, `delete-client`).
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth/auth-context";
import {
  type ContentRule,
  initialsFor,
  manualPlatformRows,
  slugify,
  uniqueSlug,
} from "../../lib/client-rules";
import type { Platform } from "../../lib/platforms";
import { callFunction } from "../../lib/pulls/api";
import { supabase } from "../../lib/supabase";
import { compressImage, imageExtension } from "../ideas/compress-image";

export type ClientDetails = {
  id: string;
  slug: string;
  name: string;
  website: string | null;
  description: string | null;
  industry: string | null;
  audience: string | null;
  country: string;
  language: string;
  initials: string | null;
  brand_color: string | null;
  logo_path: string | null;
  regulated: string[];
  audience_is_kids: boolean;
  health_months: boolean;
  content_rules: ContentRule[];
  is_demo: boolean;
  archived_at: string | null;
  archived_by: string | null;
};

export type ClientPlatformRow = {
  platform: string;
  state: "on" | "off";
  source: "website" | "team";
  account_url: string | null;
  account_handle: string | null;
};

const DETAILS =
  "id, slug, name, website, description, industry, audience, country, language, initials, brand_color, logo_path, regulated, audience_is_kids, health_months, content_rules, is_demo, archived_at, archived_by";

export const detailsKey = (id: string | undefined) => ["client-details", id] as const;
export const platformRowsKey = (id: string | undefined) => ["client_platform_rows", id] as const;

/** Everything Client settings shows (16 / M19). */
export function useClientDetails(clientId: string | undefined) {
  return useQuery({
    queryKey: detailsKey(clientId),
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select(DETAILS)
        .eq("id", clientId!)
        .single();
      if (error) throw error;
      const d = data as ClientDetails;
      return { ...d, content_rules: Array.isArray(d.content_rules) ? d.content_rules : [] };
    },
  });
}

export function usePlatformRows(clientId: string | undefined) {
  return useQuery({
    queryKey: platformRowsKey(clientId),
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_platforms")
        .select("platform, state, source, account_url, account_handle")
        .eq("client_id", clientId!);
      if (error) throw error;
      return (data ?? []) as ClientPlatformRow[];
    },
  });
}

/** Everything that shows a client: the switcher, the URL client, settings, tracked platforms. */
export function invalidateClient(queryClient: QueryClient, clientId?: string) {
  void queryClient.invalidateQueries({ queryKey: ["clients"] });
  void queryClient.invalidateQueries({ queryKey: ["client"] });
  if (clientId) {
    void queryClient.invalidateQueries({ queryKey: detailsKey(clientId) });
    void queryClient.invalidateQueries({ queryKey: platformRowsKey(clientId) });
    void queryClient.invalidateQueries({ queryKey: ["client_platforms", clientId] });
  }
}

export type ClientPatch = Partial<
  Pick<
    ClientDetails,
    | "name"
    | "website"
    | "description"
    | "industry"
    | "country"
    | "language"
    | "initials"
    | "brand_color"
    | "logo_path"
    | "regulated"
    | "audience_is_kids"
    | "health_months"
    | "content_rules"
  >
>;

/** Save fields on the client (the slug never changes, so links keep working after a rename). */
export function useUpdateClient(clientId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ClientPatch) => {
      const { error } = await supabase.from("clients").update(patch).eq("id", clientId!);
      if (error) throw error;
    },
    onSuccess: () => invalidateClient(queryClient, clientId),
  });
}

/**
 * Switch a team platform on / off (website-linked ones are always on: a check in the database refuses
 * turning them off). A supported platform without a row gets a team row.
 */
export function useSetPlatform(clientId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ platform, on }: { platform: string; on: boolean }) => {
      const { error } = await supabase
        .from("client_platforms")
        .upsert(
          { client_id: clientId!, platform, state: on ? "on" : "off", source: "team" },
          { onConflict: "client_id,platform", ignoreDuplicates: false },
        );
      if (error) throw error;
    },
    onSuccess: () => invalidateClient(queryClient, clientId),
  });
}

/** Archive (16b) or restore (16c). Archived clients keep all their data. */
export async function setArchived(clientId: string, archived: boolean, userId: string | null) {
  const { error } = await supabase
    .from("clients")
    .update(
      archived
        ? { archived_at: new Date().toISOString(), archived_by: userId }
        : { archived_at: null, archived_by: null },
    )
    .eq("id", clientId);
  if (error) throw error;
}

export class DeleteClientError extends Error {
  constructor(public code: "running" | "not_archived" | "failed") {
    super(code);
  }
}

/** Permanent delete (16d): `delete-client` removes the files, then the row (everything cascades). */
export async function deleteClient(clientId: string, confirmName: string) {
  const res = await callFunction<{ deleted: boolean; name: string }>("delete-client", {
    clientId,
    confirmName,
  });
  if (res.ok) return res.data;
  const code = res.data?.error;
  if (code === "pull_running") throw new DeleteClientError("running");
  if (code === "not_archived") throw new DeleteClientError("not_archived");
  throw new DeleteClientError("failed");
}

export type ClientCounts = {
  competitors: number;
  pulls: number;
  posts: number;
  ideas: number;
  cards: number;
};

/** What a permanent delete removes (16d reads them out). Counted when the dialog opens. */
export function useClientCounts(clientId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["client-counts", clientId],
    enabled: enabled && !!clientId,
    staleTime: 0,
    queryFn: async (): Promise<ClientCounts> => {
      const count = async (table: string, saved = false) => {
        let q = supabase
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId!);
        if (saved) q = q.eq("is_test", false).in("status", ["done", "partial"]);
        const { count: n, error } = await q;
        if (error) throw error;
        return n ?? 0;
      };
      const [competitors, pulls, posts, ideas, cards] = await Promise.all([
        count("competitors"),
        count("pulls", true),
        count("posts"),
        count("ideas"),
        count("calendar_cards"),
      ]);
      return { competitors, pulls, posts, ideas, cards };
    },
  });
}

/** Archived clients' "· Fatima" (16c): names of whoever archived them, by profile id. */
export function useProfileNames(ids: string[]) {
  const { status } = useAuth();
  const unique = [...new Set(ids)].sort();
  return useQuery({
    queryKey: ["profile-names", ...unique],
    enabled: status === "team" && unique.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", unique);
      if (error) throw error;
      return new Map(
        ((data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map(
          (p) => [p.id, p],
        ),
      );
    },
  });
}

/** Logo: compressed (rasters → WebP ≤ 200 KB, CLAUDE.md rule 8; SVG kept as is, ≤ 200 KB). */
export async function uploadLogo(clientId: string, file: File): Promise<string> {
  let blob: Blob = file;
  let ext = "svg";
  if (file.type === "image/svg+xml") {
    if (file.size > 200 * 1024) throw new Error("too_big");
  } else {
    const compressed = await compressImage(file);
    blob = compressed.blob;
    ext = imageExtension(compressed.blob.type);
  }
  const path = `${clientId}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("client-logos")
    .upload(path, blob, { contentType: blob.type || file.type, upsert: false });
  if (error) throw error;
  return path;
}

/** Signed URL for a logo in the private client-logos bucket (an hour; cached). */
export function useLogoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["client-logo", path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("client-logos")
        .createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export type NewClient = {
  name: string;
  website: string;
  country: string;
  industry: string | null;
  accounts: Partial<Record<Platform | "x", string | null>>;
};

/**
 * Manual Add client (15f): the client row (slug from the name, "-2" if taken; renaming later keeps it)
 * and its platforms. A clash with a slug someone just took is retried once.
 */
export async function createClient(input: NewClient, userId: string | null) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: taken, error: slugError } = await supabase.from("clients").select("slug");
    if (slugError) throw slugError;
    const slug = uniqueSlug(
      slugify(input.name),
      ((taken ?? []) as { slug: string }[]).map((c) => c.slug),
    );
    const { data, error } = await supabase
      .from("clients")
      .insert({
        name: input.name,
        initials: initialsFor(input.name),
        slug,
        website: input.website,
        country: input.country,
        language: "en",
        industry: input.industry,
        created_by: userId,
      })
      .select("id, slug, name")
      .single();
    if (error?.code === "23505") continue;
    if (error || !data) throw error ?? new Error("insert_failed");
    const client = data as { id: string; slug: string; name: string };
    const { error: platformsError } = await supabase
      .from("client_platforms")
      .insert(manualPlatformRows(input.accounts).map((r) => ({ ...r, client_id: client.id })));
    if (platformsError) {
      await supabase.from("clients").delete().eq("id", client.id); // nothing half-made
      throw platformsError;
    }
    return client;
  }
  throw new Error("slug_taken");
}

/** The Demo client (Slice 17f): create it, or replace its made-up data with fresh data dated from today. */
export function useResetDemo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await callFunction<{ slug: string; created: boolean }>("reset-demo", {});
      if (!res.ok) throw new Error("demo_failed");
      return res.data;
    },
    // Everything about the demo changed: clients, its pulls, posts, ideas, cards.
    onSuccess: () => void queryClient.invalidateQueries(),
  });
}
