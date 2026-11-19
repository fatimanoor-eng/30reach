// Local drafts of unsaved card edits (09 / M08), one per card id, in this browser only.
// Written while the drawer has unsaved changes; cleared on Save or Discard. If the tab closes or
// reloads with edits, the next open of that card offers them back ("You have unsaved changes from
// earlier · Restore · Discard") when the draft is newer than the saved card. Drafts older than 7 days
// are dropped. Pure functions over a Storage-like object (tested in card-drafts.test.ts); every
// storage call is wrapped, so a blocked or full localStorage never breaks the drawer.

import type { CardFields } from "./cards-api";

export const DRAFT_PREFIX = "30reach:card-draft:";
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type CardDraft = { fields: CardFields; savedAt: number };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/** localStorage, or null when the browser blocks it (private mode, disabled site data). */
export function browserStore(): Store | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const keyFor = (cardId: string) => `${DRAFT_PREFIX}${cardId}`;

export function saveDraft(store: Store | null, cardId: string, fields: CardFields, now: number) {
  try {
    store?.setItem(keyFor(cardId), JSON.stringify({ fields, savedAt: now } satisfies CardDraft));
  } catch {
    /* full or blocked: the draft is a convenience, nothing to do */
  }
}

export function clearDraft(store: Store | null, cardId: string) {
  try {
    store?.removeItem(keyFor(cardId));
  } catch {
    /* blocked */
  }
}

function parse(raw: string | null): CardDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<CardDraft>;
    return d && typeof d.savedAt === "number" && d.fields && typeof d.fields === "object"
      ? (d as CardDraft)
      : null;
  } catch {
    return null;
  }
}

/**
 * The draft worth offering for this card: newer than the saved card (`updated_at`), at most 7 days
 * old, and actually different from what's saved. Anything else is removed and null is returned.
 */
export function readDraft(
  store: Store | null,
  cardId: string,
  saved: CardFields,
  savedUpdatedAt: string | null,
  now: number,
): CardDraft | null {
  let raw: string | null;
  try {
    raw = store?.getItem(keyFor(cardId)) ?? null;
  } catch {
    return null;
  }
  const draft = parse(raw);
  const savedAt = savedUpdatedAt ? Date.parse(savedUpdatedAt) : 0;
  const offer =
    !!draft &&
    now - draft.savedAt <= DRAFT_MAX_AGE_MS &&
    draft.savedAt > (Number.isNaN(savedAt) ? 0 : savedAt) &&
    JSON.stringify({ ...saved, ...draft.fields }) !== JSON.stringify(saved);
  if (!offer) {
    if (raw !== null) clearDraft(store, cardId);
    return null;
  }
  return { ...draft, fields: { ...saved, ...draft.fields } };
}

/** Drops every card draft older than 7 days (and unreadable ones). */
export function sweepDrafts(store: Store | null, now: number) {
  if (!store) return;
  try {
    const stale: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (!k?.startsWith(DRAFT_PREFIX)) continue;
      const d = parse(store.getItem(k));
      if (!d || now - d.savedAt > DRAFT_MAX_AGE_MS) stale.push(k);
    }
    for (const k of stale) store.removeItem(k);
  } catch {
    /* blocked */
  }
}
