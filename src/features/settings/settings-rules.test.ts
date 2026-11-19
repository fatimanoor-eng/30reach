import { describe, expect, it } from "vitest";
import {
  ago,
  DB_LIMIT_BYTES,
  fill,
  formatBytes,
  groqToday,
  lastSignInLabel,
  memberInitials,
  memberName,
  parseGroqDuration,
  roleBlockedReason,
  roleChoices,
  STORAGE_LIMIT_BYTES,
  TEAM_ERRORS,
  teamErrorText,
  type Member,
} from "./settings-rules";

const NOW = Date.parse("2026-11-20T12:00:00Z");
const MB = 1024 * 1024;

describe("usage meters", () => {
  it("bytes like the Supabase dashboard", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(860 * 1024)).toBe("860 KB");
    expect(formatBytes(1.2 * MB)).toBe("1.2 MB");
    expect(formatBytes(42 * MB)).toBe("42 MB");
    expect(formatBytes(DB_LIMIT_BYTES)).toBe("500 MB");
    expect(formatBytes(STORAGE_LIMIT_BYTES)).toBe("1 GB");
  });

  it("fill stays between 0 and 1", () => {
    expect(fill(42, 500)).toBeCloseTo(0.084);
    expect(fill(1200, 1000)).toBe(1);
    expect(fill(-5, 1000)).toBe(0);
    expect(fill(5, 0)).toBe(0);
  });

  it("parses Groq's reset durations", () => {
    expect(parseGroqDuration("2m59.56s")).toBe(179_560);
    expect(parseGroqDuration("7.66s")).toBe(7660);
    expect(parseGroqDuration("1h2m")).toBe(3_720_000);
    expect(parseGroqDuration("450ms")).toBe(450);
    expect(parseGroqDuration("soon")).toBeNull();
    expect(parseGroqDuration("")).toBeNull();
    expect(parseGroqDuration(null)).toBeNull();
  });

  it("Groq requests used today, from the last AI call", () => {
    const row = (o: Record<string, unknown>, updated = "2026-11-20T10:00:00Z") => ({
      value: { remaining_requests: 962, limit_requests: 1000, reset_requests: "20h", ...o },
      updated_at: updated,
    });
    expect(groqToday(row({}), NOW)).toEqual({
      used: 38,
      limit: 1000,
      asOf: "2026-11-20T10:00:00Z",
    });
    // The reset time has passed since that call: the day starts over.
    expect(groqToday(row({ reset_requests: "1h" }), NOW)?.used).toBe(0);
    // No limit header yet: the free plan's 1,000.
    expect(groqToday(row({ limit_requests: null }), NOW)?.limit).toBe(1000);
    expect(groqToday(null, NOW)).toBeNull();
    expect(groqToday({ value: null, updated_at: null }, NOW)).toBeNull();
  });

  it("'as of' times", () => {
    expect(ago("2026-11-20T11:59:40Z", NOW)).toBe("just now");
    expect(ago("2026-11-20T11:15:00Z", NOW)).toBe("45 min ago");
    expect(ago("2026-11-20T09:00:00Z", NOW)).toBe("3 h ago");
    expect(ago("2026-11-19T09:00:00Z", NOW)).toBe("yesterday");
    expect(ago("2026-11-17T09:00:00Z", NOW)).toBe("3 days ago");
    expect(ago("2026-11-02T09:00:00Z", NOW)).toBe("2 Nov");
  });
});

const member = (o: Partial<Member>): Member => ({
  id: "x",
  email: "x@breakthirty.com",
  full_name: null,
  role: "member",
  disabled_at: null,
  last_sign_in_at: null,
  created_at: "2026-11-01T00:00:00Z",
  ...o,
});
const FATIMA = member({ id: "me", full_name: "Fatima Noor", role: "admin" });
const RYAN = member({ id: "ryan", email: "ryan@breakthirty.com" });
const SHERRY = member({ id: "sherry", full_name: "Sherry", role: "admin" });

describe("team", () => {
  it("names and initials", () => {
    expect(memberName(FATIMA)).toBe("Fatima Noor");
    expect(memberName(RYAN)).toBe("ryan");
    expect(memberInitials(FATIMA)).toBe("FN");
    expect(memberInitials(RYAN)).toBe("R");
  });

  it("last sign-in", () => {
    expect(lastSignInLabel("2026-11-18T09:00:00Z", NOW)).toBe("Signed in 2 days ago");
    expect(lastSignInLabel("2026-11-02T09:00:00Z", NOW)).toBe("Signed in on 2 Nov");
    expect(lastSignInLabel(null, NOW)).toBeNull();
  });

  it("admins can't remove their own access", () => {
    expect(roleChoices(FATIMA, "me")).toEqual(["admin", "member"]);
    expect(roleChoices(RYAN, "me")).toEqual(["admin", "member", "remove"]);
    expect(roleBlockedReason([FATIMA, RYAN], FATIMA, "remove", "me")).toBe(
      TEAM_ERRORS.cannot_remove_self,
    );
  });

  it("never the last active admin: no demoting or removing them", () => {
    expect(roleBlockedReason([FATIMA, RYAN], FATIMA, "member", "me")).toBe(TEAM_ERRORS.last_admin);
    // With a second active admin it's fine…
    expect(roleBlockedReason([FATIMA, RYAN, SHERRY], FATIMA, "member", "me")).toBeNull();
    expect(roleBlockedReason([FATIMA, RYAN, SHERRY], SHERRY, "remove", "me")).toBeNull();
    // …but a removed admin doesn't count.
    const gone = { ...SHERRY, disabled_at: "2026-11-19T00:00:00Z" };
    expect(roleBlockedReason([FATIMA, RYAN, gone], FATIMA, "member", "me")).toBe(
      TEAM_ERRORS.last_admin,
    );
    // Members can always be changed.
    expect(roleBlockedReason([FATIMA, RYAN], RYAN, "admin", "me")).toBeNull();
    expect(roleBlockedReason([FATIMA, RYAN], RYAN, "remove", "me")).toBeNull();
  });

  it("server refusals in plain words", () => {
    expect(teamErrorText("last_admin")).toMatch(/at least one admin/);
    expect(teamErrorText("cannot_remove_self")).toMatch(/your own access/);
    expect(teamErrorText(undefined)).toMatch(/Couldn’t save that/);
    expect(teamErrorText("weird")).toMatch(/Couldn’t save that/);
  });
});
