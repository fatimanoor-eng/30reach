import { describe, expect, it } from "vitest";
import { cardMeta, FORMATS, PLATFORM_BAR, PLATFORM_SHORT, PLATFORM_TINT } from "./calendar-ui";
import { formatFor, formatOptions, PLATFORM_OPTIONS } from "./platform-options";

describe("calendar platforms (LinkedIn, Slice 15c)", () => {
  it("LinkedIn has its own formats, colour and short name", () => {
    expect(FORMATS.linkedin).toEqual(["text", "image", "document", "video", "article", "poll"]);
    expect(PLATFORM_BAR.linkedin).toBe("bg-blue");
    expect(PLATFORM_TINT.linkedin).toBe("bg-tint-linkedin");
    expect(PLATFORM_SHORT.linkedin).toBe("LI");
    expect(cardMeta({ platform: "linkedin", format: "article" })).toBe("LI · Link");
    expect(cardMeta({ platform: "linkedin", format: "document" })).toBe("LI · Document");
  });

  it("the platform chip offers all three; formats follow the platform", () => {
    expect(PLATFORM_OPTIONS.map((o) => o.value)).toEqual(["instagram", "tiktok", "linkedin"]);
    expect(formatOptions("linkedin").map((o) => o.label)).toEqual([
      "Text",
      "Image",
      "Document",
      "Video",
      "Link",
      "Poll",
    ]);
    // Switching platform keeps only a format the new one has.
    expect(formatFor("linkedin", "reel")).toBeNull();
    expect(formatFor("linkedin", "image")).toBe("image");
    expect(formatFor("instagram", "poll")).toBeNull();
  });
});
