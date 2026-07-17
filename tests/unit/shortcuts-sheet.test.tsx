/**
 * ShortcutsSheet (D7 / §3.5) — the `?` reference sheet. Pins that it renders from
 * the `SHORTCUTS` registry (so it can never drift): every non-admin row appears,
 * the admin-only row is gated, and it opens/closes off `uiStore.shortcutsOpen`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import i18n from "@/i18n";
import { SHORTCUTS } from "@/lib/shortcuts-registry";
import { useUIStore } from "@/stores/uiStore";

const isAdminState = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => isAdminState.value }));

import { ShortcutsSheet } from "@/components/shared/ShortcutsSheet";

const allRows = SHORTCUTS.flatMap((s) => s.rows);
const nonAdminRows = allRows.filter((r) => !r.adminOnly);
const adminRow = allRows.find((r) => r.adminOnly);

beforeEach(() => {
  isAdminState.value = false;
  useUIStore.setState({ shortcutsOpen: false });
});
afterEach(cleanup);

describe("ShortcutsSheet", () => {
  it("is closed when shortcutsOpen is false", () => {
    render(<ShortcutsSheet />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders EVERY non-admin registry row when open", () => {
    useUIStore.setState({ shortcutsOpen: true });
    render(<ShortcutsSheet />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    for (const row of nonAdminRows) {
      expect(screen.getByText(i18n.t(row.labelKey))).toBeInTheDocument();
    }
    // …and each group heading.
    for (const section of SHORTCUTS) {
      expect(screen.getByText(i18n.t(section.titleKey))).toBeInTheDocument();
    }
  });

  it("shows the command palette as ONE row carrying BOTH bindings (⌘K · /), no separate search row", () => {
    useUIStore.setState({ shortcutsOpen: true });
    render(<ShortcutsSheet />);
    // Exactly one palette row, labelled once (golden rule 6) — never a second "Search the
    // Folio" row for the `/` alias.
    expect(screen.getAllByText(i18n.t("shortcuts.rows.palette"))).toHaveLength(1);
    expect(screen.queryByText(i18n.t("palette.title"))).not.toBeInTheDocument();
    // The `/` alias renders as a chip on that one row (the merge evidence) alongside the
    // primary ⌘K/Ctrl-K combo chip.
    expect(screen.getByText("/")).toBeInTheDocument();
  });

  it("hides the admin-only row for a non-admin", () => {
    useUIStore.setState({ shortcutsOpen: true });
    render(<ShortcutsSheet />);
    expect(adminRow).toBeDefined();
    if (adminRow) {
      expect(screen.queryByText(i18n.t(adminRow.labelKey))).not.toBeInTheDocument();
    }
  });

  it("shows the admin-only row for an admin", () => {
    isAdminState.value = true;
    useUIStore.setState({ shortcutsOpen: true });
    render(<ShortcutsSheet />);
    if (adminRow) {
      expect(screen.getByText(i18n.t(adminRow.labelKey))).toBeInTheDocument();
    }
  });
});
