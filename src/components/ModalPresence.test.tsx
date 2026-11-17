import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Drawer } from "./Drawer";
import { ModalPresence } from "./ModalPresence";

const panel = (open: boolean) => (
  <ModalPresence open={open}>
    <Drawer open onClose={() => {}} title="Add competitor">
      body
    </Drawer>
  </ModalPresence>
);

describe("ModalPresence", () => {
  it("mounts children when open, unmounts them after the modal has closed", () => {
    const { rerender } = render(panel(true));
    expect(screen.getByRole("dialog", { name: "Add competitor" })).toHaveAttribute("open");
    // jsdom runs no CSS animations, so the exit finishes at once and the drawer unmounts.
    rerender(panel(false));
    expect(screen.queryByRole("dialog", { name: "Add competitor", hidden: true })).toBeNull();
  });

  it("renders nothing while closed", () => {
    render(panel(false));
    expect(screen.queryByRole("dialog", { hidden: true })).toBeNull();
  });
});
