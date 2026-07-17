/**
 * CardOverflowMenu — the shared 3-dots row-actions menu used by BOTH the roster
 * character cards and the campaign cards. These tests pin the shared contract the
 * two surfaces rely on: a labelled kebab trigger, item rendering (incl. the
 * `hidden`/`danger`/`dividerBefore` flags), the no-leading-separator rule,
 * select-closes-and-fires, and the Arrow/Home/End roving keyboard.
 */

import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Star, Copy, Trash2 } from "lucide-react";
import {
  CardOverflowMenu,
  type CardMenuItem,
} from "@/components/shared/CardOverflowMenu";

function Harness({ items }: { items: CardMenuItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <CardOverflowMenu
      open={open}
      onOpenChange={setOpen}
      items={items}
      triggerLabel="More actions"
      menuLabel="Actions for Test"
    />
  );
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
  return screen.getByRole("menu");
}

describe("CardOverflowMenu", () => {
  it("renders the labelled kebab and reveals the menu on click", () => {
    render(
      <Harness items={[{ key: "a", label: "Alpha", icon: Star, onSelect: vi.fn() }]} />
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const menu = openMenu();
    expect(menu).toHaveAccessibleName("Actions for Test");
    expect(within(menu).getByRole("menuitem", { name: /alpha/i })).toBeInTheDocument();
  });

  it("omits hidden items and tones a danger item", () => {
    render(
      <Harness
        items={[
          { key: "copy", label: "Copy", icon: Copy, onSelect: vi.fn() },
          { key: "secret", label: "Secret", icon: Star, onSelect: vi.fn(), hidden: true },
          {
            key: "del",
            label: "Delete",
            icon: Trash2,
            danger: true,
            dividerBefore: true,
            onSelect: vi.fn(),
          },
        ]}
      />
    );
    const menu = openMenu();
    expect(
      within(menu).queryByRole("menuitem", { name: /secret/i })
    ).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /delete/i })).toHaveClass("danger");
    // A divider groups off the destructive action (1 separator, not leading).
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(1);
  });

  it("never renders a leading separator when the FIRST item sets dividerBefore", () => {
    render(
      <Harness
        items={[
          {
            key: "a",
            label: "Alpha",
            icon: Star,
            onSelect: vi.fn(),
            dividerBefore: true,
          },
          { key: "b", label: "Bravo", icon: Star, onSelect: vi.fn() },
        ]}
      />
    );
    const menu = openMenu();
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(0);
  });

  it("fires onSelect and closes the menu when an item is chosen", () => {
    const onSelect = vi.fn();
    render(<Harness items={[{ key: "a", label: "Alpha", icon: Star, onSelect }]} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /alpha/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  // #104 — a caller can pass `triggerVariant="ghost"` so its ⋯ kebab IS its
  // sibling ghost actions: it renders through the canonical `<Button>` atom
  // (`.btn ghost`), sharing the one gold recipe by construction (no hand-rolled
  // grey `.hdr-overflow`). Default (no variant) stays the bare card kebab.
  it("renders the trigger as the canonical Button atom when given a triggerVariant", () => {
    render(
      <CardOverflowMenu
        open={false}
        onOpenChange={vi.fn()}
        items={[{ key: "a", label: "Alpha", icon: Star, onSelect: vi.fn() }]}
        triggerLabel="More actions"
        menuLabel="Actions for Test"
        triggerVariant="ghost"
        triggerClassName="custom-trigger"
      />
    );
    const trigger = screen.getByRole("button", { name: /more actions/i });
    // The brass recipe + the ghost (gold) variant + the icon-only square + the
    // caller's extra class — all from `<Button>`, so a ghost-button fix propagates.
    expect(trigger).toHaveClass("btn", "ghost", "icon-only", "custom-trigger");
  });

  it("renders a bare card-chrome kebab (no `.btn`) by default", () => {
    render(
      <Harness items={[{ key: "a", label: "Alpha", icon: Star, onSelect: vi.fn() }]} />
    );
    const trigger = screen.getByRole("button", { name: /more actions/i });
    expect(trigger).toHaveClass("ch-overflow");
    expect(trigger).not.toHaveClass("btn");
  });

  it("roves focus across items with Arrow/Home/End", () => {
    render(
      <Harness
        items={[
          { key: "a", label: "Alpha", icon: Star, onSelect: vi.fn() },
          { key: "b", label: "Bravo", icon: Star, onSelect: vi.fn() },
          { key: "c", label: "Charlie", icon: Star, onSelect: vi.fn() },
        ]}
      />
    );
    const menu = openMenu();
    const alpha = within(menu).getByRole("menuitem", { name: /alpha/i });
    const bravo = within(menu).getByRole("menuitem", { name: /bravo/i });
    const charlie = within(menu).getByRole("menuitem", { name: /charlie/i });
    alpha.focus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(bravo).toHaveFocus();
    fireEvent.keyDown(menu, { key: "End" });
    expect(charlie).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" }); // wraps to the first
    expect(alpha).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowUp" }); // wraps to the last
    expect(charlie).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Home" });
    expect(alpha).toHaveFocus();
  });
});
