/**
 * MapCanvas — the ground layer of the play screen (dossier 14, UI spec rules 33–34; design
 * addendum §8): the background image, the square grid, rectangle fog, tokens bound to entity
 * ids, drag with a Foundry-style ruler, and the DM's hidden tokens and player view.
 *
 * SVG, no dependency: a table of a dozen tokens needs masks and hit-testing, not a WebGL
 * renderer. Everything persisted comes in as a `FoldedState`; everything the component decides
 * goes out as a semantic event (`onMove`, `onPlace`, `onFog`, `onHidden`) the host turns into a
 * log action — the component never builds an `Action`, never knows Firestore, never rolls.
 *
 * What is ephemeral stays here: the viewport, the token being dragged and its ruler, the fog
 * rectangle being drawn. The reducer's own projections decide the rest: `mapView` says who sees
 * what, `planDrop` says what a drop becomes, `rulerFor` colours the ruler by the mover's budget.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  mapView,
  planDrop,
  remainingMovement,
  type MapActor,
  type MapToken,
} from "@/lib/combat/map";
import { mustEntity } from "@/lib/combat/state";
import type { EntityId } from "@/lib/combat/ids";
import type { FogChange, FoldedState, MapRect, Position } from "@/lib/combat/types";
import { cn } from "@/lib/utils";
import {
  cellCenterPx,
  cellToPx,
  cellsRect,
  feetToMetres,
  fitViewport,
  groundOf,
  pxToCell,
  rulerFor,
  screenToImage,
  zoomAt,
  type Ground,
  type Px,
  type Ruler,
  type Viewport,
} from "./geometry";

export type MapTool = "select" | "pan" | "fog-reveal" | "fog-hide";

export interface MapCanvasProps {
  readonly state: FoldedState;
  readonly actor: MapActor;
  /** The DM's "player view" eye: render what a spectator sees. */
  readonly playerView?: boolean;
  readonly tool: MapTool;
  /** Resolves an entity's label id to text (the engine is locale-free). */
  readonly labelOf: (token: MapToken) => string;
  readonly onMove: (entity: EntityId, to: Position) => void;
  readonly onPlace: (entity: EntityId, to: Position) => void;
  readonly onRefused?: (
    entity: EntityId,
    reason: "control" | "turn" | "movement"
  ) => void;
  readonly onFog: (change: FogChange) => void;
  readonly onHidden: (entity: EntityId, hidden: boolean) => void;
  readonly className?: string;
}

interface Drag {
  readonly entity: EntityId;
  readonly from: Position | null;
  readonly to: Position;
  readonly ruler: Ruler | null;
  readonly pointerId: number;
}

interface FogDraw {
  readonly from: Position;
  readonly to: Position;
  readonly pointerId: number;
}

interface Pan {
  readonly start: Px;
  readonly offset: Px;
  readonly pointerId: number;
}

const TOKEN_RING = 2.5;
const ALLY_KINDS = new Set(["pc", "companion", "summon"]);

function ringColour(token: MapToken): string {
  if (token.current) return "var(--map-ring-turn)";
  return ALLY_KINDS.has(token.kind) ? "var(--map-ring-ally)" : "var(--map-ring-enemy)";
}

