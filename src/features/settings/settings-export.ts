// The four Settings exports (13 › Data › Export): one CSV each, built in the browser from what the
// team can already read. Pure (rows in → CSV text out), tested in settings-export.test.ts.

import type { CalendarEvent } from "../calendar/events/types";
import { toCsv, type CsvColumn } from "./csv";

export type ExportKind = "posts" | "ideas" | "cards" | "events";

export const EXPORTS: { kind: ExportKind; label: string; detail: string; file: string }[] = [
  { kind: "posts", label: "Posts", detail: "Latest pull", file: "posts" },
  { kind: "ideas", label: "Ideas", detail: "The whole idea board", file: "ideas" },
  { kind: "cards", label: "Calendar cards", detail: "Every planned post", file: "calendar-cards" },
  {
    kind: "events",
    label: "Calendar events",
    detail: "Holidays, health months, marketing dates · this month + 3",
    file: "calendar-events",
  },
];

// ───────────────────────────── posts (latest pull)
export type ExportPost = {
  competitor_id: string;
  platform: string;
  format: string | null;
  posted_at: string | null;
  url: string;
  caption: string | null;
  hashtags: string[] | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  counts_hidden: boolean;
};

export function postsCsv(
  posts: ExportPost[],
  brands: { id: string; name: string }[],
  pullStartedAt: string,
): string {
  const name = new Map(brands.map((b) => [b.id, b.name]));
  const rows = [...posts].sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? ""));
  const cols: CsvColumn<ExportPost>[] = [
    { label: "Brand", value: (p) => name.get(p.competitor_id) ?? "" },
    { label: "Platform", value: (p) => p.platform },
    { label: "Format", value: (p) => p.format },
    { label: "Posted at (UTC)", value: (p) => p.posted_at },
    // Hidden counts (the brand turned them off) are blank, not 0.
    { label: "Likes", value: (p) => (p.counts_hidden ? null : p.likes) },
    { label: "Comments", value: (p) => (p.counts_hidden ? null : p.comments) },
    { label: "Views", value: (p) => p.views },
    { label: "Counts hidden", value: (p) => p.counts_hidden },
    { label: "Caption", value: (p) => p.caption },
    { label: "Hashtags", value: (p) => (p.hashtags ?? []).map((t) => `#${t}`).join(" ") },
    { label: "Link", value: (p) => p.url },
    { label: "Pull from (UTC)", value: () => pullStartedAt },
  ];
  return toCsv(rows, cols);
}

// ───────────────────────────── ideas
export type ExportIdea = {
  created_at: string;
  kind: string;
  note: string | null;
  link_url: string | null;
  platform: string | null;
  format: string | null;
  tags: string[];
  source_snapshot: { brand?: string; url?: string | null; suggested_date?: string } | null;
  creator: { full_name: string | null } | null;
  planned: { date: string } | null;
};

export function ideasCsv(ideas: ExportIdea[]): string {
  const cols: CsvColumn<ExportIdea>[] = [
    { label: "Added (UTC)", value: (i) => i.created_at },
    { label: "Kind", value: (i) => i.kind },
    { label: "Note", value: (i) => i.note },
    { label: "Platform", value: (i) => i.platform },
    { label: "Format", value: (i) => i.format },
    { label: "Tags", value: (i) => i.tags.join(", ") },
    { label: "Link", value: (i) => i.link_url ?? i.source_snapshot?.url ?? null },
    { label: "From brand", value: (i) => i.source_snapshot?.brand ?? null },
    { label: "Suggested date", value: (i) => i.source_snapshot?.suggested_date ?? null },
    { label: "Planned for", value: (i) => i.planned?.date ?? null },
    {
      label: "Added by",
      value: (i) => (i.kind === "ai" ? "Blip" : (i.creator?.full_name ?? null)),
    },
  ];
  return toCsv(ideas, cols);
}

// ───────────────────────────── calendar cards
export type ExportCard = {
  date: string;
  title: string;
  platform: string | null;
  format: string | null;
  status: string;
  hook: string | null;
  caption: string | null;
  visual_idea: string | null;
  origin: string;
  compliance_status: string | null;
  updated_at: string;
  creator: { full_name: string | null } | null;
};

export function cardsCsv(cards: ExportCard[]): string {
  const rows = [...cards].sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
  );
  const cols: CsvColumn<ExportCard>[] = [
    { label: "Date", value: (c) => c.date },
    { label: "Title", value: (c) => c.title },
    { label: "Platform", value: (c) => c.platform },
    { label: "Format", value: (c) => c.format },
    { label: "Status", value: (c) => c.status },
    { label: "Hook", value: (c) => c.hook },
    { label: "Caption", value: (c) => c.caption },
    { label: "Visual idea", value: (c) => c.visual_idea },
    { label: "Started as", value: (c) => c.origin },
    { label: "Health check", value: (c) => c.compliance_status },
    { label: "Created by", value: (c) => c.creator?.full_name ?? null },
    { label: "Last edited (UTC)", value: (c) => c.updated_at },
  ];
  return toCsv(rows, cols);
}

// ───────────────────────────── calendar events (code rules + Nager, never AI)
const KIND_LABEL: Record<CalendarEvent["kind"], string> = {
  holiday: "Holiday",
  marketing: "Marketing date",
  health: "Health month",
};

export function eventsCsv(events: CalendarEvent[]): string {
  const rows = [...events].sort(
    (a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name),
  );
  const cols: CsvColumn<CalendarEvent>[] = [
    { label: "Start", value: (e) => e.start },
    { label: "End", value: (e) => e.end },
    { label: "Name", value: (e) => e.name },
    { label: "Kind", value: (e) => KIND_LABEL[e.kind] ?? e.kind },
  ];
  return toCsv(rows, cols);
}

/** First day of this month … last day of the month 3 months ahead ("2026-11-01", "2027-02-28"). */
export function eventsWindow(today: string): { from: string; to: string; years: number[] } {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)); // 1-12
  const endMonthIndex = m - 1 + 3;
  const endY = y + Math.floor(endMonthIndex / 12);
  const endM = (endMonthIndex % 12) + 1;
  const lastDay = new Date(Date.UTC(endY, endM, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${endY}-${pad(endM)}-${pad(lastDay)}`,
    years: endY === y ? [y] : [y, endY],
  };
}
