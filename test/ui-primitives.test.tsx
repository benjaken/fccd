import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Modal } from "@/components/ui/modal";
import { SidePanel } from "@/components/ui/side-panel";
import { Switch } from "@/components/ui/switch";

describe("shared UI primitives", () => {
  it("uses an accessible dialog and closes it with Escape", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open dialog
          </button>
          <Modal
            open={open}
            title="Delivery details"
            description="Review the delivery before saving."
            closeLabel="Close dialog"
            onClose={() => setOpen(false)}
          >
            <button type="button">Save</button>
          </Modal>
        </>
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open dialog" }));

    expect(
      screen.getByRole("dialog", { name: "Delivery details" }),
    ).toHaveAccessibleDescription("Review the delivery before saving.");
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open dialog" })).toHaveFocus();
  });

  it("can prevent Escape from dismissing a busy dialog", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <Modal
        open
        title="Saving"
        closeLabel="Close dialog"
        closeOnEscape={false}
        onClose={onClose}
      >
        <p>Please wait.</p>
      </Modal>,
    );

    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Saving" })).toBeInTheDocument();
  });

  it("keeps the existing controlled switch API", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [checked, setChecked] = useState(false);
      return (
        <Switch
          checked={checked}
          onCheckedChange={setChecked}
          aria-label="Enable notifications"
        />
      );
    }

    render(<Harness />);
    const toggle = screen.getByRole("switch", { name: "Enable notifications" });

    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(toggle).toBeChecked();
  });

  it("uses an accessible sheet and restores focus after Escape", async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open panel</button>
          <SidePanel
            open={open}
            title="Edit supplier"
            description="Update supplier details."
            closeLabel="Close panel"
            onClose={() => setOpen(false)}
          >
            <input aria-label="Supplier name" />
          </SidePanel>
        </>
      );
    }

    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open panel" });
    await user.click(opener);

    expect(screen.getByRole("dialog", { name: "Edit supplier" }))
      .toHaveAccessibleDescription("Update supplier details.");
    expect(screen.getByRole("button", { name: "Close panel" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Edit supplier" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
