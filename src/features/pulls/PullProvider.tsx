import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ModalPresence } from "../../components/ModalPresence";
import { useToast } from "../../components/toast-context";
import { plural } from "../../lib/format";
import {
  listTasks,
  type Platform,
  pullFinish,
  type PullFinishResponse,
  pullStart,
  pullTask,
} from "../../lib/pulls/api";
import { progressOf, PullInterrupted, runPull, toProgress } from "../../lib/pulls/run-pull";
import { supabase } from "../../lib/supabase";
import { clientPath } from "../../lib/client-path";
import { useClient } from "../../lib/useClient";
import { PLATFORMS } from "../../lib/platforms";
import { START_PULL_KEY } from "../clients/add/add-client-state";
import type { Competitor } from "../../lib/useCompetitors";
import { CREDITS_QUERY_KEY, creditsLeft } from "../../lib/useCredits";
import { PullContext, type PullOwner, type PullUiState } from "./pull-context";
import { PullProgressDialog } from "./PullProgressDialog";
import {
  onlyYouTubeLimit,
  otherPullingText,
  problemSentence,
  targetNoun,
  tookLabel,
} from "./pull-text";
import { RefreshDialog } from "./RefreshDialog";

const deps = { listTasks, pullTask, pullFinish };
const AUTO_RESUME_MS = 60_000; // one automatic resume after repeated 429s

/**
 * Owns the pull for the whole app shell (Slice 5): 05 confirm → pull-start → runPull (05b/05c) →
 * pull-finish → toast (05d/05g). On app open, finds a `running` pull and offers Resume.
 * Lives in the shell so a pull keeps going while you move between pages, and between clients (17b):
 * one pull runs at a time across all clients, and it remembers whose it is.
 */
