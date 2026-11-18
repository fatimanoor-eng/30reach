import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Link2 } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { Button } from "../../components/Button";
import { InstagramIcon, TikTokIcon } from "../../components/icons/BrandIcons";
import { useToast } from "../../components/toast-context";
import { useClient } from "../../lib/useClient";
import { useCapture, type Draft } from "./capture-context";
import { normaliseUrl, platformFromUrl } from "./idea-rules";
import { createIdea } from "./ideas-api";
import { TagEditor } from "./TagEditor";

const NOTE_MAX = 2000;
const PLACEHOLDER: Record<Draft["kind"], string> = {
  screenshot: "What caught your eye?",
  link: "What caught your eye?",
  note: "Write your idea",
};

/**
 * 14a "Just pasted" card: yellow outline, the capture (image / link field / nothing for a note),
 * a note, tags, Discard + Save idea. Ctrl/Cmd+Enter in the note saves.
 * A note needs text, a link needs a valid URL, a screenshot needs its image to be ready.
 */
export function DraftCard({ draft, autoFocus }: { draft: Draft; autoFocus: boolean }) {
  const { update, remove } = useCapture();
  const client = useClient();
  const queryClient = useQueryClient();
  const toast = useToast();
  const noteId = useId();
  const linkId = useId();
  const linkErrId = useId();

  const linkRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Focus the new draft's first empty field. If a sheet is still closing (the M09 + sheet), wait
  // until it has: closing a dialog hands focus back to the button that opened it.
  useEffect(() => {
    if (!autoFocus) return;
    const focus = () =>
      (draft.kind === "link" && !draft.link ? linkRef.current : noteRef.current)?.focus();
    const sheet = document.querySelector("dialog[open]");
    if (!sheet) return focus();
    const onClose = () => requestAnimationFrame(focus);
    sheet.addEventListener("close", onClose, { once: true });
    return () => sheet.removeEventListener("close", onClose);
    // Only when the draft first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  const url = draft.kind === "link" ? normaliseUrl(draft.link) : null;
  const platform = url ? platformFromUrl(url) : null;
  const linkInvalid = draft.kind === "link" && draft.link.trim() !== "" && !url;

  const save = useMutation({
    mutationFn: () =>
      createIdea(client.data!.id, {
        kind: draft.kind,
        note: draft.note.trim() || null,
        link_url: url,
        platform,
        tags: draft.tags,
        image: draft.image ?? null,
      }),
    onSuccess: () => {
      remove(draft.key);
      void queryClient.invalidateQueries({ queryKey: ["ideas"] });
      toast.show({ title: "Saved to idea board", pose: "success" });
    },
    onError: (err: Error) =>
      toast.show({ title: "Couldn't save the idea", detail: err.message, pose: "error" }),
  });

  const canSave =
    !!client.data &&
    !save.isPending &&
    (draft.kind === "screenshot"
      ? draft.status === "ready"
      : draft.kind === "link"
        ? !!url
        : draft.note.trim() !== "");

  function onNoteKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSave) {
      e.preventDefault();
      save.mutate();
    }
  }

  return (
    <article
      aria-label={`Unsaved ${draft.kind}`}
      className="flex flex-col gap-2.5 rounded-card border-3 border-flash bg-surface p-3 md:p-3.5"
    >
      <p className="mono-label text-muted">{draft.label}</p>

      {draft.kind === "screenshot" &&
        (draft.status === "ready" && draft.previewUrl ? (
          <img
            src={draft.previewUrl}
            alt="Screenshot to save"
            className="max-h-80 w-full rounded-control bg-soft object-cover object-top"
          />
        ) : draft.status === "error" ? (
          <div
            role="alert"
            className="flex flex-col items-center gap-1.5 rounded-control bg-soft px-3 py-6 text-center"
          >
            <ImageIcon size={20} aria-hidden="true" />
            <p className="text-small text-spark">{draft.error}</p>
          </div>
        ) : (
          <div className="flex h-36 flex-col items-center justify-center gap-1.5 rounded-control bg-soft motion-safe:animate-pulse">
            <ImageIcon size={20} aria-hidden="true" />
            <span className="mono-label">Shrinking image…</span>
          </div>
        ))}

      {draft.kind === "link" && (
        <div>
          <label htmlFor={linkId} className="sr-only">
            Link
          </label>
          <div
            className={`flex min-h-11 items-center gap-2 rounded-control border px-2.5 md:min-h-10 ${linkInvalid ? "border-spark" : "border-line focus-within:border-ink"}`}
          >
            <Link2 size={16} aria-hidden="true" className="shrink-0 text-muted" />
            <input
              id={linkId}
              type="url"
              inputMode="url"
              ref={linkRef}
              value={draft.link}
              onChange={(e) => update(draft.key, { link: e.target.value })}
              placeholder="Paste or type a link"
              aria-invalid={linkInvalid || undefined}
              aria-describedby={linkInvalid ? linkErrId : undefined}
              className="min-w-0 flex-1 bg-transparent py-2 font-mono text-small outline-none placeholder:font-sans placeholder:text-muted"
            />
          </div>
          {linkInvalid && (
            <p id={linkErrId} className="mt-1.5 text-small text-spark">
              That doesn't look like a web link.
            </p>
          )}
        </div>
      )}

      {draft.status !== "error" && (
        <>
          <label htmlFor={noteId} className="sr-only">
            {draft.kind === "note" ? "Your idea" : "Note"}
          </label>
          <textarea
            id={noteId}
            ref={noteRef}
            value={draft.note}
            maxLength={NOTE_MAX}
            rows={draft.kind === "note" ? 4 : 2}
            onChange={(e) => update(draft.key, { note: e.target.value })}
            onKeyDown={onNoteKey}
            placeholder={PLACEHOLDER[draft.kind]}
            className="w-full resize-y rounded-control border border-ink bg-surface px-2.5 py-2 text-small outline-none placeholder:text-muted"
          />
          <TagEditor
            tags={draft.tags}
            onChange={(tags) => update(draft.key, { tags })}
            leading={
              platform === "instagram" ? (
                <InstagramIcon size={14} aria-label="Instagram" role="img" aria-hidden={false} />
              ) : platform === "tiktok" ? (
                <TikTokIcon size={14} aria-label="TikTok" role="img" aria-hidden={false} />
              ) : null
            }
          />
        </>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => remove(draft.key)} disabled={save.isPending}>
          Discard
        </Button>
        {draft.status !== "error" && (
          <Button onClick={() => save.mutate()} disabled={!canSave}>
            {save.isPending ? "Saving…" : "Save idea"}
          </Button>
        )}
      </div>
    </article>
  );
}
