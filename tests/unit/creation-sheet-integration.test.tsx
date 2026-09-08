import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import type { User } from "firebase/auth";
import type { FolioCharacter } from "@/lib/identity/model";
import type { OriginBuild } from "@/lib/homebrew/origin-build";
import type { ClassBuild } from "@/lib/homebrew/class-build";
import type {
  HomebrewInstance,
  InitialLoadout,
  InstanceRepository,
} from "@/lib/homebrew/instances";
import type { LibraryRepository, LibraryVersion } from "@/lib/library/model";
import {
  newCreationDraft,
  selectCreationSource,
  answerCreationChoice,
  type CreationRole,
} from "@/lib/character-creation/model";
import {
  catalogueSnapshot,
  verifyCatalogueSnapshot,
} from "@/lib/character-creation/catalogue";
import { previewCreation } from "@/lib/character-creation/compose";
import { initializeDefinition } from "@/lib/homebrew/model";
import { includeOriginDependency } from "@/lib/homebrew/origins";
import { materializeInstance, DEFAULT_INSTANCE_STATE } from "@/lib/homebrew/instances";
import { sourceIdentity } from "@/lib/homebrew/sources";
import { loadSrdCatalogues } from "@/i18n/loaders";
import { registerSrdCatalogues } from "@/i18n/srd-en";
import { SessionController } from "@/lib/identity/session";
import { mergedUi } from "./__helpers__/ui-merged";

const harness = vi.hoisted(() => ({
  character: null as FolioCharacter | null,
  origins: null as OriginBuild | null,
  classes: null as ClassBuild | null,
  originRead: false,
  classRead: false,
}));
const stop = () => {};
vi.mock("@/lib/firebase", () => ({ auth: {}, db: {}, storage: {} }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, next: (user: User) => void) => {
    next({ uid: "owner", displayName: "Owner" } as User);
    return () => {};
  },
  GoogleAuthProvider: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/i18n", () => ({ ensureLocale: () => Promise.resolve() }));
vi.mock("@/lib/identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/identity")>()),
  createIdentityRepository: () => ({
    ensureIdentity: () => Promise.resolve(),
    watchAccount: (next: (v: unknown) => void) => {
      next({ uid: "owner", displayName: "Owner", locale: "it", diceMode: "physical" });
      return () => {};
    },
    watchOwnedCharacters: (next: (v: unknown) => void) => {
      next(harness.character ? [harness.character] : []);
      return () => {};
    },
    watchMemberships: (next: (v: unknown) => void) => {
      next([]);
      return () => {};
    },
    watchAuthority: (next: (v: unknown) => void) => {
      next({ status: "active", isAdmin: false });
      return () => {};
    },
    watchCharacter: (_ref: unknown, next: (v: unknown) => void) => {
      next(harness.character);
      return () => {};
    },
    watchPrivateNotes: (_ref: unknown, next: (v: unknown) => void) => {
      next("");
      return () => {};
    },
  }),
}));
vi.mock("@/lib/homebrew/origin-build-repository", () => ({
  createOriginBuildRepository: () => ({
    watch: (_ref: unknown, next: (v: OriginBuild | null) => void) => {
      harness.originRead = true;
      next(harness.origins);
      return () => {};
    },
    watchIssues: () => () => {},
  }),
}));
vi.mock("@/lib/homebrew/class-build-repository", () => ({
  createClassBuildReader: () => ({
    watch: (_ref: unknown, next: (v: unknown) => void) => {
      harness.classRead = true;
      next({ base: harness.classes, original: null });
      return () => {};
    },
  }),
}));
vi.mock("@/lib/homebrew/instance-repository", () => ({
  createInstanceRepository: () => ({
    watch: (_ref: unknown, next: (v: HomebrewInstance[]) => void) => {
      next([]);
      return () => {};
    },
    watchIssues: () => () => {},
  }),
}));
vi.mock("@/lib/library/repository", () => ({ createLibraryRepository: () => ({}) }));
vi.mock("@/lib/shared/repository", () => ({ createSharedRepository: () => ({}) }));
vi.mock("@/lib/homebrew/preparation-repository", () => ({
  createPreparationRepository: () => ({}),
}));
// Unrelated write forms do not participate in a read-only character inspection.
vi.mock("@/features/creation/CreationFlow", () => ({ CreationFlow: () => null }));
vi.mock("@/features/creation/ImportFlow", () => ({ ImportFlow: () => null }));
vi.mock("@/features/identity/SharedNotes", () => ({ SharedNotes: () => null }));
vi.mock("@/features/library/HomebrewPortable", () => ({ HomebrewExport: () => null }));
import { IdentityApp } from "@/features/identity/IdentityApp";
import { HomebrewSheet } from "@/features/library/HomebrewSheet";

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw Error("Missing fixture");
  return value;
}
function complete(species = "dwarf") {
  let draft = newCreationDraft("owner", "hero");
  draft.name = "Arin";
  draft.languages = ["elvish", "dwarvish"];
  draft.scores = {
    strength: 15,
    dexterity: 14,
    constitution: 13,
    intelligence: 12,
    wisdom: 10,
    charisma: 8,
  };
  for (const [role, key] of [
    ["species", "species:" + species],
    ["background", "background:soldier"],
    ["class", "class:fighter"],
  ] as const)
    draft = selectCreationSource(draft, role, catalogueSnapshot(key));
  draft = answerCreationChoice(draft, "background", "root/background-abilities", [
    "strength:2",
    "constitution:1",
  ]);
  for (let i = 0; i < 50; i++) {
    const preview = previewCreation(draft);
    const choice = preview.composition.activeChoices.find(
      (c) => c.active && c.selected.length !== c.choice.count
    );
    if (!choice) {
      expect(preview.issues).toEqual([]);
      return { draft, preview };
    }
    const pool = preview.options(choice);
    const options = (
      pool.length
        ? pool
        : choice.choice.options.map((option) => ({ option, snapshot: undefined }))
    ).slice(0, choice.choice.count);
    draft = answerCreationChoice(
      draft,
      choice.selectionId as CreationRole,
      choice.path,
      options.map((o) => o.option.id),
      options.flatMap((o) => (o.snapshot ? [o.snapshot] : []))
    );
  }
  throw Error("Fixture did not settle");
}
async function mount(node: React.ReactNode) {
  registerSrdCatalogues("it", await loadSrdCatalogues("it"));
  const i18n = createInstance();
  await i18n.init({
    lng: "it",
    defaultNS: "common",
    resources: { it: { common: mergedUi("it") } },
  });
  const view = render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
  return { ...view, i18n };
}
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, "", "/#characters?owner=owner&character=hero");
  harness.character = null;
  harness.origins = null;
  harness.classes = null;
  harness.originRead = false;
  harness.classRead = false;
});
afterEach(cleanup);

