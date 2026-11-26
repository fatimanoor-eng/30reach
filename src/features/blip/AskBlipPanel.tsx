import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ChevronLeft, Send, Square, X } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { BlipError, BlipIdle, BlipThinking } from "../../components/blip/BlipPoses";
import { useNativeModal } from "../../components/useNativeModal";
import { AI_COPY, answerText, type BlipChat, type BlipInsight } from "../../lib/ai/ai-api";
import { useProfile } from "../../lib/auth/useProfile";
import { useCompetitors } from "../../lib/useCompetitors";
import { useClient, useClientPath } from "../../lib/useClient";
import { formatShortDate } from "../../lib/format";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { createIdea } from "../ideas/ideas-api";
import { usePullPosts, useSavedPulls } from "../overview/useOverviewData";
import {
  chipsFor,
  BREATHER_TEXT,
  clientShort,
  firstNameOf,
  greeting,
  MAX_QUESTION,
  revealSegments,
  sourceLabel,
  suggestions,
  topBrand,
  wordCount,
} from "./blip-rules";
import type { BlipThread } from "./useBlipThread";
import { useReveal } from "./useReveal";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * 12 Ask Blip (side panel from 768 px) / M11 (full screen on phones). Answers come only from the saved
 * pull (the `ask-blip` function sends Groq a compact summary) and cite the posts used. "Add idea to
 * board" saves a `kind 'ai'` idea (no creator → admins delete it).
 *
 * Chat feel: three bouncing dots while Blip "types", then the answer appears word by word (40 words/s;
 * sources and actions fade in after). A click on the message, any key or Stop finishes it at once.
 * The thread follows the reveal unless the person scrolled up. Reduced motion: still dots, no reveal.
 * Screen readers hear each answer once, in full, from one live region (never word by word).
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
  const blipPosts = usePullPosts(open ? latest?.id : null).data;
  const competitors = useCompetitors();
  const navigate = useNavigate();
  const path = useClientPath();

  const { messages, busy, revealingId, finishReveal } = thread;
  const revealing = revealingId != null;
  const reduced = useMediaQuery(REDUCED_MOTION);
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  /** Follow new content only while the person is at (or near) the bottom. */
  const stick = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const clientId = client.data?.id;
  const clientName = client.data?.name ?? "the client";
  const firstName = firstNameOf(profile.data?.full_name);
  const noPull = pulls.isSuccess && !latest;

  function ask(question: string) {
    if (revealing) {
      finishReveal(); // Enter / a chip mid-reveal finishes it; the next one sends
      return;
    }
    setDraft("");
    stick.current = true;
    void thread.ask(question);
  }

  // Focus the question box on open (showModal() would focus the close button first).
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Follow the thread as it grows (new messages, the reveal, fade-ins) unless scrolled up.
  useEffect(() => {
    const el = threadRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    el.scrollTop = el.scrollHeight;
    const follow = () => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    };
    const ro = new ResizeObserver(follow);
    ro.observe(content);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = threadRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Reduced motion: no reveal at all. Closing the panel mid-reveal finishes it (no replay on reopen).
  useEffect(() => {
    if (reduced && revealing) finishReveal();
  }, [reduced, revealing, finishReveal]);
  useEffect(() => () => finishReveal(), [finishReveal]);

  // Any key finishes the reveal.
  useEffect(() => {
    if (!revealing) return;
    const onKey = () => finishReveal();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [revealing, finishReveal]);

  // One announcement per new message, in full: typing, catching breath, then the whole answer.
  const last = messages.at(-1);
  const announcement =
    last?.status === "pending"
      ? last.breather
        ? BREATHER_TEXT
        : "Blip is typing…"
      : last?.status === "done"
        ? answerText(last.answer)
        : "";

  function submit(e: FormEvent) {
    e.preventDefault();
    ask(draft);
  }

  // Smart Blip round 1: after an answer, its own follow-ups; otherwise the usual starters.
  const chips = chipsFor(
    messages,
    suggestions(clientName, topBrand(blipPosts ?? [], competitors.data ?? [])),
  );
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
          data-testid="blip-thread"
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          }}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:border-t md:border-line md:px-6 md:py-5"
        >
          <div ref={contentRef} className="flex flex-col gap-4 md:gap-5">
            {noPull ? (
              <Notice pose="idle" text={AI_COPY.noPull} />
            ) : (
              latest &&
              blipPosts && (
                <BlipSays>
                  <p className="text-body-sm">
                    {greeting({
                      firstName,
                      pullStartedAt: latest.started_at,
                      posts: blipPosts.length,
                      brands: new Set(blipPosts.map((p) => p.competitor_id)).size,
                    })}
                  </p>
                </BlipSays>
              )
            )}
            {messages.map((m) => (
              <div key={m.id} className="flex flex-col gap-4 md:gap-5">
                <p className="max-w-[85%] self-end rounded-panel bg-ink px-3.5 py-2.5 text-body-sm break-words text-white md:max-w-77 md:rounded-card">
                  {m.question}
                </p>
                {m.status === "pending" &&
                  (m.breather ? (
                    <p className="flex items-center gap-2.5 text-small text-muted">
                      <BlipThinking className="h-8 w-auto shrink-0" />
                      {BREATHER_TEXT}
                    </p>
                  ) : (
                    <BlipSays typing>
                      <TypingDots />
                    </BlipSays>
                  ))}
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
                {m.status === "done" && m.answer.type === "chat" && (
                  <BlipSays onSkip={m.animate ? () => finishReveal(m.id) : undefined}>
                    <ChatReply
                      answer={m.answer}
                      animate={!!m.animate && !reduced}
                      onDone={() => finishReveal(m.id)}
                      onAsk={ask}
                      askDisabled={busy || revealing || noPull}
                    />
                  </BlipSays>
                )}
                {m.status === "done" && m.answer.type === "insight" && (
                  <BlipSays onSkip={m.animate ? () => finishReveal(m.id) : undefined}>
                    <Answer
                      answer={m.answer}
                      animate={!!m.animate && !reduced}
                      onDone={() => finishReveal(m.id)}
                      clientId={clientId ?? null}
                      onOpenIdea={(ideaId) => {
                        onClose();
                        navigate(path(`/ideas?idea=${ideaId}`));
                      }}
                    />
                  </BlipSays>
                )}
              </div>
            ))}
          </div>
        </div>
        <p aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </p>

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
                disabled={busy || revealing || noPull}
                onClick={() => ask(c)}
                className="inline-flex min-h-11 shrink-0 items-center md:min-h-0"
              >
                <span className="rounded-full bg-bg px-2.5 py-1 font-mono text-label whitespace-nowrap text-ink hover:bg-soft">
                  {c}
                </span>
              </button>
            ))}
          </div>
          {/* Polish 2: one line is exactly the Send button's height (44 / 32 px), so the text sits in the
              middle; a longer question grows with the same padding top and bottom, Send stays at the
              bottom. */}
          <div className="flex items-end gap-2 rounded-[26px] border border-ink py-1 pr-1 pl-3.5 focus-within:ring-2 focus-within:ring-ink/15 md:rounded-tile md:py-2 md:pr-2">
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
                  // Mid-reveal, Enter only finishes the reveal (the document listener does that).
                  e.preventDefault();
                  ask(draft);
                }
              }}
              className="[field-sizing:content] max-h-32 min-h-11 flex-1 resize-none bg-transparent py-3 text-body leading-5 outline-none placeholder:text-muted md:min-h-8 md:py-1.5 md:text-body-sm md:leading-5"
            />
            {revealing ? (
              <button
                type="button"
                aria-label="Stop"
                onClick={() => finishReveal()}
                className="inline-flex size-11 shrink-0 items-center justify-center md:size-8"
              >
                <span className="inline-flex size-9 items-center justify-center rounded-full bg-ink text-white md:size-8 md:rounded-control">
                  <Square size={12} fill="currentColor" aria-hidden="true" />
                </span>
              </button>
            ) : (
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
            )}
          </div>
          <p className="hidden mono-label text-muted normal-case md:block">
            Answers only from the saved pull. If it isn’t in the data, 30reach says so.
          </p>
        </form>
      </div>
    </dialog>
  );
}

