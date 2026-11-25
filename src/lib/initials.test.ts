import { describe, expect, it } from "vitest";
import { avatarText } from "./initials";

describe("avatar initials (max 2 capitals)", () => {
  it("always 2 capitals at most; similar brands stay apart", () => {
    expect(avatarText("WW")).toBe("WW");
    expect(avatarText("LM")).toBe("LM");
    expect(avatarText("Hi")).toBe("HI");
    expect(avatarText("He")).toBe("HE");
    expect(avatarText("Fo")).toBe("FO");
    expect(avatarText("ABC")).toBe("AB");
    expect(avatarText("a.b")).toBe("AB");
    expect(avatarText("All")).toBe("All");
    expect(avatarText(" ")).toBe("");
  });
});
