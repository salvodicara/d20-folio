/**
 * The encounter log as prose — the play surface's log and the DM drawer's Registro tab
 * (stage 6 design §2 D9).
 *
 * Ids and numbers in, sentences out. `t` and the label resolver are INJECTED, so this module
 * imports no React, no store and no i18next: `lib/views/` is the only engine-side layer allowed
 * to localize, and even here the translator is a parameter. A language switch therefore
 * re-localizes the whole feed, because nothing localized is ever stored.
 *
 * Two facts shape the implementation:
 *
 * 1. **Receipts are not persisted.** The log holds actions; what each one DID is the reducer's
 *    receipt, which exists only during a fold. So this presenter folds the document itself —
 *    from the checkpoint's state, exactly as `fold` does — and keeps each action's receipt or
 *    rejection. It is the same work the store's fold already does; a caller that renders every
 *    frame should memoise on the same fingerprint the store uses.
 * 2. **A checkpoint closes the past.** Compaction folds old actions away, so the presenter shows
 *    the log the document still holds and nothing more. The history before a checkpoint is gone
 *    from the document by design (design §5.3), not hidden by this module.
 *
 * An UNDONE action produces no line: `LogLine` has no "struck through" state, so rendering one
 * would be indistinguishable from a live line, and the `undo` action's own line is what records
 * that the table changed its mind.
 */
import { initialState } from "@/lib/combat/fold";
import { assertNever, compareSeq, sortBySeq } from "@/lib/combat/ids";
import { resolve } from "@/lib/combat/resolve";
import type { Catalogue } from "@/lib/combat/catalogue";
import type { ActionId, EntityId, LabelId, Seq } from "@/lib/combat/ids";
import type {
  Action,
  CombatEvent,
  Encounter,
  FoldedState,
  Outcome,
  Receipt,
  Rejection,
  TableOp,
} from "@/lib/combat/types";

/** The minimal `t` this presenter needs — kept structural so no i18next import is required. */
export type TranslateFn = (key: string, args?: Record<string, string | number>) => string;

export interface LogLine {
  readonly id: ActionId;
  readonly at: Seq;
  /** Who is credited: the DM, the viewer, the engine's own consequence, or another member. */
  readonly author: "dm" | "you" | "auto" | { readonly uid: string };
  readonly kind: "action" | "roll" | "rejected" | "undo";
  readonly text: string;
  readonly undoable: boolean;
  /** The roll was rolled hidden (rule 34). Its faces are masked for everyone but the DM. */
  readonly hidden: boolean;
  /**
   * The one-word verdict this action's receipt settled on (`attack-resolved`), when it settled
   * on one: what the roll panel prints under the total (rule 31). `null` for every action that
   * resolves nothing — a move, a table op, a roll on its own.
   *
   * It is derived HERE rather than by the caller because the receipt exists only during the
   * fold this presenter already performs; asking a component for it would mean folding twice.
   */
  readonly verdict: Outcome | null;
  /**
   * The creature this line is ABOUT, when it is about one: whoever took the damage, or dropped.
   *
   * It is what the drawer's "Modifica" opens the HP editor on. Derived here for the same reason
   * `verdict` is — the events that name the subject live on the receipt, which exists only
   * during this fold — and it is deliberately the WOUNDED creature rather than the acting one,
   * because the correction a DM reaches for on a log line is always to the number that moved.
   */
  readonly subject: EntityId | null;
  /**
   * This line records a creature losing hit points (`damage-taken`) or dropping (`hp-zero`) —
   * the drawer's "Ferite" filter, and the gate on offering "Modifica".
   *
   * NOT `verdict !== null`: an attack that misses settles a verdict and wounds nobody, and a
   * save-based spell wounds without ever settling one.
   */
  readonly wounded: boolean;
}

export interface LogViewArgs {
  readonly encounter: Encounter;
  /** The static `core:*` catalogue; a seated entity's carried mechanics still win (`programOf`). */
  readonly catalogue: Catalogue;
  readonly viewer: { readonly uid: string; readonly dm: boolean };
  /** The campaign's DM uid — how a line is attributed to "the DM" rather than to a member. */
  readonly dmUid: string;
  readonly t: TranslateFn;
  /** Localize a stable label id: a mechanic's, or a creature's `Entity.label`. */
  readonly labels: (label: LabelId) => string;
}

