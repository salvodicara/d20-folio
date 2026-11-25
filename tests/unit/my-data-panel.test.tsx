/**
 * #1341 — «Your data» on the new settings screen: Download, and Delete behind a typed
 * email. The confirm stays disabled until the email matches.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({ downloads: 0, deletes: [] as string[] }));
vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/domains/account/my-data", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/domains/account/my-data")>();
  return {
    ...real,
    downloadMyData: () => {
      h.downloads += 1;
      return Promise.resolve({ ok: true, characters: 2, charactersSkipped: 0 });
    },
    deleteMyAccount: (_uid: string, _email: string, typed: string) => {
      h.deletes.push(typed);
      return Promise.resolve("deleted");
    },
  };
});

import { MyDataPanel } from "@/domains/account/ui/MyDataPanel";

beforeEach(() => {
  h.downloads = 0;
  h.deletes.length = 0;
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
});

const profile = {
  uid: "u1",
  email: "mara@example.com",
  displayName: "Mara",
  createdAt: new Date(0),
};

describe("Your data", () => {
  it("downloads all the data", async () => {
    render(<MyDataPanel profile={profile} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /download all my data/i }));
      await Promise.resolve();
    });
    expect(h.downloads).toBe(1);
  });

  it("delete waits for the typed email, then erases", async () => {
    render(<MyDataPanel profile={profile} />);
    fireEvent.click(screen.getByRole("button", { name: /^delete my account$/i }));
    const confirm = screen
      .getAllByRole("button", { name: /^delete my account$/i, hidden: true })
      .at(-1);
    if (!confirm) throw new Error("no confirm button");
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(screen.getByLabelText(/type your email/i), {
      target: { value: "mara@example.com" },
    });
    expect(confirm).not.toHaveAttribute("aria-disabled");
    await act(async () => {
      fireEvent.click(confirm);
      await Promise.resolve();
    });
    expect(h.deletes).toEqual(["mara@example.com"]);
  });
});
