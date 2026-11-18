import { useCallback, useEffect, useRef, useState } from "react";
import { AiError, askBlip } from "../../lib/ai/ai-api";
import { historyFrom, MAX_QUESTION, type Message } from "./blip-rules";

/**
 * The Ask Blip thread for this session (no table: a reload clears it). Owned by the app shell, so the
 * panel can mount and unmount like any drawer while the conversation stays.
 */
export function useBlipThread(clientId: string | undefined) {
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
      inFlight.current = true;
      const id = nextId.current++;
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
    [clientId],
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
