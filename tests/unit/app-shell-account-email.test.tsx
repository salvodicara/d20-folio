/**
 * The account menu names the account once (sweep 2026-11-11: an account with no
 * display name showed its email twice, as the name and again under it).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { AppShell } from "@/ui/AppShell";

function mount(name: string, email: string) {
  render(
    <MemoryRouter>
      <AppShell
        skipLabel="Skip"
        home="/"
        homeLabel="Home"
        nav={[]}
        navLabel="Areas"
        searchLabel="Search"
        onSearch={() => {}}
        menuLabel="Menu"
        account={{ label: "Account", initial: "M", name, email, actions: [] }}
        footer={null}
      >
        <p>page</p>
      </AppShell>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole("button", { name: "Account" }));
}

describe("AppShell account menu", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  it("an account with no name shows its email once", () => {
    mount("mock@test.dev", "mock@test.dev");
    expect(screen.getAllByText("mock@test.dev")).toHaveLength(1);
  });

  it("a named account shows its name, then its email", () => {
    mount("Mara", "mara@example.com");
    expect(screen.getByText("Mara")).toBeTruthy();
    expect(screen.getByText("mara@example.com")).toBeTruthy();
  });
});
