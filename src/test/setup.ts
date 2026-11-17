import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// jsdom has no matchMedia. Default: phone width (no media query matches).
// Tests can set `window.__mqMatches = true` to pretend to be tablet/desktop.
declare global {
  interface Window {
    __mqMatches?: boolean;
  }
}
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: !!window.__mqMatches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom's <dialog> may lack showModal/close. Minimal stand-ins: toggle the `open` attribute.
const proto = HTMLDialogElement.prototype;
if (!proto.showModal) {
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
}
if (!proto.close) {
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