export function PullProvider({ children }: { children: ReactNode }) {
  const client = useClient();
  const clientId = client.data?.id ?? null;
  const owner = useMemo<PullOwner | null>(
    () =>
      client.data ? { id: client.data.id, slug: client.data.slug, name: client.data.name } : null,
    [client.data],
  );
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [state, setState] = useState<PullUiState>({ kind: "idle" });
  const [refreshOpen, setRefreshOpen] = useState(false);
  const driving = useRef(false);
  const autoResumed = useRef(new Set<string>()); // pulls already auto-resumed once after 429s
  const resumeChecked = useRef(false);

  const refreshData = useCallback(async () => {
    await Promise.all(
      [CREDITS_QUERY_KEY, ["pulls"], ["running-pull"], ["posts"], ["competitors"]].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  }, [queryClient]);

  // `drive` and the toasts reference each other (Resume / Try again buttons), so keep a stable ref.
  const driveRef = useRef<(pullId: string, who: PullOwner) => void>(() => {});
  const openRefresh = useCallback(() => setRefreshOpen(true), []);

  /** 05e only makes sense once 2 real pulls exist (for the client that was pulled). */
  const hasPreviousPull = useCallback(async (pulledId: string) => {
    const { data } = await supabase
      .from("pulls")
      .select("id")
      .eq("client_id", pulledId)
      .eq("is_test", false)
      .in("status", ["done", "partial"])
      .limit(2);
    return (data?.length ?? 0) >= 2;
  }, []);

  const showResult = useCallback(
    async (r: PullFinishResponse, who: PullOwner, tookMs: number | null = null) => {
      const label = r.isTest ? "Test pull" : "Pull";
      const seeWhatsNew =
        !r.isTest && r.status !== "failed" && (await hasPreviousPull(who.id))
          ? {
              label: "See what’s new",
              onClick: () =>
                navigate(clientPath(who.slug, "/overview"), { state: { whatsNew: true } }),
            }
          : undefined;
      if (r.status === "done") {
        toast.show({
          // Blip's voice (one emoji at most, only in Blip's own messages).
          title: `${label} complete! ${plural(r.postsFound, "fresh post")} 🎉`,
          detail: [
            tookMs !== null ? tookLabel(tookMs) : null,
            `${plural(r.creditsUsed, "credit")} used`,
            r.credits ? creditsLeft(r.credits.remaining, r.credits.plan) : null,
          ]
            .filter(Boolean)
            .join(" · "),
          pose: "success",
          celebrate: true,
          action: seeWhatsNew,
        });
      } else if (r.status === "partial") {
        // "Fix handle" → that brand's 07b panel, pre-filled, cursor in the handle that wasn't found.
        // Problems carry the brand's name; the competitors list in the cache maps it to an id.
        const handleProblem = r.problems.find((p) => p.code === "not_found");
        const fixTarget = handleProblem
          ? queryClient
              .getQueriesData<Competitor[]>({ queryKey: ["competitors"] })
              .flatMap(([, list]) => list ?? [])
              .find((c) => c.name === handleProblem.brand)
          : undefined;
        toast.show({
          title: `${label} finished with ${plural(r.problems.length, "problem")}`,
          // YouTube's daily limit (18b) already says the other platforms were pulled.
          detail: onlyYouTubeLimit(r.problems)
            ? problemSentence(r.problems)
            : `${problemSentence(r.problems)} Everything else updated.`,
          pose: "error",
          action: handleProblem
            ? {
                label: targetNoun(handleProblem.platform) === "page" ? "Fix page" : "Fix handle",
                onClick: () =>
                  navigate(
                    clientPath(
                      who.slug,
                      fixTarget
                        ? `/competitors?edit=${fixTarget.id}&focus=${handleProblem.platform}`
                        : "/competitors",
                    ),
                  ),
              }
            : seeWhatsNew,
        });
      } else {
        toast.show({
          title: `${label} failed. Nothing changed.`,
          detail:
            problemSentence(r.problems, { othersPulled: false }) ||
            "No posts came back from Firecrawl.",
          pose: "error",
          action: { label: "Try again", onClick: openRefresh },
        });
      }
    },
    [toast, navigate, openRefresh, hasPreviousPull, queryClient],
  );

  const drive = useCallback(
    async (pullId: string, who: PullOwner) => {
      if (driving.current) return;
      driving.current = true;
      setState({ kind: "running", pullId, client: who, progress: null, cardOpen: true });
      const started = Date.now(); // this run (a resumed pull counts from the resume)
      try {
        const result = await runPull(
          pullId,
          deps,
          (progress) =>
            setState((s) => (s.kind === "running" && s.pullId === pullId ? { ...s, progress } : s)),
          (notice) =>
            toast.show({
              title: "Firecrawl asked Blip to slow down",
              detail: `Back in ${Math.round(notice.waitMs / 1000)} s, nothing to do.`,
              pose: "idle",
            }),
        );
        setState({ kind: "idle" });
        await refreshData(); // new pull → Overview reloads before the toast points at it
        void showResult(result, who, Date.now() - started);
      } catch (err) {
        if (
          err instanceof PullInterrupted &&
          err.reason === "rate_limited" &&
          !autoResumed.current.has(pullId)
        ) {
          // Still rate limited after backing off: wait a minute and resume once by ourselves.
          autoResumed.current.add(pullId);
          setState((s) => ({
            kind: "interrupted",
            pullId,
            client: who,
            progress: s.kind === "running" ? s.progress : null,
          }));
          toast.show({
            title: "Firecrawl asked us to slow down",
            detail: `Resuming in ${AUTO_RESUME_MS / 1000} s — nothing to do.`,
            pose: "idle",
          });
          window.setTimeout(() => driveRef.current(pullId, who), AUTO_RESUME_MS);
          return;
        }
        setState((s) => ({
          kind: "interrupted",
          pullId,
          client: who,
          progress: s.kind === "running" ? s.progress : null,
        }));
        toast.show({
          title: "Pull paused",
          detail:
            err instanceof PullInterrupted && err.reason === "rate_limited"
              ? "Firecrawl is still limiting requests. Nothing is lost — resume in a few minutes."
              : err instanceof PullInterrupted && err.reason === "firecrawl_unavailable"
                ? "Firecrawl didn’t respond. Nothing is lost — resume when you’re ready."
                : "Something went wrong. Nothing is lost — resume when you’re ready.",
          pose: "error",
          action: { label: "Resume", onClick: () => driveRef.current(pullId, who) },
        });
      } finally {
        driving.current = false;
        await refreshData();
      }
    },
    [refreshData, showResult, toast],
  );

  useEffect(() => {
    driveRef.current = (id: string, who: PullOwner) => void drive(id, who);
  }, [drive]);

  // Resume after a reload: a `running` pull that nobody is driving, for any client (one runs at a time).
  useEffect(() => {
    if (!clientId || resumeChecked.current) return;
    resumeChecked.current = true;
    void supabase
      .from("pulls")
      .select("id, client_id, clients(slug, name)")
      .eq("status", "running")
      .limit(1)
      .maybeSingle()
      .then(async ({ data }) => {
        const row = data as {
          id: string;
          client_id: string;
          clients: { slug: string; name: string } | null;
        } | null;
        if (!row?.id || !row.clients || driving.current) return;
        const who = { id: row.client_id, slug: row.clients.slug, name: row.clients.name };
        const progress = progressOf((await listTasks(row.id)).map(toProgress));
        setState({ kind: "interrupted", pullId: row.id, client: who, progress });
        toast.show({
          title:
            who.id === clientId
              ? "Your last pull didn’t finish"
              : `${who.name}’s last pull didn’t finish`,
          detail: `${Math.round(progress.fraction * 100)}% done · nothing is lost`,
          pose: "idle",
          action: { label: "Resume", onClick: () => driveRef.current(row.id, who) },
        });
      });
  }, [clientId, toast]);

  const start = useCallback(
    async (platforms: Platform[]) => {
      if (!owner) return;
      setRefreshOpen(false);
      setState({ kind: "starting" });
      const res = await pullStart({ clientId: owner.id, platforms });
      if (res.ok && res.data.status === "started" && res.data.pullId)
        return drive(res.data.pullId, owner);
      if (res.status === 409 && typeof res.data?.pullId === "string")
        return drive(res.data.pullId, owner);
      setState({ kind: "idle" });
      if (res.status === 409 && res.data?.status === "other_running") {
        toast.show({
          title: "Another pull is running",
          detail: otherPullingText(String(res.data?.clientName ?? "Another client")),
          pose: "idle",
        });
        return;
      }
      if (res.ok && res.data.status === "insufficient") {
        setRefreshOpen(true); // balance changed since 05 — the dialog re-checks and shows 05f
        return;
      }
      toast.show({
        title: "Couldn’t start the pull",
        detail: res.status === 502 ? "Firecrawl credits couldn’t be checked." : "Please try again.",
        pose: "error",
        action: { label: "Try again", onClick: openRefresh },
      });
    },
    [owner, drive, openRefresh, toast],
  );

  // Another client's pull: this client's Refresh reads as idle and explains who is pulling (17a/17b).
  const otherClient =
    (state.kind === "running" || state.kind === "interrupted") && state.client.id !== clientId
      ? state.client
      : null;
  const shown = useMemo<PullUiState>(
    () => (otherClient ? { kind: "idle" } : state),
    [otherClient, state],
  );

  // 15e "Pull now" (Add client, Slice 17d): the new client's Overview starts its first pull once.
  useEffect(() => {
    if (!clientId || state.kind !== "idle") return;
    let flagged = false;
    try {
      flagged = sessionStorage.getItem(START_PULL_KEY(clientId)) === "1";
      if (flagged) sessionStorage.removeItem(START_PULL_KEY(clientId));
    } catch {
      /* blocked storage: Refresh still works */
    }
    if (flagged) void Promise.resolve().then(() => start(PLATFORMS));
  }, [clientId, state.kind, start]);

  const api = useMemo(
    () => ({
      state: shown,
      clientId,
      refreshOpen,
      onRefreshClick: () => {
        if (otherClient) {
          toast.show({
            title: "Another pull is running",
            detail: otherPullingText(otherClient.name),
            pose: "idle",
          });
        } else if (state.kind === "running") setState({ ...state, cardOpen: true });
        else if (state.kind === "interrupted") void drive(state.pullId, state.client);
        else if (state.kind === "idle") setRefreshOpen(true);
      },
      closeRefresh: () => setRefreshOpen(false),
      start,
      resume: () => {
        if (state.kind === "interrupted" && !otherClient) void drive(state.pullId, state.client);
      },
      hideCard: () => setState((s) => (s.kind === "running" ? { ...s, cardOpen: false } : s)),
    }),
    [state, shown, otherClient, clientId, refreshOpen, start, drive, toast],
  );

  return (
    <PullContext value={api}>
      {children}
      {/* ModalPresence keeps each one mounted while its sheet / drawer slides out. */}
      <ModalPresence open={refreshOpen}>
        <RefreshDialog />
      </ModalPresence>
      <ModalPresence open={shown.kind === "running" && shown.cardOpen}>
        <PullProgressDialog />
      </ModalPresence>
    </PullContext>
  );
}