function initials(label: string): string {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export function MapCanvas({
  state,
  actor,
  playerView = false,
  tool,
  labelOf,
  onMove,
  onPlace,
  onRefused,
  onFog,
  onHidden,
  className,
}: MapCanvasProps) {
  const { t } = useTranslation();
  const view = useMemo(
    () => mapView(state, playerView ? { uid: "", dm: false } : actor),
    [state, playerView, actor]
  );
  const ground = useMemo(() => groundOf(view.background), [view.background]);
  const dmSees = actor.dm && !playerView;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [fogDraw, setFogDraw] = useState<FogDraw | null>(null);
  const [pan, setPan] = useState<Pan | null>(null);
  const [selected, setSelected] = useState<EntityId | null>(null);

  // Measure the host and fit the ground once; the viewport is local state after that.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
      setViewport((current) => current ?? fitViewport(ground, width, height));
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [ground]);

  const vp =
    viewport ??
    fitViewport(ground, size.width || ground.width, size.height || ground.height);

  const toImage = useCallback(
    (event: { clientX: number; clientY: number }): Px => {
      const rect = svgRef.current?.getBoundingClientRect();
      const screen = {
        x: event.clientX - (rect?.left ?? 0),
        y: event.clientY - (rect?.top ?? 0),
      };
      return screenToImage(vp, screen);
    },
    [vp]
  );

  const cellAt = useCallback(
    (event: { clientX: number; clientY: number }): Position =>
      pxToCell(ground, toImage(event)),
    [ground, toImage]
  );

  // ── Pointer handling ─────────────────────────────────────────────────────

  function onGroundPointerDown(event: ReactPointerEvent<SVGElement>) {
    if (event.button === 1 || tool === "pan" || (event.button === 0 && event.shiftKey)) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setPan({
        start: { x: event.clientX, y: event.clientY },
        offset: vp.offset,
        pointerId: event.pointerId,
      });
      return;
    }
    if (event.button !== 0) return;
    if ((tool === "fog-reveal" || tool === "fog-hide") && dmSees) {
      event.currentTarget.setPointerCapture(event.pointerId);
      const cell = cellAt(event);
      setFogDraw({ from: cell, to: cell, pointerId: event.pointerId });
      return;
    }
    setSelected(null);
  }

  function onTokenPointerDown(token: MapToken, event: ReactPointerEvent<SVGGElement>) {
    if (event.button !== 0 || tool !== "select") return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelected(token.id);
    const entity = mustEntity(state, token.id);
    setDrag({
      entity: token.id,
      from: entity.position,
      to: token.position,
      ruler: null,
      pointerId: event.pointerId,
    });
  }

  function onPointerMove(event: ReactPointerEvent<SVGElement>) {
    if (pan && event.pointerId === pan.pointerId) {
      setViewport({
        scale: vp.scale,
        offset: {
          x: pan.offset.x + (event.clientX - pan.start.x),
          y: pan.offset.y + (event.clientY - pan.start.y),
        },
      });
      return;
    }
    if (fogDraw && event.pointerId === fogDraw.pointerId) {
      setFogDraw({ ...fogDraw, to: cellAt(event) });
      return;
    }
    if (drag && event.pointerId === drag.pointerId) {
      const to = cellAt(event);
      const entity = mustEntity(state, drag.entity);
      const plan = planDrop(state, { entity: drag.entity, to, actor });
      const budget =
        plan.kind === "move" || (plan.kind === "refused" && plan.reason === "movement")
          ? { remainingFt: remainingMovement(entity), speedFt: entity.stats.speed }
          : null;
      const ruler = drag.from === null ? null : rulerFor(drag.from, to, budget);
      setDrag({ ...drag, to, ruler });
    }
  }

  function onPointerUp(event: ReactPointerEvent<SVGElement>) {
    if (pan && event.pointerId === pan.pointerId) {
      setPan(null);
      return;
    }
    if (fogDraw && event.pointerId === fogDraw.pointerId) {
      const rect: MapRect = cellsRect(fogDraw.from, fogDraw.to);
      setFogDraw(null);
      onFog({ kind: tool === "fog-hide" ? "hide" : "reveal", rect });
      return;
    }
    if (drag && event.pointerId === drag.pointerId) {
      const { entity, to, from } = drag;
      setDrag(null);
      if (from !== null && from.x === to.x && from.y === to.y) return; // a click, not a move
      const plan = planDrop(state, { entity, to, actor });
      if (plan.kind === "move") onMove(entity, plan.to);
      else if (plan.kind === "place") onPlace(entity, plan.to);
      else if (plan.reason !== "unknown") onRefused?.(entity, plan.reason);
    }
  }

  function onWheel(event: ReactWheelEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setViewport(zoomAt(vp, anchor, event.deltaY < 0 ? 1.1 : 1 / 1.1));
  }

  function onDoubleClick() {
    setViewport(fitViewport(ground, size.width, size.height));
  }

  // ── Derived drawing data ─────────────────────────────────────────────────

  const fog = view.fog;
  const fogOpacity = dmSees ? 0.6 : 1;
  const fogPreview = fogDraw ? cellsRect(fogDraw.from, fogDraw.to) : null;
  const acting = state.clock.current;
  const actingToken = view.tokens.find((token) => token.id === acting) ?? null;

  const tokenRadius = ground.cellPx * 0.42;
  const fontSize = Math.max(10, ground.cellPx * 0.22);

  // One token. The token being dragged is drawn AFTER the fog (below), so a player's own
  // token never disappears under the opaque overlay while they drag it across covered cells.
  const renderToken = (token: MapToken) => {
    const centre = cellCenterPx(ground, token.position);
    const at =
      drag !== null && drag.entity === token.id ? cellCenterPx(ground, drag.to) : centre;
    const label = labelOf(token);
    const isSelected = selected === token.id;
    return (
      <g
        key={token.id}
        className={cn(
          "map-token",
          token.hidden && "is-hidden",
          token.current && "is-current"
        )}
        data-testid={`map-token-${token.id}`}
        data-hidden={token.hidden ? "true" : undefined}
        transform={`translate(${at.x} ${at.y})`}
        onPointerDown={(event) => onTokenPointerDown(token, event)}
        role="button"
        tabIndex={0}
        aria-label={
          token.hidden
            ? t("map.aria.tokenHidden", { name: label })
            : t("map.aria.token", { name: label })
        }
        style={{ cursor: tool === "select" ? "grab" : "default" }}
      >
        <circle r={tokenRadius} fill="var(--map-token-fill)" />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize * 1.4}
          fill="var(--map-token-ink)"
          fontFamily="var(--font-title)"
        >
          {initials(label)}
        </text>
        <circle
          r={tokenRadius}
          fill="none"
          stroke={ringColour(token)}
          strokeWidth={isSelected ? TOKEN_RING * 1.6 : TOKEN_RING}
          strokeDasharray={token.hidden ? "5 4" : undefined}
          style={
            token.current
              ? { filter: "drop-shadow(0 0 6px var(--map-ring-turn))" }
              : undefined
          }
        />
        {/* HP bar beneath (rule 33): everyone sees the bar; the number only where revealed. */}
        <rect
          x={-tokenRadius}
          y={tokenRadius + 4}
          width={tokenRadius * 2}
          height={4}
          rx={2}
          fill="var(--map-hp-track)"
        />
        <rect
          x={-tokenRadius}
          y={tokenRadius + 4}
          width={tokenRadius * 2 * token.hpRatio}
          height={4}
          rx={2}
          fill={ALLY_KINDS.has(token.kind) ? "var(--map-hp-ally)" : "var(--map-hp-enemy)"}
          data-testid={`map-hp-${token.id}`}
        />
        <text
          y={tokenRadius + 12 + fontSize}
          textAnchor="middle"
          fontSize={fontSize}
          fill="var(--map-label-ink)"
          fontFamily="var(--font-body)"
          fontWeight={600}
          paintOrder="stroke"
          stroke="var(--map-label-halo)"
          strokeWidth={3}
        >
          {label}
          {token.hp !== null && token.maxHp !== null ? (
            <tspan fill="var(--map-label-muted)" fontWeight={400}>
              {` ${token.hp} / ${token.maxHp}`}
            </tspan>
          ) : null}
          {token.hidden ? (
            <tspan fill="var(--map-label-muted)" fontWeight={400}>
              {` (${t("map.token.hidden")})`}
            </tspan>
          ) : null}
        </text>
      </g>
    );
  };

  return (
    <svg
      ref={svgRef}
      className={cn("map-canvas", className)}
      role="application"
      aria-label={t("map.aria.canvas")}
      data-tool={tool}
      onPointerDown={onGroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
    >
      <defs>
        <pattern
          id="map-grid"
          patternUnits="userSpaceOnUse"
          width={ground.cellPx}
          height={ground.cellPx}
          x={ground.origin.x}
          y={ground.origin.y}
        >
          <path
            d={`M ${ground.cellPx} 0 L 0 0 0 ${ground.cellPx}`}
            fill="none"
            stroke="var(--map-grid)"
            strokeWidth={1}
          />
        </pattern>
        <mask id="map-fog-mask">
          <rect x={-1e5} y={-1e5} width={2e5} height={2e5} fill="white" />
          {fog.revealed.map((rect, index) => {
            const corner = cellToPx(ground, rect);
            return (
              <rect
                key={index}
                x={corner.x}
                y={corner.y}
                width={rect.w * ground.cellPx}
                height={rect.h * ground.cellPx}
                fill="black"
              />
            );
          })}
        </mask>
        <clipPath id="map-token-clip">
          <circle r={tokenRadius} />
        </clipPath>
      </defs>

      <g transform={`translate(${vp.offset.x} ${vp.offset.y}) scale(${vp.scale})`}>
        {/* Ground: the image, or a recessed field when no background is uploaded yet. */}
        {ground.url ? (
          <image
            href={ground.url}
            x={0}
            y={0}
            width={ground.width}
            height={ground.height}
          />
        ) : (
          <rect
            x={0}
            y={0}
            width={ground.width}
            height={ground.height}
            fill="var(--map-ground)"
            data-testid="map-ground-empty"
          />
        )}
        <rect
          x={0}
          y={0}
          width={ground.width}
          height={ground.height}
          fill="url(#map-grid)"
          data-testid="map-grid"
        />

        {/* The acting creature's reach ring (rule 33). */}
        {actingToken ? (
          <circle
            className="map-reach"
            cx={cellCenterPx(ground, actingToken.position).x}
            cy={cellCenterPx(ground, actingToken.position).y}
            r={ground.cellPx * 1.5}
            fill="none"
            stroke="var(--map-ring-turn)"
            strokeDasharray="6 6"
            opacity={0.6}
          />
        ) : null}

        {/* Tokens — bound to entity ids; one cell each in this stage. */}
        {view.tokens.filter((token) => drag?.entity !== token.id).map(renderToken)}

        {/* Fog: white in the mask shows the overlay, revealed rectangles are cut out. */}
        {fog.covered ? (
          <rect
            className="map-fog"
            data-testid="map-fog"
            x={-1e5}
            y={-1e5}
            width={2e5}
            height={2e5}
            fill="var(--map-fog)"
            opacity={fogOpacity}
            mask="url(#map-fog-mask)"
            pointerEvents="none"
          />
        ) : null}

        {/* The dragged token rides above the fog. */}
        {drag
          ? view.tokens.filter((token) => token.id === drag.entity).map(renderToken)
          : null}

        {/* The drag ruler: origin → hovered cell, a distance pill, tone by budget. */}
        {drag && drag.from !== null && drag.ruler ? (
          <RulerOverlay
            ground={ground}
            from={drag.from}
            to={drag.to}
            ruler={drag.ruler}
          />
        ) : null}

        {/* The fog rectangle being drawn. */}
        {fogPreview ? (
          <rect
            data-testid="map-fog-preview"
            x={cellToPx(ground, fogPreview).x}
            y={cellToPx(ground, fogPreview).y}
            width={fogPreview.w * ground.cellPx}
            height={fogPreview.h * ground.cellPx}
            fill={tool === "fog-hide" ? "var(--map-fog)" : "var(--map-reveal-preview)"}
            fillOpacity={0.35}
            stroke="var(--accent-primary-bright)"
            strokeDasharray="8 6"
            strokeWidth={2}
            pointerEvents="none"
          />
        ) : null}
      </g>

      {/* The selected token's minimal pill (DM only): hide / show. Stage 6 grows it into the
          token pill of rule 34. */}
      {selected && dmSees ? (
        <SelectedTokenControls
          token={view.tokens.find((token) => token.id === selected) ?? null}
          onHidden={onHidden}
        />
      ) : null}
    </svg>
  );
}

