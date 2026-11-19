import { expect, test, type Locator, type Page } from "@playwright/test";
import { ready, signInAs, stubSupabase } from "./helpers";

/*
 * Slice 13a: Blip comes alive. The real browser checks what jsdom can't: which keyframes run, that a
 * Blip pauses off-screen and while the tab is hidden, and that reduced motion shows the static pose.
 * (Screenshots elsewhere freeze animations at frame 0, which is the static pose.)
 */

const anim = (el: Locator) =>
  el.evaluate((n) => {
    const s = getComputedStyle(n);
    return { name: s.animationName, state: s.animationPlayState };
  });

async function gallery(page: Page) {
  await stubSupabase(page);
  await signInAs(page);
  await ready(page, "/dev/components");
  const row = page.getByRole("img", { name: "Blip idle" }).locator("xpath=ancestor::div[1]");
  await row.scrollIntoViewIfNeeded();
  return row;
}

test("each pose runs its own keyframes", async ({ page }) => {
  await gallery(page);
  const part = (pose: string, sel: string) =>
    page.getByRole("img", { name: pose, exact: true }).locator(sel).first();
  // The visibility observer reports asynchronously after the scroll: wait for "running".
  await expect
    .poll(() => anim(part("Blip idle", ".b-body")))
    .toEqual({ name: "blip-breathe", state: "running" });
  expect((await anim(part("Blip idle", ".b-eye"))).name).toBe("blip-blink");
  expect((await anim(part("Blip scanning", ".b-wave-1"))).name).toBe("blip-wave");
  expect((await anim(part("Blip scanning", ".b-look"))).name).toBe("blip-look");
  expect((await anim(part("Blip thinking", ".b-dot-3"))).name).toBe("blip-dot-3");
  expect((await anim(part("Blip error", ".b-antenna"))).name).toBe("blip-wilt");
  expect((await anim(part("Blip error", ".b-sweat"))).name).toBe("blip-sweat");
  expect((await anim(part("Blip success", ".b-figure"))).name).toBe("blip-success-jump");
});

test("only transform and opacity are animated", async ({ page }) => {
  await gallery(page);
  const props = await page.evaluate(() => {
    const seen = new Set<string>();
    for (const sheet of [...document.styleSheets]) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const r of [...rules]) {
        if (!(r instanceof CSSKeyframesRule) || !r.name.startsWith("blip-")) continue;
        for (const k of [...r.cssRules] as CSSKeyframeRule[])
          for (let i = 0; i < k.style.length; i++) seen.add(k.style[i]);
      }
    }
    return [...seen].sort();
  });
  expect(props).toEqual(["opacity", "transform"]);
});

test("Success with settle becomes the Idle loop after one jump", async ({ page }) => {
  await gallery(page);
  const settled = page.getByRole("img", { name: "Blip success, then idle" });
  await expect(settled).toHaveClass(/blip-idle/, { timeout: 4000 });
  // The plain Success (a toast) stays on its pose.
  await expect(page.getByRole("img", { name: "Blip success", exact: true })).toHaveClass(
    /blip-success/,
  );
});

test("a Blip pauses off-screen and while the tab is hidden", async ({ page }) => {
  await gallery(page);
  const idle = page.getByRole("img", { name: "Blip idle" });
  await expect(idle).not.toHaveAttribute("data-offscreen");
  // Scroll it far away: it pauses.
  // The Blip row is low on the gallery page: scrolling to the top takes it out of view.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(idle).toHaveAttribute("data-offscreen");
  expect((await anim(idle.locator(".b-body"))).state).toBe("paused");
  // Back in view, then the tab goes to the background: paused again.
  await idle.scrollIntoViewIfNeeded();
  await expect(idle).not.toHaveAttribute("data-offscreen");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect((await anim(idle.locator(".b-body"))).state).toBe("paused");
});

test("reduced motion: the static pose, nothing animates", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gallery(page);
  for (const name of ["Blip idle", "Blip scanning", "Blip thinking", "Blip error"]) {
    expect((await anim(page.getByRole("img", { name, exact: true }).locator(".b-body"))).name).toBe(
      "none",
    );
  }
  expect(
    (await anim(page.getByRole("img", { name: "Blip success", exact: true }).locator(".b-figure")))
      .name,
  ).toBe("none");
});

test("welcome 01b: Success once, then Idle", async ({ page }) => {
  await stubSupabase(page);
  await signInAs(page, { fresh: true });
  await page.goto("/welcome");
  const blip = page.locator("svg.blip").first();
  await expect(blip).toHaveClass(/blip-success/);
  await expect(page.locator("svg.blip-idle").first()).toBeVisible({ timeout: 4000 });
});
