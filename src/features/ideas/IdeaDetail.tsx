import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, CalendarDays, ExternalLink } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Drawer } from "../../components/Drawer";
import { PLATFORM_ICON, PLATFORM_NAME } from "../../lib/platforms";
import { Tooltip } from "../../components/Tooltip";
import { useToast } from "../../components/toast-context";
import { useAuth } from "../../lib/auth/auth-context";
import { useProfile } from "../../lib/auth/useProfile";
import { initialsFor } from "../../lib/auth/domain";
import { formatCompact, formatShortDate } from "../../lib/format";
import { useClient } from "../../lib/useClient";
import { AiTag } from "../calendar/CardTile";
import {
  canDeleteIdea,
  UNDO_MS,
  deleteBlockedMessage,
  formatLabel,
  ideaAge,
  ideaAuthor,
  ideaText,
  likesWord,
  plannedLabel,
  type Idea,
} from "./idea-rules";
import { cancelImageDelete, finishImageDelete, holdImageDelete } from "./pending-image-deletes";
import {
  addComment,
  COMMENT_MAX,
  commentsKey,
  deleteIdea,
  DeleteError,
  restoreIdea,
  type DeletedIdea,
  ideasKey,
  updateIdeaTags,
  useIdeaComments,
} from "./ideas-api";
import { PlanIt } from "./PlanIt";
import { TagEditor } from "./TagEditor";

/** How long "Deleted the idea · Undo" stays. */

const KIND_LABEL: Record<Idea["kind"], string> = {
  screenshot: "SCREENSHOT",
  link: "LINK",
  note: "NOTE",
  post: "POST",
  ai: "AI IDEA",
};

/**
 * 14c idea detail: drawer from 768 px (full-screen page with "‹ Ideas" on phones).
 * Meta line, the full image (not cropped), the source (link / competitor post), the note, tags
 * (editable, saved straight away), team comments, then "Delete idea" (shared confirm) and
 * "Plan it" (14d), or "Planned · {date}" linking to the card once it's on the calendar.
 */
