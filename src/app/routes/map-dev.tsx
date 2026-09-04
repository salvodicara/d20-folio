/**
 * `/_map` — the DEV-ONLY harness of the minimum map (stage 5, design addendum §8).
 *
 * Mounts `MapCanvas` on a folded encounter (the map replay's opening, a procedurally drawn
 * background, fog, a hidden wolf) and appends the component's semantic events to an in-memory
 * log, so drags, fog rectangles and hide/show are live and reproducible without Firestore, a
 * Storage upload or a sign-in. It exists so the owner's screenshot gate (golden rule 25) can see
 * the map before stage 6 mounts it under the HUD; it is not a user surface. Mounted behind
 * `import.meta.env.DEV` in router.tsx like the specimens and the crash probe; like them it
 * hardcodes its chrome strings (the map's own strings are in the `map` i18n shard).
 */
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { fold } from "@/lib/combat/fold";
import { createSeqClock, newActionId } from "@/lib/combat-io";
import type { EntityId } from "@/lib/combat/ids";
import type {
  Action,
  Encounter,
  Entity,
  FogChange,
  FoldedState,
  MapBackground,
  Position,
} from "@/lib/combat/types";
import { MapCanvas, type MapTool } from "@/features/play/map/MapCanvas";
import "@/features/play/map/map.css";

const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);

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
      claims: [],
    },
    overrides: {},
    reveal: { block: false, hp: false, token: !opts.hidden },
    position: opts.position,
    mechanics: ["core:move"],
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
    ...all.map((e) => table({ op: "add-entity", entity: e })),
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

const LABELS: Record<string, string> = {};

export function MapDevPage(): ReactNode {
  const { t, i18n } = useTranslation();
  const [role, setRole] = useState<"dm" | "player">("dm");
  const [tool, setTool] = useState<MapTool>("select");
  const [playerView, setPlayerView] = useState(false);
  const [seq] = useState(() => createSeqClock(DM));
  // The fixture is built once, lazily: the ground is drawn into a canvas at first render (this
  // route only ever mounts in a browser), and the opening log is folded from it.
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

  const state: FoldedState = useMemo(() => {
    const encounter: Encounter = {
      schema: 1,
      id: "dev",
      host: { kind: "campaign", campaignId: "dev" },
      log,
      checkpoint: null,
    };
    return fold(encounter, catalogue).state;
  }, [log]);

  const actor = role === "dm" ? { uid: DM, dm: true } : { uid: PLAYER, dm: false };

  function append(draft: ActionDraft) {
    setLog((current) => [
      ...current,
      { ...draft, id: newActionId(), seq: seq(), by: actor.uid },
    ]);
  }

  const onMove = (entity: EntityId, to: Position) =>
    append({
      kind: "intent",
      entity,
      mechanic: "core:move",
      program: "move",
      targets: [],
      answers: { to },
      payment: [],
      window: null,
      basedOn: state.revision,
    });
  const onPlace = (entity: EntityId, to: Position) =>
    append({ kind: "override", entity, path: "position", value: to, reason: "placed" });
  const onFog = (change: FogChange) =>
    append({ kind: "table", table: { op: "fog", change } });
  const onHidden = (entity: EntityId, hidden: boolean) =>
    append({
      kind: "override",
      entity,
      path: "reveal.token",
      value: !hidden,
      reason: "dm",
    });

  const tools: { id: MapTool; label: string; dm?: boolean }[] = [
    { id: "select", label: t("map.tool.select") },
    { id: "pan", label: t("map.tool.pan") },
    { id: "fog-reveal", label: t("map.tool.fogReveal"), dm: true },
    { id: "fog-hide", label: t("map.tool.fogHide"), dm: true },
  ];

  return (
    <main className="map-dev" data-testid="map-dev">
      <div className="map-dev__strip" role="toolbar" aria-label="Map tools (dev harness)">
        {tools
          .filter((item) => !item.dm || (role === "dm" && !playerView))
          .map((item) => (
            <button
              key={item.id}
              type="button"
              className={tool === item.id ? "is-active" : undefined}
              aria-pressed={tool === item.id}
              onClick={() => setTool(item.id)}
              title={t(
                `map.tool.${item.id === "fog-reveal" ? "fogRevealTip" : item.id === "fog-hide" ? "fogHideTip" : `${item.id}Tip`}`
              )}
            >
              {item.label}
            </button>
          ))}
        {role === "dm" && !playerView ? (
          <>
            <button
              type="button"
              onClick={() => onFog({ kind: "cover", covered: true })}
              title={t("map.fog.coverAllTip")}
            >
              {t("map.fog.coverAll")}
            </button>
            <button
              type="button"
              onClick={() => onFog({ kind: "cover", covered: false })}
              title={t("map.fog.offTip")}
            >
              {t("map.fog.off")}
            </button>
          </>
        ) : null}
        {role === "dm" ? (
          <button
            type="button"
            aria-pressed={playerView}
            className={playerView ? "is-active" : undefined}
            onClick={() => setPlayerView((v) => !v)}
            title={t("map.view.playerTip")}
          >
            {t("map.view.player")}
          </button>
        ) : null}
        <span className="map-dev__spacer" />
        <span className="map-scale-badge" title={t("map.scale.tip")}>
          {t("map.scale.badge")}
        </span>
        <label>
          role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "dm" | "player")}
          >
            <option value="dm">DM</option>
            <option value="player">Lyra (player)</option>
          </select>
        </label>
        <label>
          lang
          <select
            value={i18n.language.startsWith("it") ? "it" : "en"}
            onChange={(e) => void i18n.changeLanguage(e.target.value)}
          >
            <option value="it">IT</option>
            <option value="en">EN</option>
          </select>
        </label>
      </div>
      <MapCanvas
        className="map-dev__canvas"
        state={state}
        actor={actor}
        playerView={playerView}
        tool={tool}
        labelOf={(token) => LABELS[token.id] ?? token.label}
        onMove={onMove}
        onPlace={onPlace}
        onFog={onFog}
        onHidden={onHidden}
      />
    </main>
  );
}
