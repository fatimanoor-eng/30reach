import { describe, expect, it } from "vitest";
import type { CardFields } from "./cards-api";
import {
  clearDraft,
  DRAFT_MAX_AGE_MS,
  DRAFT_PREFIX,
  readDraft,
  saveDraft,
  sweepDrafts,
} from "./card-drafts";

/** A Map-backed Storage, like localStorage. */
function memoryStore() {
  const m = new Map<string, string>();
  return {
    map: m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
  };
}

const SAVED: CardFields = {
  date: "2026-12-04",
  platform: "tiktok",
  format: "video",
  title: "Holiday eating, no guilt",
  hook: "One meal doesn’t undo your progress.",
  caption: "Saved caption",
  visual_idea: null,
  status: "drafting",
};
const UPDATED_AT = "2026-11-17T10:00:00Z";
const T = Date.parse(UPDATED_AT);
const HOUR = 3_600_000;

describe("card drafts (unsaved edits kept in this browser)", () => {
  it("offers a draft newer than the saved card that differs from it", () => {
    const store = memoryStore();
    saveDraft(store, "k2", { ...SAVED, caption: "Typed, never saved" }, T + HOUR);
    expect(readDraft(store, "k2", SAVED, UPDATED_AT, T + 2 * HOUR)).toEqual({
      fields: { ...SAVED, caption: "Typed, never saved" },
      savedAt: T + HOUR,
    });
  });

  it("drops a draft older than the saved card (someone saved since)", () => {
    const store = memoryStore();
    saveDraft(store, "k2", { ...SAVED, caption: "old edit" }, T - HOUR);
    expect(readDraft(store, "k2", SAVED, UPDATED_AT, T + HOUR)).toBeNull();
    expect(store.map.size).toBe(0);
  });

  it("drops a draft older than 7 days", () => {
    const store = memoryStore();
    saveDraft(store, "k2", { ...SAVED, caption: "edit" }, T + HOUR);
    expect(readDraft(store, "k2", SAVED, UPDATED_AT, T + HOUR + DRAFT_MAX_AGE_MS)).not.toBeNull();
    expect(readDraft(store, "k2", SAVED, UPDATED_AT, T + HOUR + DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(store.map.size).toBe(0);
  });

  it("drops a draft that's the same as what's saved", () => {
    const store = memoryStore();
    saveDraft(store, "k2", SAVED, T + HOUR);
    expect(readDraft(store, "k2", SAVED, UPDATED_AT, T + HOUR)).toBeNull();
    expect(store.map.size).toBe(0);
  });

  it("is per card, and Save / Discard clear it", () => {
    const store = memoryStore();
    saveDraft(store, "k2", { ...SAVED, caption: "a" }, T + HOUR);
    saveDraft(store, "k3", { ...SAVED, caption: "b" }, T + HOUR);
    clearDraft(store, "k2");
    expect([...store.map.keys()]).toEqual([`${DRAFT_PREFIX}k3`]);
  });

  it("ignores junk and survives a blocked or missing store", () => {
    const store = memoryStore();
    store.setItem(`${DRAFT_PREFIX}k2`, "{not json");
    expect(readDraft(store, "k2", SAVED, UPDATED_AT, T)).toBeNull();
    expect(store.map.size).toBe(0);
    const blocked = {
      ...memoryStore(),
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => saveDraft(blocked, "k2", SAVED, T)).not.toThrow();
    expect(readDraft(blocked, "k2", SAVED, UPDATED_AT, T)).toBeNull();
    expect(() => saveDraft(null, "k2", SAVED, T)).not.toThrow();
    expect(readDraft(null, "k2", SAVED, UPDATED_AT, T)).toBeNull();
  });

  it("the sweep drops every card draft older than 7 days, and nothing else", () => {
    const store = memoryStore();
    saveDraft(store, "old", { ...SAVED, caption: "x" }, T - DRAFT_MAX_AGE_MS - 1);
    saveDraft(store, "new", { ...SAVED, caption: "y" }, T - HOUR);
    store.setItem("30reach:something-else", "keep");
    store.setItem(`${DRAFT_PREFIX}broken`, "nope");
    sweepDrafts(store, T);
    expect([...store.map.keys()].sort()).toEqual(
      ["30reach:something-else", `${DRAFT_PREFIX}new`].sort(),
    );
  });

  it("a draft from before a field was added is filled from the saved card", () => {
    const store = memoryStore();
    const older: Partial<CardFields> = { ...SAVED, caption: "edit" };
    delete older.visual_idea;
    store.setItem(`${DRAFT_PREFIX}k2`, JSON.stringify({ fields: older, savedAt: T + HOUR }));
    expect(readDraft(store, "k2", SAVED, UPDATED_AT, T + HOUR)?.fields).toEqual({
      ...SAVED,
      caption: "edit",
    });
  });
});
