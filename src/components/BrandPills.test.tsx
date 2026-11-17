import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandSelectionProvider } from "../lib/BrandSelectionProvider";
import { sampleBrands } from "../lib/sample-data";
import { BrandPills } from "./BrandPills";

function setup() {
  render(
    <BrandSelectionProvider>
      <BrandPills brands={sampleBrands} />
    </BrandSelectionProvider>,
  );
  return (name: string) => screen.getByRole("button", { name: new RegExp(`^\\w*\\s*${name}$`) });
}

describe("BrandPills", () => {
  it("starts on All brands", () => {
    const pill = setup();
    expect(pill("All brands")).toHaveAttribute("aria-pressed", "true");
    expect(pill("Hims")).toHaveAttribute("aria-pressed", "false");
  });

  it("selects up to 3 brands, then blocks the rest", () => {
    const pill = setup();
    fireEvent.click(pill("Hims"));
    fireEvent.click(pill("Ro"));
    fireEvent.click(pill("Hers"));
    expect(pill("All brands")).toHaveAttribute("aria-pressed", "false");
    expect(pill("Found")).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(pill("Found"));
    expect(pill("Found")).toHaveAttribute("aria-pressed", "false");
  });

  it("Clear and All brands reset the selection", () => {
    const pill = setup();
    fireEvent.click(pill("Hims"));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(pill("All brands")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });
});
