import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ChevronLeft, Send, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { BlipError, BlipIdle, BlipThinking } from "../../components/blip/BlipPoses";
import { useNativeModal } from "../../components/useNativeModal";
import { AI_COPY, answerText, type BlipAnswer } from "../../lib/ai/ai-api";
import { useProfile } from "../../lib/auth/useProfile";
import { useCompetitors } from "../../lib/useCompetitors";
import { useClient } from "../../lib/useClient";
import { formatShortDate } from "../../lib/format";
import { createIdea } from "../ideas/ideas-api";
import { usePullPosts, useSavedPulls } from "../overview/useOverviewData";
import {
  clientShort,
  greeting,
  MAX_QUESTION,
  sourceLabel,
  suggestions,
  topBrand,
} from "./blip-rules";
import type { BlipThread } from "./useBlipThread";

/**
 * 12 Ask Blip (side panel from 768 px) / M11 (full screen on phones). Answers come only from the saved
 * pull (the `ask-blip` function sends Groq a compact summary) and cite the posts used. Blip/Thinking
 * shows while answering. "Add idea to board" saves a `kind 'ai'` idea (no creator → admins delete it).
 *
 * The thread (session only, no table) is owned by the shell (useBlipThread), so this drawer mounts
 * and unmounts like the others and reopening keeps the conversation.
 */
export function AskBlipPanel({
  open,
  onClose,
  thread,
}: {
  open: boolean;
  onClose: () => void;
  thread: BlipThread;
}) {
  const modal = useNativeModal(open, onClose);
  const titleId = useId();
  const client = useClient();
  const profile = useProfile();
  const pulls = useSavedPulls();
  const latest = pulls.data?.latest ?? null;
  const posts = usePullPosts(open ? latest?.id : null);
  const competitors = useCompetitors();
  const navigate = useNavigate();

  const { messages, busy } = thread;
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const clientId = client.data?.id;
  const clientName = client.data?.name ?? "the client";
  const firstName = profile.data?.full_name?.trim().split(/\s+/)[0] ?? null;
  const noPull = pulls.isSuccess && !latest;

  function ask(question: string) {
    setDraft("");
    void thread.ask(question);
  }

  // Focus the question box on open (showModal() would focus the close button first).
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    ask(draft);
  }

  const chips = suggestions(clientName, topBrand(posts.data ?? [], competitors.data ?? []));
  const pullDate = latest ? (formatShortDate(latest.started_at) ?? "").toUpperCase() : null;

  return (
    <dialog
      {...modal}
      aria-labelledby={titleId}
      data-motion="drawer"
      className="m-0 h-dvh w-full max-w-none bg-surface text-ink md:ml-auto md:w-115 md:border-l md:border-line md:shadow-xl"
    >
      <div className="flex h-full flex-col">
        {/* Header: desktop = Blip + title + ✕, then the "Reading" line; phone = ‹ Blip title / line. */}
        <header className="border-b border-line pt-[env(safe-area-inset-top)] md:border-b-0 md:pt-0">
          <div className="flex items-center gap-2.5 py-2 pr-4 pl-1 md:justify-between md:px-6 md:pt-5 md:pb-4">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Ask Blip"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-soft md:hidden"
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <div className="flex min-w-0 items-center gap-2.5">
              <BlipIdle className="h-9.5 w-auto shrink-0 md:h-10" />
              <div className="min-w-0">
                <h2 id={titleId} className="text-card">
                  Ask Blip
                </h2>
                {pullDate && (
                  <p className="truncate mono-label text-muted md:hidden">
                    Reading the pull from {pullDate}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 hidden size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-soft hover:text-ink md:inline-flex"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          {pullDate && (
            <p className="hidden px-6 pb-4 mono-label whitespace-pre text-muted md:block">
              {`Reading  ·  ${clientName.toUpperCase()}  ·  Pull from ${pullDate}`}
            </p>
          )}
        </header>

        <div
          ref={threadRef}
          aria-live="polite"
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 md:gap-5 md:border-t md:border-line md:px-6 md:py-5"
        >
          {noPull ? (
            <Notice pose="idle" text={AI_COPY.noPull} />
          ) : (
            latest &&
            posts.data && (
              <p className="text-body-sm">
                {greeting({
                  firstName,
                  pullStartedAt: latest.started_at,
                  posts: posts.data.length,
                  brands: new Set(posts.data.map((p) => p.competitor_id)).size,
                })}
              </p>
            )
          )}
          {messages.map((m) => (
            <div key={m.id} className="flex flex-col gap-4 md:gap-5">
              <p className="max-w-[85%] self-end rounded-panel bg-ink px-3.5 py-2.5 text-body-sm break-words text-white md:max-w-77 md:rounded-card">
                {m.question}
              </p>
              {m.status === "pending" && (
                <p className="flex items-center gap-2 text-small text-muted">
                  <BlipThinking className="h-11 w-auto shrink-0" />
                  Blip is thinking…
                </p>
              )}
              {m.status === "error" && (
                <Notice
                  pose={m.kind === "no_pull" ? "idle" : "error"}
                  text={
                    m.kind === "rate_limited"
                      ? AI_COPY.rateLimited
                      : m.kind === "no_pull"
                        ? AI_COPY.noPull
                        : AI_COPY.failed
                  }
                  retry={m.kind === "failed" ? () => thread.retry(m.id) : undefined}
                />
              )}
              {m.status === "done" && (
                <Answer
                  answer={m.answer}
                  clientId={clientId ?? null}
                  onOpenIdea={(ideaId) => {
                    onClose();
                    navigate(`/ideas?idea=${ideaId}`);
                  }}
                />
              )}
            </div>
          ))}
        </div>

        <form
          onSubmit={submit}
          className="flex flex-col gap-2.5 border-t border-line px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:gap-3 md:px-6 md:pt-4 md:pb-5"
        >
          {/* Phones: chips scroll sideways above the input (M11). Desktop: they wrap (12). */}
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                disabled={busy || noPull}
                onClick={() => ask(c)}
                className="inline-flex min-h-11 shrink-0 items-center md:min-h-0"
              >
                <span className="rounded-full bg-bg px-2.5 py-1 font-mono text-label whitespace-nowrap text-ink hover:bg-soft">
                  {c}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-ink py-1.5 pr-1.5 pl-3.5 focus-within:ring-2 focus-within:ring-ink/15 md:rounded-tile md:py-2 md:pr-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={MAX_QUESTION}
              disabled={noPull}
              aria-label="Ask Blip a question"
              placeholder={`Ask about ${clientShort(clientName)}’s competitors…`}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  ask(draft);
                }
              }}
              className="[field-sizing:content] max-h-32 min-h-6 flex-1 resize-none bg-transparent text-body outline-none placeholder:text-muted md:text-body-sm"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={busy || noPull || !draft.trim()}
              className="inline-flex size-11 shrink-0 items-center justify-center md:size-8"
            >
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-ink text-white md:size-8 md:rounded-control">
                <Send size={15} aria-hidden="true" />
              </span>
            </button>
          </div>
          <p className="hidden mono-label text-muted normal-case md:block">
            Answers only from the saved pull. If it isn’t in the data, 30reach says so.
          </p>
        </form>
      </div>
    </dialog>
  );
}

