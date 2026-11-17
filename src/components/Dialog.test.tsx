import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomSheet } from "./BottomSheet";
import { Dialog } from "./Dialog";

const props = {
  title: "Remove Found?",
  description: "Found's saved posts will disappear from the dashboards.",
};

describe.each([
  ["Dialog", Dialog],
  ["BottomSheet", BottomSheet],
])("%s", (_name, Modal) => {
  it("opens as a modal dialog labelled by its title", () => {
    render(<Modal open onClose={() => {}} {...props} />);
    const dialog = screen.getByRole("dialog", { name: "Remove Found?" });
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveAccessibleDescription(props.description);
  });

  it("closes on Esc, Cancel and a backdrop click", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} {...props} />);
    const dialog = screen.getByRole("dialog");

    fireEvent(dialog, new Event("cancel", { cancelable: true })); // what Esc fires
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(dialog); // target = <dialog> itself = backdrop
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("runs the primary action", () => {
    const onClick = vi.fn();
    render(
      <Modal
        open
        onClose={() => {}}
        {...props}
        primary={{ label: "Remove Found", variant: "danger", onClick }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Found" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
