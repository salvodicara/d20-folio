import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PreparationReuse } from "@/features/library/PreparationReuse";
import type { FolioCampaign } from "@/lib/identity/model";
import { SessionController } from "@/lib/identity/session";
import { initializeDefinition } from "@/lib/homebrew/model";
vi.mock("@/features/library/homebrew-labels", () => ({
  useHomebrewLabel: () => (key: string) => key,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/features/library/HomebrewReader", () => ({ HomebrewReader: () => null }));
vi.mock("@/lib/homebrew/conformance", () => ({ conformDefinition: () => [] }));
afterEach(cleanup);
it("does not materialize on selection; explicit reuse addresses the selected campaign", async () => {
  const session = new SessionController();
  session.transition({ uid: "dm", campaignId: "camp", activeCharacterId: null });
  const campaign: FolioCampaign = {
    schema: 1,
    id: "camp",
    name: "Camp",
    dmUid: "dm",
    members: ["dm"],
    revision: 1,
    archived: false,
    joinOpen: true,
  } as const;
  const version = {
    schema: 1,
    ownerUid: "dm",
    entryId: "wolf",
    version: 1,
    definition: { ...initializeDefinition("monster"), name: "Wolf" },
    provenance: null,
    operationId: "publish",
  } as const;
  const commit = vi.fn((op: unknown) => Promise.resolve({ operation: op, revision: 1 }));
  const addIntent = vi.fn((selected: FolioCampaign) => ({
    kind: "preparation-add",
    uid: "dm",
    opId: "one",
    scope: session.scope(),
    baseRevision: 0,
    authority: { characterRevision: null, assignment: null, campaignRevision: 1 },
    campaignId: selected.id,
    preparationId: "encounter",
    targetId: "copy",
    base: null,
    snapshot: version,
    state: {
      kind: "monster",
      label: "Wolf",
      currentHp: 10,
      tempHp: 0,
      conditions: [],
      resources: {},
    },
  }));
  // Only the persistence boundary is mocked; the actual operation hook runs.
  const repository = { addIntent, commit, reconcile: vi.fn(() => Promise.resolve(null)) };
  render(
    <PreparationReuse
      version={version}
      campaign={campaign}
      repository={repository as never}
      session={session}
      onClose={() => {}}
      onOpen={() => {}}
    />
  );
  expect(commit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "prepareCopy" }));
  await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
  expect(addIntent.mock.calls[0]?.[0]).toEqual(campaign);
});