it("does not certify a guided sheet when origins resolved missing but the class exists", async () => {
  const { preview } = complete();
  harness.character = preview.character;
  harness.classes = preview.classes;
  const { i18n } = await mount(<IdentityApp />);
  await waitFor(() => expect(harness.originRead && harness.classRead).toBe(true));
  const dialog = await screen.findByRole("dialog", { name: "Arin" });
  expect(
    await within(dialog).findByText(i18n.t("homebrewV2.origin.unavailableBuild"))
  ).toBeInTheDocument();
  expect(
    within(dialog).queryByRole("heading", { name: "Dettagli del personaggio" })
  ).toBeNull();
});
it("retains legacy baseline inspection when optional origin and class documents are absent", async () => {
  const { preview } = complete();
  harness.character = structuredClone(preview.character);
  Reflect.deleteProperty(harness.character.sheet.build, "creation");
  const { i18n } = await mount(<IdentityApp />);
  const dialog = await screen.findByRole("dialog", { name: "Arin" });
  expect(
    await within(dialog).findByRole("heading", { name: "Dettagli del personaggio" })
  ).toBeInTheDocument();
  expect(harness.originRead && harness.classRead).toBe(true);
  expect(
    within(dialog).queryByText(i18n.t("homebrewV2.origin.unavailableBuild"))
  ).toBeNull();
});
it("uses Italian primary origin and selected-option labels on an official created sheet", async () => {
  const { preview } = complete("human");
  harness.character = preview.character;
  harness.origins = preview.origins;
  harness.classes = preview.classes;
  const { container } = await mount(<IdentityApp />);
  const dialog = await screen.findByRole("dialog", { name: "Arin" });
  expect(
    await within(dialog).findByRole("heading", { name: "Dettagli del personaggio" })
  ).toBeInTheDocument();
  const panel = required(container.ownerDocument.querySelector(".origin-build-panel"));
  const headings = Array.from(panel.querySelectorAll("h4")).map((n) => n.textContent);
  expect(headings.some((name) => name.startsWith("Umano ·"))).toBe(true);
  expect(headings.some((name) => name.startsWith("Soldato ·"))).toBe(true);
  expect(
    headings.some((name) => name.startsWith("Human ·") || name.startsWith("Soldier ·"))
  ).toBe(false);
  const facts = Array.from(panel.querySelectorAll(".homebrew-facts dt")).map(
    (n) => n.textContent
  );
  expect(facts).toContain("Taglia");
  expect(facts).not.toContain("Size");
  const size = Array.from(panel.querySelectorAll(".homebrew-facts dt")).find(
    (n) => n.textContent === "Taglia"
  );
  expect(size?.nextElementSibling).toHaveTextContent("Piccola");
  const background = Array.from(dialog.querySelectorAll(".identity-facts dt")).find(
    (n) => n.textContent === "Background"
  );
  expect(background?.nextElementSibling).toHaveTextContent("Soldato");
  const intro = required(
    dialog.querySelector(".identity-inspection-label")?.nextElementSibling
  );
  expect(intro).toHaveTextContent("Umano");
  expect(intro).not.toHaveTextContent("Human");
});
it("preserves authored custom species and background names in the Italian sheet", async () => {
  let { draft } = complete();
  const species = initializeDefinition("species");
  species.name = "The English Named Lineage";
  species.payload.data.size = "medium";
  const original = required(
    draft.selections[required(draft.sources.background)]
  ).snapshot;
  const background = structuredClone(original.definition);
  background.name = "My Authored Background";
  for (const [role, definition] of [
    ["species", species],
    ["background", background],
  ] as const) {
    const version: LibraryVersion = {
      schema: 1,
      ownerUid: "owner",
      entryId: "custom-" + role,
      version: 1,
      definition,
      provenance: null,
      operationId: "publish",
    };
    const previous = required(draft.selections[required(draft.sources[role])]);
    draft = selectCreationSource(draft, role, version);
    const selected = required(draft.selections[required(draft.sources[role])]);
    selected.answers = previous.answers;
    if (previous.resolvedChoices) selected.resolvedChoices = previous.resolvedChoices;
  }
  draft = answerCreationChoice(draft, "background", "root/equipment", ["B"]);
  const preview = previewCreation(draft);
  expect(preview.issues).toEqual([]);
  harness.character = preview.character;
  harness.origins = preview.origins;
  harness.classes = preview.classes;
  await mount(<IdentityApp />);
  const dialog = await screen.findByRole("dialog", { name: "Arin" });
  expect(
    await within(dialog).findByRole("heading", { name: "Dettagli del personaggio" })
  ).toBeInTheDocument();
  expect(
    Array.from(dialog.querySelectorAll(".origin-selected h4")).some((n) =>
      n.textContent.startsWith("The English Named Lineage ·")
    )
  ).toBe(true);
  const intro = required(
    dialog.querySelector(".identity-inspection-label")?.nextElementSibling
  );
  expect(intro).toHaveTextContent("The English Named Lineage");
  const backgroundFact = Array.from(dialog.querySelectorAll(".identity-facts dt")).find(
    (n) => n.textContent === "Background"
  );
  expect(backgroundFact?.nextElementSibling).toHaveTextContent("My Authored Background");
});

