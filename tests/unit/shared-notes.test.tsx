import type { NoteSnapshot } from "@/lib/shared/model";
// @vitest-environment jsdom
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SharedNotes } from "@/features/identity/SharedNotes";
import { SessionController } from "@/lib/identity/session";
import type { SharedRepository } from "@/lib/shared/model";
import i18n from "@/i18n";
it("retains the edited base and draft when another client changes the saved note", async () => {
  await i18n.changeLanguage("en");
  sessionStorage.clear();
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  const target = { kind: "personal" as const, ownerUid: "owner", characterId: "one" };
  let current = {
    target,
    text: "original",
    revision: 0,
    authority: { characterRevision: 0, assignment: null, campaignRevision: null },
  };
  const noteIntent = vi.fn((base: NoteSnapshot, text: string) => ({
    kind: "notes",
    opId: "fixed",
    uid: "owner",
    scope: session.scope(),
    target,
    baseRevision: base.revision,
    authority: base.authority,
    text,
  }));
  const repo = {
    readNotes: () => Promise.resolve(current),
    noteIntent,
    commit: () => Promise.reject(new Error("stale-base")),
    reconcile: () => Promise.resolve(null),
  } as unknown as SharedRepository;
  const props = {
    repository: repo,
    session,
    target,
    title: "Private notes",
    value: "original",
  };
  const view = render(<SharedNotes {...props} />);
  await waitFor(() => expect(screen.getByRole("textbox")).not.toBeDisabled());
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "my draft" } });
  current = { ...current, text: "another client", revision: 1 };
  view.rerender(<SharedNotes {...props} value="another client" />);
  fireEvent.click(screen.getByRole("button", { name: "Save notes" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("changed"));
  expect(screen.getByRole("textbox")).toHaveValue("my draft");
  expect(noteIntent.mock.calls[0]?.[0].revision).toBe(0);
});
it("opens the last verified owner note for editing offline even without a draft", async () => {
  await i18n.changeLanguage("en");
  sessionStorage.clear();
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  const target = { kind: "personal" as const, ownerUid: "owner", characterId: "one" };
  const snapshot = {
    target,
    text: "verified",
    revision: 2,
    authority: { characterRevision: 0, assignment: null, campaignRevision: null },
  };
  sessionStorage.setItem(
    "folio-p03:owner:folioAccounts/owner/characters/one/private/notes:verified",
    JSON.stringify(snapshot)
  );
  render(
    <SharedNotes
      session={session}
      repository={
        {
          readNotes: () => Promise.reject(new Error("offline")),
        } as unknown as SharedRepository
      }
      target={target}
      title="Notes"
      value=""
    />
  );
  await waitFor(() => expect(screen.getByRole("textbox")).not.toBeDisabled());
  expect(screen.getByRole("textbox")).toHaveValue("verified");
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "new offline draft" },
  });
  expect(screen.getByRole("textbox")).toHaveValue("new offline draft");
});
it("persists invalidation across a same-user context round trip", async () => {
  await i18n.changeLanguage("en");
  sessionStorage.clear();
  const session = new SessionController();
  const scope = { uid: "owner", campaignId: null, activeCharacterId: null };
  session.transition(scope);
  const target = { kind: "personal" as const, ownerUid: "owner", characterId: "one" };
  const base = {
    target,
    text: "saved",
    revision: 0,
    authority: { characterRevision: 0, assignment: null, campaignRevision: null },
  };
  const operation = {
    kind: "notes",
    opId: "stable",
    uid: "owner",
    scope,
    target,
    text: "draft",
    baseRevision: 0,
    authority: base.authority,
  };
  const key = "folio-p03:owner:folioAccounts/owner/characters/one/private/notes";
  sessionStorage.setItem(key, JSON.stringify({ text: "draft", base, operation }));
  const repository = {
    readNotes: () => Promise.resolve(base),
    commit: vi.fn(),
  } as unknown as SharedRepository;
  const props = { repository, session, target, title: "Notes", value: "saved" };
  const view = render(<SharedNotes {...props} />);
  await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("draft"));
  act(() => session.transition({ ...scope, campaignId: "other" }));
  view.unmount();
  session.transition(scope);
  render(<SharedNotes {...props} />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Review changes" })).toBeVisible()
  );
  expect(screen.queryByRole("button", { name: "Check save" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox")).toHaveValue("draft");
});
it("restores an owned draft offline without treating it as a remote save", async () => {
  await i18n.changeLanguage("en");
  sessionStorage.clear();
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  const target = { kind: "personal" as const, ownerUid: "owner", characterId: "one" };
  const base = {
    target,
    text: "saved",
    revision: 0,
    authority: { characterRevision: 0, assignment: null, campaignRevision: null },
  };
  sessionStorage.setItem(
    "folio-p03:owner:folioAccounts/owner/characters/one/private/notes",
    JSON.stringify({ text: "offline draft", base })
  );
  const repository = {
    readNotes: () => Promise.reject(new Error("offline")),
  } as unknown as SharedRepository;
  render(
    <SharedNotes
      repository={repository}
      session={session}
      target={target}
      title="Private notes"
      value="saved"
    />
  );
  await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("offline draft"));
  expect(screen.getByRole("textbox")).not.toBeDisabled();
});
