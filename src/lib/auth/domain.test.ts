import { describe, expect, it } from "vitest";
import { initialsFor, isDomainRejection, isTeamEmail, parseRejectedEmail } from "./domain";

describe("isTeamEmail", () => {
  it.each(["fatima.noor@breakthirty.com", "Someone@BreakThirty.com", "  padded@breakthirty.com "])(
    "accepts %s",
    (email) => expect(isTeamEmail(email)).toBe(true),
  );

  it.each([
    "ali.khan@gmail.com",
    "x@evilbreakthirty.com",
    "x@breakthirty.com.evil.com",
    "x@sub.breakthirty.com",
    "@breakthirty.com",
    "a@b@breakthirty.com",
    "",
    null,
    undefined,
  ])("rejects %s", (email) => expect(isTeamEmail(email)).toBe(false));
});

describe("hook rejection message", () => {
  const msg =
    "ali.khan@gmail.com isn't a Breakthirty account. 30reach only lets in @breakthirty.com Google accounts.";

  it("finds the rejected address", () => {
    expect(parseRejectedEmail(msg)).toBe("ali.khan@gmail.com");
    expect(isDomainRejection(msg)).toBe(true);
  });

  it("handles the no-email variant and other errors", () => {
    const noEmail = "That Google account isn't a Breakthirty account. 30reach only lets in …";
    expect(parseRejectedEmail(noEmail)).toBeNull();
    expect(isDomainRejection(noEmail)).toBe(true);
    expect(isDomainRejection("access_denied")).toBe(false);
    expect(parseRejectedEmail(null)).toBeNull();
  });
});

describe("initialsFor", () => {
  it("uses first and last name", () => expect(initialsFor("Fatima Noor", "f@x.com")).toBe("FN"));
  it("falls back to the email", () => expect(initialsFor(null, "fatima@x.com")).toBe("F"));
});
