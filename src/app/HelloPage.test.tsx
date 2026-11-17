import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HelloPage } from "./HelloPage";

describe("HelloPage", () => {
  it("shows the 30reach logo as the page heading", () => {
    render(<HelloPage />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toContainElement(screen.getByRole("img", { name: "30reach" }));
  });

  it("shows the slice label", () => {
    render(<HelloPage />);
    expect(screen.getByText(/slice 0/i)).toBeInTheDocument();
  });
});
