/**
 * `/_play` — the DEV-ONLY harness of the whole play surface (stage 6 design §2 D9).
 *
 * It mounts `PlayScreen` on a FOLDED fixture — Sara's ford ambush, with a procedurally drawn
 * background, fog, a hidden wolf and one seated bard — over a fake table store: an in-memory
 * log, folded on every append, with the same `TableState` shape the real store exposes. No
 * Firestore, no Storage upload, no sign-in, no dice beyond the app's own seam.
 *
 * It exists for the owner's screenshot gate (golden rule 25) and for the screenshot lane
 * (`tests/visual/play.spec.ts`), which drives it across theme × locale × viewport × role. It is
 * not a user surface: it is mounted behind `import.meta.env.DEV` in `router.tsx` like the
 * specimens and the crash probes, and its own chrome (the role and mode switches) is hardcoded
 * English — everything BELOW it is the product, and the product is bilingual.
 *
 * It replaces stage 5's `/_map`, whose map is now this screen's ground.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CORE_MECHANICS, CORE_MECHANIC_IDS } from "@/data/combat/core-catalogue";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { fold } from "@/lib/combat/fold";
import { createSeqClock, newActionId } from "@/lib/combat-io";
import type { MechanicId } from "@/lib/combat/ids";
import type { Mechanic } from "@/lib/combat/mechanic";
import type {
  Action,
  Encounter,
  Entity,
  MapBackground,
  Position,
} from "@/lib/combat/types";
import { PlayScreen } from "@/features/play/PlayScreen";
import type { TableState } from "@/features/play/table/table-store";

const { catalogue } = buildCatalogue(CORE_MECHANICS);

const DM = "dm";
const PLAYER = "p-lyra";

function entity(opts: {
  id: string;
  kind: Entity["kind"];
  label: string;
  controllerUid: string;
  hp: number;
  maxHp?: number;
  ac: number;
  speed?: number;
  position: Position | null;
  hidden?: boolean;
  mechanics?: readonly MechanicId[];
}): Entity {
  const zero = { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 };
  return {
    id: opts.id,
    kind: opts.kind,
    label: opts.label,
    controllerUid: opts.controllerUid,
    controlledBy: null,
    origin: { kind: "table" },
    stats: {
      ac: opts.ac,
      maxHp: opts.maxHp ?? opts.hp,
      speed: opts.speed ?? 30,
      proficiency: 2,
      abilities: zero,
      saves: zero,
      spellSaveDc: null,
      spellAttack: null,
      attacksPerAction: 1,
      resistances: [],
      immunities: [],
      vulnerabilities: [],
      conditionImmunities: [],
    },
    vitals: {
      hp: opts.hp,
      tempHp: null,
      deathSaves: { successes: 0, failures: 0 },
      life: "alive",
      exhaustion: 0,
    },
    resources: {},
    concentration: null,
    turn: {
      action: 0,
      bonus: 0,
      reaction: 0,
      attacksUsed: 0,
      movementUsed: 0,
      movementExtra: 0,
      claims: [],
    },
    overrides: {},
    reveal: { block: false, hp: false, token: !opts.hidden },
    position: opts.position,
    mechanics: [...CORE_MECHANIC_IDS, ...(opts.mechanics ?? [])],
  };
}

/** A stone floor with a river, drawn once into a canvas — no copyrighted map, no upload. */
function drawGround(width: number, height: number, cellPx: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#2d2a24";
  ctx.fillRect(0, 0, width, height);
  // Flagstones: a deterministic checker of warm greys.
  for (let y = 0; y < height; y += cellPx) {
    for (let x = 0; x < width; x += cellPx) {
      const n = ((x / cellPx) * 7 + (y / cellPx) * 13) % 5;
      ctx.fillStyle =
        ["#3a3630", "#403b34", "#37332d", "#443e36", "#3d3832"][n] ?? "#3a3630";
      ctx.fillRect(x + 1, y + 1, cellPx - 2, cellPx - 2);
    }
  }
  // The ford: a river band across the lower third.
  ctx.fillStyle = "#1f3a4a";
  ctx.beginPath();
  ctx.moveTo(0, height * 0.62);
  ctx.bezierCurveTo(
    width * 0.3,
    height * 0.55,
    width * 0.6,
    height * 0.75,
    width,
    height * 0.66
  );
  ctx.lineTo(width, height * 0.82);
  ctx.bezierCurveTo(
    width * 0.6,
    height * 0.9,
    width * 0.3,
    height * 0.7,
    0,
    height * 0.78
  );
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2a4c5f";
  ctx.beginPath();
  ctx.moveTo(0, height * 0.68);
  ctx.bezierCurveTo(
    width * 0.3,
    height * 0.6,
    width * 0.6,
    height * 0.8,
    width,
    height * 0.72
  );
  ctx.lineTo(width, height * 0.75);
  ctx.bezierCurveTo(
    width * 0.6,
    height * 0.83,
    width * 0.3,
    height * 0.63,
    0,
    height * 0.71
  );
  ctx.closePath();
  ctx.fill();
  // Reeds along the far bank.
  ctx.fillStyle = "#3f5a2a";
  for (let x = cellPx * 0.5; x < width; x += cellPx * 1.5) {
    ctx.fillRect(x, height * 0.58, 6, cellPx * 0.4);
  }
  return canvas.toDataURL("image/jpeg", 0.8);
}

