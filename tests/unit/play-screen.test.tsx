/**
 * `PlayScreen` semantics (jsdom). Pixels are the screenshot gate's job (golden rule 25); this
 * file pins what the screen MEANS:
 *
 *   • who sees what — the DM, a seated player, a spectator;
 *   • a tile → a target → an `intent`, with the rolls that settled it appended first;
 *   • the drawer's per-line undo appending an `undo`;
 *   • the HP editor appending the `override` the DM meant.
 *
 * The table is a fake `TableState` over an in-memory log: the same interface the real store
 * exposes, so the screen cannot tell the difference — which is the whole point of injecting it.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import i18next from "@/i18n";

// The screen itself never touches Firestore — the table store is injected — but the app's
// i18n bootstrap pulls the singleton in transitively, and CI has no Firebase env.
vi.mock("@/lib/firebase", () => ({}));
import { PlayScreen } from "@/features/play/PlayScreen";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { CORE_MECHANICS } from "@/data/combat/core-catalogue";
import { fold } from "@/lib/combat/fold";
import type { TableState } from "@/features/play/table/table-store";
import type { Action, Encounter, Entity } from "@/lib/combat/types";
import type { Mechanic } from "@/lib/combat/mechanic";
import type { ActionId } from "@/lib/combat/ids";
import { testEntity } from "./combat/__helpers__/entities";
import { nextActionId, openingActions, seqFactory } from "./combat/__helpers__/state";

const { catalogue } = buildCatalogue(CORE_MECHANICS);

const DM = "dm";
const PLAYER = "p-lyra";

/** One attack the bard carries into the log — the shape `projectCharacter` emits. */
const RAPIER: Mechanic = {
  schema: 1,
  id: "pc:lyra:weapon-rapier",
  source: "srd",
  label: "custom:Rapier",
  active: [
    {
      id: "attack",
      trigger: { kind: "invocation", economy: "action" },
      cost: [{ kind: "turn", claim: "attack" }],
      targets: {
        count: 1,
        eligibility: { relation: "visible", between: ["$self", "$target"], value: true },
      },
      inputs: [
        { id: "roll", kind: "d20", for: "attack" },
        { id: "damage", kind: "dice", formula: "1d8+3" },
      ],
      steps: [
        {
          id: "hit",
          kind: "attack",
          roll: "roll",
          bonus: 7,
          damage: [{ dice: "damage", type: "piercing" }],
        },
      ],
    },
  ],
};

function fixtureLog(): Action[] {
  const seq = seqFactory(DM);
  const lyra: Entity = {
    ...testEntity({
      id: "lyra",
      kind: "pc",
      controllerUid: PLAYER,
      hp: 38,
      maxHp: 62,
      mechanics: ["core:move", "core:dash", RAPIER.id],
      position: { x: 1, y: 1 },
    }),
    label: "custom:Lyra",
  };
  const ogre: Entity = {
    ...testEntity({
      id: "ogre",
      kind: "monster",
      controllerUid: DM,
      hp: 42,
      maxHp: 59,
      mechanics: ["core:move"],
      position: { x: 3, y: 1 },
    }),
    label: "custom:Ogre",
  };
  // The helper's trailing argument is the pool of definitions a seat may carry; each entity
  // takes the ones its own `mechanics` list names.
  return openingActions(
    DM,
    seq,
    [lyra, ogre],
    { lyra: 15, ogre: 12 },
    ["lyra", "ogre"],
    [RAPIER, ...CORE_MECHANICS]
  );
}

interface Fake {
  readonly table: TableState;
  readonly log: Action[];
  rerender(): void;
}

/** A `TableState` over an in-memory log, re-folded on every append. */
function fakeTable(uid: string, dm: boolean, log: Action[]): TableState {
  const seq = seqFactory(uid);
  const encounter: Encounter = {
    schema: 1,
    id: "live",
    host: { kind: "campaign", campaignId: "c" },
    log,
    checkpoint: null,
  };
  return {
    snapshot: { kind: "encounter", encounter, pending: false },
    fold: fold(encounter, catalogue),
    role: { uid, dm },
    dispatch: (body) => {
      const id: ActionId = nextActionId("a");
      const action = { ...body, id, seq: seq(), by: uid } as Action;
      log.push(action);
      return Promise.resolve(id);
    },
    undo: (of, reason) => {
      log.push({
        kind: "undo",
        of,
        reason,
        id: nextActionId("u"),
        seq: seq(),
        by: uid,
      });
      return Promise.resolve();
    },
    connect: () => () => undefined,
  };
}

