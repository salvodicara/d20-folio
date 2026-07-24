/**
 * CombatAlgorithm — the character's combat decision tree, the combat helper
 * folded into the cockpit's Play tab (blueprint §2.4). Re-homed verbatim from the
 * standalone Algorithm page; renders as a titled section (the folio `.sec-head`
 * rubric replaces the page header) reading from the store the cockpit populates.
 *
 * A step-by-step "playbook" for what to do on a combat turn. The player walks
 * the steps top to bottom and takes the first whose condition is true. Built
 * for new players, but stays out of the way for veterans.
 *
 * Folio system (Illuminated Folio): a vertical flowchart "spine" of numbered
 * brass badges (`.algo-flow` / `.algo-step` / `.an-badge`) connecting
 * action-coloured cards (`.info-card.algo-card`). Each decision branch renders
 * as an IF clause (`.algo-if` / `.algo-kw` / `.algo-cond`) over its outcome
 * bullets, with YES / NO branches surfaced as inline keyword chips.
 *
 * Icons are rendered exclusively through the folio inline-SVG (lucide) set — no
 * OS emoji. The engine still stores `step.emoji` as a string, but the UI maps
 * it to a fixed lucide glyph and authors it via an icon picker, never a raw
 * emoji text field.
 *
 * Play mode: read-only flowchart. Edit mode: inline editing of every field,
 * add/remove steps + branches, reorder, and a fixed-subset icon picker.
 *
 * JSON import: a modal pre-filled with the CURRENT algorithm serialized through
 * the import codec (round-trip safe — see `./algorithm-json`), or with a worked
 * example when the algorithm is empty. On confirm the existing steps are
 * replaced (with a 5 s undo toast). Invalid JSON or wrong shape shows an inline
 * error message.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { Plus, Trash2, ChevronUp, ChevronDown, ListChecks, Upload } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { CheckboxField } from "@/components/ui/selection";
import { IconPicker } from "@/components/shared/icon-picker";
import { resolveAlgoIcon, DEFAULT_ALGO_ICON } from "@/components/shared/icon-registry";
import {
  parseAlgorithmJson,
  serializeAlgorithmSteps,
  JSON_TEMPLATE,
  type ImportError,
} from "./algorithm-json";
import { ModalShell } from "@/components/shared/ModalShell";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { InfoCard } from "@/components/shared/InfoCard";
import { cn } from "@/lib/utils";
import { parseInline } from "@/components/shared/parseInline";
import { ReferenceSection } from "../ReferenceSection";
import { PLAY_REF_ANCHOR, type PlayRefSection } from "../play-reference";
import type { CombatAlgorithmStep } from "@/types/character";

/** This block is the persisted "playbook" reference section (collapsed by default). */
const SECTION: PlayRefSection = "playbook";

// The folio icon registry + resolver + picker now live in the shared
// `@/components/shared/icon-picker` module (reused by the custom-feature form, #78).
// The JSON import/export codec (validate + parse + round-trip-safe serialize +
// the worked example) lives in the sibling `./algorithm-json` module.

// ─── Types ────────────────────────────────────────────────────────────────────

type SubStep = CombatAlgorithmStep["steps"][number];

/** Action-economy tone of a step, inferred from its branch text for the
 *  left-border accent. Kept presentational only (no engine dependency). */
type StepSlot = "action" | "bonus" | "reaction" | "movement" | "default";

const SLOT_PATTERNS: Array<[StepSlot, RegExp]> = [
  ["reaction", /\b(reaction|reazione|counterspell|controincant)/i],
  [
    "bonus",
    /\b(bonus action|azione bonus|healing word|parola guaritrice|bardic|bardica)/i,
  ],
  ["movement", /\b(disengage|dash|disimpegno|scatto|misty step|passo nebb)/i],
];

function inferSlot(step: CombatAlgorithmStep): StepSlot {
  const haystack = [
    step.title,
    ...step.steps.flatMap((s) => [s.question ?? "", ...s.bullets]),
  ]
    .join(" ")
    .toLowerCase();
  for (const [slot, re] of SLOT_PATTERNS) {
    if (re.test(haystack)) return slot;
  }
  return "default";
}

/** Detect a leading YES → / NO → branch marker on a bullet so we can render it
 *  as a keyword chip instead of inline prose. Locale-aware (EN + IT). */
