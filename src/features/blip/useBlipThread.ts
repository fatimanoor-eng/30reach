import { useCallback, useEffect, useRef, useState } from "react";
import { AiError, askBlip } from "../../lib/ai/ai-api";
import { useProfile } from "../../lib/auth/useProfile";
import {
  firstNameOf,
  historyFrom,
  MAX_QUESTION,
  matchSmallTalk,
  smallTalkReply,
  type Message,
} from "./blip-rules";

/**
 * The Ask Blip thread for this session (no table: a reload clears it). Owned by the app shell, so the
 * panel can mount and unmount like any drawer while the conversation stays.
 *
 * A pure greeting / thanks ("hiiii!!", "thx") is answered here with a rotating line (no Groq call, no tokens spent).
 */
export function useBlipThread(clientId: string | undefined) {
  const profile = useProfile();
  const firstName = firstNameOf(profile.data?.full_name);
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
      setMessages((m) => [...m, { id, question: q, status: "pending" }]);
      try {
        const answer = await askBlip(clientId, q, history);
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
    [clientId, firstName],
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
