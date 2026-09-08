import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type {
  LibraryEntry,
  LibraryRepository,
  LibraryVersion,
} from "@/lib/library/model";
import { SessionController } from "@/lib/identity/session";
import { initializeDefinition } from "@/lib/homebrew/model";
import { CreationFlow } from "@/features/creation/CreationFlow";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/features/identity/IdentityNavigation", () => ({
  useIdentityNavigation: () => ({
    route: { page: "characters", creation: "new", step: "identity" },
    navigation: { go: vi.fn() },
  }),
}));
vi.mock("@/features/library/useLibraryOperation", () => ({
  useLibraryOperation: () => ({ state: null, recoveryOriginal: null }),
}));
vi.mock("@/lib/character-creation/draft", () => ({
  CreationDraftStorage: class {
    load() {
      return { value: { draft: {} }, original: null, error: false };
    }
  },
}));
vi.mock("@/lib/character-creation/compose", () => ({
  previewCreation: () => ({}),
  validateCreationCandidate: () => {},
  creationCandidate: () => ({}),
}));
vi.mock("@/features/creation/CreationWizard", () => ({
  CreationWizard: ({ librarySources }: { librarySources: LibraryVersion[] }) => (
    <div data-testid="sources">
      {librarySources.map((source) => source.entryId).join(",")}
    </div>
  ),
}));

afterEach(cleanup);

it("keeps Library options withdrawn when a version read completes after listener denial", async () => {
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  let entries: (entries: LibraryEntry[]) => void = () => {};
  let denied: (error: Error) => void = () => {};
  let resolveVersion: (version: LibraryVersion) => void = () => {};
  const pending = new Promise<LibraryVersion>((resolve) => {
    resolveVersion = resolve;
  });
  const readVersion = vi.fn(() => pending);
  const library = {
    watchEntries: (next: typeof entries, error: typeof denied) => {
      entries = next;
      denied = error;
      return () => {};
    },
    readVersion,
  } as unknown as LibraryRepository;
  const definition = initializeDefinition("class");
  const version: LibraryVersion = {
    schema: 1,
    ownerUid: "owner",
    entryId: "withdrawn-class",
    version: 1,
    definition,
    provenance: null,
    operationId: "published",
  };
  render(<CreationFlow session={session} library={library} enabled generation={1} />);
  act(() => {
    entries([
      {
        ownerUid: "owner",
        id: version.entryId,
        stableVersion: 1,
        draft: definition,
      } as LibraryEntry,
    ]);
  });
  expect(readVersion).toHaveBeenCalledOnce();
  act(() => denied(Error("permission-denied")));
  expect(screen.getByRole("alert").textContent).toBe("creationFlow.libraryError");
  await act(async () => {
    resolveVersion(version);
    await pending;
  });
  expect(screen.getByTestId("sources").textContent).toBe("");
  expect(screen.getByRole("alert").textContent).toBe("creationFlow.libraryError");
});
