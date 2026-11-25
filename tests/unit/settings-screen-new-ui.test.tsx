/**
 * The new Settings screen carries «Try the new interface» too (#1233): it is the way back
 * to the classic interface for a player who opted in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const h = vi.hoisted(() => ({
  saveNewUi: vi.fn<(uid: string, on: boolean) => Promise<string>>(() =>
    Promise.resolve("saved")
  ),
  profile: { displayName: "Tester", newUi: true },
}));

vi.mock("@/lib/firebase", () => ({ db: {}, auth: {} }));
vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/features/account/new-ui-switch", () => ({ saveNewUi: h.saveNewUi }));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => false }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ user: { uid: "u1", email: "t@example.com" }, profile: h.profile }),
}));

import { SettingsScreen } from "@/domains/account/ui/SettingsScreen";

beforeEach(() => {
  h.saveNewUi.mockClear();
});

describe("new Settings screen: «Try the new interface»", () => {
  it("shows the saved choice and switches back to classic", () => {
    render(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: "New" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "Classic" }));
    expect(h.saveNewUi).toHaveBeenCalledWith("u1", false);
  });
});
