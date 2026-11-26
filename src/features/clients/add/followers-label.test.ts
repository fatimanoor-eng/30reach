import { describe, expect, it } from "vitest";
import { followersLabel } from "./followers-label";

describe("followersLabel", () => {
  it("rounds like a person would say it", () => {
    expect(followersLabel(369_000)).toBe("~369K on Instagram");
    expect(followersLabel(81_200)).toBe("~81.2K on Instagram");
    expect(followersLabel(1_240_000)).toBe("~1.2M on Instagram");
    expect(followersLabel(950)).toBe("~950 on Instagram");
  });
});
