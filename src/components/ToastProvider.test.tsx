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

  it("custom duration, and onDismiss tells why it went (once)", () => {
    const reasons: string[] = [];
    const onUndo = vi.fn();
    function Many() {
      const toast = useToast();
      const deleted = () =>
        toast.show({
          title: "Deleted the idea",
          durationMs: 10_000,
          action: { label: "Undo", onClick: onUndo },
          onDismiss: (r) => reasons.push(r),
        });
      return (
        <>
          <button type="button" onClick={deleted}>
            delete
          </button>
          <button type="button" onClick={() => toast.show({ title: "Other" })}>
            other
          </button>
        </>
      );
    }
    render(
      <ToastProvider>
        <Many />
      </ToastProvider>,
    );

    // Timeout after 10 s, not 8.
    fireEvent.click(screen.getByText("delete"));
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS + 100));
    expect(screen.getByRole("status")).toHaveTextContent("Deleted the idea");
    act(() => vi.advanceTimersByTime(10_000));
    expect(reasons).toEqual(["timeout"]);

    // ✕
    fireEvent.click(screen.getByText("delete"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    // Replaced by another toast
    fireEvent.click(screen.getByText("delete"));
    fireEvent.click(screen.getByText("other"));
    // The action (Undo)
    fireEvent.click(screen.getByText("delete"));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(reasons).toEqual(["timeout", "closed", "replaced", "action"]);
  });
});