/** A Blip message: the small idle avatar beside it (greeting, chat replies and insights). */
function BlipSays({
  children,
  onSkip,
  typing = false,
}: {
  children: ReactNode;
  onSkip?: () => void;
  /** Blip is typing: the Thinking pose, animated. Message avatars stay still (a long thread). */
  typing?: boolean;
}) {
  // Click / tap mid-reveal shows it all (keyboard: any key, or Stop).
  return (
    <div className="flex items-start gap-2.5" onClick={onSkip}>
      {typing ? (
        <BlipThinking className="h-8 w-auto shrink-0" />
      ) : (
        <BlipIdle still className="h-8 w-auto shrink-0" />
      )}
      <div className="min-w-0 flex-1 pt-1">{children}</div>
    </div>
  );
}

/** Blip is typing: three bouncing dots in a bubble (still with reduced motion). */
function TypingDots() {
  return (
    <span
      data-testid="blip-typing"
      aria-hidden="true"
      className="inline-flex items-center gap-1 rounded-panel bg-bg px-3.5 py-3 md:rounded-card"
    >
      <span className="blip-dot size-1.5 rounded-full bg-muted" />
      <span className="blip-dot size-1.5 rounded-full bg-muted" />
      <span className="blip-dot size-1.5 rounded-full bg-muted" />
    </span>
  );
}

