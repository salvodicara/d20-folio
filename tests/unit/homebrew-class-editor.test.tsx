import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { initializeDefinition } from "@/lib/homebrew/model";
import type { LibraryDefinition } from "@/lib/library/model";
import { HomebrewFields } from "@/features/library/HomebrewFields";
import { mergedUi } from "./__helpers__/ui-merged";

afterEach(cleanup);
async function editor(initial = initializeDefinition("class")) {
  const i18n = createInstance();
  await i18n.init({ lng: "en", resources: { en: { common: mergedUi("en") } } });
  function Harness() {
    const [definition, set] = useState(initial);
    return (
      <>
        <HomebrewFields
          definition={definition}
          disabled={false}
          onChange={(payload) => set({ ...definition, payload })}
        />
        <output data-testid="definition">{JSON.stringify(definition)}</output>
      </>
    );
  }
  render(
    <I18nextProvider i18n={i18n}>
      <Harness />
    </I18nextProvider>
  );
}
const actual = () =>
  JSON.parse(screen.getByTestId("definition").textContent) as LibraryDefinition;
it("authors levels 1, 3, 5 and renumbers without replacing stable declarations", async () => {
  await editor();
  fireEvent.change(screen.getByLabelText("New class level"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Add level" }));
  fireEvent.change(screen.getByLabelText("New class level"), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Add level" }));
  const rows = actual().payload.data.progression as { id: string; level: number }[];
  expect(rows.map((r) => r.level)).toEqual([1, 3, 5]);
  const level = screen.getByTestId("class-level-" + String(rows[1]?.id));
  fireEvent.change(within(level).getByLabelText("Class level"), {
    target: { value: "6" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Order by level" }));
  expect(
    (actual().payload.data.progression as { id: string; level: number }[]).map((r) => [
      r.id,
      r.level,
    ])
  ).toEqual([
    [rows[0]?.id, 1],
    [rows[2]?.id, 5],
    [rows[1]?.id, 6],
  ]);
});
it("preserves unknown data during known identity edits", async () => {
  const initial = initializeDefinition("class");
  initial.payload.data.future = { opaque: [1, "two"] };
  await editor(initial);
  fireEvent.change(screen.getByLabelText("Hit die"), { target: { value: "12" } });
  expect(actual().payload.data.hitDie).toBe(12);
  expect(actual().payload.data.future).toEqual({ opaque: [1, "two"] });
});
it("does not replace a malformed progression or future authoring payload", async () => {
  const initial = initializeDefinition("class");
  initial.payload.data.progression = { future: true };
  await editor(initial);
  expect(screen.queryByRole("button", { name: "Add level" })).toBeNull();
  expect(actual().payload.data.progression).toEqual({ future: true });
  cleanup();
  initial.payload.data.authoringVersion = 99;
  await editor(initial);
  expect(screen.queryByLabelText("Hit die")).toBeNull();
  expect(actual().payload.data.authoringVersion).toBe(99);
});

it.each(["class", "subclass"] as const)(
  "reuses the recorded %s as a library draft instead of applying character item state",
  async (family) => {
    const { LibraryEditor } = await import("@/features/library/LibraryEditor");
    const { SessionController } = await import("@/lib/identity/session");
    const { act, waitFor } = await import("@testing-library/react");
    const i18n = createInstance();
    await i18n.init({ lng: "en", resources: { en: { common: mergedUi("en") } } });
    const session = new SessionController();
    session.transition({ uid: "class-reuse", campaignId: null, activeCharacterId: null });
    const recorded = initializeDefinition(family);
    recorded.name = "Recorded class";
    const draft = structuredClone(recorded);
    draft.description = "Unpublished change";
    const version = {
      schema: 1,
      entryId: "class",
      ownerUid: "class-reuse",
      version: 1,
      definition: recorded,
      provenance: null,
    };
    const entry = {
      schema: 1,
      id: "class",
      ownerUid: "class-reuse",
      revision: 2,
      stableVersion: 1,
      draft,
      provenance: null,
      lastOperation: { uid: "class-reuse", opId: "saved" },
    };
    let duplicated: LibraryDefinition | undefined;
    let characterRoute = false;
    await act(async () => {
      await Promise.resolve();
      render(
        <I18nextProvider i18n={i18n}>
          <LibraryEditor
            id="class"
            family={family}
            repository={
              {
                load: () => Promise.resolve(entry),
                readVersion: () => Promise.resolve(version),
              } as never
            }
            session={session}
            revision={0}
            onShare={() => {}}
            onReuse={() => {
              characterRoute = true;
            }}
            onDuplicate={(value) => {
              duplicated = value;
              return Promise.resolve();
            }}
          />
        </I18nextProvider>
      );
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Reuse recorded " + family })
    );
    await waitFor(() => expect(duplicated).toEqual(recorded));
    expect(characterRoute).toBe(false);
  }
);

it("names the affected level when an authored declaration is invalid", async () => {
  const { blankClassLevel } = await import("@/lib/homebrew/classes");
  const initial = initializeDefinition("class");
  initial.name = "Adept";
  initial.payload.data.progression = [
    { ...blankClassLevel(1), name: "First lesson" },
    { ...blankClassLevel(3), name: "Deep focus", programIds: ["missing"] },
  ] as never;
  await editor(initial);
  expect(
    screen.getAllByRole("status").find((e) => e.classList.contains("homebrew-validation"))
      ?.textContent
  ).toContain("Deep focus");
});
