import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatShortDate } from "../../lib/format";
import { AiError, askBlip } from "../../lib/ai/ai-api";
import { useProfile } from "../../lib/auth/useProfile";
import { useClient } from "../../lib/useClient";
import { useCompetitors } from "../../lib/useCompetitors";
import {
  clientShort,
  firstNameOf,
  hesitationReply,
  historyFrom,
  howReply,
  isLightQuestion,
  MAX_QUESTION,
  matchHelpTalk,
  matchSmallTalk,
  smallTalkReply,
  suggestions,
  topBrand,
  type Message,
  typingDelay,
  withBreather,
} from "./blip-rules";

/**
 * The Ask Blip thread for this session (no table: a reload clears it). Owned by the app shell, so the
 * panel can mount and unmount like any drawer while the conversation stays.
 *
 * Hesitation ("ummm", "idk") and "how do you work?" are answered here too (two starting points; one
 * line on reading the saved pull). A pure greeting / thanks ("hiiii!!", "thx") is answered here with a rotating line (no Groq call,
 * no tokens). Other short small talk goes in light mode (no data summary). A rate limit shows
 * "One sec, catching my breath…", waits (≤ 30 s) and retries once before the breather message.
 *
 * New answers arrive with `animate: true` (the panel reveals them word by word, then calls
 * finishReveal). Code replies show the typing dots for 400–700 ms first.
 */
export function useBlipThread(clientId: string | undefined) {
  const profile = useProfile();
  const firstName = firstNameOf(profile.data?.full_name);
  const client = useClient();
  const competitors = useCompetitors();
  const clientName = client.data?.name;
  const queryClient = useQueryClient();
  // Brand and client names: a question naming one is about the data, so it never goes light.
  const names = useMemo(
    () => [
      ...(competitors.data ?? []).map((c) => c.name),
      ...(clientName ? [clientName, clientShort(clientName)] : []),
    ],
    [competitors.data, clientName],
  );
  const [messages, setMessages] = useState<Message[]>([]);
  // One thread per client (Slice 17b): switching clients starts a fresh one. A switch passes through
  // `undefined` while the next client loads, so only a new, known client resets it.
  const [threadFor, setThreadFor] = useState(clientId);
  if (clientId && clientId !== threadFor) {
    setThreadFor(clientId);
    if (threadFor) setMessages([]);
  }
  const nextId = useRef(1);
  const inFlight = useRef(false); // set at once, so a quick double click can't ask twice
  // ask() reads the committed thread (it's only called from events, after a commit).
  const latest = useRef(messages);
  useEffect(() => {
    latest.current = messages;
  }, [messages]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim().slice(0, MAX_QUESTION);
      const current = latest.current;
      if (!q || !clientId || inFlight.current) return;
      const id = nextId.current++;
      const small = matchSmallTalk(q);
      const help = small ? null : matchHelpTalk(q);
      inFlight.current = true;
      if (small || help) {
        const kind = small ? small.kind : help!;
        const turn = current.filter((m) => m.status === "done" && m.local === kind).length;
        // The saved pull the open panel already loaded (no extra request for a one-liner).
        const pulls = queryClient.getQueryData<{
          latest: { id: string; started_at: string } | null;
        }>(["pulls", "saved", clientId]);
        const latestPull = pulls?.latest ?? null;
        const posts = latestPull
          ? (queryClient.getQueryData<
              {
                competitor_id: string;
                likes: number | null;
                comments: number | null;
                counts_hidden: boolean;
              }[]
            >(["posts", latestPull.id]) ?? null)
          : null;
        let answer: { type: "chat"; message: string; suggestions?: string[] };
        if (small) answer = { type: "chat", message: smallTalkReply(small, firstName, turn) };
        else if (help === "hesitation")
          answer = {
            type: "chat",
            ...hesitationReply(
              suggestions(
                clientName ?? "the client",
                topBrand(posts ?? [], competitors.data ?? []),
              ),
              turn,
            ),
          };
        else
          answer = {
            type: "chat",
            message: howReply(
              latestPull && posts
                ? {
                    date: formatShortDate(latestPull.started_at) ?? "",
                    posts: posts.length,
                    brands: new Set(posts.map((p) => p.competitor_id)).size,
                  }
                : null,
            ),
          };
        setMessages((m) => [...m, { id, question: q, status: "pending" }]);
        window.setTimeout(() => {
          setMessages((m) =>
            m.map((x) =>
              x.id === id
                ? {
                    id,
                    question: q,
                    status: "done",
                    local: kind,
                    animate: true,
                    answer,
                  }
                : x,
            ),
          );
          inFlight.current = false;
        }, typingDelay());
        return;
      }
      const history = historyFrom(current);
      const light = isLightQuestion(q, names);
      const setBreather = (breather: boolean) =>
        setMessages((m) =>
          m.map((x) => (x.id === id && x.status === "pending" ? { ...x, breather } : x)),
        );
      setMessages((m) => [...m, { id, question: q, status: "pending" }]);
      try {
        const answer = await withBreather(
          () => {
            setBreather(false);
            return askBlip(clientId, q, history, light);
          },
          { onWait: () => setBreather(true) },
        );
        setMessages((m) =>
          m.map((x) =>
            x.id === id ? { id, question: q, status: "done", answer, animate: true } : x,
          ),
        );
      } catch (err) {
        const kind = err instanceof AiError ? err.kind : "failed";
        setMessages((m) =>
          m.map((x) => (x.id === id ? { id, question: q, status: "error", kind } : x)),
        );
      } finally {
        inFlight.current = false;
      }
    },
    [clientId, firstName, names, queryClient, clientName, competitors.data],
  );

  /** The reveal ended or was skipped: show the message in full from now on (no replay on reopen). */
  const finishReveal = useCallback((id?: number) => {
    setMessages((m) =>
      m.some((x) => x.status === "done" && x.animate && (id == null || x.id === id))
        ? m.map((x) =>
            x.status === "done" && x.animate && (id == null || x.id === id)
              ? { ...x, animate: false }
              : x,
          )
        : m,
    );
  }, []);

  /** Drop a failed turn and ask it again. */
  const retry = useCallback(
    (id: number) => {
      const failed = latest.current.find((m) => m.id === id);
      if (!failed) return;
      latest.current = latest.current.filter((m) => m.id !== id);
      setMessages(latest.current);
      void ask(failed.question);
    },
    [ask],
  );

  return {
    messages,
    busy: messages.some((m) => m.status === "pending"),
    /** The message being revealed word by word, if any. */
    revealingId: messages.find((m) => m.status === "done" && m.animate)?.id ?? null,
    ask,
    retry,
    finishReveal,
  };
}

export type BlipThread = ReturnType<typeof useBlipThread>;
