import { describe, expect, it } from "vitest";
import { userIdOf } from "./user-id.ts";

describe("userIdOf (27 Nov: actor / started_by were always empty)", () => {
  it("reads @supabase/server's userClaims.id", () => {
    expect(userIdOf({ userClaims: { id: "u-1" } })).toBe("u-1");
  });
  it("falls back to the raw JWT's sub", () => {
    expect(userIdOf({ userClaims: null, jwtClaims: { sub: "u-2" } })).toBe("u-2");
  });
  it("null without a user (and never the old, missing userClaims.sub)", () => {
    expect(userIdOf({ userClaims: { sub: "x" } as never })).toBeNull();
    expect(userIdOf({})).toBeNull();
  });
});
