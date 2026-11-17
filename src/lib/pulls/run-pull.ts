import type { FnResult, Platform, PullFinishResponse, PullTaskResponse, TaskRow } from "./api";

export type TaskProgress = {
  id: string;
  brand: string;
  platform: Platform;
  status: PullTaskResponse["status"];
  pages: number;
  postsFound: number;
  creditsUsed: number;
  errorCode: string | null;
};

export type PullProgress = {
  tasks: TaskProgress[];
  /** 0–1: finished tasks / all tasks. */
  fraction: number;
  creditsUsed: number;
};

export class PullInterrupted extends Error {
  constructor(public reason: string) {
    super(`Pull interrupted: ${reason}`);
  }
}

export type RunDeps = {
  listTasks: (pullId: string) => Promise<TaskRow[]>;
  pullTask: (taskId: string) => Promise<FnResult<PullTaskResponse>>;
  pullFinish: (pullId: string) => Promise<FnResult<PullFinishResponse>>;
  sleep?: (ms: number) => Promise<void>;
};

/** Things the UI may want to tell the person while the pull keeps going by itself. */
export type PullNotice = { kind: "rate_limited"; waitMs: number; attempt: number };

/**
 * Free-plan pacing (first real pull hit Firecrawl 429s with 2 tasks in parallel):
 * one task at a time, a short gap between page calls, long back-off on 429.
 */
export const CONCURRENCY = 1;
export const PAGE_GAP_MS = 3000; // pause before every page call after the first
export const RATE_LIMIT_BACKOFF_MS = [10_000, 20_000, 40_000]; // when 429 has no Retry-After
const MAX_RETRIES = 3; // per task, for other retryable Firecrawl / save errors
const BUSY_WAIT_MS = 3000; // another tab holds the task's lease
const MAX_BUSY_WAITS = 60; // ~3 minutes, then give up (resumable)

export function progressOf(tasks: TaskProgress[]): PullProgress {
  const finished = tasks.filter((t) => t.status === "done" || t.status === "failed").length;
  return {
    tasks,
    fraction: tasks.length ? finished / tasks.length : 0,
    creditsUsed: tasks.reduce((sum, t) => sum + t.creditsUsed, 0),
  };
}

export const toProgress = (t: TaskRow): TaskProgress => ({
  id: t.id,
  brand: t.competitors?.name ?? "Unknown brand",
  platform: t.platform,
  status: t.status,
  pages: t.pages,
  postsFound: t.posts_found,
  creditsUsed: t.credits_used,
  errorCode: t.error_code,
});

/**
 * Drives a pull from the browser: pull-task for every unfinished task (one at a time, paced) until
 * `more` is false, then pull-finish. Works the same for a fresh pull and for Resume after a reload.
 * Throws PullInterrupted if it has to stop; the pull stays `running` and can be resumed later.
 */
export async function runPull(
  pullId: string,
  deps: RunDeps,
  onProgress: (p: PullProgress) => void = () => {},
  onNotice: (n: PullNotice) => void = () => {},
): Promise<PullFinishResponse> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const tasks = (await deps.listTasks(pullId)).map(toProgress);
  const emit = () => onProgress(progressOf(tasks.map((t) => ({ ...t }))));
  emit();

  const queue = tasks.filter((t) => t.status === "queued" || t.status === "running");
  let pageCalls = 0;

  async function runTask(task: TaskProgress) {
    let retries = 0;
    let busyWaits = 0;
    let rateLimits = 0;
    task.status = "running";
    emit();
    for (;;) {
      if (pageCalls++ > 0) await sleep(PAGE_GAP_MS); // stay under Firecrawl's free-plan rate limit
      const res = await deps.pullTask(task.id);
      if (res.ok) {
        Object.assign(task, {
          status: res.data.status,
          pages: res.data.pages,
          postsFound: res.data.postsFound,
          creditsUsed: res.data.creditsUsed,
          errorCode: res.data.errorCode,
        });
        emit();
        if (!res.data.more) return;
        retries = 0;
        rateLimits = 0;
        continue;
      }
      const code = (res.data?.error as string | undefined) ?? `http_${res.status}`;
      if (res.status === 429 || code === "rate_limited") {
        if (rateLimits >= RATE_LIMIT_BACKOFF_MS.length) throw new PullInterrupted("rate_limited");
        const retryAfter = typeof res.data?.retryAfter === "number" ? res.data.retryAfter : null;
        const waitMs = retryAfter ? retryAfter * 1000 : RATE_LIMIT_BACKOFF_MS[rateLimits];
        rateLimits += 1;
        onNotice({ kind: "rate_limited", waitMs, attempt: rateLimits });
        await sleep(waitMs);
        continue;
      }
      if (res.status === 409 && code === "busy") {
        if (++busyWaits > MAX_BUSY_WAITS) throw new PullInterrupted("task_busy");
        await sleep(BUSY_WAIT_MS);
        continue;
      }
      if (res.data?.retryable === true && ++retries <= MAX_RETRIES) {
        await sleep(2000 * retries);
        continue;
      }
      throw new PullInterrupted(code);
    }
  }

  async function worker() {
    for (let task = queue.shift(); task; task = queue.shift()) await runTask(task);
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  for (let attempt = 0; ; attempt++) {
    const res = await deps.pullFinish(pullId);
    if (res.ok) return res.data;
    if (res.status === 409 && attempt < 10) {
      await sleep(BUSY_WAIT_MS); // another tab is still finishing a task
      continue;
    }
    throw new PullInterrupted(
      (res.data?.error as string | undefined) ?? `finish_http_${res.status}`,
    );
  }
}