/** Ids undone by a live (not itself undone) undo action — the same rule `fold` applies. */
function undoneIds(log: readonly Action[]): Set<ActionId> {
  const undos = log.filter(
    (a): a is Extract<Action, { kind: "undo" }> => a.kind === "undo"
  );
  const undoneUndos = new Set(
    undos.filter((u) => undos.some((o) => o.of === u.id)).map((u) => u.id)
  );
  return new Set(undos.filter((u) => !undoneUndos.has(u.id)).map((u) => u.of));
}

interface Folded {
  readonly receipts: ReadonlyMap<ActionId, Receipt>;
  readonly rejections: ReadonlyMap<ActionId, Rejection>;
  /** Every creature the log ever named, so a line can still name one that has left. */
  readonly names: ReadonlyMap<EntityId, LabelId>;
}

function remember(names: Map<EntityId, LabelId>, state: FoldedState): void {
  for (const entity of Object.values(state.entities)) names.set(entity.id, entity.label);
}

/** Fold the document, keeping what each action did rather than only where it left the state. */
function foldWithReceipts(
  encounter: Encounter,
  catalogue: Catalogue,
  skip: ReadonlySet<ActionId>
): Folded {
  const from = encounter.checkpoint;
  let state = from ? from.state : initialState();
  const receipts = new Map<ActionId, Receipt>();
  const rejections = new Map<ActionId, Rejection>();
  const names = new Map<EntityId, LabelId>();
  remember(names, state);
  for (const action of sortBySeq(encounter.log)) {
    if (from && compareSeq(action.seq, from.through) <= 0) continue;
    if (action.kind === "undo" || skip.has(action.id)) continue;
    const result = resolve(state, action, catalogue);
    if (result.kind === "rejected") {
      rejections.set(action.id, result.rejection);
      continue;
    }
    receipts.set(action.id, result.receipt);
    state = result.state;
    remember(names, state);
  }
  return { receipts, rejections, names };
}

/** `held` while a reaction window holds the action open, `resolved`/`closed` when it shuts. */
function windowToken(summary: readonly string[]): "held" | "resolved" | "closed" | null {
  if (summary.includes("window:resolved")) return "resolved";
  if (summary.includes("window:closed")) return "closed";
  return summary.some((token) => token.startsWith("window:")) ? "held" : null;
}

/** An override's value, as a display string: ids and numbers only ever reach here. */
function display(value: unknown): string {
  const plain = ["string", "number", "boolean"].includes(typeof value);
  return plain ? String(value) : JSON.stringify(value ?? null);
}

/** The entity a table op is about, whether the op carries the whole creature or just its id. */
function opEntity(op: TableOp): EntityId | null {
  if (!("entity" in op)) return null;
  return typeof op.entity === "string" ? op.entity : op.entity.id;
}

