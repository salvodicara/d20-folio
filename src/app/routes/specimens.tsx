/**
 * Specimens — the DEV-ONLY style guide of the design vision (owner 2026-10-13: "every
 * screen follows one design vision"). Every system piece in every state, rendered
 * through the REAL
 * components and recipes, so this page always shows the system exactly as it ships:
 *
 *   · Field + surfaces: the calm field, the panel slab, the recessed well
 *   · Voices: Cinzel titles and section rubrics, Alegreya reading text, the control
 *     voice (Source Serif 4 capitals) for buttons, labels and tabs, lining numerals
 *   · Controls: buttons (the one lit primary, secondary, ghost, destructive, disabled),
 *     tabs, chips and badges, inputs, switches, segmented control
 *   · Chrome: a dialog head, a menu, a toast
 *
 * One theme at a time: many recipes key on the document's theme, so a nested
 * light column inside a dark document cannot be honest. Switch the app theme (or
 * screenshot both) to see the other.
 *
 * Mounted behind `import.meta.env.DEV` in router.tsx, so it does not exist in the
 * production bundle. Like the crash probes, it hardcodes its strings: it is not a
 * user-facing surface, so the bilingual lock does not apply.
 */
import { useState, type ReactNode } from "react";
import { Copy, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import {
  Field,
  Input,
  NumberStepper,
  SearchInput,
  Textarea,
} from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Checkbox, Switch } from "@/components/ui/selection";
import { SectionHeader } from "@/components/shared/SectionHeader";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="spec-row">
      <span className="spec-label">{label}</span>
      <div className="spec-items">{children}</div>
    </div>
  );
}

function Guide() {
  const [tab, setTab] = useState("combat");
  const [seg, setSeg] = useState<"all" | "prep">("all");
  const [on, setOn] = useState(true);
  const [count, setCount] = useState(3);
  const [query, setQuery] = useState("Fireball");
  return (
    <div className="wb spec-column">
      <h2 className="spec-theme">Folio style guide</h2>

      <section className="folio-panel spec-panel">
        <SectionHeader title="Voices" />
        <h1 className="page-title spec-title">Lyra Voss</h1>
        <p className="spec-body">
          As a Bonus Action you imbue one weapon with positive energy. For 1 minute you
          add your Charisma modifier to its attack rolls.
        </p>
        <p className="spec-body" lang="it">
          Un&apos;abilità di 3º livello che infligge 8d6 danni da fuoco in un&apos;area di
          6 metri.
        </p>
        <Row label="Labels">
          <span className="es-eyebrow">Armor Class · Initiative · Speed</span>
        </Row>
        <Row label="Numbers">
          <span className="spec-numbers">AC 18 · HP 42/58 · 1d8+2 · +7 · DC 15</span>
        </Row>
        <Row label="Ink ramp">
          <span style={{ color: "var(--text-muted)" }}>Muted</span>
          <span style={{ color: "var(--text-secondary)" }}>Secondary</span>
          <span style={{ color: "var(--text-primary)" }}>Primary</span>
          <span style={{ color: "var(--accent-text)" }}>Gilt</span>
        </Row>
      </section>

      <section className="folio-panel spec-panel">
        <SectionHeader title="Buttons" />
        <Row label="Primary">
          <Button variant="primary">End turn</Button>
          <Button variant="primary" disabled>
            End turn
          </Button>
        </Row>
        <Row label="Others">
          <Button variant="secondary">Short rest</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="destructive">
            <Icon as={Trash2} size="sm" decorative />
            Delete
          </Button>
          <Button variant="dashed">Add item</Button>
        </Row>
        <Row label="Attack">
          <button
            type="button"
            className="cc-btn"
            style={{ ["--at-c" as string]: "var(--at-action)" }}
          >
            Attack
          </button>
        </Row>
      </section>

      <section className="folio-panel spec-panel">
        <SectionHeader title="Tabs and chips" />
        <div className="tabstrip-shell">
          <div role="tablist" aria-label="Specimen tabs" className="tabstrip">
            {["combat", "spells", "inventory"].map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {id === "combat" ? "Combat" : id === "spells" ? "Spells" : "Inventory"}
              </button>
            ))}
          </div>
        </div>
        <div className="sheet-page spec-page">Tab panel</div>
        <Row label="Segmented">
          <Segmented
            aria-label="Specimen filter"
            value={seg}
            onChange={setSeg}
            options={[
              { value: "all", label: "All" },
              { value: "prep", label: "Prepared" },
            ]}
          />
        </Row>
        <Row label="Badges">
          <Badge>Concentration</Badge>
          <Badge variant="outline">Ritual</Badge>
          <Badge variant="muted">Cantrip</Badge>
          <Badge color="var(--amethyst-300)" ink="var(--amethyst-100)">
            Frightened
          </Badge>
        </Row>
      </section>

      <section className="folio-panel spec-panel">
        <SectionHeader title="Inputs" />
        <Field label="Character name" help="Shown on the sheet and the campaign.">
          {(props) => <Input {...props} defaultValue="Lyra Voss" />}
        </Field>
        <Field label="Notes" error="Too long for a note.">
          {(props) => (
            <Textarea {...props} defaultValue="Met a goblin scout at the bridge." />
          )}
        </Field>
        <Row label="Search">
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            clearLabel="Clear"
            placeholder="Search spells…"
          />
        </Row>
        <Row label="Stepper">
          <NumberStepper
            value={count}
            onChange={setCount}
            min={0}
            max={9}
            ariaLabel="Count"
          />
        </Row>
        <Row label="Toggles">
          <Switch checked={on} onCheckedChange={setOn} aria-label="Specimen switch" />
          <Checkbox defaultChecked aria-label="Specimen checkbox" />
        </Row>
        <div className="spec-well">A recessed well inside a panel.</div>
      </section>

      <section className="spec-panel spec-chrome">
        <SectionHeader title="Dialog, menu, toast" />
        <div className="modal spec-modal">
          <div className="modal-head">
            <div className="min-w-0 flex-1">
              <div className="modal-title">Rest</div>
              <p className="modal-subtitle">Spend Hit Dice or take a Long Rest.</p>
            </div>
          </div>
          <div className="spec-modal-body">Dialog body</div>
        </div>
        <div className="settings-pop popover spec-menu">
          <div className="pop-body" role="menu" aria-label="Specimen menu">
            <button type="button" role="menuitem" className="menu-item">
              <Icon as={Copy} decorative />
              Duplicate
            </button>
            <button type="button" role="menuitem" className="menu-item">
              <Icon as={Pencil} decorative />
              Rename
            </button>
            <div className="menu-div" role="separator" />
            <button type="button" role="menuitem" className="menu-item danger">
              <Icon as={Trash2} decorative />
              Delete
            </button>
          </div>
        </div>
        <div className="toast spec-toast">
          <span className="t-txt">Fireball cast · level 3 slot spent</span>
          <Button variant="ghost" size="sm" className="t-undo">
            Undo
          </Button>
        </div>
      </section>
    </div>
  );
}

export function SpecimensPage(): ReactNode {
  return (
    <main className="spec-page-root">
      <Guide />
    </main>
  );
}
