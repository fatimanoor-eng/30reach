import { describe, expect, it } from "vitest";
import {
  appPathOf,
  clientInitials,
  clientPath,
  filterClients,
  lastPullLabel,
  markColors,
  orderClients,
  pickLastClient,
  slugOf,
} from "./client-path";

const c = (id: string, name: string, archived = false) => ({
  id,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  archived_at: archived ? "2026-11-01T00:00:00Z" : null,
});
const obu = c("1", "OBU Health");
const best = c("2", "All The Best Co");
const demo = c("3", "Demo Wellness Co");
const old = c("4", "Aardvark Labs", true);

describe("client paths", () => {
  it("puts the client in front of the page", () => {
    expect(clientPath("obu-health", "/calendar?date=2026-12-04")).toBe(
      "/c/obu-health/calendar?date=2026-12-04",
    );
    expect(clientPath("obu-health", "ideas")).toBe("/c/obu-health/ideas");
  });
  it("finds the page and the slug", () => {
    expect(appPathOf("/c/obu-health/ideas")).toBe("/ideas");
    expect(appPathOf("/c/obu-health")).toBe("/");
    expect(appPathOf("/overview")).toBe("/overview");
    expect(slugOf("/c/all-the-best-co/instagram")).toBe("all-the-best-co");
    expect(slugOf("/overview")).toBeUndefined();
  });
});

describe("pickLastClient", () => {
  const all = [obu, best, demo, old];
  it("prefers your last client on any device, then this browser's, then A–Z", () => {
    expect(pickLastClient(all, { profileClientId: "3", storedSlug: "obu-health" })).toBe(demo);
    expect(pickLastClient(all, { profileClientId: null, storedSlug: "obu-health" })).toBe(obu);
    expect(pickLastClient(all, { profileClientId: "gone", storedSlug: "gone" })).toBe(best);
  });
  it("never falls back to an archived client, but keeps one you last opened", () => {
    expect(pickLastClient([old, obu], {})).toBe(obu);
    expect(pickLastClient([old, obu], { profileClientId: "4" })).toBe(old);
    expect(pickLastClient([], {})).toBeUndefined();
  });
});

describe("orderClients", () => {
  it("current first, then A–Z, archived left out", () => {
    expect(orderClients([obu, demo, best, old], "3").map((x) => x.name)).toEqual([
      "Demo Wellness Co",
      "All The Best Co",
      "OBU Health",
    ]);
  });
  it("search filters by name", () => {
    expect(filterClients([obu, best, demo], " co").map((x) => x.id)).toEqual(["2", "3"]);
    expect(filterClients([obu, best], "")).toHaveLength(2);
  });
});

describe("lastPullLabel", () => {
  const now = new Date(2026, 10, 24, 10);
  it("says when the client was last pulled", () => {
    expect(lastPullLabel(null, now)).toBe("No pull yet");
    expect(lastPullLabel(new Date(2026, 10, 24, 8).toISOString(), now)).toBe("Pulled today");
    expect(lastPullLabel(new Date(2026, 10, 24, 8).toISOString(), now, { short: true })).toBe(
      "Today",
    );
    expect(lastPullLabel(new Date(2026, 10, 23, 23).toISOString(), now)).toBe("Yesterday");
    expect(lastPullLabel(new Date(2026, 10, 22, 12).toISOString(), now)).toBe("2 days ago");
  });
});

describe("client mark", () => {
  it("uses saved initials, else the first two letters", () => {
    expect(clientInitials("OBU Health", "OB")).toBe("OB");
    expect(clientInitials("All The Best Co", null)).toBe("AL");
    expect(clientInitials("  northwind clinic ")).toBe("NO");
  });
  it("brand colour with readable text; none / black / white → ink with a hairline", () => {
    expect(markColors(null)).toEqual({ kind: "ink" });
    expect(markColors("#000000")).toEqual({ kind: "ink" });
    expect(markColors("#FFFFFF")).toEqual({ kind: "ink" });
    expect(markColors("not a colour")).toEqual({ kind: "ink" });
    expect(markColors("#C8102E")).toEqual({ kind: "brand", background: "#C8102E", text: "white" });
    expect(markColors("#E9E9E3")).toEqual({ kind: "brand", background: "#E9E9E3", text: "ink" });
    expect(markColors("#F4EB02")).toEqual({ kind: "brand", background: "#F4EB02", text: "ink" });
  });
});