function mount(opts: {
  uid: string;
  dm: boolean;
  characterId: string | null;
  log?: Action[];
}): Fake {
  const log = opts.log ?? fixtureLog();
  const props = () => ({
    table: fakeTable(opts.uid, opts.dm, log),
    catalogue,
    viewer: {
      uid: opts.uid,
      dm: opts.dm,
      characterId: opts.characterId,
      dmUid: DM,
    },
    title: "Imboscata al guado",
    members: { dm: "Sara", "p-lyra": "Marco" },
    characters: {},
  });
  const view = render(<PlayScreen {...props()} />);
  return {
    table: props().table,
    log,
    rerender: () => view.rerender(<PlayScreen {...props()} />),
  };
}

beforeEach(async () => {
  await i18next.changeLanguage("en");
  vi.restoreAllMocks();
});

describe("who sees what", () => {
  it("the DM gets the drawer handle, the fog tool and the creature dock", () => {
    mount({ uid: DM, dm: true, characterId: null });
    expect(screen.getByTestId("play-screen").dataset.role).toBe("dm");
    expect(screen.getByTestId("pl-drawer-open")).toBeTruthy();
    expect(screen.getByTestId("pl-tool-fog-reveal")).toBeTruthy();
    expect(screen.getByTestId("pl-tool-add")).toBeTruthy();
    expect(screen.getByTestId("pl-player-view")).toBeTruthy();
  });

  it("a seated player gets the hotbar and none of the DM's tools", () => {
    mount({ uid: PLAYER, dm: false, characterId: "lyra" });
    expect(screen.getByTestId("play-screen").dataset.role).toBe("player");
    expect(screen.getByTestId("pl-hotbar")).toBeTruthy();
    expect(screen.queryByTestId("pl-drawer-open")).toBeNull();
    expect(screen.queryByTestId("pl-tool-fog-reveal")).toBeNull();
    expect(screen.queryByTestId("pl-player-view")).toBeNull();
  });

  it("a spectator sees the map, the strip and the log, and nothing to act with", () => {
    mount({ uid: "watcher", dm: false, characterId: null });
    expect(screen.getByTestId("play-screen").dataset.role).toBe("spectator");
    expect(screen.getByTestId("pl-initiative")).toBeTruthy();
    expect(screen.getByTestId("pl-log")).toBeTruthy();
    expect(screen.queryByTestId("pl-hotbar")).toBeNull();
    expect(screen.queryByTestId("pl-drawer-open")).toBeNull();
    expect(screen.queryByTestId("pl-tool-add")).toBeNull();
  });

  it("no table at all is one honest panel, and only the DM is offered the way forward", () => {
    const missing: TableState = {
      snapshot: { kind: "missing" },
      fold: null,
      role: { uid: DM, dm: true },
      dispatch: () => Promise.resolve("x"),
      undo: () => Promise.resolve(),
      connect: () => () => undefined,
    };
    const { rerender } = render(
      <PlayScreen
        table={missing}
        catalogue={catalogue}
        viewer={{ uid: DM, dm: true, characterId: null, dmUid: DM }}
        title="t"
        members={{}}
        characters={{}}
        onOpenTable={() => undefined}
      />
    );
    expect(screen.getByTestId("pl-open-table")).toBeTruthy();
    rerender(
      <PlayScreen
        table={{ ...missing, role: { uid: PLAYER, dm: false } }}
        catalogue={catalogue}
        viewer={{ uid: PLAYER, dm: false, characterId: "lyra", dmUid: DM }}
        title="t"
        members={{}}
        characters={{}}
      />
    );
    expect(screen.queryByTestId("pl-open-table")).toBeNull();
  });
});