const BRANCH_RE = /^\s*(YES|NO|SÌ|SI)\s*(?:→|->|:)\s*/i;

function splitBranch(bullet: string): { kw: string | null; rest: string } {
  const m = BRANCH_RE.exec(bullet);
  if (!m || !m[1]) return { kw: null, rest: bullet };
  const raw = m[1].toUpperCase();
  const kw = raw === "SI" ? "SÌ" : raw;
  return { kw, rest: bullet.slice(m[0].length) };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CombatAlgorithm() {
  const { t } = useTranslation();
  const character = useCharacterStore((s) => s.character);
  const setCharacter = useCharacterStore((s) => s.setCharacter);
  const sheetMode = useUIStore((s) => s.sheetMode);
  const showToast = useToastStore((s) => s.showToast);
  const isEdit = sheetMode === "edit";

  const [importOpen, setImportOpen] = useState(false);

  if (!character) return null;

  const { character: charData } = character;
  const steps = charData.combatAlgorithm;

  // ── Mutation helpers ──────────────────────────────────────────────────────

  function updateSteps(newSteps: CombatAlgorithmStep[]) {
    const current = useCharacterStore.getState().character;
    if (!current) return;
    setCharacter({
      ...current,
      character: { ...current.character, combatAlgorithm: newSteps },
    });
  }

  function addStep() {
    updateSteps([
      ...steps,
      { emoji: DEFAULT_ALGO_ICON.id, title: "", steps: [{ bullets: [""] }] },
    ]);
  }

  async function removeStep(idx: number) {
    // Deleting a step discards all of its decision branches, so confirm first.
    const ok = await useConfirmStore.getState().confirm({
      title: t("algorithm.removeStepTitle"),
      message: t("algorithm.removeStepMessage"),
      confirmLabel: t("common.remove"),
      cancelLabel: t("common.cancel"),
      tone: "danger",
    });
    if (!ok) return;
    updateSteps(steps.filter((_, i) => i !== idx));
  }

  function moveStep(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= steps.length) return;
    const arr = [...steps];
    const a = arr[idx];
    const b = arr[target];
    if (!a || !b) return;
    arr[idx] = b;
    arr[target] = a;
    updateSteps(arr);
  }

  function updateStep(idx: number, patch: Partial<CombatAlgorithmStep>) {
    const arr = [...steps];
    const current = arr[idx];
    if (!current) return;
    arr[idx] = {
      emoji: patch.emoji ?? current.emoji,
      title: patch.title ?? current.title,
      steps: patch.steps ?? current.steps,
    };
    updateSteps(arr);
  }

  function addSubStep(stepIdx: number) {
    const arr = [...steps];
    const current = arr[stepIdx];
    if (!current) return;
    arr[stepIdx] = {
      emoji: current.emoji,
      title: current.title,
      steps: [...current.steps, { bullets: [""] }],
    };
    updateSteps(arr);
  }

  function removeSubStep(stepIdx: number, subIdx: number) {
    const arr = [...steps];
    const current = arr[stepIdx];
    if (!current) return;
    arr[stepIdx] = {
      emoji: current.emoji,
      title: current.title,
      steps: current.steps.filter((_, i) => i !== subIdx),
    };
    updateSteps(arr);
  }

  function updateSubStep(stepIdx: number, subIdx: number, patch: Partial<SubStep>) {
    const arr = [...steps];
    const current = arr[stepIdx];
    if (!current) return;
    const subSteps = [...current.steps];
    const currentSub = subSteps[subIdx];
    if (!currentSub) return;
    subSteps[subIdx] = {
      question: patch.question !== undefined ? patch.question : currentSub.question,
      indent: patch.indent !== undefined ? patch.indent : currentSub.indent,
      bullets: patch.bullets ?? currentSub.bullets,
    };
    arr[stepIdx] = { emoji: current.emoji, title: current.title, steps: subSteps };
    updateSteps(arr);
  }

  // ── JSON import handler ───────────────────────────────────────────────────

  function handleImport(newSteps: CombatAlgorithmStep[]) {
    const previous = steps;
    updateSteps(newSteps);
    setImportOpen(false);
    // Deliberately toast-only, NOT on the session undo stack: an IMPORT
    // mutation is on the stack's never-list (undoStore §NEVER LIST) — it
    // rewrites an edit-surface document wholesale. The toast's Undo is a
    // one-shot restore of the pre-import playbook.
    showToast({
      message: t("algorithm.importJSONSuccess"),
      duration: 5000,
      onUndo: () => updateSteps(previous),
    });
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  if (steps.length === 0 && !isEdit) {
    return (
      <ReferenceSection
        id={SECTION}
        anchorId={PLAY_REF_ANCHOR[SECTION]}
        title={t("algorithm.title")}
      >
        <InfoCard className="algo-empty">
          <span className="ai-glyph" aria-hidden>
            <Icon as={ListChecks} size="lg" decorative />
          </span>
          <p>{t("algorithm.empty")}</p>
        </InfoCard>
      </ReferenceSection>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // The shared playbook body — the intro gloss + the numbered flowchart spine
  // (which branches on edit mode for the per-step / add-step affordances). The
  // JSON-import modal rides here too but only ever opens in edit mode (its sole
  // trigger is the edit header below), so play mode never mounts it.
  const flow = (
    <>
      {/* JSON Import Modal — mounted per open so the box re-seeds from the LIVE
          steps every time: the CURRENT algorithm as editable JSON when one
          exists, the worked example only when empty (owner directive). */}
      {importOpen && (
        <ImportJSONModal
          open
          onClose={() => setImportOpen(false)}
          onImport={handleImport}
          currentSteps={steps}
        />
      )}

      {/* Intro — the playbook gloss */}
      <div className="algo-intro">
        <span className="ai-glyph" aria-hidden>
          <Icon as={ListChecks} size="lg" decorative />
        </span>
        <p>{t("algorithm.subtitle")}</p>
      </div>

      <ol className="algo-flow">
        {steps.map((step, idx) => {
          const slot = inferSlot(step);
          const stepIcon = resolveAlgoIcon(step.emoji);
          return (
            <li key={idx} className="algo-step">
              <div className="algo-num" aria-hidden>
                <span className="an-badge">{idx + 1}</span>
              </div>
              <InfoCard className="algo-card" data-slot={slot}>
                {isEdit ? (
                  /* Edit header — icon + title on one comfortable row, then the
                     reorder/remove cluster on its own line with 40 px targets so
                     nothing competes for the same cramped strip. */
                  <div className="mb-3 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <IconPicker
                        value={step.emoji}
                        onChange={(id) => updateStep(idx, { emoji: id })}
                      />
                      <Input
                        type="text"
                        value={step.title}
                        onChange={(e) => updateStep(idx, { title: e.target.value })}
                        placeholder={t("algorithm.stepTitlePlaceholder")}
                        aria-label={t("algorithm.stepTitlePlaceholder")}
                        className="w-full"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="lg"
                        iconOnly
                        onClick={() => moveStep(idx, -1)}
                        disabled={idx === 0}
                        aria-label={t("common.moveUp")}
                      >
                        <Icon as={ChevronUp} size="sm" decorative />
                      </Button>
                      <Button
                        variant="ghost"
                        size="lg"
                        iconOnly
                        onClick={() => moveStep(idx, 1)}
                        disabled={idx === steps.length - 1}
                        aria-label={t("common.moveDown")}
                      >
                        <Icon as={ChevronDown} size="sm" decorative />
                      </Button>
                      <Button
                        variant="ghost"
                        size="lg"
                        iconOnly
                        className="icon-danger"
                        onClick={() => void removeStep(idx)}
                        style={{ marginLeft: "auto" }}
                        aria-label={t("common.remove")}
                      >
                        <Icon as={Trash2} size="sm" decorative />
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Play header — icon glyph + step title. */
                  <div className="algo-head">
                    <span className="algo-head-glyph" aria-hidden>
                      <Icon as={stepIcon.glyph} size="sm" decorative />
                    </span>
                    <h3 className="algo-title">{step.title}</h3>
                  </div>
                )}

                {/* Decision branches */}
                <div className="algo-branches">
                  {step.steps.map((sub, subIdx) => (
                    <div
                      key={subIdx}
                      className={cn(
                        "algo-branch",
                        sub.indent && !isEdit && "algo-branch-indent"
                      )}
                    >
                      {isEdit ? (
                        <EditableSubStep
                          sub={sub}
                          onUpdate={(patch) => updateSubStep(idx, subIdx, patch)}
                          onRemove={() => removeSubStep(idx, subIdx)}
                        />
                      ) : (
                        <>
                          {sub.question && (
                            <p className="algo-if">
                              <span className="algo-kw">{t("algorithm.ifKeyword")}</span>
                              <span className="algo-cond">
                                {parseInline(sub.question)}
                              </span>
                            </p>
                          )}
                          <ul className="algo-then-list">
                            {sub.bullets.map((bullet, bIdx) => {
                              const { kw, rest } = splitBranch(bullet);
                              return (
                                <li key={bIdx} className="algo-then">
                                  {kw ? (
                                    <span
                                      className="algo-kw branch"
                                      data-branch={kw === "NO" ? "no" : "yes"}
                                    >
                                      {kw}
                                    </span>
                                  ) : (
                                    <span className="algo-bullet-dot" aria-hidden />
                                  )}
                                  <span className="algo-then-text">
                                    {parseInline(rest)}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {isEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="algo-add-branch"
                    onClick={() => addSubStep(idx)}
                  >
                    <Icon as={Plus} size="sm" decorative />
                    {t("algorithm.addSubStep")}
                  </Button>
                )}
              </InfoCard>
            </li>
          );
        })}

        {/* Add step (edit mode) — dashed brass badge + dashed button */}
        {isEdit && (
          <li className="algo-add-row">
            <div className="algo-num" aria-hidden>
              <span className="an-badge add">+</span>
            </div>
            <Button variant="dashed" block onClick={addStep}>
              <Icon as={Plus} size="sm" decorative />
              {t("algorithm.addStep")}
            </Button>
          </li>
        )}
      </ol>
    </>
  );

  // Edit mode — the editor stays fully expanded (a collapsed editor makes no
  // sense); the JSON-import action docks in the header meta.
  if (isEdit) {
    return (
      <div className="mt-8">
        <SectionHeader
          title={t("algorithm.title")}
          meta={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setImportOpen(true)}
              aria-label={t("algorithm.importJSON")}
            >
              <Icon as={Upload} size="sm" decorative />
              {t("algorithm.importJSON")}
            </Button>
          }
        />
        {flow}
      </div>
    );
  }

  // Play mode — an on-demand reference section: collapsed to just its header by
  // default, blooming the whole flowchart on click (persisted per user).
  return (
    <ReferenceSection
      id={SECTION}
      anchorId={PLAY_REF_ANCHOR[SECTION]}
      title={t("algorithm.title")}
    >
      {flow}
    </ReferenceSection>
  );
}

// ─── JSON Import Modal ────────────────────────────────────────────────────────
// Simple textarea modal: user pastes a JSON string, the component validates it
// against the CombatAlgorithmStep[] schema, and calls onImport on success.
// Invalid input shows an inline error; the modal never crashes.

function ImportJSONModal({
  open,
  onClose,
  onImport,
  currentSteps,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (steps: CombatAlgorithmStep[]) => void;
  currentSteps: CombatAlgorithmStep[];
}) {
  const { t } = useTranslation();
  // Owner directive: when the character already HAS an algorithm, seed the box
  // with THAT content in import form (round-trip safe), so the user sees exactly
  // what to change; the worked example seeds only the empty state. The modal is
  // mounted per open, so this initial state is always fresh.
  const hasContent = currentSteps.length > 0;
  const seed = hasContent ? serializeAlgorithmSteps(currentSteps) : JSON_TEMPLATE;
  const [raw, setRaw] = useState(seed);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setError(null);
    onClose();
  }

  // Item i — each failure mode maps to a friendly why + how-to-fix line (never a
  // raw parser error or an internal field/type name).
  const ERROR_KEY: Record<ImportError, string> = {
    syntax: "algorithm.importJSONErrorSyntax",
    notArray: "algorithm.importJSONErrorNotArray",
    shape: "algorithm.importJSONErrorShape",
  };

  function handleConfirm() {
    if (!raw.trim()) {
      setError(t(ERROR_KEY.syntax));
      return;
    }
    const result = parseAlgorithmJson(raw);
    if (!Array.isArray(result)) {
      setError(t(ERROR_KEY[result]));
      return;
    }
    setError(null);
    onImport(result);
  }

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      title={t("algorithm.importJSON")}
      rubric={t("algorithm.importJSONRubric")}
      size="md"
    >
      <div className="modal-body flex flex-col gap-3 p-4">
        {/* Item i — a plain-language hint over the box; the box itself is pre-filled
            with the CURRENT algorithm (when one exists) or a working example to
            edit (a template, not a blank). */}
        <p className="text-xs text-text-secondary">
          {t(hasContent ? "algorithm.importJSONHintCurrent" : "algorithm.importJSONHint")}
        </p>
        <Textarea
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            if (error) setError(null);
          }}
          placeholder={t("algorithm.importJSONPlaceholder")}
          aria-label={t("algorithm.importJSONField")}
          rows={14}
          className="w-full font-mono text-xs"
          spellCheck={false}
        />
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          {/* Reset the box back to its seed (the current algorithm, or the worked
              example when empty) after an edit/clear. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRaw(seed);
              setError(null);
            }}
          >
            {t(
              hasContent
                ? "algorithm.importJSONResetCurrent"
                : "algorithm.importJSONResetExample"
            )}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={handleConfirm}>
              {t("common.confirm")}
            </Button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Sub-step Editor ──────────────────────────────────────────────────────────

function EditableSubStep({
  sub,
  onUpdate,
  onRemove,
}: {
  sub: { question?: string; indent?: boolean; bullets: string[] };
  onUpdate: (
    patch: Partial<{ question: string; indent: boolean; bullets: string[] }>
  ) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();

  function updateBullet(bIdx: number, value: string) {
    const newBullets = [...sub.bullets];
    newBullets[bIdx] = value;
    onUpdate({ bullets: newBullets });
  }

  function addBullet() {
    onUpdate({ bullets: [...sub.bullets, ""] });
  }

  function removeBullet(bIdx: number) {
    if (sub.bullets.length <= 1) return; // Keep at least one
    onUpdate({ bullets: sub.bullets.filter((_, i) => i !== bIdx) });
  }

  return (
    <div className="algo-branch-edit">
      {/* Question field — the IF condition that triggers this branch. The
          remove control sits at a comfortable 40 px target alongside it. */}
      <div className="algo-branch-edit-head">
        <span className="algo-kw">{t("algorithm.ifKeyword")}</span>
        <Input
          type="text"
          value={sub.question ?? ""}
          onChange={(e) => onUpdate({ question: e.target.value })}
          placeholder={t("algorithm.questionPlaceholder")}
          aria-label={t("algorithm.questionPlaceholder")}
          className="w-full"
        />
        <Button
          variant="ghost"
          size="lg"
          iconOnly
          className="icon-danger"
          onClick={onRemove}
          aria-label={t("common.remove")}
        >
          <Icon as={Trash2} size="sm" decorative />
        </Button>
      </div>

      {/* Indent toggle on its own line — it no longer competes with the
          question input for horizontal space on narrow viewports. */}
      <CheckboxField
        className="algo-indent-toggle"
        checked={sub.indent ?? false}
        onCheckedChange={(c) => onUpdate({ indent: c })}
        label={t("algorithm.indent")}
      />

      {/* Bullet points — each outcome line with a comfortable remove target. */}
      <div className="algo-bullets-edit">
        {sub.bullets.map((bullet, bIdx) => (
          <div key={bIdx} className="algo-bullet-edit">
            <span className="algo-bullet-dot" aria-hidden />
            <Input
              type="text"
              value={bullet}
              onChange={(e) => updateBullet(bIdx, e.target.value)}
              placeholder={t("algorithm.bulletPlaceholder")}
              aria-label={t("algorithm.bulletPlaceholder")}
              className="w-full"
            />
            {sub.bullets.length > 1 && (
              <Button
                variant="ghost"
                size="lg"
                iconOnly
                className="icon-danger"
                onClick={() => removeBullet(bIdx)}
                aria-label={t("common.remove")}
              >
                <Icon as={Trash2} size="sm" decorative />
              </Button>
            )}
          </div>
        ))}
      </div>

      <Button variant="ghost" size="sm" className="algo-add-bullet" onClick={addBullet}>
        <Icon as={Plus} size="sm" decorative />
        {t("algorithm.addBullet")}
      </Button>
    </div>
  );
}