function Notice({
  pose,
  text,
  retry,
}: {
  pose: "idle" | "error";
  text: string;
  retry?: () => void;
}) {
  const Pose = pose === "error" ? BlipError : BlipIdle;
  return (
    <div role={pose === "error" ? "alert" : undefined} className="flex items-start gap-2.5">
      <Pose className="h-11 w-auto shrink-0" />
      <div className="flex flex-col items-start gap-1 pt-1.5">
        <p className="text-body-sm">{text}</p>
        {retry && (
          <button
            type="button"
            onClick={retry}
            className="min-h-11 text-small font-medium text-blue hover:underline md:min-h-0"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

function Answer({
  answer,
  clientId,
  onOpenIdea,
}: {
  answer: BlipAnswer;
  clientId: string | null;
  onOpenIdea: (ideaId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState<{ id: string } | "saving" | "error" | null>(null);
  const [copied, setCopied] = useState(false);

  async function addIdea() {
    if (!clientId || !answer.idea) return;
    setSaved("saving");
    const first = answer.sources[0];
    try {
      const idea = await createIdea(clientId, {
        kind: "ai",
        note: answer.idea,
        tags: [],
        platform: first?.platform ?? null,
        source_post_id: first?.id ?? null,
        source_snapshot: {
          saved_from: "ask-blip",
          ...(first && {
            brand: first.brand,
            date: first.postedAt ?? undefined,
            url: first.url,
            format: first.format,
            likes: first.likes,
          }),
        },
      });
      setSaved(idea);
      void queryClient.invalidateQueries({ queryKey: ["ideas"] });
    } catch {
      setSaved("error");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(answerText(answer));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  }

  return (
    <div className="flex flex-col gap-2.5 text-body-sm md:gap-3">
      <p>{answer.lead}</p>
      {answer.points.map((p, i) => (
        <p key={i}>
          {i + 1}.&nbsp; {p}
        </p>
      ))}
      {answer.forClient && <p>{answer.forClient}</p>}
      {answer.sources.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-control bg-bg px-3 py-2.5">
          <p className="mono-label text-muted">
            Based on {answer.sources.length} {answer.sources.length === 1 ? "post" : "posts"}
          </p>
          {answer.sources.map((s) => (
            <a
              key={s.id}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 self-start text-small text-blue hover:underline md:min-h-0"
            >
              {sourceLabel(s)}
              <ArrowUpRight size={12} aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 text-small font-medium">
        {answer.idea &&
          (saved && typeof saved === "object" ? (
            <span className="inline-flex min-h-11 items-center gap-1.5 text-fresh md:min-h-0">
              Saved to idea board ·
              <button
                type="button"
                onClick={() => onOpenIdea(saved.id)}
                className="text-blue hover:underline"
              >
                Open
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void addIdea()}
              disabled={saved === "saving" || !clientId}
              className="min-h-11 text-blue hover:underline disabled:opacity-60 md:min-h-0"
            >
              {saved === "saving" ? "Adding…" : "Add idea to board"}
            </button>
          ))}
        <button
          type="button"
          onClick={() => void copy()}
          className="hidden text-muted hover:text-ink md:inline"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        {saved === "error" && (
          <span role="alert" className="text-spark">
            Couldn’t add it. Try again.
          </span>
        )}
      </div>
    </div>
  );
}