describe("a tile, a target, an intent", () => {
  it("appends the rolls first and the intent that spends them second", async () => {
    const fake = mount({ uid: PLAYER, dm: false, characterId: "lyra" });
    const before = fake.log.length;

    fireEvent.click(screen.getByTestId(`pl-tile-${RAPIER.id}#attack`));
    // Armed, not fired: nothing is appended until a target answers.
    expect(fake.log.length).toBe(before);
    expect(screen.getByTestId("pl-aiming")).toBeTruthy();

    // The commit awaits the rolls before it appends the intent, so the click is flushed
    // through a microtask turn inside `act`.
    await act(async () => {
      fireEvent.click(screen.getByTestId("pl-cell-ogre"));
      await Promise.resolve();
    });

    const appended = fake.log.slice(before);
    expect(appended.map((action) => action.kind)).toEqual(["roll", "roll", "intent"]);
    const intent = appended.at(-1);
    expect(intent?.kind === "intent" && intent.targets).toEqual(["ogre"]);
    // Every input is answered by the id of the roll that settled it.
    if (intent?.kind !== "intent") throw new Error("no intent");
    expect(Object.values(intent.answers)).toHaveLength(2);
    for (const answer of Object.values(intent.answers)) {
      expect(answer).toHaveProperty("roll");
    }
  });

  it("aiming can be abandoned without spending a die", () => {
    const fake = mount({ uid: PLAYER, dm: false, characterId: "lyra" });
    const before = fake.log.length;
    fireEvent.click(screen.getByTestId(`pl-tile-${RAPIER.id}#attack`));
    fireEvent.click(screen.getByTestId("pl-aim-cancel"));
    expect(screen.queryByTestId("pl-aiming")).toBeNull();
    expect(fake.log.length).toBe(before);
  });
});

describe("the DM drawer", () => {
  it("undo on a log line appends an undo of that action", () => {
    const fake = mount({ uid: DM, dm: true, characterId: null });
    fireEvent.click(screen.getByTestId("pl-drawer-open"));
    const drawer = screen.getByTestId("pl-drawer");
    const first = fake.log[0];
    if (!first) throw new Error("empty fixture");
    fireEvent.click(within(drawer).getByTestId(`pl-undo-${first.id}`));
    const last = fake.log.at(-1);
    expect(last?.kind).toBe("undo");
    expect(last?.kind === "undo" && last.of).toBe(first.id);
  });

  it("the hidden tab's switch appends the reveal override for that token", () => {
    const fake = mount({ uid: DM, dm: true, characterId: null });
    fireEvent.click(screen.getByTestId("pl-drawer-open"));
    fireEvent.click(screen.getByTestId("pl-dtab-hidden"));
    fireEvent.click(screen.getByTestId("pl-hide-ogre"));
    const last = fake.log.at(-1);
    if (last?.kind !== "override") throw new Error("expected an override");
    expect(last.path).toBe("reveal.token");
    expect(last.value).toBe(false);
  });

  it("the rules tab appends the table's automation setting", () => {
    const fake = mount({ uid: DM, dm: true, characterId: null });
    fireEvent.click(screen.getByTestId("pl-drawer-open"));
    fireEvent.click(screen.getByTestId("pl-dtab-rules"));
    fireEvent.click(screen.getByTestId("pl-automation-log-only"));
    const last = fake.log.at(-1);
    expect(last?.kind === "table" && last.table.op).toBe("settings");
    expect(
      last?.kind === "table" && last.table.op === "settings" && last.table.automation
    ).toBe("log-only");
  });
});

describe("the HP editor", () => {
  it("damage becomes the total the reducer's own HP path takes", () => {
    const fake = mount({ uid: DM, dm: true, characterId: null });
    fireEvent.click(screen.getByTestId("pl-drawer-open"));
    // The DM's hotbar drives the acting creature (Lyra, 38 HP); its HP pill opens the editor.
    fireEvent.click(screen.getByTestId("pl-hp-pill"));
    fireEvent.change(screen.getByTestId("pl-hp-amount"), { target: { value: "13" } });
    fireEvent.click(screen.getByTestId("pl-hp-apply"));
    const last = fake.log.at(-1);
    if (last?.kind !== "override") throw new Error("expected an override");
    expect(last.path).toBe("vitals.hp");
    expect(last.value).toBe(25);
  });

  it("temporary hit points and a condition ride their own override paths", () => {
    const fake = mount({ uid: DM, dm: true, characterId: null });
    fireEvent.click(screen.getByTestId("pl-drawer-open"));
    fireEvent.click(screen.getByTestId("pl-hp-pill"));
    fireEvent.change(screen.getByTestId("pl-hp-temp"), { target: { value: "7" } });
    fireEvent.change(screen.getByTestId("pl-hp-condition"), {
      target: { value: "prone:on" },
    });
    fireEvent.click(screen.getByTestId("pl-hp-apply"));
    const paths = fake.log
      .filter((action) => action.kind === "override")
      .map((action) => action.path);
    expect(paths).toContain("vitals.tempHp");
    expect(paths).toContain("condition");
  });
});