it("localizes direct and bundled catalogue copy summaries while retaining a custom copy name", async () => {
  const { preview } = complete();
  const spell = catalogueSnapshot("spell:magic-missile");
  const weapon = catalogueSnapshot("equipment:longsword");
  const rootDefinition = includeOriginDependency(initializeDefinition("species"), weapon);
  const root: LibraryVersion = {
    schema: 1,
    ownerUid: "owner",
    entryId: "package",
    version: 1,
    definition: rootDefinition.definition,
    provenance: null,
    operationId: "publish",
  };
  const sourceKey = sourceIdentity(root);
  const character = preview.character;
  const op = { uid: "owner", opId: "create" };
  const custom: LibraryVersion = {
    schema: 1,
    ownerUid: "owner",
    entryId: "custom-spell",
    version: 1,
    definition: { ...initializeDefinition("spell"), name: "My English Spell" },
    provenance: null,
    operationId: "publish",
  };
  const items = [
    materializeInstance(
      character,
      "initial_spell",
      spell,
      DEFAULT_INSTANCE_STATE,
      1,
      op,
      {},
      verifyCatalogueSnapshot
    ),
    materializeInstance(
      character,
      "initial_weapon",
      {
        kind: "bundled",
        schema: 1,
        sourceKey,
        dependencyPath: rootDefinition.key,
        definition: weapon.definition,
      },
      DEFAULT_INSTANCE_STATE,
      1,
      op,
      { [sourceKey]: root },
      verifyCatalogueSnapshot
    ),
    materializeInstance(character, "custom_copy", custom, DEFAULT_INSTANCE_STATE, 1, op),
  ];
  const initial: InitialLoadout = {
    schema: 1,
    character,
    revision: 1,
    sources: { [sourceKey]: root },
    instances: Object.fromEntries(
      items.filter((i) => i.id.startsWith("initial_")).map((i) => [i.id, i])
    ),
    lastOperation: op,
  };
  const repository = {
    watch: (_ref: unknown, next: (items: HomebrewInstance[]) => void) => {
      next(items);
      return stop;
    },
    watchIssues: () => stop,
    loadedInitial: () => initial,
  } as unknown as InstanceRepository;
  const session = new SessionController();
  session.transition({ uid: "viewer", campaignId: null, activeCharacterId: null });
  const { container } = await mount(
    <HomebrewSheet
      character={character}
      repository={repository}
      library={{} as LibraryRepository}
      session={session}
    />
  );
  await waitFor(() =>
    expect(container.querySelectorAll(".homebrew-preview > summary")).toHaveLength(3)
  );
  const summaries = Array.from(
    container.querySelectorAll(".homebrew-preview > summary")
  ).map((n) => n.textContent);
  expect(summaries.some((s) => s.startsWith("Dardo Incantato ·"))).toBe(true);
  expect(summaries).toContain(`Spada Lunga · Versione ${weapon.release}`);
  expect(summaries).toContain("My English Spell · Versione 1");
  expect(
    summaries.some((s) => s.startsWith("Magic Missile ·") || s.startsWith("Longsword ·"))
  ).toBe(false);
});
