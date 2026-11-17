import { describe, expect, it, vi } from "vitest";
import type { FnResult, PullFinishResponse, PullTaskResponse, TaskRow } from "./api";
import {
  PAGE_GAP_MS,
  progressOf,
  PullInterrupted,
  RATE_LIMIT_BACKOFF_MS,
  runPull,
  type RunDeps,
} from "./run-pull";

const row = (id: string, status: TaskRow["status"] = "queued"): TaskRow => ({
  id,
  platform: "instagram",
  status,
  pages: 0,
  posts_found: 0,
  credits_used: 0,
  error_code: null,
  competitor_id: `c-${id}`,
  competitors: { name: `Brand ${id}` },
});

type TaskResult = FnResult<PullTaskResponse>;
const page = (
  taskId: string,
  more: boolean,
  pages: number,
): { ok: true; status: number; data: PullTaskResponse } => ({
  ok: true,
  status: 200,
  data: {
    taskId,
    status: more ? "running" : "done",
    more,
    pages,
    postsFound: pages * 10,
    creditsUsed: pages * 2,
    errorCode: null,
  },
});

const finished: FnResult<PullFinishResponse> = {
  ok: true,
  status: 200,
  data: {
    status: "done",
    isTest: true,
    postsFound: 30,
    creditsUsed: 6,
    credits: null,
    problems: [],
    deleted: 0,
  },
};

function deps(overrides: Partial<RunDeps> = {}): RunDeps {
  return {
    listTasks: async () => [row("a"), row("b")],
    pullTask: vi.fn(async (id: string) => page(id, false, 1)),
    pullFinish: vi.fn(async () => finished),
    sleep: async () => {},
    ...overrides,
  };
}

describe("runPull", () => {
  it("calls each task until `more` is false, then finishes", async () => {
    const calls: string[] = [];
    let aPages = 0;
    const d = deps({
      pullTask: vi.fn(async (id: string) => {
        calls.push(id);
        if (id === "a") return page(id, ++aPages < 2, aPages);
        return page(id, false, 1);
      }),
    });
    const result = await runPull("p1", d);
    expect(calls.filter((c) => c === "a")).toHaveLength(2);
    expect(calls.filter((c) => c === "b")).toHaveLength(1);
    expect(d.pullFinish).toHaveBeenCalledWith("p1");
    expect(result.status).toBe("done");
  });

  it("reports progress up to 100%", async () => {
    const seen: number[] = [];
    await runPull("p1", deps(), (p) => seen.push(p.fraction));
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(1);
  });

  it("resumes: skips tasks that are already done", async () => {
    const d = deps({ listTasks: async () => [row("a", "done"), row("b", "running")] });
    await runPull("p1", d);
    expect(d.pullTask).toHaveBeenCalledTimes(1);
    expect(d.pullTask).toHaveBeenCalledWith("b");
  });

  it("waits when another tab holds the task, then continues", async () => {
    let first = true;
    const d = deps({
      listTasks: async () => [row("a")],
      pullTask: vi.fn(async (id: string): Promise<TaskResult> => {
        if (first) {
          first = false;
          return { ok: false as const, status: 409, data: { error: "busy" } };
        }
        return page(id, false, 1);
      }),
    });
    await expect(runPull("p1", d)).resolves.toMatchObject({ status: "done" });
    expect(d.pullTask).toHaveBeenCalledTimes(2);
  });

  it("retries retryable errors a few times, then stops (resumable)", async () => {
    const d = deps({
      listTasks: async () => [row("a")],
      pullTask: vi.fn(async () => ({
        ok: false as const,
        status: 502,
        data: { error: "firecrawl_unavailable", retryable: true },
      })),
    });
    await expect(runPull("p1", d)).rejects.toBeInstanceOf(PullInterrupted);
    expect(d.pullTask).toHaveBeenCalledTimes(4); // 1 + 3 retries
    expect(d.pullFinish).not.toHaveBeenCalled();
  });

  it("a failed task (e.g. not_found) doesn't stop the others", async () => {
    const d = deps({
      pullTask: vi.fn(async (id: string): Promise<TaskResult> =>
        id === "a"
          ? {
              ok: true as const,
              status: 200,
              data: {
                ...page(id, false, 1).data,
                status: "failed" as const,
                errorCode: "not_found",
                creditsUsed: 0,
              },
            }
          : page(id, false, 1),
      ),
    });
    const progress: ReturnType<typeof progressOf>[] = [];
    await runPull("p1", d, (p) => progress.push(p));
    expect(progress.at(-1)!.tasks.map((t) => t.status)).toEqual(["failed", "done"]);
    expect(d.pullFinish).toHaveBeenCalled();
  });

  it("runs one task at a time, with a gap between page calls (free-plan pacing)", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const sleeps: number[] = [];
    const d = deps({
      listTasks: async () => [row("a"), row("b"), row("c")],
      sleep: async (ms) => void sleeps.push(ms),
      pullTask: vi.fn(async (id: string): Promise<TaskResult> => {
        maxInFlight = Math.max(maxInFlight, ++inFlight);
        await Promise.resolve();
        inFlight--;
        return page(id, false, 1);
      }),
    });
    await runPull("p1", d);
    expect(maxInFlight).toBe(1);
    expect(sleeps).toEqual([PAGE_GAP_MS, PAGE_GAP_MS]); // 3 calls → 2 gaps
  });

  it("on 429 waits for Retry-After, tells the UI, then carries on", async () => {
    const sleeps: number[] = [];
    const notices: number[] = [];
    let first = true;
    const d = deps({
      listTasks: async () => [row("a")],
      sleep: async (ms) => void sleeps.push(ms),
      pullTask: vi.fn(async (id: string): Promise<TaskResult> => {
        if (first) {
          first = false;
          return {
            ok: false,
            status: 429,
            data: { error: "rate_limited", retryable: true, retryAfter: 12 },
          };
        }
        return page(id, false, 1);
      }),
    });
    await expect(runPull("p1", d, undefined, (n) => notices.push(n.waitMs))).resolves.toMatchObject(
      {
        status: "done",
      },
    );
    expect(notices).toEqual([12_000]);
    expect(sleeps).toEqual([12_000, PAGE_GAP_MS]);
  });

  it("on 429 without Retry-After backs off 10 s, 20 s, 40 s, then pauses (resumable)", async () => {
    const sleeps: number[] = [];
    const d = deps({
      listTasks: async () => [row("a")],
      sleep: async (ms) => void sleeps.push(ms),
      pullTask: vi.fn(async (): Promise<TaskResult> => ({
        ok: false,
        status: 429,
        data: { error: "rate_limited", retryable: true },
      })),
    });
    const err = await runPull("p1", d).catch((e) => e);
    expect(err).toBeInstanceOf(PullInterrupted);
    expect(err.reason).toBe("rate_limited");
    expect(sleeps.filter((ms) => ms !== PAGE_GAP_MS)).toEqual(RATE_LIMIT_BACKOFF_MS);
    expect(d.pullFinish).not.toHaveBeenCalled();
  });
});
