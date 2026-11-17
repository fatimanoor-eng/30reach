import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Credits } from "../lib/useCredits";
import { CreditsMeter } from "./CreditsMeter";

const credits: Credits = {
  remaining: 588,
  plan: 1000,
  periodStart: "2026-11-01T00:00:00Z",
  resetsAt: "2026-12-01T12:00:00Z",
  updatedAt: "2026-11-17T14:02:00Z",
  stale: false,
};

describe("CreditsMeter", () => {
  it("ready: number, bar and reset date", () => {
    render(<CreditsMeter state={{ status: "ready", credits }} />);
    expect(screen.getByText("588 left")).toBeInTheDocument();
    expect(screen.getByText(/of 1,000 · live · resets 1 Dec/)).toBeInTheDocument();
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "588");
    expect(meter).toHaveAttribute("aria-valuemax", "1000");
  });

  it("more credits than the plan: real number shown, bar capped at full", () => {
    const { container } = render(
      <CreditsMeter state={{ status: "ready", credits: { ...credits, remaining: 1021 } }} />,
    );
    expect(screen.getByText("1,021 left")).toBeInTheDocument();
    expect(screen.getByText(/of 1,000/)).toBeInTheDocument();
    expect(container.querySelector<HTMLElement>("[role=meter] > div")!.style.width).toBe("100%");
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "1021");
    expect(meter).toHaveAttribute("aria-valuemax", "1021"); // valid ARIA: now ≤ max
  });

  it("stale: says when the reading is from instead of 'live'", () => {
    render(<CreditsMeter state={{ status: "ready", credits: { ...credits, stale: true } }} />);
    expect(screen.queryByText(/live/)).not.toBeInTheDocument();
    expect(screen.getByText(/as of \d{2}:\d{2}/)).toBeInTheDocument();
  });

  it("loading: placeholder number", () => {
    render(<CreditsMeter state={{ status: "loading" }} />);
    expect(screen.getByText("— left")).toBeInTheDocument();
    expect(screen.getByText("Checking credits…")).toBeInTheDocument();
  });

  it("error: message and a working Retry", () => {
    const retry = vi.fn();
    render(<CreditsMeter state={{ status: "error", retry }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load credits");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
