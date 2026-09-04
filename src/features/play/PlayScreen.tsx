/**
 * `PlayScreen` — the whole play surface, composed (stage 6 design §2 D9).
 *
 * The map is the ground and every panel floats on it at a fixed edge (UI spec rule 28); the DM
 * drawer is the only docked one and shifts the rest (rule 32). Nothing here holds game state:
 * everything shown is `table.fold.state`, and everything done is an `Action` appended through
 * `table.dispatch`. What this component DOES own is the ephemeral half of playing — which tool
 * is active, which creature is selected, which tile is being aimed, which faces the person is
 * still typing — none of which belongs in a shared document.
 *
 * The tile → target → roll → intent flow (design §2 D7) lives here because it is the one thing
 * that crosses every component: a tile arms it, the map or the target block answers the targets,
 * the roll panel answers the dice in `manual` mode, and `dispatch.ts`'s three pure functions do
 * the rest. A rejection the reducer's own preflight already knows is NOT dispatched — no dice
 * are spent to learn it — and shows as the tile's reason; a rejection the FOLD produces (a race
 * with another client) arrives as a log line marked refused, never as a modal.
 *
 * The component takes its world as props — the table store, the viewer's seat, the names, the
 * portraits, the DM's bestiary — so the DEV harness can mount it on a folded fixture with no
 * Firestore at all, and the live route can mount the same screen over the real document.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { buildLogLines, type LogLine } from "@/lib/views/encounter-log-view";
import { mapView } from "@/lib/combat/map";
import { areaShapeFrom } from "@/lib/combat/answers";
import { areaMembership } from "@/lib/combat/position";
import { sortBySeq } from "@/lib/combat/ids";
import type { ActionId, EntityId, WindowId } from "@/lib/combat/ids";
import type { Catalogue } from "@/lib/combat/catalogue";
import type { ConditionId, Entity, Position, Rejection } from "@/lib/combat/types";
import { useLocale } from "@/hooks/useLocale";
import { feetToMetres } from "./map/geometry";

import { MapCanvas, type MapViewportApi } from "./map/MapCanvas";
import { AddCreature, type CreatureOption } from "./AddCreature";
import { DmDrawer } from "./DmDrawer";
import { Hotbar } from "./Hotbar";
import { InitiativeStrip, type StripCell } from "./InitiativeStrip";
import { PlayIcon, PlaySprite } from "./PlayIcon";
import { PlayTip } from "./PlayTip";
import { ProseLog } from "./ProseLog";
import { ReactionCard, type ReactionOffer } from "./ReactionCard";
import { RollPanel, type RollView } from "./RollPanel";
import { SceneHeader } from "./SceneHeader";
import { TargetBlock, type TargetView } from "./TargetBlock";
import { TokenPill } from "./TokenPill";
import { ToolRail } from "./ToolRail";
import { ViewControls } from "./ViewControls";
import { conditionName, createPlayLabels } from "./labels";
import {
  CONDITION_ICON,
  DICE_MODE_KEY,
  initiativeOrder,
  readyForTurns,
  type DiceMode,
  type DrawerTab,
  type HotbarTab,
  type LogFilter,
} from "./model";
import { groupTiles, hotbarTiles, reactionTiles, type HotbarTile } from "./tiles";
import { mapToolFor, type PlayTool } from "./tools";
import {
  freeRoll,
  intentBody,
  planIntent,
  rollsFor,
  type IntentArgs,
  type PendingInput,
} from "./table/dispatch";
import { HpEditor, type HpEdit } from "./HpEditor";
import type { TableState } from "./table/table-store";
import "./play.css";
import "./map/map.css";

function storedDiceMode(): DiceMode {
  try {
    return localStorage.getItem(DICE_MODE_KEY) === "manual" ? "manual" : "app";
  } catch {
    // A browser with storage denied still plays; it simply plays in the default mode.
    return "app";
  }
}

export interface PlaySeatInfo {
  readonly uid: string;
  readonly dm: boolean;
  /** The character this member may seat (`memberDetails[uid].characterId`), if any. */
  readonly characterId: string | null;
  readonly dmUid: string;
}

export interface PlayScreenProps {
  readonly table: TableState;
  readonly catalogue: Catalogue;
  readonly viewer: PlaySeatInfo;
  readonly title: string;
  /** uid → display name, from the campaign's member details. */
  readonly members: Readonly<Record<string, string>>;
  /** characterId → the hero's name. */
  readonly characters: Readonly<Record<string, string>>;
  readonly portraits?: Readonly<Record<EntityId, string | null>>;
  readonly levels?: Readonly<Record<EntityId, number | null>>;
  /** A monster's printed type and CR, when the client has the bestiary loaded. */
  readonly identityOf?: (
    entity: Entity
  ) => { readonly type: string | null; readonly cr: string | null } | null;
  readonly creatures?: readonly CreatureOption[];
  readonly creaturesLoading?: boolean;
  readonly onAddCreature?: (option: CreatureOption, at: Position | null) => void;
  /** The player's seat verbs; absent when this viewer cannot take a seat. */
  readonly onSit?: () => void;
  readonly onStand?: (entity: EntityId) => void;
  /** The DM opening the table when the document does not exist yet. */
  readonly onOpenTable?: () => void;
}