/** Small talk: just the line, revealed word by word. No Copy, sources or "Add idea". */
function ChatReply({
  answer,
  animate,
  onDone,
  onAsk,
  askDisabled,
}: {
  answer: BlipChat;
  animate: boolean;
  onDone: () => void;
  /** A starting point was tapped (hesitation replies): ask it. */
  onAsk: (question: string) => void;
  askDisabled: boolean;
}) {
  const shown = useReveal(wordCount(answer.message), animate, onDone);
  const [text] = revealSegments([answer.message], shown);
  const [fadeIn] = useState(animate);
  // Hidden from screen readers while it builds up; the live region reads it once, in full.
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-sm" aria-hidden={animate || undefined}>
        {text}
      </p>
      {!animate && answer.suggestions && answer.suggestions.length > 0 && (
        <div className={`flex flex-wrap gap-1.5 ${fadeIn ? "blip-fade-in" : ""}`}>
          {answer.suggestions.map((q) => (
            <button
              key={q}
              type="button"
              disabled={askDisabled}
              onClick={(e) => {
                e.stopPropagation();
                onAsk(q);
              }}
              className="inline-flex min-h-11 items-center md:min-h-0"
            >
              <span className="rounded-full border border-ink bg-surface px-2.5 py-1 font-mono text-label text-ink hover:bg-bg">
                {q}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
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
      <Pose className="h-8 w-auto shrink-0" />
      <div className="flex flex-col items-start gap-1 pt-1">
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
  animate,
  onDone,
  clientId,
  onOpenIdea,
}: {
  answer: BlipInsight;
  animate: boolean;
  onDone: () => void;
  clientId: string | null;
  onOpenIdea: (ideaId: string) => void;
}) {
  // Reveal order: lead, points, "For {client}:"; then sources and actions fade in.
  const segments = [answer.lead, ...answer.points, answer.forClient];
  const shown = useReveal(
    segments.reduce((n, t) => n + wordCount(t), 0),
    animate,
    onDone,
  );
  const [lead, ...rest] = revealSegments(segments, shown);
  const points = rest.slice(0, answer.points.length);
  const forClient = rest[answer.points.length];
  const [fadeIn] = useState(animate); // fade only when this answer was revealed, not on reopen
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

  /** Copy (tablet / desktop only, like 12; M11 has none). */
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
      {/* Hidden from screen readers while it builds up; the live region reads it once, in full. */}
      <div className="flex flex-col gap-2.5 md:gap-3" aria-hidden={animate || undefined}>
        {lead && <p>{lead}</p>}
        {points.map(
          (p, i) =>
            p && (
              <p key={i}>
                {i + 1}.&nbsp; {p}
              </p>
            ),
        )}
        {forClient && <p>{forClient}</p>}
      </div>
      {!animate && (
        <div className={`flex flex-col gap-2.5 md:gap-3 ${fadeIn ? "blip-fade-in" : ""}`}>
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
      )}
    </div>
  );
}