export function IdeaDetail({
  idea,
  imageUrl,
  onClose,
  onDeleted,
  planOnOpen = false,
}: {
  idea: Idea;
  imageUrl?: string;
  onClose: () => void;
  /** After a delete: the page closes the drawer and won't report the idea as missing. */
  onDeleted: (id: string) => void;
  /** Opened from a tile's "Plan it": start with the plan popover open. */
  planOnOpen?: boolean;
}) {
  const client = useClient();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [planOpen, setPlanOpen] = useState(planOnOpen && !idea.planned);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const snap = idea.source_snapshot;
  const text = ideaText(idea);
  const listKey = ideasKey(client.data?.id);

  // Tags: shown straight away, put back if saving fails.
  const tags = useMutation({
    mutationFn: (next: string[]) => updateIdeaTags(idea.id, next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const before = queryClient.getQueryData<Idea[]>(listKey);
      queryClient.setQueryData<Idea[]>(listKey, (list) =>
        list?.map((i) => (i.id === idea.id ? { ...i, tags: next } : i)),
      );
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) queryClient.setQueryData(listKey, ctx.before);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["ideas"] }),
  });

  // Who may delete: the person who added it, or an admin (the database enforces the same rule).
  const { user } = useAuth();
  const profile = useProfile();
  const isAdmin = profile.data?.role === "admin";
  const [refused, setRefused] = useState(false); // the server said no (403)
  const mayDelete =
    !refused && (profile.isPending || canDeleteIdea(idea, user?.id ?? null, isAdmin));
  const blockedMessage = deleteBlockedMessage(idea);

  const remove = useMutation({
    mutationFn: () => deleteIdea(idea),
    onSuccess: (deleted) => {
      setConfirmOpen(false);
      onDeleted(idea.id);
      void queryClient.invalidateQueries({ queryKey: ["ideas"] });
      void queryClient.invalidateQueries({ queryKey: ["calendar_cards"] });
      offerUndo(deleted);
    },
    onError: (err) => {
      if (err instanceof DeleteError && err.reason === "not-allowed") setRefused(true);
    },
  });

  /**
   * "Deleted the idea · Undo" for ~10 s. The image stays until the toast goes, so Undo brings it
   * back too; then it's removed (pending-image-deletes.ts covers a page closed in between).
   */
  function offerUndo(deleted: DeletedIdea) {
    const path = deleted.imagePath;
    if (path) holdImageDelete(path);
    const undo = async () => {
      if (path) cancelImageDelete(path);
      try {
        await restoreIdea(deleted.snapshot);
        void queryClient.invalidateQueries({ queryKey: ["ideas"] });
        void queryClient.invalidateQueries({ queryKey: ["calendar_cards"] });
        toast.show({ title: "Restored the idea", pose: "success" });
      } catch {
        if (path) void finishImageDelete(path);
        toast.show({ title: "Couldn’t undo. The idea stays deleted.", pose: "error" });
      }
    };
    toast.show({
      title: "Deleted the idea",
      pose: "success",
      durationMs: UNDO_MS,
      action: { label: "Undo", onClick: () => void undo() },
      onDismiss: (reason) => {
        if (reason !== "action" && path) void finishImageDelete(path);
      },
    });
  }

  const PlatformIcon = idea.platform ? PLATFORM_ICON[idea.platform] : null;
  const kind =
    idea.kind === "post" && snap?.brand
      ? `FROM ${snap.brand.toUpperCase()}`
      : KIND_LABEL[idea.kind];
  const header = (
    <p className="flex min-h-11 items-center gap-2 mono-label text-muted md:min-h-5">
      {PlatformIcon && (
        <PlatformIcon
          size={16}
          role="img"
          aria-hidden={false}
          aria-label={idea.platform ? PLATFORM_NAME[idea.platform] : undefined}
          className="shrink-0 text-ink"
        />
      )}
      {idea.kind === "ai" && <AiTag />}
      <span className="whitespace-pre-wrap">
        {[kind, ideaAuthor(idea), ideaAge(idea.created_at)].join("  ·  ")}
      </span>
    </p>
  );

  const footer = (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        {mayDelete ? (
          <button
            type="button"
            onClick={() => {
              remove.reset();
              setConfirmOpen(true);
            }}
            className="min-h-11 text-body-sm font-medium text-spark hover:underline"
          >
            Delete idea
          </button>
        ) : (
          // Shown but not usable: the shared board only lets the creator or an admin delete.
          <Tooltip content={blockedMessage}>
            {(tip) => (
              <button
                type="button"
                aria-disabled="true"
                aria-describedby={tip["aria-describedby"]}
                onClick={tip.onToggle}
                className="min-h-11 cursor-not-allowed text-body-sm font-medium text-muted"
              >
                Delete idea
              </button>
            )}
          </Tooltip>
        )}
        {idea.planned ? (
          <Link
            to={`/calendar?date=${idea.planned.date}&card=${idea.planned.id}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line px-4 text-body-sm font-medium hover:bg-soft md:min-h-10"
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-fresh" />
            Planned · {plannedLabel(idea.planned.date)}
          </Link>
        ) : (
          <div className="relative">
            <Button
              data-plan-anchor
              aria-expanded={planOpen}
              icon={<CalendarDays size={16} aria-hidden="true" />}
              onClick={() => setPlanOpen((o) => !o)}
            >
              Plan it
            </Button>
            <PlanIt
              idea={idea}
              open={planOpen}
              onClose={() => setPlanOpen(false)}
              onPlanned={onClose}
            />
          </div>
        )}
      </div>
      {!mayDelete && <p className="text-small text-muted">{blockedMessage}</p>}
    </div>
  );

  return (
    <Drawer open onClose={onClose} title="Idea" header={header} footer={footer} backLabel="Ideas">
      <div className="flex flex-col gap-4">
        {idea.image_path &&
          (imageUrl ? (
            <img
              src={imageUrl}
              alt={text ? "" : `${KIND_LABEL[idea.kind].toLowerCase()} image`}
              className="max-h-[50dvh] w-full rounded-control bg-soft object-contain md:max-h-90"
            />
          ) : (
            <div className="h-60 rounded-control bg-soft motion-safe:animate-pulse" />
          ))}

        {idea.kind === "link" && idea.link_url && (
          <a
            href={idea.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 font-mono text-small break-all text-blue hover:underline md:min-h-0"
          >
            {idea.link_url}
            <ExternalLink size={14} aria-hidden="true" className="shrink-0" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}

        {idea.kind === "post" && snap && (
          <div className="flex flex-col gap-1 rounded-control bg-bg px-3 py-2.5">
            <p className="mono-label text-muted">
              {[snap.brand, formatLabel(snap.format), formatShortDate(snap.date)]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {snap.caption && snap.caption !== idea.note && (
              <p className="line-clamp-3 text-small">{snap.caption}</p>
            )}
            <p className="flex flex-wrap items-center gap-x-3 text-small text-muted">
              {snap.likes != null && (
                <span>
                  {formatCompact(snap.likes)} {likesWord(idea.platform)}
                </span>
              )}
              {snap.comments != null && <span>{formatCompact(snap.comments)} comments</span>}
              {snap.url && (
                <a
                  href={snap.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-blue hover:underline md:min-h-0"
                >
                  Open post <ExternalLink size={12} aria-hidden="true" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </p>
          </div>
        )}

        {idea.note && (
          <p className="text-card font-medium break-words whitespace-pre-line">{idea.note}</p>
        )}

        <div>
          <TagEditor tags={idea.tags} onChange={(next) => tags.mutate(next)} />
          {tags.isError && (
            <p role="alert" className="mt-1 text-small text-spark">
              Couldn’t save the tags. Try again.
            </p>
          )}
        </div>

        <Comments ideaId={idea.id} />
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !remove.isPending && setConfirmOpen(false)}
        title="Delete this idea?"
        description={
          idea.planned
            ? "It’s removed from the board for everyone, with its comments. The calendar card made from it stays."
            : "It’s removed from the board for everyone, with its comments."
        }
        confirmLabel={remove.isPending ? "Deleting…" : "Delete idea"}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      >
        {remove.isError && (
          <p role="alert" className="text-center text-small text-spark">
            {remove.error instanceof DeleteError && remove.error.reason === "not-allowed"
              ? blockedMessage
              : remove.error.message}
          </p>
        )}
      </ConfirmDialog>
    </Drawer>
  );
}

/** Team comments (idea_comments), oldest first, and "Add a comment…" (Enter posts, Shift+Enter = new line). */
function Comments({ ideaId }: { ideaId: string }) {
  const comments = useIdeaComments(ideaId);
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const inputId = useId();
  const headingId = useId();

  const post = useMutation({
    mutationFn: () => addComment(ideaId, body),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: commentsKey(ideaId) });
    },
  });
  const canPost = body.trim() !== "" && !post.isPending;

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canPost) post.mutate();
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 border-t border-line pt-3.5"
    >
      <h3 id={headingId} className="mono-label text-muted">
        Comments
      </h3>
      {comments.isPending ? (
        <div
          aria-busy="true"
          aria-label="Loading comments"
          className="skeleton-delay flex flex-col gap-3"
        >
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-2.5">
              <div className="size-6 rounded-full bg-soft motion-safe:animate-pulse" />
              <div className="h-8 flex-1 rounded-control bg-soft motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      ) : comments.isError ? (
        <p className="text-small text-muted">
          Comments didn’t load.{" "}
          <button
            type="button"
            onClick={() => void comments.refetch()}
            className="min-h-11 text-blue hover:underline md:min-h-0"
          >
            Try again
          </button>
        </p>
      ) : comments.data.length === 0 ? (
        <p className="text-small text-muted">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.data.map((c) => {
            const name = c.author?.full_name?.trim() || "Team";
            return (
              <li key={c.id} className="flex gap-2.5">
                <Avatar initials={initialsFor(name, "?").slice(0, 1)} tone="user" />
                <div className="min-w-0 text-small">
                  <p className="font-medium">{name.split(/\s+/)[0]}</p>
                  <p className="break-words whitespace-pre-line">{c.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-end gap-2 rounded-control border border-line px-3 focus-within:border-ink">
        <label htmlFor={inputId} className="sr-only">
          Add a comment
        </label>
        <textarea
          id={inputId}
          rows={1}
          value={body}
          maxLength={COMMENT_MAX}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Add a comment…"
          className="[field-sizing:content] max-h-40 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-small outline-none placeholder:text-muted md:min-h-9 md:py-2"
        />
        {body.trim() && (
          <button
            type="button"
            onClick={() => post.mutate()}
            disabled={!canPost}
            aria-label="Post comment"
            className="mb-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-white disabled:opacity-40 md:mb-0.5 md:size-7"
          >
            <ArrowUp size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      {post.isError && (
        <p role="alert" className="-mt-1.5 text-small text-spark">
          Couldn’t post the comment. Check your connection and try again.
        </p>
      )}
    </section>
  );
}
