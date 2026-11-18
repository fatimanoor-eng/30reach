import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiError, askBlip } from "../../lib/ai/ai-api";
import { useProfile } from "../../lib/auth/useProfile";
import { useClient } from "../../lib/useClient";
import { useCompetitors } from "../../lib/useCompetitors";
import {
  clientShort,
  firstNameOf,
  historyFrom,
  isLightQuestion,
  MAX_QUESTION,
  matchSmallTalk,
  smallTalkReply,
  type Message,
  withBreather,
} from "./blip-rules";

/**
 * The Ask Blip thread for this session (no table: a reload clears it). Owned by the app shell, so the
 * panel can mount and unmount like any drawer while the conversation stays.
 *
 * A pure greeting / thanks ("hiiii!!", "thx") is answered here with a rotating line (no Groq call,
 * no tokens). Other short small talk goes in light mode (no data summary). A rate limit shows
 * "One sec, catching my breath…", waits (≤ 30 s) and retries once before the breather message.
 */
export function useBlipThread(clientId: string | undefined) {
  const profile = useProfile();
  const firstName = firstNameOf(profile.data?.full_name);
  const client = useClient();
  const competitors = useCompetitors();
  const clientName = client.data?.name;
  // Brand and client names: a question naming one is about the data, so it never goes light.
  const names = useMemo(
    () => [
      ...(competitors.data ?? []).map((c) => c.name),
      ...(clientName ? [clientName, clientShort(clientName)] : []),
    ],
    [competitors.data, clientName],
  );
  const [messages, setMessages] = useState<Message[]>([]);
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
      if (small) {
        const turn = current.filter((m) => m.status === "done" && m.local === small.kind).length;
        const message = smallTalkReply(small, firstName, turn);
        latest.current = [
          ...current,
          { id, question: q, status: "done", local: small.kind, answer: { type: "chat", message } },
        ];
        setMessages(latest.current);
        return;
      }
      inFlight.current = true;
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
          m.map((x) => (x.id === id ? { id, question: q, status: "done", answer } : x)),
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
    [clientId, firstName, names],
  );

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

  return { messages, busy: messages.some((m) => m.status === "pending"), ask, retry };
}

export type BlipThread = ReturnType<typeof useBlipThread>;
