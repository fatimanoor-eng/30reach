import { describe, expect, it } from "vitest";
import {
  cardMeta,
  FORMATS,
  formatName,
  PLATFORM_BAR,
  PLATFORM_SHORT,
  PLATFORM_TINT,
} from "./calendar-ui";
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
    expect(PLATFORM_OPTIONS.map((o) => o.value)).toEqual([
      "instagram",
      "tiktok",
      "linkedin",
      "facebook",
    ]);
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

describe("calendar platforms (Facebook, Slice 16c)", () => {
  it("Facebook: Fresh bar, its own tint, FB, formats with Album and Link", () => {
    expect(PLATFORM_BAR.facebook).toBe("bg-fresh");
    expect(PLATFORM_TINT.facebook).toBe("bg-tint-facebook");
    expect(PLATFORM_SHORT.facebook).toBe("FB");
    expect(FORMATS.facebook).toEqual(["reel", "video", "image", "carousel", "article", "text"]);
    expect(formatOptions("facebook").map((o) => o.label)).toEqual([
      "Reel",
      "Video",
      "Image",
      "Album",
      "Link",
      "Text",
    ]);
    expect(cardMeta({ platform: "facebook", format: "carousel" })).toBe("FB · Album");
    expect(cardMeta({ platform: "instagram", format: "carousel" })).toBe("IG · Carousel");
    expect(formatName("tiktok", "carousel")).toBe("Carousel");
    expect(formatFor("facebook", "poll")).toBeNull();
    expect(formatFor("facebook", "reel")).toBe("reel");
  });
});
