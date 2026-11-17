import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "../../app/PageHeader";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Dialog } from "../../components/Dialog";
import { SegmentedControl } from "../../components/SegmentedControl";
import {
  type Platform,
  type PullFinishResponse,
  type PullStartResponse,
  listTasks,
  pullFinish,
  pullStart,
  pullTask,
} from "../../lib/pulls/api";
import { type PullProgress, PullInterrupted, runPull } from "../../lib/pulls/run-pull";
import { formatNumber, formatShortDate, plural } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import { CREDITS_QUERY_KEY } from "../../lib/useCredits";

/**
 * DEV ONLY (/dev/test-pull, not in production builds). Slice 5 test mode:
 * one brand × one platform, 2-page cap, so you can check the data before any full pull.
 * Uses the real pull-start / pull-task / pull-finish functions with test: {...}.
 */
type Phase =
  | { kind: "idle" }
  | { kind: "running"; progress: PullProgress | null }
  | { kind: "done"; pullId: string; result: PullFinishResponse }
  | { kind: "error"; message: string; pullId?: string };

const deps = { listTasks, pullTask, pullFinish };

export function TestPullPage() {
  const queryClient = useQueryClient();
  const [pickedId, setPickedId] = useState<string>("");
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [confirming, setConfirming] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const client = useQuery({
    queryKey: ["client", "obu-health"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("slug", "obu-health")
        .single();
      if (error) throw error;
      return data;
    },
  });

  const competitors = useQuery({
    queryKey: ["competitors", client.data?.id],
    enabled: !!client.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("competitors")
        .select("id, name, instagram_handle, tiktok_handle, instagram_status, tiktok_status")
        .eq("client_id", client.data!.id)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Default target: Hims (agreed test: Hims Instagram, 4 credits) until you pick another brand.
  const competitorId =
    pickedId ||
    (competitors.data?.find((c) => c.name === "Hims") ?? competitors.data?.[0])?.id ||
    "";

  const running = useQuery({
    queryKey: ["running-pull", client.data?.id],
    enabled: !!client.data,
    queryFn: async () => {
      const { data } = await supabase
        .from("pulls")
        .select("id, is_test, started_at")
        .eq("client_id", client.data!.id)
        .eq("status", "running")
        .maybeSingle();
      return data;
    },
  });

  // Preview = estimate + live balance. Costs 0 Firecrawl credits.
  const preview = useQuery({
    queryKey: ["test-pull-preview", client.data?.id, competitorId, platform],
    enabled: !!client.data && !!competitorId && phase.kind !== "running",
    staleTime: 60_000,
    queryFn: async (): Promise<PullStartResponse> => {
      const res = await pullStart({
        clientId: client.data!.id,
        preview: true,
        test: { competitorId, platform },
      });
      if (res.ok) return res.data;
      if (res.status === 409)
        return { ...(res.data as unknown as PullStartResponse), status: "running" };
      throw new Error(String(res.data?.error ?? `HTTP ${res.status}`));
    },
  });

  const latestTest = useQuery({
    queryKey: ["latest-test-pull", client.data?.id, phase.kind === "done" ? phase.pullId : null],
    enabled: !!client.data && phase.kind !== "running",
    queryFn: async () => {
      const { data } = await supabase
        .from("pulls")
        .select("id, status, started_at, credits_used")
        .eq("client_id", client.data!.id)
        .eq("is_test", true)
        .neq("status", "running")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  async function drive(pullId: string) {
    setPhase({ kind: "running", progress: null });
    try {
      const result = await runPull(pullId, deps, (progress) =>
        setPhase({ kind: "running", progress }),
      );
      setPhase({ kind: "done", pullId, result });
    } catch (err) {
      setPhase({
        kind: "error",
        pullId,
        message:
          err instanceof PullInterrupted
            ? `Stopped (${err.reason}). The pull is resumable.`
            : String(err),
      });
    } finally {
      await queryClient.invalidateQueries({ queryKey: CREDITS_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ["running-pull"] });
      await queryClient.invalidateQueries({ queryKey: ["competitors"] });
    }
  }

  async function start() {
    setConfirming(false);
    setPhase({ kind: "running", progress: null });
    const res = await pullStart({ clientId: client.data!.id, test: { competitorId, platform } });
    if (res.ok && res.data.status === "started" && res.data.pullId) return drive(res.data.pullId);
    const reason = res.ok
      ? res.data.status
      : String(res.data?.error ?? res.data?.status ?? `HTTP ${res.status}`);
    setPhase({ kind: "error", message: `Not started: ${reason}` });
  }

  const target = competitors.data?.find((c) => c.id === competitorId);
  const handle = target?.[`${platform}_handle` as const];
  const est = preview.data?.estimate;
  const maxCredits = est?.max ?? 0;

  return (
    <>
      <PageHeader title="Test pull" crumbs={["Dev", "Test pull"]} />
      <div className="flex flex-col gap-6">
        <Card
          title="1 · Choose one brand and one platform"
          info="Test mode: 2-page cap, marked is_test. Ignored by dashboards; deleted when the first real pull finishes."
        >
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-body-sm">
              <span className="mono-label text-muted">Brand</span>
              <select
                value={competitorId}
                onChange={(e) => setPickedId(e.target.value)}
                disabled={phase.kind === "running"}
                className="min-h-11 rounded-control border border-line bg-surface px-3 text-body-sm md:min-h-10"
              >
                {competitors.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <SegmentedControl
              label="Platform"
              value={platform}
              onChange={setPlatform}
              options={[
                { value: "instagram", label: "Instagram" },
                { value: "tiktok", label: "TikTok" },
              ]}
            />
            {handle && <Chip>@{handle}</Chip>}
          </div>
        </Card>

        <Card title="2 · Expected cost (checked live, costs nothing)">
          {preview.isLoading && <p className="text-body-sm text-muted">Checking…</p>}
          {preview.isError && (
            <p role="alert" className="text-body-sm text-spark">
              {String(preview.error)}
            </p>
          )}
          {preview.data && est && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 font-mono text-small">
              <dt className="text-muted">Expected</dt>
              <dd>~{plural(est.expected, "credit")}</dd>
              <dt className="text-muted">At most</dt>
              <dd>
                {plural(est.max, "credit")} ({plural(preview.data.pageCap, "page")} × 2)
              </dd>
              <dt className="text-muted">Credits left</dt>
              <dd>
                {preview.data.credits
                  ? `${formatNumber(preview.data.credits.remaining)} of ${formatNumber(preview.data.credits.plan)}`
                  : "—"}
              </dd>
              <dt className="text-muted">Window</dt>
              <dd>last {preview.data.windowDays} days</dd>
              <dt className="text-muted">Status</dt>
              <dd>{preview.data.status}</dd>
            </dl>
          )}
          {running.data && phase.kind !== "running" && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-body-sm">
                A {running.data.is_test ? "test " : ""}pull is still running from{" "}
                {new Date(running.data.started_at).toLocaleTimeString()}.
              </p>
              <Button variant="secondary" onClick={() => drive(running.data!.id)}>
                Resume it
              </Button>
            </div>
          )}
          <div className="mt-5">
            <Button
              onClick={() => setConfirming(true)}
              disabled={
                !preview.data || preview.data.status !== "preview" || phase.kind === "running"
              }
            >
              Run test pull (up to {maxCredits ? plural(maxCredits, "credit") : "… credits"})
            </Button>
          </div>
        </Card>

        {phase.kind !== "idle" && (
          <Card title="3 · Result">
            {phase.kind === "running" && (
              <div className="flex flex-col gap-2 font-mono text-small">
                <p>Pulling… {Math.round((phase.progress?.fraction ?? 0) * 100)}%</p>
                {phase.progress?.tasks.map((t) => (
                  <p key={t.id}>
                    {t.brand} · {t.platform} · {t.status} · {plural(t.pages, "page")} ·{" "}
                    {plural(t.postsFound, "post")} · {plural(t.creditsUsed, "credit")}
                  </p>
                ))}
              </div>
            )}
            {phase.kind === "error" && (
              <p role="alert" className="text-body-sm text-spark">
                {phase.message}
              </p>
            )}
            {phase.kind === "done" && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 font-mono text-small">
                <dt className="text-muted">Status</dt>
                <dd>{phase.result.status}</dd>
                <dt className="text-muted">Posts saved</dt>
                <dd>{plural(phase.result.postsFound, "post")}</dd>
                <dt className="text-muted">Credits used</dt>
                <dd>{plural(phase.result.creditsUsed, "credit")}</dd>
                <dt className="text-muted">Credits left</dt>
                <dd>{phase.result.credits ? formatNumber(phase.result.credits.remaining) : "—"}</dd>
                {phase.result.problems.map((p) => (
                  <dd key={`${p.brand}${p.platform}`} className="col-span-2 text-spark">
                    {p.brand} {p.platform}: {p.code}
                  </dd>
                ))}
              </dl>
            )}
          </Card>
        )}

        {latestTest.data && <TestPosts pullId={latestTest.data.id} />}
      </div>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Run a test pull for ${target?.name ?? "this brand"} on ${platform === "instagram" ? "Instagram" : "TikTok"}?`}
        description={`This spends real Firecrawl credits: about ${est?.expected ?? "?"}, at most ${maxCredits}. Posts from the last 30 days are saved as a test pull.`}
        primary={{ label: `Spend up to ${plural(maxCredits, "credit")}`, onClick: start }}
      />
    </>
  );
}

/** Posts of the latest test pull, with thumbnails (private bucket → short-lived signed URLs). */
function TestPosts({ pullId }: { pullId: string }) {
  const posts = useQuery({
    queryKey: ["test-pull-posts", pullId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select(
          "id, platform, url, posted_at, format, likes, comments, views, hashtags, thumbnail_path, competitors(name)",
        )
        .eq("pull_id", pullId)
        .order("posted_at", { ascending: false });
      if (error) throw error;
      const paths = data.map((p) => p.thumbnail_path).filter((p): p is string => !!p);
      const signed = paths.length
        ? ((await supabase.storage.from("post-thumbs").createSignedUrls(paths, 600)).data ?? [])
        : [];
      const urls = new Map(signed.map((s) => [s.path, s.signedUrl]));
      return data.map((p) => ({
        ...p,
        thumb: p.thumbnail_path ? urls.get(p.thumbnail_path) : undefined,
      }));
    },
  });

  return (
    <Card
      title={`Latest test pull · ${posts.data ? plural(posts.data.length, "post") : "…"}`}
      info="Also in Supabase → Table Editor → posts (filter pull_id) and Storage → post-thumbs."
    >
      {posts.isError && (
        <p role="alert" className="text-spark">
          {String(posts.error)}
        </p>
      )}
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {posts.data?.map((p) => (
          <li key={p.id} className="overflow-hidden rounded-tile border border-line">
            {p.thumb ? (
              <img
                src={p.thumb}
                alt=""
                className="aspect-[4/5] w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex aspect-[4/5] items-end bg-soft p-2">
                <Chip>{p.format ?? "post"}</Chip>
              </div>
            )}
            <div className="flex flex-col gap-1 p-2 font-mono text-label">
              <span>
                {p.format} · {formatShortDate(p.posted_at) ?? "—"}
              </span>
              <span>
                {countOrDash(p.likes, "like")} · {countOrDash(p.comments, "comment")} ·{" "}
                {countOrDash(p.views, "view")}
              </span>
              <span className="truncate text-muted">
                {p.hashtags?.map((h: string) => `#${h}`).join(" ") || "no hashtags"}
              </span>
              <a href={p.url} target="_blank" rel="noreferrer" className="text-blue">
                Open post
              </a>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** "1 like" / "12 likes"; "— views" when the platform has no count (e.g. Instagram images). */
function countOrDash(n: number | null, word: string) {
  return n === null ? `— ${word}s` : plural(n, word);
}
