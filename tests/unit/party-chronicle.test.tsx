/**
 * party-chronicle — render tests for the Combat Chronicle UI over the session log: the
 * live feed's "Who struck?" (answered by the DM anywhere, by a player only on a hit
 * their character took; never auto-guessed), the undo and retraction affordances, and
 * the editable end entry (line deletion honored, chapter built, note and outcome handed
 * back, Save/Skip wired).
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import i18n from "@/i18n";

vi.mock("@/lib/firebase", () => ({ db: {} }));

import {
  ChronicleFeed,
  EndEncounterDialog,
  type EncounterClose,
} from "@/features/campaigns/party-chronicle";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import type { FeedLine, FeedViewer, PlayEvent } from "@/lib/session-log";
import type { EncounterState } from "@/types/campaign";

beforeAll(async () => {
  if (i18n.language !== "en") await i18n.changeLanguage("en");
});

/** Assert-present helper (the repo forbids `!` / non-null assertions in tests). */
function must<T>(v: T | null | undefined, msg: string): T {
  if (v === null || v === undefined) throw new Error(msg);
  return v;
}

const ROWS: EncounterCombatantView[] = [
  {
    id: "pc-mara",
    kind: "pc",
    name: "Mara",
    ac: 15,
    initiative: 14,
    conditions: [],
    currentHp: 22,
    maxHp: 22,
    tempHp: 0,
    down: false,
    hidden: false,
    memberUid: "mara",
    characterId: "char-mara",
  },
  {
    id: "monster-1",
    kind: "monster",
    name: "Goblin",
    ac: 13,
    initiative: 12,
    conditions: [],
    currentHp: 4,
    maxHp: 12,
    tempHp: 0,
    down: false,
    hidden: false,
  },
];

const DM: FeedViewer = { uid: "dm", isDm: true };
const MARA: FeedViewer = { uid: "mara", isDm: false };

const line = (event: PlayEvent, extra: Partial<FeedLine> = {}): FeedLine => ({
  id: "enc:1:ev:0",
  by: "dm",
  round: 1,
  event,
  logged: event,
  ...extra,
});
const onGoblin = line({ kind: "damage", amount: 8, target: "monster-1" });
const onMara = line({ kind: "damage", amount: 5, target: "pc-mara" });

function feed(
  lines: FeedLine[],
  viewer: FeedViewer,
  over: Partial<Pick<Parameters<typeof ChronicleFeed>[0], "hpFor" | "undoFor">> = {}
) {
  const onAttribute = vi.fn<(line: FeedLine, actor: string | null) => void>();
  const onRetract = vi.fn<(line: FeedLine) => void>();
  render(
    <ChronicleFeed
      lines={lines}
      rows={ROWS}
      memberDetails={{}}
      currentId="pc-mara"
      viewer={viewer}
      hpFor={over.hpFor ?? (() => null)}
      undoFor={over.undoFor ?? (() => null)}
      onAttribute={onAttribute}
      onRetract={onRetract}
    />
  );
  return { onAttribute, onRetract };
}