function RulerOverlay({
  ground,
  from,
  to,
  ruler,
}: {
  ground: Ground;
  from: Position;
  to: Position;
  ruler: Ruler;
}) {
  const { t, i18n } = useTranslation();
  const a = cellCenterPx(ground, from);
  const b = cellCenterPx(ground, to);
  const tone =
    ruler.tone === "ok"
      ? "var(--map-ruler-ok)"
      : ruler.tone === "dash"
        ? "var(--map-ruler-dash)"
        : "var(--map-ruler-over)";
  const label = t("map.ruler.label", {
    metres: feetToMetres(ruler.feet).toLocaleString(i18n.language, {
      maximumFractionDigits: 1,
    }),
    feet: ruler.feet,
    count: ruler.cells,
  });
  const fontSize = Math.max(11, ground.cellPx * 0.24);
  const pillWidth = label.length * fontSize * 0.6 + 16;
  return (
    <g
      className="map-ruler"
      data-testid="map-ruler"
      data-tone={ruler.tone}
      pointerEvents="none"
    >
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={tone}
        strokeWidth={3}
        strokeDasharray="10 8"
        strokeLinecap="round"
      />
      <circle cx={b.x} cy={b.y} r={ground.cellPx * 0.12} fill={tone} />
      <g transform={`translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - fontSize * 1.6})`}>
        <rect
          x={-pillWidth / 2}
          y={-fontSize}
          width={pillWidth}
          height={fontSize * 1.8}
          rx={fontSize * 0.9}
          fill="var(--map-pill-bg)"
          stroke={tone}
          strokeWidth={1.5}
        />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          y={-fontSize * 0.1}
          fontSize={fontSize}
          fill="var(--map-pill-ink)"
          fontFamily="var(--font-numeric)"
          fontWeight={600}
        >
          {label}
        </text>
      </g>
    </g>
  );
}

function SelectedTokenControls({
  token,
  onHidden,
}: {
  token: MapToken | null;
  onHidden: (entity: EntityId, hidden: boolean) => void;
}) {
  const { t } = useTranslation();
  if (!token) return null;
  const label = token.hidden ? t("map.token.show") : t("map.token.hide");
  return (
    <foreignObject x={8} y={8} width={220} height={40} data-testid="map-token-controls">
      <button
        type="button"
        className="map-token-control"
        onClick={() => onHidden(token.id, !token.hidden)}
        title={t("map.token.hideTip")}
      >
        {label}
      </button>
    </foreignObject>
  );
}
