import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlipError, BlipIdle, BlipScanning, BlipSuccess, BlipThinking } from "./BlipPoses";

/** jsdom has no AnimationEvent: an "animationend" that carries animationName, like a browser's. */
function animationEnd(el: Element, animationName: string) {
  // React listens for the name it detected at startup; jsdom has no animation support, so React may
  // use the webkit-prefixed one. Send both (only one reaches React's handler).
  for (const type of ["animationend", "webkitAnimationEnd"]) {
    const ev = new Event(type, { bubbles: true });
    Object.defineProperty(ev, "animationName", { value: animationName });
    act(() => {
      el.dispatchEvent(ev);
    });
  }
}

describe("Blip poses (Slice 13a)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("each pose carries its animation class and named parts", () => {
    const poses = [
      [BlipIdle, "blip-idle", ["b-body", "b-antenna", "b-eye", "b-arm-l", "b-arm-r"]],
      [BlipScanning, "blip-scanning", ["b-wave-1", "b-wave-2", "b-look"]],
      [BlipThinking, "blip-thinking", ["b-dot-1", "b-dot-2", "b-dot-3"]],
      [BlipSuccess, "blip-success", ["b-figure", "b-shadow", "b-spark-1"]],
      [BlipError, "blip-error", ["b-bulb", "b-bulb-dim", "b-sparks", "b-sweat"]],
    ] as const;
    for (const [Pose, cls, parts] of poses) {
      const { container, unmount } = render(<Pose />);
      const svg = container.querySelector("svg")!;
      expect(svg.classList.contains("blip")).toBe(true);
      expect(svg.classList.contains(cls)).toBe(true);
      for (const part of parts)
        expect(svg.querySelector(`.${part}`), `${cls} .${part}`).not.toBeNull();
      unmount();
    }
  });

  it("`still` turns the animation off here; className and title pass through", () => {
    const { container } = render(<BlipIdle still className="h-8" title="Blip" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("class")).toBe("blip blip-idle blip-still h-8");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Blip");
  });

  it("Success with `settle` becomes the Idle loop when its jump ends; without, it stays", () => {
    const settled = render(<BlipSuccess settle />);
    const svg = settled.container.querySelector("svg")!;
    // Other animations ending (a sparkle) don't count.
    animationEnd(svg, "blip-sparkle");
    expect(settled.container.querySelector(".blip-success")).not.toBeNull();
    animationEnd(svg, "blip-success-jump");
    expect(settled.container.querySelector(".blip-idle")).not.toBeNull();
    expect(settled.container.querySelector(".blip-success")).toBeNull();

    const once = render(<BlipSuccess />);
    animationEnd(once.container.querySelector("svg")!, "blip-success-jump");
    expect(once.container.querySelector(".blip-success")).not.toBeNull();
  });

  it("pauses while off-screen (IntersectionObserver)", () => {
    let report: (visible: boolean) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
          report = (visible) => cb([{ isIntersecting: visible }]);
        }
        observe() {}
        disconnect() {}
      },
    );
    const { container } = render(<BlipScanning />);
    const svg = container.querySelector("svg")!;
    act(() => report(false));
    expect(svg.hasAttribute("data-offscreen")).toBe(true);
    act(() => report(true));
    expect(svg.hasAttribute("data-offscreen")).toBe(false);
  });

  it("pauses every Blip while the tab is hidden", () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(document.documentElement.hasAttribute("data-tab-hidden")).toBe(true);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(document.documentElement.hasAttribute("data-tab-hidden")).toBe(false);
    hidden.mockRestore();
  });
});
