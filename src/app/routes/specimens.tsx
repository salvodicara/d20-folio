/**
 * Specimens — the DEV-ONLY living type specimen of "The Gilded Plate", the
 * typography system of the BG3-identity epic (owner-ratified 2026-07-02):
 *
 *   · Cinzel (--font-title) — ceremonial titling, caps-only face, never <14px
 *   · Alegreya (--font-display / --font-body) — content headings + prose
 *   · Source Serif 4 (--font-numeric) — numbers, stats, uppercase labels,
 *     tabular lining figures
 *
 * The section renders through the CANONICAL tokens and recipes (no local font
 * imports or overrides — the faces load once in main.tsx), so this page always
 * shows the type system exactly as the app ships it. Mounted behind
 * `import.meta.env.DEV` in router.tsx (same gating as the crash probes), so it
 * does not exist in the production bundle. Like the crash probes, this
 * dev-only surface hardcodes its strings — it is not a user-facing surface, so
 * the bilingual lock does not apply.
 */
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function SpecimensPage(): ReactNode {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg-page)",
        padding: "var(--sp-8) var(--sp-6)",
        display: "grid",
        gap: "var(--sp-8)",
        alignContent: "start",
        justifyContent: "center",
        gridTemplateColumns: "minmax(0, 960px)",
      }}
    >
      <section
        className="folio-panel gilt-frame"
        style={{ padding: "var(--sp-6)", display: "grid", gap: "var(--sp-4)" }}
      >
        <div className="rail-head" style={{ marginBottom: 0 }}>
          <span className="rh-diamond" aria-hidden="true" />
          <h5>The Gilded Plate — Cinzel · Alegreya · Source Serif 4</h5>
          <span className="rh-rule" aria-hidden="true" />
        </div>

        {/* Ceremonial page title (Cinzel) + content heading (Alegreya). */}
        <div>
          <h1
            className="page-title"
            style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--sp-1)" }}
          >
            Aldemaro della Fiamma
          </h1>
          <h2 className="es-title" style={{ margin: 0 }}>
            Channel Divinity: Sacred Weapon
          </h2>
        </div>

        {/* Uppercase tracked label row — the numeric-register label voice. */}
        <div className="es-eyebrow">Armor Class · Initiative · Speed</div>

        {/* Numeric register — stat row + a right-aligned tabular column. */}
        <div style={{ display: "flex", gap: "var(--sp-8)", alignItems: "flex-start" }}>
          <div
            style={{
              fontFamily: "var(--font-numeric)",
              fontSize: "var(--text-md)",
              color: "var(--text-primary)",
            }}
          >
            AC 18 · HP 42/58 · 1d8+2 · +7 · DC 15
          </div>
          <div
            style={{
              fontFamily: "var(--font-numeric)",
              fontSize: "var(--text-md)",
              color: "var(--text-secondary)",
              textAlign: "right",
              minWidth: "4ch",
              lineHeight: "var(--leading-snug)",
            }}
          >
            18
            <br />7<br />
            115
            <br />3
          </div>
        </div>

        {/* Body copy — EN + IT at the app's 15px body size. */}
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-base)",
            lineHeight: "var(--leading-relaxed)",
            color: "var(--text-secondary)",
            maxWidth: "var(--measure)",
            display: "grid",
            gap: "var(--sp-2)",
          }}
        >
          <p style={{ margin: 0 }}>
            As a Bonus Action, you can imbue one weapon that you are holding with positive
            energy. For 1 minute, you add your Charisma modifier to attack rolls made with
            that weapon, and each hit deals an extra <em>1d8 radiant damage</em> to the
            target.
          </p>
          <p style={{ margin: 0 }} lang="it">
            È un&apos;abilità di 3º livello che infligge 8d6 danni da fuoco in
            un&apos;area di 6 metri; ogni creatura nell&apos;area deve superare un tiro
            salvezza su Destrezza o subire <em>danni pieni</em> — perché la città è già in
            fiamme, e l&apos;eroe non può più aspettare.
          </p>
        </div>

        {/* Verb+object buttons — the .btn recipe rides var(--font-numeric). */}
        <div style={{ display: "flex", gap: "var(--sp-3)" }}>
          <Button variant="primary">Cast Fireball</Button>
          <Button variant="ghost">Add Item</Button>
        </div>

        {/* ── Palette probe (Phase-0 T2) — the BG3 palette-foundation tiers on
            one strip: the warm text ramp ending in --text-special, the focus
            wash + grounded illumination on a focused button (autoFocus =
            programmatic :focus-visible on load), and the two scrim tiers. ── */}
        <div className="es-eyebrow">Palette Probe — Text Ramp · Focus Wash · Scrims</div>
        <div style={{ display: "grid", gap: "var(--sp-1)", fontSize: "var(--text-md)" }}>
          <span style={{ color: "var(--text-muted)" }}>
            Muted — marginalia and labels
          </span>
          <span style={{ color: "var(--text-secondary)" }}>
            Secondary — reading prose and descriptions
          </span>
          <span style={{ color: "var(--text-primary)" }}>
            Primary — the sheet&apos;s main ink
          </span>
          <span style={{ color: "var(--text-special)", fontWeight: 600 }}>
            Special — the lit emphasis: the name of the thing you&apos;re reading
          </span>
        </div>
        <div style={{ display: "flex", gap: "var(--sp-4)", alignItems: "center" }}>
          <Button variant="ghost" autoFocus>
            Focused Control
          </Button>
          {(["--scrim-dim", "--scrim-heavy"] as const).map((token) => (
            <span
              key={token}
              style={{
                display: "inline-grid",
                placeItems: "center",
                width: "9rem",
                height: "2.5rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-medium)",
                /* Each scrim tier laid over a light gold base (stand-in for the
                   content it would dim) so 46% vs 75% read side by side. */
                background: `linear-gradient(var(${token}), var(${token})), var(--gold-leaf-100)`,
                color: "#ffffff",
                fontFamily: "var(--font-numeric)",
                fontSize: "var(--text-xs)",
                letterSpacing: "var(--tracking-wide)",
              }}
            >
              {token}
            </span>
          ))}
        </div>

        {/* Small-size legibility probes: Cinzel at its 14px floor (never below),
            beside the numeric register's 13px tracked-label voice. */}
        <div style={{ display: "flex", gap: "var(--sp-6)", alignItems: "baseline" }}>
          <span
            style={{
              fontFamily: "var(--font-title)",
              fontSize: "14px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            Spell Save DC — Cinzel 14px floor
          </span>
          <span
            style={{
              fontFamily: "var(--font-numeric)",
              fontSize: "13px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            Proficiency +3 — Source Serif 4 13px
          </span>
        </div>
      </section>
    </main>
  );
}
