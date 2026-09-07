// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SharedAssignment } from "@/features/identity/SharedAssignment";
import { SessionController } from "@/lib/identity/session";
import type { FolioCharacter } from "@/lib/identity/model";
import type { AssignmentOperation } from "@/lib/shared/model";
import type { SharedRepository } from "@/lib/shared/model";
import i18n from "@/i18n";

it("reopens a pending release with its original destination and intent", async () => {
  await i18n.changeLanguage("en");
  sessionStorage.clear();
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: "campaign", activeCharacterId: null });
  const character: FolioCharacter = {
    schema: 1,
    ownerUid: "owner",
    id: "one",
    name: "One",
    speciesId: "elf",
    classId: "wizard",
    level: 1,
    revision: 1,
    portraitPath: null,
    sheet: { build: {}, state: {} },
    currentAssignment: { campaignId: "campaign", assignmentId: "original", version: 1 },
  };
  const operation: AssignmentOperation = {
    kind: "assignment",
    opId: "release",
    uid: "owner",
    scope: { ...session.scope() },
    target: { ownerUid: "owner", id: "one" },
    baseRevision: 1,
    campaignId: null,
    campaignRevision: null,
    authority: {
      characterRevision: 1,
      assignment: character.currentAssignment,
      campaignRevision: null,
    },
  };
  sessionStorage.setItem("folio-p03-assignment:owner:one", JSON.stringify({ operation }));
  const reconcile = vi.fn(() => Promise.resolve({ operation, revision: 2 }));
  const commit = vi.fn();
  const done = vi.fn();
  render(
    <SharedAssignment
      character={character}
      campaigns={[]}
      session={session}
      repository={{ reconcile, commit } as unknown as SharedRepository}
      onDone={done}
    />
  );
  expect(screen.getByRole("combobox")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Check save" }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(reconcile).toHaveBeenCalledWith(operation);
  expect(commit).not.toHaveBeenCalled();
});
