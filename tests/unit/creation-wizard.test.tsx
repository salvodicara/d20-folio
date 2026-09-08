import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import {
  CreationWizard,
  type CreationWizardProps,
} from "@/features/creation/CreationWizard";
import {
  answerCreationChoice,
  newCreationDraft,
  selectCreationSource,
  type CreationRole,
} from "@/lib/character-creation/model";
import { previewCreation } from "@/lib/character-creation/compose";
import { catalogueSnapshot } from "@/lib/character-creation/catalogue";
import { initializeDefinition } from "@/lib/homebrew/model";
import type { LibraryVersion } from "@/lib/library/model";
import { loadSrdCatalogues } from "@/i18n/loaders";
import { registerSrdCatalogues } from "@/i18n/srd-en";
import { mergedUi } from "./__helpers__/ui-merged";

function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw Error("Missing test fixture");
  return value;
}
afterEach(cleanup);
async function mount(
  overrides: Partial<CreationWizardProps> = {},
  locale: "en" | "it" = "en"
) {
  const draft = newCreationDraft("owner", "draft");
  const props: CreationWizardProps = {
    draft,
    preview: previewCreation(draft),
    step: "identity",
    librarySources: [],
    disabled: false,
    retained: false,
    onChange: vi.fn(),
    onStep: vi.fn(),
    onConfirm: vi.fn(),
    onLibrary: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
  const i18n = createInstance();
  if (locale === "it") registerSrdCatalogues("it", await loadSrdCatalogues("it"));
  await i18n.init({
    lng: locale,
    resources: { [locale]: { common: mergedUi(locale) } },
    defaultNS: "common",
  });
  const view = render(
    <I18nextProvider i18n={i18n}>
      <CreationWizard {...props} />
    </I18nextProvider>
  );
  const update = (next: Partial<CreationWizardProps>) => {
    Object.assign(props, next);
    if (next.draft && !next.preview) props.preview = previewCreation(next.draft);
    view.rerender(
      <I18nextProvider i18n={i18n}>
        <CreationWizard {...props} />
      </I18nextProvider>
    );
  };
  return { props, view, i18n, update };
}
it("keeps edits controlled and uses the route step as the retained hint", async () => {
  const { props } = await mount();
  fireEvent.change(screen.getByRole("textbox", { name: "Character name" }), {
    target: { value: "Lyra" },
  });
  expect(props.onChange).toHaveBeenCalledWith(
    expect.objectContaining({ name: "Lyra", step: "identity" })
  );
  expect(screen.getByRole("textbox", { name: "Character name" })).toHaveValue("");
  expect(screen.queryByText("Draft saved on this device")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(props.onStep).toHaveBeenCalledWith("origins");
});

function complete(classId = "fighter") {
  let draft = newCreationDraft("owner", "draft");
  draft.name = "Lyra";
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
    ["species", "species:dwarf"],
    ["background", "background:soldier"],
    ["class", "class:" + classId],
  ] as const)
    draft = selectCreationSource(draft, role, catalogueSnapshot(key));
  draft = answerCreationChoice(draft, "background", "root/background-abilities", [
    "strength:2",
    "constitution:1",
  ]);
  for (let i = 0; i < 50; i++) {
    const preview = previewCreation(draft);
    const c = preview.composition.activeChoices.find(
      (c) => c.active && c.selected.length !== c.choice.count
    );
    if (!c) {
      expect(preview.issues).toEqual([]);
      return draft;
    }
    const options = preview.options(c).length
      ? preview.options(c)
      : c.choice.options.map((option) => ({ option, snapshot: undefined }));
    const selected = options.slice(0, c.choice.count);
    draft = answerCreationChoice(
      draft,
      c.selectionId as CreationRole,
      c.path,
      selected.map((o) => o.option.id),
      selected.flatMap((o) => (o.snapshot ? [o.snapshot] : []))
    );
  }
  throw Error("fixture did not settle");
}
it("searches the complete spell pool and keeps selected spells removable", async () => {
  const draft = selectCreationSource(
    newCreationDraft("owner", "draft"),
    "class",
    catalogueSnapshot("class:wizard")
  );
  const preview = previewCreation(draft);
  const c = required(
    preview.composition.activeChoices.find((c) => c.choice.id === "spellbook")
  );
  const options = preview.options(c);
  expect(options.length).toBeGreaterThan(3);
  const last = required(options.at(-1));
  const { props, update } = await mount({ draft, preview, step: "class" });
  const group = screen.getByRole("group", { name: "In spellbook" });
  expect(within(group).getAllByRole("checkbox")).toHaveLength(options.length);
  const read = within(group).getByText("Read " + last.option.name, {
    selector: "summary",
  });
  expect(read.closest("label")).toBeNull();
  fireEvent.click(read);
  expect(read.parentElement).toHaveAttribute("open");
  expect(read.parentElement).toHaveTextContent(
    required(last.snapshot).definition.description
  );
  expect(props.onChange).not.toHaveBeenCalled();
  fireEvent.change(within(group).getByRole("searchbox"), {
    target: { value: last.option.name },
  });
  fireEvent.click(
    within(group).getByRole("checkbox", { name: new RegExp(last.option.name) })
  );
  const next = required(vi.mocked(props.onChange).mock.lastCall)[0];
  expect(
    required(required(next.selections[required(next.sources.class)]).resolvedChoices)[
      c.path
    ]
  ).toEqual([last.snapshot]);
  update({ draft: next });
  fireEvent.change(within(group).getByRole("searchbox"), {
    target: { value: "no matching result" },
  });
  const checked = within(group).getByRole("checkbox", {
    name: new RegExp(last.option.name),
  });
  expect(checked).toBeChecked();
  fireEvent.click(checked);
  const cleared = required(vi.mocked(props.onChange).mock.lastCall)[0];
  expect(
    required(cleared.selections[required(cleared.sources.class)]).answers[c.path]
  ).toEqual([]);
});
it("retains a custom branch after changing its parent and supports explicit clearing", async () => {
  const definition = initializeDefinition("species");
  definition.name = "Custom lineage";
  definition.payload.data.size = "medium";
  definition.payload.data.choices = [
    {
      id: "gate",
      name: "Lineage gift",
      count: 1,
      parent: null,
      options: [
        { id: "yes", name: "Gift", benefits: [] },
        { id: "no", name: "No gift", benefits: [] },
      ],
    },
    {
      id: "gift",
      name: "Gift skill",
      count: 1,
      parent: { choiceId: "gate", optionId: "yes" },
      options: [
        {
          id: "arcana",
          name: "Arcane learning",
          benefits: [{ kind: "proficiency", category: "skill", id: "arcana" }],
        },
      ],
    },
  ];
  const source: LibraryVersion = {
    schema: 1,
    ownerUid: "owner",
    entryId: "custom",
    version: 2,
    provenance: null,
    operationId: "published",
    definition,
  };
  let draft = selectCreationSource(newCreationDraft("owner", "draft"), "species", source);
  draft = answerCreationChoice(draft, "species", "root/gate", ["yes"]);
  draft = answerCreationChoice(draft, "species", "root/gift", ["arcana"]);
  const { props, update } = await mount({
    draft,
    preview: previewCreation(draft),
    step: "origins",
    librarySources: [source],
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "No gift" }));
  const next = required(vi.mocked(props.onChange).mock.lastCall)[0];
  expect(
    required(next.selections[required(next.sources.species)]).answers["root/gift"]
  ).toEqual(["arcana"]);
  update({ draft: next });
  expect(screen.getByRole("checkbox", { name: "Arcane learning" })).toBeDisabled();
  expect(
    props.preview.composition.facts.some(
      (f) => f.benefit.kind === "proficiency" && f.benefit.id === "arcana"
    )
  ).toBe(false);
  const retained = required(
    screen.getByText("Retained answers", { selector: "summary" }).parentElement
  );
  fireEvent.click(within(retained).getByRole("button", { name: "Clear selection" }));
  expect(
    required(
      required(vi.mocked(props.onChange).mock.lastCall)[0].selections[
        required(next.sources.species)
      ]
    ).answers
  ).not.toHaveProperty("root/gift");
});
it("restores earlier sources with their retained answers and keeps navigation controlled", async () => {
  const draft = complete();
  const { props, update } = await mount({
    draft,
    preview: previewCreation(draft),
    step: "class",
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Class" }), {
    target: { value: "class:wizard" },
  });
  const next = required(vi.mocked(props.onChange).mock.lastCall)[0];
  expect(required(next.selections[required(draft.sources.class)]).answers).toEqual(
    required(draft.selections[required(draft.sources.class)]).answers
  );
  update({ draft: next });
  fireEvent.click(screen.getByRole("button", { name: "Use this source again" }));
  expect(required(vi.mocked(props.onChange).mock.lastCall)[0].sources.class).toBe(
    draft.sources.class
  );
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(props.onStep).toHaveBeenCalledWith("origins");
  expect(screen.getByRole("heading", { level: 2, name: "Class" })).toBeInTheDocument();
});
it("shows selected feats, pinned copies and complete scores in a valid review", async () => {
  const draft = complete();
  const { props, update } = await mount({
    draft,
    preview: previewCreation(draft),
    step: "review",
    retained: true,
  });
  expect(screen.getByText("Draft saved on this device")).toBeInTheDocument();
  expect(screen.getByRole("table")).toHaveTextContent("Constitution");
  expect(screen.getByText("Savage Attacker")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create character" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Create character" }));
  expect(props.onConfirm).toHaveBeenCalledOnce();
  update({ disabled: true });
  expect(screen.getByRole("button", { name: "Create character" })).toBeDisabled();
});
it("localizes official choices and keeps authored custom names intact in Italian", async () => {
  const draft = complete("wizard");
  await mount({ draft, preview: previewCreation(draft), step: "class" }, "it");
  expect(screen.getByRole("combobox", { name: "Classe" })).toHaveTextContent("Mago");
  expect(screen.getByRole("group", { name: "Trucchetti" })).toBeInTheDocument();
  expect(screen.queryByText("Spellcasting ability")).toBeNull();
  expect(screen.queryByText("Class skills")).toBeNull();
});
it("names a class feature and its nested option from the Italian source catalogue", async () => {
  const draft = selectCreationSource(
    newCreationDraft("owner", "draft"),
    "class",
    catalogueSnapshot("class:cleric")
  );
  await mount({ draft, preview: previewCreation(draft), step: "class" }, "it");
  const group = screen.getByRole("group", { name: "Ordine Divino" });
  expect(within(group).getByRole("checkbox", { name: /Protettore/ })).toBeInTheDocument();
  expect(within(group).getByRole("checkbox", { name: /Taumaturgo/ })).toBeInTheDocument();
});
it("permits a scoped prerequisite exception but never overrides unsupported declarations", async () => {
  const draft = complete();
  const preview = previewCreation(draft);
  preview.valid = false;
  preview.issues = [
    {
      selectionId: "class",
      path: "root",
      code: "prerequisite-ability",
      severity: "invalid",
    },
    {
      selectionId: "class",
      path: "root/future",
      code: "unsupported-field",
      severity: "unsupported",
    },
  ];
  const { props } = await mount({ draft, preview, step: "review" });
  expect(screen.getAllByRole("button", { name: "Record exception" })).toHaveLength(1);
  fireEvent.change(screen.getByRole("textbox", { name: "Reason for exception" }), {
    target: { value: "Our table agreement" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Record exception" }));
  const next = required(vi.mocked(props.onChange).mock.lastCall)[0];
  expect(required(next.selections[required(next.sources.class)]).exceptions).toEqual([
    {
      path: "root",
      code: "prerequisite-ability",
      authorUid: "owner",
      reason: "Our table agreement",
    },
  ]);
  expect(next.exceptions).toEqual([]);
  expect(screen.getByRole("button", { name: "Create character" })).toBeDisabled();
});
it("records the reason for an out-of-range manual score without changing the score", async () => {
  const draft = newCreationDraft("owner", "draft");
  draft.method = "manual";
  draft.scores = {
    strength: 20,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  };
  const { props } = await mount({
    draft,
    preview: previewCreation(draft),
    step: "abilities",
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Reason for exception" }), {
    target: { value: "Agreed with the DM" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Record exception" }));
  expect(props.onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      scores: draft.scores,
      exceptions: [
        {
          path: "abilities/strength",
          code: "manual-range",
          reason: "Agreed with the DM",
          authorUid: "owner",
        },
      ],
      step: "abilities",
    })
  );
});
it("blocks confirmation for an incomplete or disabled review", async () => {
  await mount({ step: "review" });
  expect(screen.getByRole("button", { name: "Create character" })).toBeDisabled();
  expect(
    screen.getByText("Complete the highlighted choices before creating your character.")
  ).toBeInTheDocument();
});
