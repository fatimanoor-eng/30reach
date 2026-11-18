import { beforeEach, describe, expect, it, vi } from "vitest";

const remove = vi.fn();
vi.mock("../../lib/supabase", () => ({
  AUTH_STORAGE_KEY: "30reach-auth",
  supabase: { storage: { from: () => ({ remove }) } },
}));

const KEY = "30reach:pending-image-deletes";
const listed = () =>
  (JSON.parse(localStorage.getItem(KEY) ?? "[]") as { path: string }[]).map((p) => p.path);

describe("pending image removals (Undo window)", () => {
  beforeEach(() => {
    localStorage.clear();
    remove.mockReset().mockResolvedValue({ error: null });
    vi.resetModules();
  });

  it("holds the image until the toast goes, then removes it", async () => {
    const m = await import("./pending-image-deletes");
    m.holdImageDelete("c/a.webp");
    expect(listed()).toEqual(["c/a.webp"]);
    expect(remove).not.toHaveBeenCalled();
    await m.finishImageDelete("c/a.webp");
    expect(remove).toHaveBeenCalledWith(["c/a.webp"]);
    expect(listed()).toEqual([]);
  });

  it("Undo keeps the image", async () => {
    const m = await import("./pending-image-deletes");
    m.holdImageDelete("c/a.webp");
    m.cancelImageDelete("c/a.webp");
    expect(listed()).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });

  it("a failed removal stays listed for the next visit", async () => {
    remove.mockResolvedValue({ error: { message: "offline" } });
    const m = await import("./pending-image-deletes");
    m.holdImageDelete("c/a.webp");
    await m.finishImageDelete("c/a.webp");
    expect(listed()).toEqual(["c/a.webp"]);
  });

  it("the next visit sweeps only what's past the Undo window", async () => {
    const m = await import("./pending-image-deletes");
    const now = Date.now();
    m.holdImageDelete("c/old.webp", now - m.SWEEP_AFTER_MS - 1);
    m.holdImageDelete("c/new.webp", now - 1000); // another tab may still offer Undo
    await m.sweepImageDeletes(now);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(["c/old.webp"]);
    expect(listed()).toEqual(["c/new.webp"]);
  });
});
