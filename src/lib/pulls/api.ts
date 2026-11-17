import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../supabase";

/** Mirrors supabase/functions/_shared/pull-logic.ts (kept in sync by hand; both are small). */
export type Platform = "instagram" | "tiktok";

export type Estimate = {
  perPlatform: Record<Platform, { tasks: number; expected: number; max: number }>;
  expected: number;
  max: number;
};

export type CreditsReading = {
  remaining: number;
  plan: number;
  periodStart: string | null;
  resetsAt: string | null;
};

export type PullStartResponse = {
  status: "preview" | "insufficient" | "started" | "running";
  pullId?: string;
  estimate: Estimate;
  credits: CreditsReading;
  lastPullAt: string | null;
  brands: number;
  pageCap: number;
  windowDays: number;
  isTest: boolean;
};

export type PullTaskResponse = {
  taskId: string;
  status: "queued" | "running" | "done" | "failed";
  more: boolean;
  pages: number;
  postsFound: number;
  creditsUsed: number;
  errorCode: string | null;
  stopReason?: string | null;
};

export type PullProblem = { brand: string; platform: Platform; code: string };

export type PullFinishResponse = {
  status: "done" | "partial" | "failed";
  isTest: boolean;
  postsFound: number;
  creditsUsed: number;
  credits: CreditsReading | null;
  problems: PullProblem[];
  deleted: number;
};

export type FnResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; data: Record<string, unknown> | null };

/** Calls an Edge Function and always returns the HTTP status + JSON body (also for 4xx/5xx). */
export async function callFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<FnResult<T>> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (!error) return { ok: true, status: 200, data: data as T };
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    let json: Record<string, unknown> | null = null;
    try {
      json = await res.json();
    } catch {
      /* no body */
    }
    return { ok: false, status: res.status, data: json };
  }
  return { ok: false, status: 0, data: { error: "network", message: error.message } };
}

export type StartArgs = {
  clientId: string;
  platforms?: Platform[];
  preview?: boolean;
  test?: { competitorId: string; platform: Platform };
};

export const pullStart = (args: StartArgs) =>
  callFunction<PullStartResponse>("pull-start", { ...args });
export const pullTask = (taskId: string) => callFunction<PullTaskResponse>("pull-task", { taskId });
export const pullFinish = (pullId: string) =>
  callFunction<PullFinishResponse>("pull-finish", { pullId });

export type TaskRow = {
  id: string;
  platform: Platform;
  status: PullTaskResponse["status"];
  pages: number;
  posts_found: number;
  credits_used: number;
  error_code: string | null;
  competitor_id: string;
  competitors: { name: string } | null;
};

/** Tasks of a pull (team can read pull_tasks via RLS). */
export async function listTasks(pullId: string): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from("pull_tasks")
    .select(
      "id, platform, status, pages, posts_found, credits_used, error_code, competitor_id, competitors(name)",
    )
    .eq("pull_id", pullId)
    .order("platform")
    .order("id");
  if (error) throw error;
  return (data ?? []) as unknown as TaskRow[];
}