describe("ChronicleFeed — the live feed", () => {
  it("renders the line and, for the DM on an open hit, the picker", () => {
    feed([onGoblin], DM);
    expect(screen.getByText("Goblin takes 8")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mara" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No one" })).toBeTruthy();
  });

  it("a chip answers 'Who struck?' with that combatant; 'No one' with null", () => {
    const props = feed([onGoblin], DM);
    fireEvent.click(screen.getByRole("button", { name: "Mara" }));
    fireEvent.click(screen.getByRole("button", { name: "No one" }));
    expect(props.onAttribute.mock.calls).toEqual([
      [onGoblin, "pc-mara"],
      [onGoblin, null],
    ]);
  });

  it("a player answers only for a hit their own character took", () => {
    feed([onGoblin, onMara], MARA);
    // One picker (the hit on Mara), offering the Goblin; none on the Goblin's line.
    expect(screen.getAllByRole("group", { name: "Who struck?" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Goblin" })).toBeTruthy();
  });

  it("shows the HP readout only when the caller passes it", () => {
    feed([onGoblin], DM, { hpFor: () => ({ current: 4, max: 12 }) });
    expect(screen.getByText("Goblin takes 8 (4/12 HP)")).toBeTruthy();
  });

  it("no picker once the hit is attributed", () => {
    const named: PlayEvent = {
      kind: "damage",
      amount: 8,
      target: "monster-1",
      actor: "pc-mara",
    };
    feed([line(named)], DM);
    expect(screen.getByText("Mara hits Goblin for 8")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "No one" })).toBeNull();
  });

  it("an uncertain derived attacker wears the marker and keeps the picker", () => {
    const guessed: PlayEvent = {
      kind: "damage",
      amount: 8,
      target: "monster-1",
      actor: "pc-mara",
    };
    feed([line(guessed, { logged: onGoblin.logged, auto: true, uncertain: true })], DM);
    expect(screen.getByRole("img", { name: /uncertain/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "No one" })).toBeTruthy();
  });

  it("the DM's undo on a monster line runs the engine undo instead of a retraction", () => {
    const undo = vi.fn();
    const props = feed([onGoblin], DM, { undoFor: () => undo });
    fireEvent.click(screen.getByRole("button", { name: "Undo this line" }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Strike from the record" })).toBeNull();
    expect(props.onRetract).not.toHaveBeenCalled();
  });

  it("a line is struck by its author or the DM, never by another player", () => {
    const own = line(
      { kind: "heal", amount: 4, target: "pc-mara" },
      { id: "pc:c:1", by: "mara" }
    );
    const props = feed([own, onGoblin], MARA);
    const strike = screen.getAllByRole("button", { name: "Strike from the record" });
    expect(strike).toHaveLength(1);
    fireEvent.click(must(strike[0], "no strike"));
    expect(props.onRetract).toHaveBeenCalledWith(own);
  });

  it("a declared miss reads as the miss line", () => {
    feed(
      [
        line(
          { kind: "action", actor: "pc-mara", targets: ["monster-1"], outcome: "miss" },
          { by: "mara" }
        ),
      ],
      DM
    );
    expect(screen.getByText("Mara misses Goblin")).toBeTruthy();
  });
});

describe("EndEncounterDialog — the editable end entry", () => {
  const encounter: EncounterState = {
    combatants: [
      {
        kind: "monster",
        id: "monster-1",
        name: "Goblin",
        ac: 13,
        initiative: 12,
        conditions: [],
        hp: { current: 0, temp: 0, max: 12 },
      },
    ],
    nextMonsterOrdinal: 2,
    round: 1,
    currentCombatantId: "pc-mara",
    epoch: 1,
    status: "active",
    events: [],
  };
  const lines: FeedLine[] = [
    onGoblin,
    line({ kind: "down", target: "monster-1" }, { id: "enc:1:ev:1" }),
  ];
  const dialog = (
    onSave = vi.fn<(close: EncounterClose) => Promise<void>>(() => Promise.resolve()),
    onSkip = vi.fn()
  ) => {
    render(
      <EndEncounterDialog
        encounter={encounter}
        lines={lines}
        rows={ROWS}
        memberDetails={{}}
        hpFor={() => null}
        onSave={onSave}
        onSkip={onSkip}
        onCancel={vi.fn()}
      />
    );
    return { onSave, onSkip };
  };

  it("uses the shared modal body and footer spacing grammar", () => {
    dialog();
    const modal = screen.getByRole("dialog");
    expect(modal.querySelector(":scope > .modal-body")).toBeTruthy();
    expect(modal.querySelector(":scope > .modal-foot")).toBeTruthy();
  });

  it("hands back the chapter, the note and the outcome", () => {
    const { onSave } = dialog();
    fireEvent.change(screen.getByPlaceholderText(/What happened/), {
      target: { value: "  The bridge held.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save to Chronicle/ }));
    const close = must(onSave.mock.calls[0], "onSave not called")[0];
    expect(close.chapter.startsWith("## ")).toBe(true);
    expect(close.chapter).toContain("Goblin takes 8");
    expect(close.chapter).toContain("Goblin falls");
    expect(close.chapter).toContain("The party is victorious");
    expect(close.note).toBe("The bridge held.");
    expect(close.outcome).toBe("victory");
  });

  it("honors a deleted line — it is absent from the saved chapter", () => {
    const { onSave } = dialog();
    const deletes = screen.getAllByRole("button", { name: /Remove this line/ });
    fireEvent.click(must(deletes[1], "no second delete"));
    fireEvent.click(screen.getByRole("button", { name: /Save to Chronicle/ }));
    const close = must(onSave.mock.calls[0], "onSave not called")[0];
    expect(close.chapter).toContain("Goblin takes 8");
    expect(close.chapter).not.toContain("Goblin falls");
  });

  it("Skip saves nothing", () => {
    const { onSave, onSkip } = dialog();
    fireEvent.click(screen.getByRole("button", { name: /^Skip$/ }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
