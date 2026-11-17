import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_DURATION_MS, useToast } from "./toast-context";
import { ToastProvider } from "./ToastProvider";

function Trigger() {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show({ title: "Pull complete", pose: "success" })}>
      go
    </button>
  );
}

describe("Toast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows, then hides itself after ~8 s", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByRole("status")).toHaveTextContent("Pull complete");

    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 100));
    expect(screen.getByRole("status")).toHaveTextContent("Pull complete");

    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("can be dismissed", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText("go"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
