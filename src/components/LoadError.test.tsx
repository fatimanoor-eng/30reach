import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoadError } from "./LoadError";

describe("LoadError", () => {
  it("announces what failed, shows Blip/Error and retries", () => {
    const onRetry = vi.fn();
    const { container } = render(<LoadError title="Ideas didn’t load" onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn’t load");
    expect(alert).toHaveTextContent("Ideas didn’t load");
    expect(alert).toHaveTextContent("Nothing was changed.");
    // The Error pose (red warning marks); the Idle pose has none.
    expect(container.querySelector('svg path[fill="#F95050"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