export function buildLogLines(args: LogViewArgs): LogLine[] {
  const { encounter, catalogue, viewer, dmUid, t, labels } = args;
  const skip = undoneIds(encounter.log);
  const { receipts, rejections, names } = foldWithReceipts(encounter, catalogue, skip);
  const through = encounter.checkpoint?.through ?? null;

  const nameOf = (id: EntityId): string => {
    const label = names.get(id);
    return label === undefined ? id : labels(label);
  };

  const authorOf = (by: string): LogLine["author"] =>
    by === dmUid ? "dm" : by === viewer.uid ? "you" : { uid: by };

  /** A `roll` renders as its own kind of line and an `undo` as another, so neither reaches
   *  here — excluding them keeps this switch exhaustive over what actually does. */
  const summaryText = (
    action: Exclude<Action, { kind: "roll" | "undo" }>,
    receipt: Receipt
  ): string => {
    switch (action.kind) {
      case "table": {
        const op = action.table;
        const entity = opEntity(op);
        return t(`play.log.table.${op.op}`, {
          ...(entity === null ? {} : { entity: nameOf(entity) }),
          ...(op.op === "set-initiative" ? { value: op.value } : {}),
          ...(op.op === "rest" ? { rest: t(`play.log.rest.${op.rest}`) } : {}),
        });
      }
      case "override":
        return t("play.log.override", {
          entity: nameOf(action.entity),
          path: action.path,
          value: display(action.value),
          reason: action.reason,
        });
      case "declare":
        return t(action.remove ? "play.log.declareRemoved" : "play.log.declare", {
          relation: t(`play.log.relation.${action.relation.kind}`),
        });
      case "check":
        return t(
          `play.log.concentration.${receipt.outcome === "negated" ? "lost" : "held"}`
        );
      case "intent": {
        const mechanic = labels(action.mechanic);
        return windowToken(receipt.summary) === "held"
          ? t("play.log.windowHeld", { mechanic })
          : t(`play.log.outcome.${receipt.outcome}`, { mechanic });
      }
      case "resolve": {
        const declared = receipt.summary[0];
        return windowToken(receipt.summary) === "resolved" && declared !== undefined
          ? t("play.log.windowResolved", { mechanic: labels(declared) })
          : t("play.log.windowClosed");
      }
      default:
        return assertNever(action, "log line action");
    }
  };

  /** The receipt's own verdict: the last attack or save it resolved. A program that resolves
   *  several targets settles several; the last is the one the panel is looking at, because it
   *  is the one whose roll was just entered. */
  const verdictOf = (receipt: Receipt): Outcome | null => {
    let outcome: Outcome | null = null;
    for (const event of receipt.events) {
      if (event.kind === "attack-resolved") outcome = event.outcome;
    }
    return outcome;
  };

  /** The creature a receipt's events wound, and whether they wound anybody at all. The LAST
   *  such event wins, for the same reason the last verdict does: it is the one the DM is
   *  looking at when the line lands. */
  const woundOf = (
    events: readonly CombatEvent[]
  ): { readonly subject: EntityId | null; readonly wounded: boolean } => {
    let subject: EntityId | null = null;
    for (const event of events) {
      if (event.kind === "damage-taken" || event.kind === "hp-zero")
        subject = event.entity;
    }
    return { subject, wounded: subject !== null };
  };

  /** The three engine consequences worth a sentence of their own; every other event is
   *  already implied by the action's own line. */
  const consequenceText = (event: CombatEvent): string | null => {
    switch (event.kind) {
      case "hp-zero":
        return t("play.log.event.hpZero", { entity: nameOf(event.entity) });
      case "effect-ended":
        return t("play.log.event.effectEnded");
      case "concentration-ended":
        return t("play.log.event.concentrationEnded", { entity: nameOf(event.entity) });
      default:
        return null;
    }
  };

  /** Those consequences as lines credited to nobody — the log's "auto" author. */
  const consequences = (action: Action, receipt: Receipt): LogLine[] =>
    receipt.events.flatMap((event, index) => {
      const text = consequenceText(event);
      const wound = woundOf([event]);
      return text === null
        ? []
        : [
            {
              id: `${action.id}#${index}`,
              at: action.seq,
              author: "auto" as const,
              kind: "action" as const,
              text,
              undoable: false,
              hidden: false,
              verdict: null,
              subject: wound.subject,
              wounded: wound.wounded,
            },
          ];
    });

  const lines: LogLine[] = [];
  for (const action of sortBySeq(encounter.log)) {
    if (through !== null && compareSeq(action.seq, through) <= 0) continue;
    if (skip.has(action.id)) continue;
    const author = authorOf(action.by);
    const undoable = (viewer.dm || action.by === viewer.uid) && !skip.has(action.id);
    const base = {
      id: action.id,
      at: action.seq,
      author,
      undoable,
      verdict: null,
      subject: null,
      wounded: false,
    };

    if (action.kind === "undo") {
      lines.push({
        ...base,
        kind: "undo",
        hidden: false,
        text:
          action.reason === null
            ? t("play.log.undo")
            : t("play.log.undoWithReason", { reason: action.reason }),
      });
      continue;
    }

    const rejection = rejections.get(action.id);
    if (rejection !== undefined) {
      lines.push({
        ...base,
        kind: "rejected",
        hidden: false,
        text: t("play.log.rejected", {
          reason: t(`play.log.reason.${rejection.reason}`),
        }),
      });
      continue;
    }

    const receipt = receipts.get(action.id);
    // Every action the fold neither skipped nor rejected has a receipt; a missing one would be
    // a fold that disagrees with itself, so there is nothing honest to render.
    if (receipt === undefined) continue;

    if (action.kind === "roll") {
      const record = action.roll;
      const purpose = t(`play.log.purpose.${record.purpose}`);
      lines.push({
        ...base,
        kind: "roll",
        hidden: record.hidden,
        text:
          record.hidden && !viewer.dm
            ? t("play.log.hiddenRoll", { purpose })
            : t("play.log.roll", {
                purpose,
                formula: record.formula,
                faces: record.faces.join(", "),
                total: record.total,
              }),
      });
      continue;
    }

    const wound = woundOf(receipt.events);
    lines.push({
      ...base,
      kind: "action",
      hidden: false,
      text: summaryText(action, receipt),
      verdict: verdictOf(receipt),
      subject: wound.subject,
      wounded: wound.wounded,
    });
    lines.push(...consequences(action, receipt));
  }
  return lines;
}
