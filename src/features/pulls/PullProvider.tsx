import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useToast } from "../../components/toast-context";
import { formatNumber, plural } from "../../lib/format";
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
import { useClient } from "../../lib/useClient";
import { CREDITS_QUERY_KEY } from "../../lib/useCredits";
import { PullContext, type PullUiState } from "./pull-context";
import { PullProgressDialog } from "./PullProgressDialog";
import { problemSentence } from "./pull-text";
import { RefreshDialog } from "./RefreshDialog";

const deps = { listTasks, pullTask, pullFinish };
const AUTO_RESUME_MS = 60_000; // one automatic resume after repeated 429s

/**
 * Owns the pull for the whole app shell (Slice 5): 05 confirm → pull-start → runPull (05b/05c) →
 * pull-finish → toast (05d/05g). On app open, finds a `running` pull and offers Resume.
 * Lives in the shell so a pull keeps going while you move between pages.
 */
export function PullProvider({ children }: { children: ReactNode }) {
  const client = useClient();
  const clientId = client.data?.id ?? null;
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
  const driveRef = useRef<(pullId: string) => void>(() => {});
  const openRefresh = useCallback(() => setRefreshOpen(true), []);

  /** 05e only makes sense once 2 real pulls exist. */
  const hasPreviousPull = useCallback(async () => {
    if (!clientId) return false;
    const { data } = await supabase
      .from("pulls")
      .select("id")
      .eq("client_id", clientId)
      .eq("is_test", false)
      .in("status", ["done", "partial"])
      .limit(2);
    return (data?.length ?? 0) >= 2;
  }, [clientId]);

  const showResult = useCallback(
    async (r: PullFinishResponse) => {
      const label = r.isTest ? "Test pull" : "Pull";
      const seeWhatsNew =
        !r.isTest && r.status !== "failed" && (await hasPreviousPull())
          ? {
              label: "See what’s new",
              onClick: () => navigate("/overview", { state: { whatsNew: true } }),
            }
          : undefined;
      if (r.status === "done") {
        toast.show({
          title: `${label} complete`,
          detail: [
            plural(r.postsFound, "post"),
            `${plural(r.creditsUsed, "credit")} used`,
            r.credits ? `${formatNumber(r.credits.remaining)} left` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          pose: "success",
          action: seeWhatsNew,
        });
      } else if (r.status === "partial") {
        const handleProblem = r.problems.some((p) => p.code === "not_found");
        toast.show({
          title: `${label} finished with ${plural(r.problems.length, "problem")}`,
          detail: `${problemSentence(r.problems)} Everything else updated.`,
          pose: "error",
          action: handleProblem
            ? { label: "Fix handle", onClick: () => navigate("/competitors") }
            : seeWhatsNew,
        });
      } else {
        toast.show({
          title: `${label} failed. Nothing changed.`,
          detail: problemSentence(r.problems) || "No posts came back from Firecrawl.",
          pose: "error",
          action: { label: "Try again", onClick: openRefresh },
        });
      }
    },
    [toast, navigate, openRefresh, hasPreviousPull],
  );

  const drive = useCallback(
    async (pullId: string) => {
      if (driving.current) return;
      driving.current = true;
      setState({ kind: "running", pullId, progress: null, cardOpen: true });
      try {
        const result = await runPull(
          pullId,
          deps,
          (progress) =>
            setState((s) => (s.kind === "running" && s.pullId === pullId ? { ...s, progress } : s)),
          (notice) =>
            toast.show({
              title: "Firecrawl asked us to slow down",
              detail: `Resuming in ${Math.round(notice.waitMs / 1000)} s — nothing to do.`,
              pose: "idle",
            }),
        );
        setState({ kind: "idle" });
        await refreshData(); // new pull → Overview reloads before the toast points at it
        void showResult(result);
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
            progress: s.kind === "running" ? s.progress : null,
          }));
          toast.show({
            title: "Firecrawl asked us to slow down",
            detail: `Resuming in ${AUTO_RESUME_MS / 1000} s — nothing to do.`,
            pose: "idle",
          });
          window.setTimeout(() => driveRef.current(pullId), AUTO_RESUME_MS);
          return;
        }
        setState((s) => ({
          kind: "interrupted",
          pullId,
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
          action: { label: "Resume", onClick: () => driveRef.current(pullId) },
        });
      } finally {
        driving.current = false;
        await refreshData();
      }
    },
    [refreshData, showResult, toast],
  );

  useEffect(() => {
    driveRef.current = (id: string) => void drive(id);
  }, [drive]);

  // Resume after a reload: a `running` pull that nobody is driving.
  useEffect(() => {
    if (!clientId || resumeChecked.current) return;
    resumeChecked.current = true;
    void supabase
      .from("pulls")
      .select("id")
      .eq("client_id", clientId)
      .eq("status", "running")
      .maybeSingle()
      .then(async ({ data }) => {
        if (!data?.id || driving.current) return;
        const progress = progressOf((await listTasks(data.id)).map(toProgress));
        setState({ kind: "interrupted", pullId: data.id, progress });
        toast.show({
          title: "Your last pull didn’t finish",
          detail: `${Math.round(progress.fraction * 100)}% done · nothing is lost`,
          pose: "idle",
          action: { label: "Resume", onClick: () => driveRef.current(data.id) },
        });
      });
  }, [clientId, toast]);

  const start = useCallback(
    async (platforms: Platform[]) => {
      if (!clientId) return;
      setRefreshOpen(false);
      setState({ kind: "starting" });
      const res = await pullStart({ clientId, platforms });
      if (res.ok && res.data.status === "started" && res.data.pullId) return drive(res.data.pullId);
      if (res.status === 409 && typeof res.data?.pullId === "string") return drive(res.data.pullId);
      setState({ kind: "idle" });
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
    [clientId, drive, openRefresh, toast],
  );

  const api = useMemo(
    () => ({
      state,
      clientId,
      refreshOpen,
      onRefreshClick: () => {
        if (state.kind === "running") setState({ ...state, cardOpen: true });
        else if (state.kind === "interrupted") void drive(state.pullId);
        else if (state.kind === "idle") setRefreshOpen(true);
      },
      closeRefresh: () => setRefreshOpen(false),
      start,
      resume: () => {
        if (state.kind === "interrupted") void drive(state.pullId);
      },
      hideCard: () => setState((s) => (s.kind === "running" ? { ...s, cardOpen: false } : s)),
    }),
    [state, clientId, refreshOpen, start, drive],
  );

  return (
    <PullContext value={api}>
      {children}
      <RefreshDialog />
      <PullProgressDialog />
    </PullContext>
  );
}
