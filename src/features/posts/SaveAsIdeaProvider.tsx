import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useId, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { Chip } from "../../components/Chip";
import { ResponsiveDialog } from "../../components/ResponsiveDialog";
import { useToast } from "../../components/toast-context";
import { appPathOf } from "../../lib/client-path";
import { formatShortDate } from "../../lib/format";
import { useClient, useClientPath } from "../../lib/useClient";
import { PLATFORM_LABEL } from "../calendar/calendar-ui";
import { formatLabel, type SourceSnapshot } from "../ideas/idea-rules";
import { copyThumbnail, createIdea } from "../ideas/ideas-api";
import { TagEditor } from "../ideas/TagEditor";
import { SaveAsIdeaContext, type SaveablePost } from "./save-as-idea";

const NOTE_MAX = 2000;

/** Where a post was saved from, for "SAVED FROM OVERVIEW" on the board. */
function savedFrom(pathname: string): string | undefined {
  const page = appPathOf(pathname).split("/")[1];
  return ["overview", "instagram", "tiktok", "linkedin", "facebook"].includes(page)
    ? page
    : undefined;
}

/**
 * One "Save to idea board" dialog for the whole app (06d centred dialog; M10 bottom sheet on
 * phones). The post is attached; "Your idea" is the note; platform and format are filled in from
 * the post (ink chips), "+ tag" adds more. Saving keeps a `source_snapshot` (brand, date, caption,
 * link, numbers), so the idea keeps its context after old pulls are deleted, and a copy of the
 * thumbnail in idea-images. Then: "Saved to idea board · Open".
 */
export function SaveAsIdeaProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<(SaveablePost & { from?: string }) | null>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const client = useClient();
  const path = useClientPath();
  const queryClient = useQueryClient();
  const toast = useToast();
  const noteId = useId();

  const openFor = useCallback(
    (p: SaveablePost) => {
      setTarget({ ...p, from: savedFrom(pathname) });
      setNote("");
      setTags([]);
      setOpen(true);
    },
    [pathname],
  );

  const save = useMutation({
    mutationFn: async () => {
      const { post, brandName, thumbUrl, from } = target!;
      const image = await copyThumbnail(thumbUrl);
      const snapshot: SourceSnapshot = {
        brand: brandName,
        date: post.posted_at ?? undefined,
        caption: post.caption,
        url: post.url,
        format: post.format,
        likes: post.counts_hidden ? null : post.likes,
        comments: post.comments,
        saved_from: from,
      };
      const saved = await createIdea(client.data!.id, {
        kind: "post",
        note: note.trim() || null,
        platform: post.platform,
        format: post.format,
        tags,
        image: image?.blob ?? null,
        imageWidth: image?.width ?? null,
        imageHeight: image?.height ?? null,
        source_post_id: post.id,
        source_snapshot: snapshot,
      });
      return { id: saved.id, copied: !!image || !thumbUrl };
    },
    onSuccess: ({ id, copied }) => {
      setOpen(false); // first: a toast can't be reached under an open dialog
      void queryClient.invalidateQueries({ queryKey: ["ideas"] });
      toast.show({
        title: "Saved to idea board",
        detail: copied ? undefined : "The post’s picture couldn’t be copied.",
        pose: "success",
        action: { label: "Open", onClick: () => navigate(path(`/ideas?idea=${id}`)) },
      });
    },
  });

  const post = target?.post;
  const meta = post
    ? [target.brandName, formatLabel(post.format, post.platform), formatShortDate(post.posted_at)]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <SaveAsIdeaContext value={openFor}>
      {children}
      <ResponsiveDialog
        open={open}
        onClose={() => !save.isPending && setOpen(false)}
        title="Save to idea board"
        primary={{
          label: save.isPending ? "Saving…" : "Save idea",
          onClick: () => save.mutate(),
          disabled: save.isPending || !client.data,
        }}
      >
        {post && (
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5 rounded-control bg-bg p-2.5">
              {target.thumbUrl ? (
                <img
                  src={target.thumbUrl}
                  alt=""
                  className="h-12.5 w-10 shrink-0 rounded-[5px] bg-line object-cover"
                />
              ) : (
                <div aria-hidden="true" className="h-12.5 w-10 shrink-0 rounded-[5px] bg-line" />
              )}
              <div className="min-w-0">
                <p className="truncate mono-label text-muted">{meta}</p>
                <p className="line-clamp-2 text-small font-medium">
                  {post.caption?.trim() || "No caption"}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={noteId} className="mono-label text-muted">
                Your idea
              </label>
              <textarea
                id={noteId}
                rows={2}
                autoFocus
                value={note}
                maxLength={NOTE_MAX}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What would OBU’s version be?"
                className="w-full resize-y rounded-control border border-ink bg-surface p-3 text-body-sm outline-none placeholder:text-muted"
              />
            </div>

            <TagEditor
              tags={tags}
              onChange={setTags}
              leading={
                <>
                  <Chip tone="ink">{PLATFORM_LABEL[post.platform]}</Chip>
                  {post.format && <Chip tone="ink">{formatLabel(post.format, post.platform)}</Chip>}
                </>
              }
            />

            {save.isError && (
              <p role="alert" className="text-small text-spark">
                Couldn’t save the idea. Check your connection and try again.
              </p>
            )}
          </div>
        )}
      </ResponsiveDialog>
    </SaveAsIdeaContext>
  );
}
