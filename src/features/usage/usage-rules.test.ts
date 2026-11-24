import { describe, expect, it } from "vitest";
import {
  avgPerPull,
  billingLabel,
  shortWeekLabels,
  axisMax,
  chartSeries,
  lastWeeks,
  mondayOf,
  otherCredits,
  runningLow,
  tableRows,
  tooltipLines,
  totals,
  type UsageClient,
  type UsageWeekRow,
  weekBars,
} from "./usage-rules";

const client = (id: string, name: string, o: Partial<UsageClient> = {}): UsageClient => ({
  id,
  slug: id,
  name,
  initials: null,
  brand_color: null,
  is_demo: false,
  archived_at: null,
  credits: 0,
  pull_credits: 0,
  check_credits: 0,
  scan_credits: 0,
  groq_requests: 0,
  pulls: 0,
  last_pull: null,
  storage_bytes: 0,
  posts: 0,
  ideas: 0,
  cards: 0,
  ...o,
});
const obu = client("obu", "OBU Health", {
  credits: 77,
  pull_credits: 77,
  pulls: 1,
  storage_bytes: 148e6,
});
const atb = client("atb", "All The Best Co", {
  credits: 75,
  pull_credits: 64,
  scan_credits: 11,
  pulls: 1,
});
const demo = client("demo", "Demo Wellness Co", { is_demo: true });
const old = client("nw", "Northwind Clinic", { archived_at: "2026-11-01", credits: 0 });

describe("weeks", () => {
  it("Mondays, last 8, oldest first", () => {
    expect(mondayOf("2026-11-24")).toBe("2026-11-23");
    expect(mondayOf("2026-11-29")).toBe("2026-11-23"); // Sunday
    expect(lastWeeks("2026-11-24")).toEqual([
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
      "2026-11-23",
    ]);
  });
});

describe("table", () => {
  it("active by credits, then demo, archived last; totals; other credits", () => {
    expect(tableRows([old, demo, atb, obu]).map((c) => c.name)).toEqual([
      "OBU Health",
      "All The Best Co",
      "Demo Wellness Co",
      "Northwind Clinic",
    ]);
    expect(totals([obu, atb, demo, old])).toMatchObject({ credits: 152, pulls: 2, scans: 11 });
    expect(otherCredits(177, 152)).toBe(25);
    expect(otherCredits(100, 152)).toBe(0);
    expect(otherCredits(null, 152)).toBe(0);
    expect(avgPerPull(obu)).toBe(77);
    expect(avgPerPull(demo)).toBeNull();
    expect(runningLow(90, 1000)).toBe(true);
    expect(runningLow(772, 1000)).toBe(false);
  });
});

describe("weekly chart", () => {
  const rows: UsageWeekRow[] = [
    { week: "2026-11-16", client_id: "obu", kind: "pull", credits: 96, pulls: 1 },
    { week: "2026-11-23", client_id: "obu", kind: "pull", credits: 77, pulls: 1 },
    { week: "2026-11-23", client_id: "atb", kind: "pull", credits: 64, pulls: 1 },
    { week: "2026-11-23", client_id: "atb", kind: "scan", credits: 7, pulls: 0 },
    { week: "2026-11-23", client_id: "atb", kind: "competitor_search", credits: 4, pulls: 0 },
    { week: "2026-11-16", client_id: "demo", kind: "handle_check", credits: 13, pulls: 0 },
    { week: "2026-11-16", client_id: null, kind: "scan", credits: 2, pulls: 0 },
  ];
  const series = chartSeries([obu, atb, demo, old], rows);
  it("top 2 get their own shade; the rest are 'Demo + other'", () => {
    expect(series.map((s) => [s.name, s.shade])).toEqual([
      ["OBU Health", 0],
      ["All The Best Co", 1],
      ["Demo + other", 2],
    ]);
  });
  it("stacks per week; unassigned credits count as other; axis rounds up", () => {
    const bars = weekBars(["2026-11-16", "2026-11-23"], series, rows);
    expect(bars).toEqual([
      {
        week: "2026-11-16",
        total: 111,
        parts: [
          { key: "obu", credits: 96 },
          { key: "atb", credits: 0 },
          { key: "other", credits: 15 },
        ],
      },
      {
        week: "2026-11-23",
        total: 152,
        parts: [
          { key: "obu", credits: 77 },
          { key: "atb", credits: 75 },
          { key: "other", credits: 0 },
        ],
      },
    ]);
    expect(axisMax(bars)).toBe(160);
    expect(axisMax([])).toBe(10);
  });
  it("tooltip like the frame", () => {
    expect(tooltipLines(series[1], "2026-11-23", rows)).toEqual({
      title: "All The Best Co · week of 23 Nov",
      detail: "75 credits · 1 pull (64) + scan (11)",
    });
    expect(tooltipLines(series[2], "2026-11-16", rows).detail).toBe(
      "15 credits · scan (2) + checks (13)",
    );
    expect(tooltipLines(series[0], "2026-10-05", rows).detail).toBe("No credits");
  });
});

describe("labels", () => {
  it("billing month up to the day before the reset", () => {
    expect(billingLabel("2026-11-01T00:00:00Z", "2026-12-01T12:00:00Z")).toBe("1–30 Nov");
    expect(billingLabel("2026-11-15T00:00:00Z", "2026-12-15T00:00:00Z")).toBe("15 Nov – 14 Dec");
    expect(billingLabel(null, "2026-12-01")).toBeNull();
  });
  it("phone week labels name the month only when it changes", () => {
    expect(
      shortWeekLabels(["2026-10-05", "2026-10-12", "2026-10-26", "2026-11-02", "2026-11-09"]),
    ).toEqual(["5 Oct", "12", "26", "2 Nov", "9"]);
  });
});
