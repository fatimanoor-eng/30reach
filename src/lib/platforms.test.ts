import { describe, expect, it } from "vitest";
import { pullReadiness, trackedPlatforms } from "./platforms";

describe("pullReadiness — same rule as pull-start", () => {
  const ig = {
    instagram_handle: "hims",
    tiktok_handle: null,
    linkedin_url: null,
    facebook_url: null,
  };
  const none = {
    instagram_handle: null,
    tiktok_handle: null,
    linkedin_url: null,
    facebook_url: null,
  };
  it("no competitors / no accounts on tracked platforms / ok", () => {
    expect(pullReadiness([], null)).toBe("no_competitors");
    expect(pullReadiness([none], null)).toBe("no_accounts");
    expect(pullReadiness([ig], ["tiktok", "facebook"])).toBe("no_accounts");
    expect(pullReadiness([none, ig], ["instagram"])).toBe("ok");
    expect(pullReadiness([ig], null)).toBe("ok"); // tracked still loading → every platform
  });
  it("tracked comes from client_platforms (on + supported)", () => {
    expect(
      trackedPlatforms([
        { platform: "instagram", state: "off" },
        { platform: "tiktok", state: "on" },
      ]),
    ).toEqual(["tiktok"]);
  });
});