/**
 * What Lyra and the ogre CARRY into the log (design §2 D2). These are shaped exactly as
 * `projectCharacter` / `projectMonster` emit them — a fixed bonus, one damage part, a `slot`
 * cost for a levelled spell — so the hotbar, the target flow and the roll panel are exercised
 * against the real authoring format rather than against a convenience of the harness.
 */
const LYRA_MECHANICS: readonly Mechanic[] = [
  {
    schema: 1,
    id: "pc:lyra:weapon-rapier",
    source: "srd",
    label: "srd:equipment:rapier:name",
    active: [
      {
        id: "attack",
        trigger: { kind: "invocation", economy: "action" },
        cost: [{ kind: "turn", claim: "attack" }],
        targets: {
          count: 1,
          eligibility: {
            relation: "visible",
            between: ["$self", "$target"],
            value: true,
          },
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
  },
  {
    schema: 1,
    id: "pc:lyra:spell-fire-bolt",
    source: "srd",
    label: "srd:spell:fire-bolt:name",
    active: [
      {
        id: "cast",
        trigger: { kind: "invocation", economy: "action" },
        cost: [{ kind: "turn", claim: "action" }],
        targets: {
          count: 1,
          eligibility: {
            relation: "visible",
            between: ["$self", "$target"],
            value: true,
          },
        },
        inputs: [
          { id: "roll", kind: "d20", for: "attack" },
          { id: "damage", kind: "dice", formula: "2d10" },
        ],
        steps: [
          {
            id: "hit",
            kind: "attack",
            roll: "roll",
            bonus: 7,
            damage: [{ dice: "damage", type: "fire" }],
          },
        ],
      },
    ],
  },
  {
    schema: 1,
    id: "pc:lyra:spell-healing-word",
    source: "srd",
    label: "srd:spell:healing-word:name",
    active: [
      {
        id: "cast",
        trigger: { kind: "invocation", economy: "bonus" },
        cost: [
          { kind: "turn", claim: "bonus" },
          { kind: "slot", level: 1, upcast: true },
        ],
        targets: {
          count: 1,
          eligibility: {
            relation: "visible",
            between: ["$self", "$target"],
            value: true,
          },
        },
        inputs: [{ id: "heal", kind: "dice", formula: "2d4+3" }],
        steps: [{ id: "mend", kind: "heal", amount: 5, to: "$target" }],
      },
    ],
  },
];

const OGRE_MECHANICS: readonly Mechanic[] = [
  {
    schema: 1,
    id: "monster:ogre:club",
    source: "monster",
    label: "ogre.actions.club",
    active: [
      {
        id: "club",
        trigger: { kind: "invocation", economy: "action" },
        cost: [{ kind: "turn", claim: "attack" }],
        targets: {
          count: 1,
          eligibility: {
            relation: "adjacent",
            between: ["$self", "$target"],
            value: true,
          },
        },
        inputs: [
          { id: "roll", kind: "d20", for: "attack" },
          { id: "damage", kind: "dice", formula: "2d8+4" },
        ],
        steps: [
          {
            id: "hit",
            kind: "attack",
            roll: "roll",
            bonus: 6,
            damage: [{ dice: "damage", type: "bludgeoning" }],
          },
        ],
      },
    ],
  },
];

const CELL_PX = 80;
const COLUMNS = 24;
const ROWS = 15;

function openingLog(background: MapBackground, seq: () => Action["seq"]): Action[] {
  const table = (op: Extract<Action, { kind: "table" }>["table"]): Action => ({
    kind: "table",
    id: newActionId(),
    seq: seq(),
    by: DM,
    table: op,
  });
  const lyra = entity({
    id: "lyra",
    kind: "pc",
    label: "Lyra",
    controllerUid: PLAYER,
    hp: 38,
    maxHp: 62,
    ac: 16,
    position: { x: 6, y: 6 },
    mechanics: LYRA_MECHANICS.map((m) => m.id),
  });
  const thorin = entity({
    id: "thorin",
    kind: "pc",
    label: "Thorin",
    controllerUid: "p-thorin",
    hp: 44,
    ac: 18,
    speed: 25,
    position: { x: 4, y: 8 },
  });
  const mira = entity({
    id: "mira",
    kind: "pc",
    label: "Mira",
    controllerUid: "p-mira",
    hp: 31,
    maxHp: 35,
    ac: 14,
    position: { x: 5, y: 10 },
  });
  const ogre = entity({
    id: "ogre",
    kind: "monster",
    label: "Ogre",
    controllerUid: DM,
    hp: 42,
    maxHp: 59,
    ac: 11,
    speed: 40,
    position: { x: 9, y: 4 },
    mechanics: OGRE_MECHANICS.map((m) => m.id),
  });
  const archer1 = entity({
    id: "goblin-1",
    kind: "monster",
    label: "Goblin arciere",
    controllerUid: DM,
    hp: 7,
    ac: 15,
    position: { x: 11, y: 5 },
  });
  const archer2 = entity({
    id: "goblin-2",
    kind: "monster",
    label: "Goblin arciere",
    controllerUid: DM,
    hp: 7,
    ac: 15,
    position: { x: 13, y: 6 },
  });
  const shaman = entity({
    id: "shaman",
    kind: "monster",
    label: "Sciamano goblin",
    controllerUid: DM,
    hp: 9,
    ac: 13,
    position: { x: 12, y: 8 },
  });
  const wolf = entity({
    id: "wolf",
    kind: "monster",
    label: "Lupo",
    controllerUid: DM,
    hp: 11,
    ac: 12,
    speed: 40,
    position: { x: 17, y: 9 },
    hidden: true,
  });
  const all = [lyra, thorin, mira, ogre, archer1, archer2, shaman, wolf];
  return [
    table({ op: "start", epoch: 1 }),
    ...all.map((e) =>
      table({
        op: "add-entity",
        entity: e,
        mechanics:
          e.id === "lyra" ? LYRA_MECHANICS : e.id === "ogre" ? OGRE_MECHANICS : [],
      })
    ),
    table({ op: "set-initiative", entity: "lyra", value: 15 }),
    table({ op: "set-initiative", entity: "ogre", value: 12 }),
    table({ op: "set-initiative", entity: "thorin", value: 11 }),
    table({ op: "set-initiative", entity: "goblin-1", value: 9 }),
    table({ op: "set-initiative", entity: "goblin-2", value: 9 }),
    table({ op: "set-initiative", entity: "shaman", value: 8 }),
    table({ op: "set-initiative", entity: "mira", value: 6 }),
    table({ op: "set-initiative", entity: "wolf", value: 4 }),
    table({
      op: "begin-turns",
      order: ["lyra", "ogre", "thorin", "goblin-1", "goblin-2", "shaman", "mira", "wolf"],
    }),
    table({ op: "map", background }),
    table({ op: "fog", change: { kind: "cover", covered: true } }),
    table({ op: "fog", change: { kind: "reveal", rect: { x: 2, y: 2, w: 14, h: 11 } } }),
    table({ op: "fog", change: { kind: "hide", rect: { x: 12, y: 2, w: 4, h: 3 } } }),
  ];
}

/** An action without its envelope — distributive over the union, so each kind keeps its own
 *  fields (a plain `Omit<Action, …>` collapses the union to the common keys). */
type ActionDraft = Action extends infer A
  ? A extends Action
    ? Omit<A, "id" | "seq" | "by">
    : never
  : never;

/** The names the fixture's ids stand for; the harness is its own tiny "campaign". */
const MEMBERS: Record<string, string> = {
  dm: "Sara",
  "p-lyra": "Marco",
  "p-thorin": "Giulia",
  "p-mira": "Elena",
};

const CHARACTERS: Record<string, string> = {};

type Role = "dm" | "player" | "spectator";

const SEATS: Record<Role, { uid: string; dm: boolean; characterId: string | null }> = {
  dm: { uid: DM, dm: true, characterId: null },
  player: { uid: PLAYER, dm: false, characterId: "lyra" },
  spectator: { uid: "watcher", dm: false, characterId: null },
};

/**
 * A `TableState` over an in-memory log: the same interface `createTableStore` exposes, with
 * `appendAction` replaced by a `setState`. The point is that `PlayScreen` cannot tell the
 * difference — if the harness needed a different screen, the harness would be proving nothing.
 */
function useFakeTable(role: Role): TableState {
  const [seq] = useState(() => createSeqClock(DM));
  const [log, setLog] = useState<Action[]>(() => {
    const url = drawGround(COLUMNS * CELL_PX, ROWS * CELL_PX, CELL_PX);
    const background: MapBackground = {
      path: "campaigns/dev/maps/ford.jpeg",
      url,
      width: COLUMNS * CELL_PX,
      height: ROWS * CELL_PX,
      cellPx: CELL_PX,
      origin: { x: 0, y: 0 },
      bytes: url.length,
    };
    return openingLog(background, seq);
  });
  const seat = SEATS[role];

  const encounter: Encounter = useMemo(
    () => ({
      schema: 1,
      id: "live",
      host: { kind: "campaign", campaignId: "dev" },
      log,
      checkpoint: null,
    }),
    [log]
  );

  const folded = useMemo(() => fold(encounter, catalogue), [encounter]);

  return useMemo<TableState>(
    () => ({
      snapshot: { kind: "encounter", encounter, pending: false },
      fold: folded,
      role: { uid: seat.uid, dm: seat.dm },
      dispatch: (draft: ActionDraft) => {
        const id = newActionId();
        const action = { ...draft, id, seq: seq(), by: seat.uid } as Action;
        setLog((current) => [...current, action]);
        return Promise.resolve(id);
      },
      undo: (of, reason) => {
        setLog((current) => [
          ...current,
          { kind: "undo", of, reason, id: newActionId(), seq: seq(), by: seat.uid },
        ]);
        return Promise.resolve();
      },
      connect: () => () => undefined,
    }),
    [encounter, folded, seat.uid, seat.dm, seq]
  );
}

export function PlayDevPage(): ReactNode {
  const { i18n } = useTranslation();
  const [role, setRole] = useState<Role>("dm");
  const table = useFakeTable(role);
  const seat = SEATS[role];

  return (
    <>
      <PlayScreen
        table={table}
        catalogue={catalogue}
        viewer={{ ...seat, dmUid: DM }}
        title="Imboscata al guado"
        members={MEMBERS}
        characters={CHARACTERS}
        identityOf={(entity) =>
          entity.kind === "monster" ? { type: "Umanoide", cr: "1/4" } : null
        }
      />
      {/* The harness's own chrome, deliberately outside the product's i18n. */}
      <div className="pl-dev" data-testid="play-dev-chrome">
        <label>
          role
          <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="dm">DM</option>
            <option value="player">Player (Lyra)</option>
            <option value="spectator">Spectator</option>
          </select>
        </label>
        <label>
          lang
          <select
            value={i18n.language.startsWith("it") ? "it" : "en"}
            onChange={(event) => void i18n.changeLanguage(event.target.value)}
          >
            <option value="it">IT</option>
            <option value="en">EN</option>
          </select>
        </label>
      </div>
    </>
  );
}