/** What the surface is waiting for the person to answer before an intent can be appended. */
type Aiming =
  | { readonly kind: "none" }
  | {
      readonly kind: "targets";
      readonly tile: HotbarTile;
      readonly need: number;
      readonly picked: readonly EntityId[];
    }
  | {
      readonly kind: "area";
      readonly tile: HotbarTile;
      readonly origin: Position | null;
    }
  | {
      readonly kind: "faces";
      readonly tile: HotbarTile;
      readonly args: IntentArgs;
      readonly inputs: readonly PendingInput[];
    }
  /** The dice medallion's own roll: no mechanic, no target, just dice and the log. */
  | { readonly kind: "free" };

const ALLY_KINDS = new Set(["pc", "companion", "summon"]);

/** The rail's hotkeys, exactly as the tooltips print them (`ToolRail`'s `RAIL`). */
const TOOL_KEYS: Readonly<Record<string, PlayTool>> = {
  v: "select",
  h: "pan",
  r: "ruler",
  a: "add",
  f: "fog-reveal",
};

export function PlayScreen(props: PlayScreenProps) {
  const { t } = useTranslation();
  const { language } = useLocale();
  const {
    table,
    catalogue,
    viewer,
    title,
    members,
    characters,
    portraits = {},
    levels = {},
    identityOf,
    creatures = [],
    creaturesLoading = false,
    onAddCreature,
    onSit,
    onStand,
    onOpenTable,
  } = props;

  const state = table.fold?.state ?? null;

  // ── Ephemeral surface state ──────────────────────────────────────────────
  const [tool, setTool] = useState<PlayTool>("select");
  const [playerView, setPlayerView] = useState(false);
  const [selected, setSelected] = useState<EntityId | null>(null);
  const [tab, setTab] = useState<HotbarTab>("common");
  const [aiming, setAiming] = useState<Aiming>({ kind: "none" });
  const [drawer, setDrawer] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("log");
  const [logFilter, setLogFilter] = useState<LogFilter>("all");
  /** The creature the HP editor is open on — the ONLY thing that decides what it edits. A log
   *  line opens it on the creature the line wounded; the HP pill opens it on the viewer's own. */
  const [hpFor, setHpFor] = useState<EntityId | null>(null);
  /** The reaction window the viewer has waved away; the card is shown for any other. */
  const [dismissedWindow, setDismissedWindow] = useState<WindowId | null>(null);
  const [fogOpacity, setFogOpacity] = useState(0.6);
  const [hiddenRolls, setHiddenRolls] = useState(true);
  const [diceMode, setDiceMode] = useState<DiceMode>(storedDiceMode);
  const [notice, setNotice] = useState<string | null>(null);
  const viewportRef = useRef<MapViewportApi | null>(null);
  /** What the key handler needs to know NOW. It is bound once and must not re-bind on every
   *  turn, so the three facts that change under it are read through refs. */
  const canEndTurnRef = useRef(false);
  const dmRef = useRef(viewer.dm);
  const dispatchRef = useRef<TableState["dispatch"] | null>(null);
  const onViewport = useCallback((api: MapViewportApi) => {
    viewportRef.current = api;
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DICE_MODE_KEY, diceMode);
    } catch {
      // Nothing to do: the mode simply does not survive the session.
    }
  }, [diceMode]);

  // ── Names and labels ─────────────────────────────────────────────────────
  const labels = useMemo(
    () =>
      createPlayLabels({
        t,
        locale: language,
        mechanics: state?.mechanics ?? {},
        characters,
      }),
    [t, language, state?.mechanics, characters]
  );
  const nameOf = useCallback(
    (id: EntityId): string => {
      const entity = state?.entities[id];
      return entity ? labels(entity.label) : id;
    },
    [state, labels]
  );
  const authorOf = useCallback(
    (author: LogLine["author"]): string => {
      if (author === "dm") return t("play.role.dm");
      if (author === "you") return t("play.role.you");
      if (author === "auto") return t("play.role.auto");
      return members[author.uid] ?? t("play.role.someone");
    },
    [t, members]
  );

  // ── Who the viewer is driving ────────────────────────────────────────────
  const seatedId: EntityId | null = viewer.dm
    ? (selected ?? state?.clock.current ?? null)
    : (viewer.characterId ?? null);
  const seated = seatedId === null ? null : (state?.entities[seatedId] ?? null);
  const mine = useCallback(
    (entity: Entity): boolean => entity.controllerUid === viewer.uid,
    [viewer.uid]
  );
  const drives = seated !== null && (viewer.dm || mine(seated));

  // ── The map's projection, which is also the strip's ──────────────────────
  const actor = useMemo(
    () => ({ uid: viewer.uid, dm: viewer.dm }),
    [viewer.uid, viewer.dm]
  );
  const view = useMemo(
    () => (state ? mapView(state, playerView ? { uid: "", dm: false } : actor) : null),
    [state, actor, playerView]
  );

  const lines = useMemo<readonly LogLine[]>(() => {
    if (!table.snapshot || table.snapshot.kind !== "encounter") return [];
    return buildLogLines({
      encounter: table.snapshot.encounter,
      catalogue,
      viewer: actor,
      dmUid: viewer.dmUid,
      t,
      labels,
    });
  }, [table.snapshot, catalogue, actor, viewer.dmUid, t, labels]);

  // ── Dispatch helpers ─────────────────────────────────────────────────────
  // Bound once: `table.dispatch` is a store method, and handing the naked reference around
  // would carry the method away from its object.
  const dispatch = useCallback<TableState["dispatch"]>(
    (body) => table.dispatch(body),
    [table]
  );

  const fail = useCallback(
    (rejection: Rejection) => {
      setNotice(t(`play.log.reason.${rejection.reason}`));
    },
    [t]
  );

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  /**
   * The last leg of every tile: roll what the plan owes, then append the intent that spends
   * those rolls. In `app` mode the dice seam draws them here; in `manual` mode the faces come
   * from the roll panel and this is called again with them.
   */
  const commit = useCallback(
    async (args: IntentArgs, faces?: Readonly<Record<string, readonly number[]>>) => {
      if (!state) return;
      const planned = planIntent(state, catalogue, args);
      if ("reason" in planned) {
        fail(planned);
        return;
      }
      const built = rollsFor(planned.inputs, faces ? "manual" : "app", {
        by: viewer.uid,
        entity: args.entity,
        hidden: viewer.dm && hiddenRolls,
        ...(faces ? { faces } : {}),
      });
      if ("code" in built) {
        setNotice(t(`play.roll.error.${built.code}`));
        return;
      }
      const ids: Record<string, ActionId> = {};
      for (const [index, pending] of built.entries()) {
        const key = planned.inputs[index]?.key;
        if (key === undefined) continue;
        ids[key] = await dispatch({ kind: "roll", roll: pending.roll });
      }
      await dispatch(intentBody(state, catalogue, args, ids));
      setAiming({ kind: "none" });
    },
    [state, catalogue, dispatch, fail, viewer.uid, viewer.dm, hiddenRolls, t]
  );

  /**
   * The point where the aiming is done: either roll now, or ask for the faces first. Manual
   * mode is the only reason this is a separate step — the plan is identical either way.
   */
  const aimed = useCallback(
    async (args: IntentArgs, tile: HotbarTile) => {
      if (!state) return;
      const planned = planIntent(state, catalogue, args);
      if ("reason" in planned) {
        fail(planned);
        return;
      }
      if (diceMode === "manual" && planned.inputs.length > 0) {
        setAiming({ kind: "faces", tile, args, inputs: planned.inputs });
        return;
      }
      await commit(args);
    },
    [state, catalogue, diceMode, commit, fail]
  );

  // The three facts the key handler reads, refreshed every render: it is bound once, so it
  // cannot close over them.
  useEffect(() => {
    dmRef.current = viewer.dm;
    dispatchRef.current = dispatch;
    canEndTurnRef.current =
      state !== null &&
      state.clock.phase === "turns" &&
      seated !== null &&
      state.clock.current === seated.id;
  });

  /**
   * The shortcuts the tooltips advertise (rule 39: no hotkey text inside a button, so the
   * tooltip is where they are promised — and a promise on a screen is a contract).
   *
   * Bound on `window` rather than on the root element because the play surface has no single
   * focused owner: a person who has just clicked the map, a tile or nothing at all still
   * expects Space to end their turn. A key that arrives while a field has focus belongs to the
   * field, so those are let through untouched.
   */
  useEffect(() => {
    const typing = (target: EventTarget | null): boolean =>
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (typing(event.target)) return;
      const tool = TOOL_KEYS[event.key.toLowerCase()];
      if (tool !== undefined) {
        if (tool === "add" || tool === "fog-reveal" ? dmRef.current : true) {
          event.preventDefault();
          setTool(tool);
        }
        return;
      }
      if (event.code === "Space" && canEndTurnRef.current) {
        event.preventDefault();
        void dispatchRef.current?.({ kind: "table", table: { op: "end-turn" } });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * The dice medallion's roll: one `roll` action and nothing else. It is a log entry like any
   * other — same seam, same provenance — so the table sees it and the DM can undo it.
   */
  const throwFree = useCallback(
    async (formula: string, faces: readonly number[] | null) => {
      const built = freeRoll(formula, faces === null ? "app" : "manual", {
        by: viewer.uid,
        entity: seatedId,
        hidden: viewer.dm && hiddenRolls,
        ...(faces === null ? {} : { faces }),
      });
      if ("code" in built) {
        setNotice(t(`play.roll.error.${built.code}`));
        return;
      }
      await dispatch({ kind: "roll", roll: built.roll });
      setAiming({ kind: "none" });
    },
    [dispatch, viewer.uid, viewer.dm, seatedId, hiddenRolls, t]
  );

  /** Arm a tile, or fire it straight away when it needs nothing aimed. */
  const startTile = useCallback(
    (tile: HotbarTile) => {
      if (!state || !seated) return;
      if (!tile.usable && tile.rejection) {
        fail(tile.rejection);
        return;
      }
      const count = tile.targets?.count;
      const args: IntentArgs = {
        entity: seated.id,
        mechanic: tile.mechanic,
        program: tile.program,
        targets: [],
        answersSoFar: {},
      };
      if (count === "area") {
        setAiming({ kind: "area", tile, origin: null });
        setTool("select");
        return;
      }
      if (typeof count === "number" && count > 0) {
        setAiming({ kind: "targets", tile, need: count, picked: [] });
        setTool("select");
        return;
      }
      void aimed(args, tile);
    },
    [state, seated, fail, aimed]
  );

  /** A creature was tapped: it either answers the aiming, or becomes the selection. */
  const pickEntity = useCallback(
    (id: EntityId | null) => {
      if (id !== null && aiming.kind === "targets" && seated) {
        const picked = [...aiming.picked, id];
        if (picked.length < aiming.need) {
          setAiming({ ...aiming, picked });
          return;
        }
        void aimed(
          {
            entity: seated.id,
            mechanic: aiming.tile.mechanic,
            program: aiming.tile.program,
            targets: picked,
            answersSoFar: {},
          },
          aiming.tile
        );
        return;
      }
      setSelected(id);
      if (id !== null) setHpFor(null);
    },
    [aiming, seated, aimed]
  );

  // ── The DM's table verbs ─────────────────────────────────────────────────
  const beginTurns = useCallback(() => {
    if (!state) return;
    void dispatch({
      kind: "table",
      table: { op: "begin-turns", order: initiativeOrder(state) },
    });
  }, [state, dispatch]);

  const applyHp = useCallback(
    (entity: EntityId, edits: readonly HpEdit[]) => {
      for (const edit of edits) {
        void dispatch({
          kind: "override",
          entity,
          path: edit.path,
          value: edit.value,
          reason: edit.reason,
        });
      }
      setHpFor(null);
    },
    [dispatch]
  );

  // ── Standby: no table, or one nobody has opened ──────────────────────────
  if (!table.snapshot || !state || !view) {
    return (
      <Standby
        kind={
          table.snapshot === null
            ? "loading"
            : table.snapshot.kind === "missing"
              ? "missing"
              : table.snapshot.kind === "quarantined"
                ? "quarantined"
                : "error"
        }
        dm={viewer.dm}
        onOpenTable={onOpenTable}
      />
    );
  }

  // ── Derived view models ──────────────────────────────────────────────────
  const order = state.clock.order.length > 0 ? state.clock.order : initiativeOrder(state);
  const visible = new Set(view.tokens.map((token) => token.id));
  const currentIndex = order.indexOf(state.clock.current ?? "");
  const cells: StripCell[] = order
    .filter((id) => visible.has(id) || state.entities[id]?.controllerUid === viewer.uid)
    .map((id, index) => {
      const entity = state.entities[id];
      const token = view.tokens.find((one) => one.id === id) ?? null;
      const maxHp = Math.max(1, entity?.stats.maxHp ?? 1);
      return {
        id,
        name: nameOf(id),
        portrait: portraits[id] ?? null,
        hpRatio: Math.max(0, Math.min(1, (entity?.vitals.hp ?? 0) / maxHp)),
        foe: !ALLY_KINDS.has(entity?.kind ?? "monster"),
        current: state.clock.current === id,
        done: currentIndex >= 0 && index < currentIndex,
        hidden: token?.hidden ?? false,
        conditions: Object.values(state.effects).filter(
          (effect) => effect.target === id && effect.payload.kind === "condition"
        ).length,
        initiative: state.clock.initiative[id] ?? null,
      };
    });

  const selectedEntity = selected === null ? null : (state.entities[selected] ?? null);
  const selectedToken =
    selected === null ? null : (view.tokens.find((one) => one.id === selected) ?? null);
  const identity = selectedEntity ? (identityOf?.(selectedEntity) ?? null) : null;
  const target: TargetView | null = selectedEntity
    ? {
        name: nameOf(selectedEntity.id),
        type: identity?.type ?? null,
        cr: identity?.cr ?? null,
        ac: selectedEntity.stats.ac,
        hp: selectedToken?.hp ?? (viewer.dm ? selectedEntity.vitals.hp : null),
        maxHp: Math.max(1, selectedEntity.stats.maxHp),
        hpRatio: Math.max(
          0,
          Math.min(1, selectedEntity.vitals.hp / Math.max(1, selectedEntity.stats.maxHp))
        ),
        conditions: Object.values(state.effects)
          .filter(
            (effect) =>
              effect.target === selectedEntity.id && effect.payload.kind === "condition"
          )
          .map((effect) => {
            const condition =
              effect.payload.kind === "condition" ? effect.payload.condition : "prone";
            return {
              id: effect.id,
              icon: CONDITION_ICON[condition],
              label: conditionName(condition, language),
            };
          })
          .concat(
            selectedEntity.concentration === null
              ? []
              : [
                  {
                    id: "concentration",
                    icon: "i-concentration",
                    label: t("play.target.concentrating"),
                  },
                ]
          ),
      }
    : null;

  const tiles = seated ? hotbarTiles(state, catalogue, seated) : [];
  const groups = groupTiles(tiles);

  // The newest roll, and the verdict of whatever spent it (rule 31).
  const rollLine = [...lines].reverse().find((line) => line.kind === "roll") ?? null;
  const rollAction = rollLine
    ? (sortBySeq(
        table.snapshot.kind === "encounter" ? table.snapshot.encounter.log : []
      ).find((action) => action.id === rollLine.id) ?? null)
    : null;
  const spentBy = rollLine ? state.spent[rollLine.id] : undefined;
  const verdictLine = spentBy
    ? (lines.find((line) => line.id === spentBy) ?? null)
    : null;
  // The panel is titled by WHAT was rolled for, not by the die: the intent that spent the roll
  // names the mechanic, and that is the sentence a person is looking for.
  const spentAction = spentBy
    ? (sortBySeq(
        table.snapshot.kind === "encounter" ? table.snapshot.encounter.log : []
      ).find((action) => action.id === spentBy) ?? null)
    : null;
  const rollTitle =
    spentAction && spentAction.kind === "intent" ? labels(spentAction.mechanic) : null;
  const roll: RollView | null =
    rollAction && rollAction.kind === "roll"
      ? {
          id: rollAction.id,
          title: rollTitle ?? t(`play.log.purpose.${rollAction.roll.purpose}`),
          who: rollAction.roll.roller ? nameOf(rollAction.roll.roller) : authorOf("dm"),
          formula: `${t(`play.log.purpose.${rollAction.roll.purpose}`)} · ${rollAction.roll.formula}`,
          faces: rollAction.roll.hidden && !viewer.dm ? null : [...rollAction.roll.faces],
          total: rollAction.roll.hidden && !viewer.dm ? null : rollAction.roll.total,
          dc: null,
          verdict: verdictLine?.verdict ?? null,
          hidden: rollAction.roll.hidden,
          undoable: rollLine?.undoable ?? false,
        }
      : null;

  // The reaction window this viewer may answer (component 10).
  const reactionWindow = state.windows[0] ?? null;
  const eligible = reactionWindow
    ? (reactionWindow.eligible.find(
        (id) => viewer.dm || state.entities[id]?.controllerUid === viewer.uid
      ) ?? null)
    : null;
  const eligibleEntity = eligible ? (state.entities[eligible] ?? null) : null;
  const reactionTile = eligibleEntity
    ? (reactionTiles(state, catalogue, eligibleEntity)[0] ?? null)
    : null;
  const offer: ReactionOffer | null =
    reactionWindow && eligible && eligibleEntity
      ? {
          window: reactionWindow.id,
          actor: nameOf(eligible),
          trigger: t(`play.window.${reactionWindow.event.kind}`, {
            name:
              "entity" in reactionWindow.event
                ? nameOf(reactionWindow.event.entity)
                : t("play.role.someone"),
          }),
          mechanic: reactionTile
            ? { key: reactionTile.key, label: labels(reactionTile.label) }
            : null,
          waitingOn: members[eligibleEntity.controllerUid] ?? t("play.role.dm"),
          mine: viewer.dm || mine(eligibleEntity),
        }
      : null;

  /** Waved away for THIS window only: the next one opens the card again by itself. */
  const reactionShown = offer !== null && offer.window !== dismissedWindow;

  const editEntity = hpFor === null ? null : (state.entities[hpFor] ?? null);
  const editConditions: ConditionId[] = editEntity
    ? Object.values(state.effects)
        .filter(
          (effect) =>
            effect.target === editEntity.id && effect.payload.kind === "condition"
        )
        .map((effect) =>
          effect.payload.kind === "condition" ? effect.payload.condition : "prone"
        )
    : [];

  const acting = seated !== null && state.clock.current === seated.id;
  const inTurns = state.clock.phase === "turns";

  /**
   * The tinted circle and its caption while an area spell is being aimed (rule 33). The shape
   * is bound by the reducer's OWN binder (`areaShapeFrom`) and its members counted by the
   * reducer's own membership test, so the preview cannot promise a different set of creatures
   * from the one the fold will hit.
   */
  const areaPreview = (() => {
    if (aiming.kind !== "area" || aiming.origin === null) return null;
    const spec = aiming.tile.targets?.area;
    if (!spec) return null;
    const resolved = areaShapeFrom(spec, { [spec.origin]: aiming.origin });
    if (resolved.kind !== "shape") return null;
    const inside = areaMembership(resolved.shape, Object.values(state.entities));
    const enemies = inside.filter(
      (id) => !ALLY_KINDS.has(state.entities[id]?.kind ?? "monster")
    ).length;
    const radiusFt =
      "radiusFt" in resolved.shape
        ? resolved.shape.radiusFt
        : "sizeFt" in resolved.shape
          ? resolved.shape.sizeFt
          : resolved.shape.lengthFt;
    return {
      origin: aiming.origin,
      radiusFt,
      caption: t("play.aim.areaCaption", {
        name: labels(aiming.tile.label),
        metres: feetToMetres(radiusFt).toLocaleString(language, {
          maximumFractionDigits: 1,
        }),
        count: enemies,
      }).toLocaleUpperCase(language),
    };
  })();

  return (
    <TooltipProvider>
      <div
        className="pl-root"
        data-testid="play-screen"
        data-role={viewer.dm ? "dm" : drives ? "player" : "spectator"}
      >
        <PlaySprite />
        <div className="pl-stage">
          <div className="pl-ground">
            <MapCanvas
              state={state}
              actor={actor}
              playerView={playerView}
              tool={mapToolFor(tool)}
              labelOf={(token) => labels(token.label)}
              portraitOf={(token) => portraits[token.id] ?? null}
              selected={selected}
              onSelect={pickEntity}
              onViewport={onViewport}
              onCell={
                aiming.kind === "area"
                  ? (at) => setAiming({ ...aiming, origin: at })
                  : null
              }
              area={areaPreview}
              onMove={(entity, to) =>
                void dispatch({
                  kind: "intent",
                  entity,
                  mechanic: "core:move",
                  program: "move",
                  targets: [],
                  answers: { to },
                  payment: [],
                  window: null,
                  basedOn: state.revision,
                })
              }
              onPlace={(entity, to) =>
                void dispatch({
                  kind: "override",
                  entity,
                  path: "position",
                  value: to,
                  reason: "placed",
                })
              }
              onRefused={(_, reason) => setNotice(t(`play.map.refused.${reason}`))}
              onFog={(change) =>
                void dispatch({ kind: "table", table: { op: "fog", change } })
              }
            />
          </div>
          <div className="pl-vignette" />

          <div className="pl-float pl-topband">
            <SceneHeader
              title={title}
              round={state.clock.round}
              current={state.clock.current === null ? null : nameOf(state.clock.current)}
              currentIsDm={
                state.clock.current !== null &&
                state.entities[state.clock.current]?.controllerUid === viewer.dmUid
              }
            />

            <InitiativeStrip
              cells={cells}
              round={state.clock.round}
              selected={selected}
              onSelect={pickEntity}
            />

            <ViewControls
              onZoom={(factor) => viewportRef.current?.zoomBy(factor)}
              onFit={() => viewportRef.current?.fit()}
              playerView={viewer.dm ? playerView : null}
              onPlayerView={setPlayerView}
            />
          </div>

          <TargetBlock target={target} />

          <ToolRail
            tool={tool}
            onTool={(next) =>
              setTool(next === "fog-reveal" && tool === "fog-reveal" ? "fog-hide" : next)
            }
            dm={viewer.dm && !playerView}
            onCoverAll={() =>
              void dispatch({
                kind: "table",
                table: { op: "fog", change: { kind: "cover", covered: true } },
              })
            }
            onFogOff={() =>
              void dispatch({
                kind: "table",
                table: { op: "fog", change: { kind: "cover", covered: false } },
              })
            }
          />

          {tool === "add" && viewer.dm ? (
            <AddCreature
              options={creatures}
              loading={creaturesLoading}
              onPick={(option) => {
                onAddCreature?.(option, null);
                setTool("select");
              }}
              onClose={() => setTool("select")}
            />
          ) : null}

          {/* Aiming: the caption the rendition prints under a tinted area (rule 33). */}
          {aiming.kind === "targets" || aiming.kind === "area" ? (
            <div className="pl-float pl-aim pl-panel" data-testid="pl-aiming">
              <PlayIcon id="i-target" />
              <span>
                {aiming.kind === "area"
                  ? t("play.aim.area", { name: labels(aiming.tile.label) })
                  : t("play.aim.targets", {
                      name: labels(aiming.tile.label),
                      left: aiming.need - aiming.picked.length,
                    })}
              </span>
              {aiming.kind === "area" && aiming.origin !== null && seated ? (
                <button
                  type="button"
                  className="pl-ghost"
                  data-testid="pl-aim-confirm"
                  onClick={() => {
                    const spec = aiming.tile.targets?.area;
                    const origin = aiming.origin;
                    if (!spec || origin === null) return;
                    void aimed(
                      {
                        entity: seated.id,
                        mechanic: aiming.tile.mechanic,
                        program: aiming.tile.program,
                        targets: [],
                        answersSoFar: { [spec.origin]: origin },
                      },
                      aiming.tile
                    );
                  }}
                >
                  {t("combat.cast")}
                </button>
              ) : null}
              <button
                type="button"
                className="pl-ghost"
                onClick={() => setAiming({ kind: "none" })}
                data-testid="pl-aim-cancel"
              >
                {t("common.cancel")}
              </button>
            </div>
          ) : null}

          <RollPanel
            // Keyed by what it is asking about: a new prompt is a new panel, so the faces the
            // person typed for the last one are never carried into the next.
            key={
              aiming.kind === "faces"
                ? aiming.tile.key
                : aiming.kind === "free"
                  ? "free"
                  : (roll?.id ?? "none")
            }
            roll={aiming.kind === "faces" || aiming.kind === "free" ? null : roll}
            prompt={
              aiming.kind === "faces"
                ? {
                    kind: "inputs",
                    title: labels(aiming.tile.label),
                    inputs: aiming.inputs,
                  }
                : aiming.kind === "free"
                  ? { kind: "free", title: t("play.dice.title") }
                  : null
            }
            onManual={(faces) => {
              if (aiming.kind === "faces") void commit(aiming.args, faces);
            }}
            onFree={(formula, faces) => void throwFree(formula, faces)}
            mode={diceMode}
            onMode={setDiceMode}
            onCancel={() => setAiming({ kind: "none" })}
            onUndo={(action) => void table.undo(action, null)}
          />

          <ReactionCard
            offer={reactionShown ? offer : null}
            onReact={(taken) => {
              if (!eligibleEntity || !reactionTile) return;
              void commit({
                entity: eligibleEntity.id,
                mechanic: reactionTile.mechanic,
                program: reactionTile.program,
                targets: [],
                answersSoFar: {},
                window: taken.window,
              });
            }}
            onPass={(passed) => void dispatch({ kind: "resolve", window: passed.window })}
          />

          {/* The HP editor floats for anyone without the drawer to hold it (a player, or the
              DM with the drawer closed): the SAME component, so the two places can never drift
              into two editors. */}
          {editEntity && !(viewer.dm && drawer) ? (
            <section
              className="pl-float pl-hpfloat pl-panel pl-panel--framed"
              data-testid="pl-hp-float"
            >
              <span className="pl-brackets" />
              <HpEditor
                key={editEntity.id}
                entity={editEntity}
                name={nameOf(editEntity.id)}
                conditions={editConditions}
                conditionName={(id) => conditionName(id, language)}
                onApply={(edits) => applyHp(editEntity.id, edits)}
                onClose={() => setHpFor(null)}
              />
            </section>
          ) : null}

          {!drawer ? <ProseLog lines={lines} authorOf={authorOf} /> : null}

          {notice ? (
            <p
              className="pl-float pl-notice pl-panel"
              role="status"
              data-testid="pl-notice"
            >
              {notice}
            </p>
          ) : null}

          {selectedEntity && (viewer.dm || mine(selectedEntity)) ? (
            <div className="pl-float pl-pill-slot">
              <TokenPill
                key={selectedEntity.id}
                entity={selectedEntity.id}
                name={nameOf(selectedEntity.id)}
                initiative={state.clock.initiative[selectedEntity.id] ?? null}
                hidden={!selectedEntity.reveal.token}
                dm={viewer.dm}
                mine={mine(selectedEntity) && !viewer.dm}
                seatedCharacter={selectedEntity.origin.kind === "character"}
                onInitiative={(entity, value) =>
                  void dispatch({
                    kind: "table",
                    table: { op: "set-initiative", entity, value },
                  })
                }
                onHidden={(entity, hidden) =>
                  void dispatch({
                    kind: "override",
                    entity,
                    path: "reveal.token",
                    value: !hidden,
                    reason: "dm",
                  })
                }
                onRemove={(entity) => {
                  void dispatch({
                    kind: "table",
                    table: { op: "remove-entity", entity },
                  });
                  setSelected(null);
                }}
                onLeave={(entity) => onStand?.(entity)}
              />
            </div>
          ) : null}

          {/* The DM's table verbs, only where they have somewhere to go. */}
          {viewer.dm && !inTurns ? (
            <div className="pl-float pl-tablebar pl-panel" data-testid="pl-table-bar">
              <button
                type="button"
                className="pl-ghost"
                disabled={!readyForTurns(state)}
                onClick={beginTurns}
                data-testid="pl-begin-turns"
              >
                {t("campaignHub.encounterBeginTurns")}
              </button>
              <span className="pl-note">
                {readyForTurns(state)
                  ? t("play.table.readyHint")
                  : t("play.table.notReadyHint")}
              </span>
            </div>
          ) : null}

          {seated && drives ? (
            <Hotbar
              entity={seated}
              name={nameOf(seated.id)}
              portrait={portraits[seated.id] ?? null}
              level={levels[seated.id] ?? null}
              dmControlled={viewer.dm && !mine(seated)}
              acting={acting}
              tab={tab}
              onTab={setTab}
              groups={groups}
              labelOf={labels}
              reasonOf={(tile) =>
                tile.rejection ? t(`play.log.reason.${tile.rejection.reason}`) : null
              }
              selectedTile={
                aiming.kind === "targets" || aiming.kind === "area"
                  ? aiming.tile.key
                  : null
              }
              onTile={startTile}
              onEndTurn={() =>
                void dispatch({ kind: "table", table: { op: "end-turn" } })
              }
              canEndTurn={inTurns && acting}
              onDice={() => setAiming({ kind: "free" })}
              onReaction={() => {
                if (!offer) return;
                setDismissedWindow(reactionShown ? offer.window : null);
              }}
              // What the VIEWER may answer, not what the table holds: a medallion enabled for a
              // window this person cannot act on would be a lit button that does nothing.
              openWindows={offer ? 1 : 0}
              onHp={() => {
                setHpFor(seated.id);
                // The DM's editor lives in the drawer's Registro, beside the line that caused
                // the correction; everyone else gets it as a floating panel.
                if (viewer.dm) {
                  setDrawer(true);
                  setDrawerTab("log");
                }
              }}
            />
          ) : !viewer.dm && viewer.characterId && onSit ? (
            <div className="pl-float pl-tablebar pl-panel" data-testid="pl-sit-bar">
              <button
                type="button"
                className="pl-ghost"
                onClick={onSit}
                data-testid="pl-sit"
              >
                {t("play.table.sit")}
              </button>
              <span className="pl-note">{t("play.table.sitHint")}</span>
            </div>
          ) : null}

          {viewer.dm && !drawer ? (
            <PlayTip
              label={t("play.drawer.title")}
              hint={t("play.drawer.openTip")}
              side="left"
            >
              <button
                type="button"
                className="pl-float pl-dmtab pl-panel"
                onClick={() => setDrawer(true)}
                data-testid="pl-drawer-open"
                aria-label={t("play.drawer.title")}
              >
                <span className="pl-cap">{t("play.role.dm")}</span>
                <PlayIcon id="i-list" />
              </button>
            </PlayTip>
          ) : null}
        </div>

        {viewer.dm && drawer ? (
          <DmDrawer
            tab={drawerTab}
            onTab={setDrawerTab}
            onClose={() => setDrawer(false)}
            lines={lines}
            filter={logFilter}
            onFilter={setLogFilter}
            authorOf={authorOf}
            onUndo={(action) => void table.undo(action, null)}
            editing={editEntity ? { entity: editEntity } : null}
            onEdit={(line) => setHpFor(line.subject)}
            onEditClose={() => setHpFor(null)}
            editName={editEntity ? nameOf(editEntity.id) : ""}
            editConditions={editConditions}
            conditionName={(id) => conditionName(id, language)}
            onHpApply={(edits) => {
              if (editEntity) applyHp(editEntity.id, edits);
            }}
            tokens={Object.values(state.entities).map((entity) => ({
              id: entity.id,
              name: nameOf(entity.id),
              hidden: !entity.reveal.token,
            }))}
            onTokenHidden={(entity, hidden) =>
              void dispatch({
                kind: "override",
                entity,
                path: "reveal.token",
                value: !hidden,
                reason: "dm",
              })
            }
            revealMonsterHp={state.settings.revealMonsterHp}
            onRevealMonsterHp={(on) =>
              void dispatch({
                kind: "table",
                table: {
                  op: "settings",
                  revealMonsterHp: on,
                  automation: state.settings.automation,
                },
              })
            }
            hiddenRolls={hiddenRolls}
            onHiddenRolls={setHiddenRolls}
            fogCovered={state.map.fog.covered}
            onCoverAll={() =>
              void dispatch({
                kind: "table",
                table: { op: "fog", change: { kind: "cover", covered: true } },
              })
            }
            onFogOff={() =>
              void dispatch({
                kind: "table",
                table: { op: "fog", change: { kind: "cover", covered: false } },
              })
            }
            fogOpacity={fogOpacity}
            onFogOpacity={setFogOpacity}
            automation={state.settings.automation}
            onAutomation={(value) =>
              void dispatch({
                kind: "table",
                table: {
                  op: "settings",
                  revealMonsterHp: state.settings.revealMonsterHp,
                  automation: value,
                },
              })
            }
            diceMode={diceMode}
            onDiceMode={setDiceMode}
            round={state.clock.round}
            lineCount={lines.length}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}

/** No table, or one this client cannot read: one honest panel, and the DM's way forward. */
function Standby({
  kind,
  dm,
  onOpenTable,
}: {
  kind: "loading" | "missing" | "quarantined" | "error";
  dm: boolean;
  onOpenTable?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="pl-root" data-testid="play-screen-standby">
      <div className="pl-stage">
        <div className="pl-vignette" />
        <section className="pl-float pl-standby pl-panel pl-panel--framed">
          <span className="pl-brackets" />
          <h1>{t(`play.standby.${kind}.title`)}</h1>
          <p>{t(`play.standby.${kind}.body`)}</p>
          {kind === "missing" && dm && onOpenTable ? (
            <button
              type="button"
              className="pl-ghost"
              onClick={onOpenTable}
              data-testid="pl-open-table"
            >
              {t("play.standby.open")}
            </button>
          ) : null}
        </section>
      </div>
    </div>
  );
}
