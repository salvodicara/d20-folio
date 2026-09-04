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
import {
  filterLines,
  manualVitals,
  nextMonsterOrdinal,
  seatableCharacter,
} from "@/features/play/model";
import type { LogLine } from "@/lib/views/encounter-log-view";
import type { Action, Encounter, Entity, FoldedState } from "@/lib/combat/types";
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
    // A SEATED character, as `projectCharacter` emits it: the origin is what tells the DM's
    // pill that only its player may take it off the table.
    origin: { kind: "character", uid: PLAYER, characterId: "lyra", buildRevision: 1 },
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

/**
 * A `TableState` over an in-memory log, re-folded on every append.
 *
 * `seq` is the MOUNT's clock, not a fresh one per instance: a restarted clock stamps a later
 * action before the opening ops, `sortBySeq` folds it first, and the reducer rejects it as
 * `unknown-entity` — a green "the action was appended" assertion over a table that never
 * changed.
 */
function fakeTable(
  uid: string,
  dm: boolean,
  log: Action[],
  seq: () => Action["seq"]
): TableState {
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
  // Continues past the fixture's own stamps, so everything this test appends folds after it.
  const seq = seqFactory(opts.uid, 9_000);
  const props = () => ({
    table: fakeTable(opts.uid, opts.dm, log, seq),
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

describe("the keyboard the tooltips promise", () => {
  it("Space ends the turn when it is the viewer's, and never otherwise", () => {
    const fake = mount({ uid: PLAYER, dm: false, characterId: "lyra" });
    fireEvent.keyDown(window, { code: "Space" });
    expect(fake.log.at(-1)?.kind === "table" && fake.log.at(-1)?.kind).toBe("table");
    const ended = fake.log.at(-1);
    expect(ended?.kind === "table" && ended.table.op).toBe("end-turn");
  });

  it("Space on a focused button belongs to the button, not to the turn", () => {
    const fake = mount({ uid: PLAYER, dm: false, characterId: "lyra" });
    const before = fake.log.length;
    // A keyboard user tabs to a hotbar tile and presses Space: that activates the TILE. Ending
    // their turn instead would take the action away from them without asking.
    fireEvent.keyDown(screen.getByTestId(`pl-tile-${RAPIER.id}#attack`), {
      code: "Space",
    });
    expect(fake.log.length).toBe(before);
    // The pill tabs and the drawer's controls are buttons too.
    fireEvent.keyDown(screen.getByTestId("pl-tab-items"), { code: "Space" });
    expect(fake.log.length).toBe(before);
  });

  it("Space in a text field belongs to the field", () => {
    const fake = mount({ uid: DM, dm: true, characterId: null });
    fireEvent.click(screen.getByTestId("pl-drawer-open"));
    fireEvent.click(screen.getByTestId("pl-hp-pill"));
    const before = fake.log.length;
    fireEvent.keyDown(screen.getByTestId("pl-hp-amount"), { code: "Space" });
    expect(fake.log.length).toBe(before);
  });

  it("a rail hotkey selects its tool", () => {
    mount({ uid: DM, dm: true, characterId: null });
    fireEvent.keyDown(window, { key: "r" });
    expect(screen.getByTestId("pl-tool-ruler").getAttribute("aria-pressed")).toBe("true");
  });

  it("a letter still works while a button holds focus", () => {
    mount({ uid: DM, dm: true, characterId: null });
    // Chromium focuses a button on click, so ONE mouse click on the rail must not kill the
    // tool shortcuts — which is exactly when they are most wanted.
    const rail = screen.getByTestId("pl-tool-select");
    fireEvent.keyDown(rail, { key: "r" });
    expect(screen.getByTestId("pl-tool-ruler").getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(screen.getByTestId("pl-tool-ruler"), { key: "h" });
    expect(screen.getByTestId("pl-tool-pan").getAttribute("aria-pressed")).toBe("true");
    // A hotbar tile and a drawer tab focus the same way.
    fireEvent.keyDown(screen.getByTestId("pl-tab-items"), { key: "v" });
    expect(screen.getByTestId("pl-tool-select").getAttribute("aria-pressed")).toBe(
      "true"
    );
  });

  it("a letter typed into a field is still the field's", () => {
    mount({ uid: DM, dm: true, characterId: null });
    fireEvent.click(screen.getByTestId("pl-drawer-open"));
    fireEvent.click(screen.getByTestId("pl-hp-pill"));
    fireEvent.keyDown(screen.getByTestId("pl-hp-amount"), { key: "r" });
    expect(screen.getByTestId("pl-tool-ruler").getAttribute("aria-pressed")).toBe(
      "false"
    );
  });

  it("a DM-only hotkey does nothing for a player", () => {
    mount({ uid: PLAYER, dm: false, characterId: "lyra" });
    fireEvent.keyDown(window, { key: "f" });
    expect(screen.queryByTestId("pl-tool-fog-reveal")).toBeNull();
    expect(screen.getByTestId("pl-tool-select").getAttribute("aria-pressed")).toBe(
      "true"
    );
  });
});

describe("the dice medallion", () => {
  it("opens a free roll rather than flipping a setting", () => {
    mount({ uid: PLAYER, dm: false, characterId: "lyra" });
    fireEvent.click(screen.getByTestId("pl-dice"));
    expect(screen.getByTestId("pl-roll-free")).toBeTruthy();
  });

  it("submitting the free roll appends a roll action", async () => {
    const fake = mount({ uid: PLAYER, dm: false, characterId: "lyra" });
    const before = fake.log.length;
    fireEvent.click(screen.getByTestId("pl-dice"));
    fireEvent.change(screen.getByTestId("pl-free-formula"), {
      target: { value: "2d6+1" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("pl-free-roll"));
      await Promise.resolve();
    });
    const appended = fake.log.slice(before);
    expect(appended).toHaveLength(1);
    const rolled = appended[0];
    if (rolled?.kind !== "roll") throw new Error("expected a roll");
    expect(rolled.roll.formula).toBe("2d6+1");
    expect(rolled.roll.purpose).toBe("free");
    expect(rolled.roll.roller).toBe("lyra");
  });

  it("in manual mode it takes the faces the person read", async () => {
    const fake = mount({ uid: PLAYER, dm: false, characterId: "lyra" });
    fireEvent.click(screen.getByTestId("pl-dice"));
    fireEvent.click(screen.getByTestId("pl-roll-mode"));
    fireEvent.change(screen.getByTestId("pl-free-formula"), {
      target: { value: "1d20" },
    });
    fireEvent.change(screen.getByTestId("pl-free-face-0"), { target: { value: "17" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("pl-free-roll"));
      await Promise.resolve();
    });
    const rolled = fake.log.at(-1);
    if (rolled?.kind !== "roll") throw new Error("expected a roll");
    expect(rolled.roll.faces).toEqual([17]);
    expect(rolled.roll.source).toBe("manual");
  });
});

describe("a player's own panels", () => {
  it("the HP pill opens the editor as a floating panel, on their own creature", () => {
    mount({ uid: PLAYER, dm: false, characterId: "lyra" });
    fireEvent.click(screen.getByTestId("pl-hp-pill"));
    const floating = screen.getByTestId("pl-hp-float");
    expect(within(floating).getByTestId("pl-hp-editor")).toBeTruthy();
    expect(floating.textContent).toContain("Lyra");
  });

  it("the reaction medallion is dark when there is nothing to answer", () => {
    mount({ uid: PLAYER, dm: false, characterId: "lyra" });
    expect(screen.getByTestId("pl-reaction-medal").hasAttribute("disabled")).toBe(true);
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

  it("damage takes temporary hit points first, exactly as an automated hit does", () => {
    const fake = mount({ uid: DM, dm: true, characterId: null });
    fireEvent.click(screen.getByTestId("pl-drawer-open"));
    fireEvent.click(screen.getByTestId("pl-hp-pill"));
    fireEvent.change(screen.getByTestId("pl-hp-temp"), { target: { value: "5" } });
    fireEvent.click(screen.getByTestId("pl-hp-apply"));
    // Re-fold: the second correction has to see the pool the first one granted.
    fake.rerender();
    // Now 5 temp HP on 38: 13 damage eats the pool and takes 8 real hit points.
    fireEvent.click(screen.getByTestId("pl-hp-pill"));
    fireEvent.change(screen.getByTestId("pl-hp-amount"), { target: { value: "13" } });
    fireEvent.click(screen.getByTestId("pl-hp-apply"));
    const overrides = fake.log
      .filter((action) => action.kind === "override")
      .map((action) => [action.path, action.value] as const);
    expect(overrides).toContainEqual(["vitals.hp", 30]);
    expect(overrides.filter(([path]) => path === "vitals.tempHp").at(-1)?.[1]).toBe(0);
  });

  it("a log line's Modifica edits the creature THAT line wounded", async () => {
    // Manual dice, so the blow LANDS: a random miss would make this assertion vacuous, and the
    // point is which creature the correction opens on, not whether the attack hit.
    localStorage.setItem("d20-dice-mode", "manual");
    const fake = mount({ uid: DM, dm: true, characterId: null });
    fireEvent.click(screen.getByTestId(`pl-tile-${RAPIER.id}#attack`));
    fireEvent.click(screen.getByTestId("pl-cell-ogre"));
    const faces = screen
      .getByTestId("pl-roll-manual")
      .querySelectorAll<HTMLInputElement>('input[type="number"]');
    fireEvent.change(faces[0] as Element, { target: { value: "20" } });
    fireEvent.change(faces[1] as Element, { target: { value: "8" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("pl-roll-apply"));
      await Promise.resolve();
    });
    fake.rerender();

    fireEvent.click(screen.getByTestId("pl-drawer-open"));
    const drawer = screen.getByTestId("pl-drawer");
    const edit = drawer.querySelector<HTMLButtonElement>('[data-testid^="pl-edit-"]');
    expect(edit, "a landed blow offers Modifica on its own line").toBeTruthy();
    fireEvent.click(edit as HTMLButtonElement);
    // The ogre took the damage; nothing was selected on the map, and the old wiring would have
    // edited the selection or nothing at all.
    expect(screen.getByTestId("pl-hp-editor").textContent).toContain("Ogre");
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

describe("the ordinal a new creature takes", () => {
  it("is the lowest free one, so a removal frees its number", () => {
    const state = (ids: readonly string[]): FoldedState =>
      ({
        entities: Object.fromEntries(
          ids.map((id) => [
            id,
            { id, origin: { kind: "monster", srdId: "ogre" } } as unknown as Entity,
          ])
        ),
      }) as unknown as FoldedState;
    expect(nextMonsterOrdinal(state([]), "ogre")).toBe(1);
    expect(nextMonsterOrdinal(state(["ogre-1"]), "ogre")).toBe(2);
    // add, add, remove the first, add → 1 again, not the colliding 2.
    expect(nextMonsterOrdinal(state(["ogre-2"]), "ogre")).toBe(1);
    expect(nextMonsterOrdinal(state(["ogre-1", "ogre-2"]), "ogre")).toBe(3);
    // Another creature's seats never move this one's numbering.
    expect(nextMonsterOrdinal(state(["ogre-1"]), "goblin")).toBe(1);
  });
});

describe("manual damage takes the same order as an automated hit", () => {
  const wounded = (hp: number, temp: number): Entity =>
    ({
      vitals: { hp, tempHp: temp > 0 ? { amount: temp, source: null } : null },
    }) as unknown as Entity;

  it("temporary hit points absorb first, then hit points", () => {
    expect(manualVitals(wounded(38, 5), "damage", 13)).toEqual({ hp: 30, tempHp: 0 });
    expect(manualVitals(wounded(38, 20), "damage", 13)).toEqual({ hp: 38, tempHp: 7 });
    expect(manualVitals(wounded(4, 0), "damage", 13)).toEqual({ hp: 0, tempHp: 0 });
  });

  it("healing never touches the temporary pool", () => {
    expect(manualVitals(wounded(30, 5), "heal", 8)).toEqual({ hp: 38, tempHp: 5 });
  });
});

describe("the Registro's filters", () => {
  const line = (over: Partial<LogLine>): LogLine => ({
    id: "x",
    at: { ms: 0, counter: 0, by: "dm" },
    author: "dm",
    kind: "action",
    text: "",
    undoable: true,
    hidden: false,
    verdict: null,
    subject: null,
    wounded: false,
    ...over,
  });

  it("'Ferite' keeps what wounded somebody, not what settled a verdict", () => {
    const missed = line({ id: "miss", verdict: "miss" });
    const savedAgainst = line({ id: "save", wounded: true, subject: "ogre" });
    const hit = line({ id: "hit", verdict: "hit", wounded: true, subject: "ogre" });
    const moved = line({ id: "move" });
    const kept = filterLines([missed, savedAgainst, hit, moved], "wounds").map(
      (l) => l.id
    );
    // A miss settles a verdict and wounds nobody; a save-based spell wounds and settles none.
    expect(kept).toEqual(["save", "hit"]);
  });
});

describe("the token pill's ownership scope", () => {
  it("refuses to remove a seated character, and PRINTS why", () => {
    mount({ uid: DM, dm: true, characterId: null });
    fireEvent.click(screen.getByTestId("pl-cell-lyra"));
    // Lyra is a player's own character: only their "Alzati" carries the fight home. The
    // control is gone and the reason is in the document — a disabled button's tooltip never
    // opens, so hiding the sentence there would be hiding it entirely.
    expect(screen.queryByTestId("pl-pill-remove")).toBeNull();
    const reason = screen.getByTestId("pl-pill-remove-reason");
    expect(reason.textContent).toContain("Lyra");
    expect(reason.textContent).toMatch(/only its player|leave the table/i);
  });

  it("removes a monster, which has nothing to write back", () => {
    const fake = mount({ uid: DM, dm: true, characterId: null });
    fireEvent.click(screen.getByTestId("pl-cell-ogre"));
    fireEvent.click(screen.getByTestId("pl-pill-remove"));
    const last = fake.log.at(-1);
    expect(last?.kind === "table" && last.table.op).toBe("remove-entity");
  });
});

describe("a seat verb that cannot reach the server", () => {
  it("keeps the seat and says the write-back needs a connection", async () => {
    const log = fixtureLog();
    render(
      <PlayScreen
        table={fakeTable(PLAYER, false, log, seqFactory(PLAYER, 9_000))}
        catalogue={catalogue}
        viewer={{ uid: PLAYER, dm: false, characterId: "lyra", dmUid: DM }}
        title="t"
        members={{}}
        characters={{}}
        // What `PlayRoute` does offline: the server read times out and the promise rejects.
        onStand={() => Promise.reject(new Error("no server"))}
      />
    );
    const before = log.length;
    fireEvent.click(screen.getByTestId("pl-cell-lyra"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("pl-pill-leave"));
      await Promise.resolve();
    });
    // The seat is untouched — nothing was appended — and the person is told why.
    expect(log.length).toBe(before);
    expect(screen.getByTestId("pl-notice").textContent).toMatch(
      /connection|still at the table/i
    );
  });
});

describe("taking a seat", () => {
  it("refuses the document the store is still holding from another sheet", () => {
    expect(seatableCharacter({ id: "lyra" }, "lyra")).toBe(true);
    // Arrived from Thorin's sheet: the store has not swapped yet.
    expect(seatableCharacter({ id: "thorin" }, "lyra")).toBe(false);
    expect(seatableCharacter(null, "lyra")).toBe(false);
    expect(seatableCharacter({ id: "lyra" }, null)).toBe(false);
  });
});
