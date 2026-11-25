/**
 * The page follows the player's choice once the profile loads (#1233). Found in the
 * browser: React Router's RouterProvider keeps the state of the router it first got, so
 * handing it the other interface's route tree left the classic page on screen. The
 * provider is remounted per interface.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Outlet } from "react-router";

vi.mock("@/lib/firebase", () => ({ db: {}, auth: {}, storage: {} }));
vi.mock("@/components/shared/AuthGuard", () => ({ AuthGuard: () => <Outlet /> }));
vi.mock("@/app/AppShell", () => ({ AppShell: () => <Outlet /> }));
vi.mock("@/app/NewAppShell", () => ({ NewAppShell: () => <Outlet /> }));
vi.mock("@/features/account/SettingsPage", () => ({
  SettingsPage: () => <p>classic settings</p>,
}));
vi.mock("@/domains/account/ui/SettingsScreen", () => ({
  SettingsScreen: () => <p>new settings</p>,
}));

import { AppRouter } from "@/app/router";
import { useAuthStore } from "@/stores/authStore";

afterEach(() => {
  cleanup();
  useAuthStore.setState({ profile: null });
  window.history.replaceState(null, "", "/");
});

describe("AppRouter follows the profile's choice", () => {
  it("shows the new screen once the profile says so, and the classic one when it stops", async () => {
    window.history.replaceState(null, "", "/settings");
    render(<AppRouter />);
    expect(await screen.findByText("classic settings")).toBeInTheDocument();
    act(() => {
      useAuthStore.setState({ profile: { newUi: true } as never });
    });
    expect(await screen.findByText("new settings")).toBeInTheDocument();
    act(() => {
      useAuthStore.setState({ profile: null });
    });
    expect(await screen.findByText("classic settings")).toBeInTheDocument();
  });
});
