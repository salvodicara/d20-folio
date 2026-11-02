// DEV and preview only: every design-system piece on one page, pinned by Playwright screenshots
// (tests/e2e/ui-slice.spec.ts). Query: ?lang=en, ?room=study|sanctum|war-room|library|armoury, ?dialog=1, ?toast=1.
import { asLocale } from "@/lib/locale";
import { useState } from "react";
import { useSearchParams } from "react-router";
import {
  AppShell,
  Button,
  Chip,
  Dialog,
  Field,
  HpRing,
  Icon,
  ICON_NAMES,
  Panel,
  Room,
  Tabs,
  Toast,
  type RoomName,
} from "@/ui";

const T = {
  it: {
    title: "Elementi dell’interfaccia",
    sub: "Ogni pezzo del nuovo design, in italiano e in inglese.",
    buttons: "Bottoni",
    primary: "Crea personaggio",
    ghost: "Importa",
    quiet: "Annulla",
    danger: "Elimina per sempre",
    disabled: "Non disponibile",
    tabs: "Schede",
    tabItems: ["Azioni", "Incantesimi", "Inventario", "Privilegi", "Storia"],
    chips: "Scelte e stati",
    choice: ["1 minuto", "1 ora", "8 ore"],
    conc: "Benedizione · 9 round",
    cond: "Condizioni",
    buff: "Effetti",
    fields: "Campi",
    email: "La tua email",
    emailPh: "nome@example.com",
    code: "Codice d’invito",
    codeErr:
      "Nessuna campagna con questo codice. Controlla le lettere o chiedi un nuovo link al gruppo.",
    note: "Ogni link vale 1 ora e si usa una volta sola. Chiedine uno nuovo qui sotto.",
    hp: "Punti ferita",
    icons: "Icone (per significato)",
    panels: "Pannelli",
    resources: "Risorse",
    group: "Gruppo",
    treasure: "Cassa comune",
    loot: "Bottino",
    dialog: "Apri il dialogo",
    dlgTitle: "Lancia Benedizione",
    dlgBody: "Spendi uno slot di 1° e la tua azione. Dura 1 minuto, con concentrazione.",
    cast: "Lancia",
    close: "Chiudi",
    toast: "14 danni: 31 → 22 PF.",
    undo: "Annulla",
    label: "Sezioni della scheda",
    shell: {
      skip: "Vai al contenuto principale",
      home: "Folio, pagina iniziale",
      nav: ["Personaggi", "Campagne", "Compendio"],
      navLabel: "Principale",
      search: "Cerca nel compendio",
      menu: "Menu",
      account: "Il tuo account",
      settings: "Impostazioni",
      signOut: "Esci",
      foot: "Folio · Contenuto amatoriale non ufficiale",
    },
  },
  en: {
    title: "Interface pieces",
    sub: "Every piece of the new design, in Italian and English.",
    buttons: "Buttons",
    primary: "Create character",
    ghost: "Import",
    quiet: "Undo",
    danger: "Delete forever",
    disabled: "Not available",
    tabs: "Tabs",
    tabItems: ["Actions", "Spells", "Inventory", "Features", "Background"],
    chips: "Choices and states",
    choice: ["1 minute", "1 hour", "8 hours"],
    conc: "Bless · 9 rounds",
    cond: "Conditions",
    buff: "Effects",
    fields: "Fields",
    email: "Your email",
    emailPh: "name@example.com",
    code: "Invite code",
    codeErr:
      "No campaign with this code. Check the letters or ask the party for a new link.",
    note: "Each link lasts 1 hour and works once. Ask for a new one below.",
    hp: "Hit Points",
    icons: "Icons (by meaning)",
    panels: "Panels",
    resources: "Resources",
    group: "Party",
    treasure: "Shared chest",
    loot: "Loot",
    dialog: "Open the dialog",
    dlgTitle: "Cast Bless",
    dlgBody:
      "Spend a level 1 spell slot and your action. Lasts 1 minute, with concentration.",
    cast: "Cast",
    close: "Close",
    toast: "14 damage: 31 → 22 HP.",
    undo: "Undo",
    label: "Sheet sections",
    shell: {
      skip: "Skip to main content",
      home: "Folio, home page",
      nav: ["Characters", "Campaigns", "Compendium"],
      navLabel: "Primary",
      search: "Search the compendium",
      menu: "Menu",
      account: "Your account",
      settings: "Settings",
      signOut: "Sign out",
      foot: "Folio · Unofficial fan content",
    },
  },
};

const sec = { display: "grid", gap: 16, alignContent: "start" } as const;
const row = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" } as const;

export function UiStoriesPage() {
  const [q] = useSearchParams();
  const lang = asLocale(q.get("lang") ?? "it");
  const t = T[lang];
  const room = (q.get("room") ?? "study") as RoomName;
  const [tab, setTab] = useState("0");
  const [pick, setPick] = useState(1);
  const [open, setOpen] = useState(q.get("dialog") === "1");
  return (
    <div lang={lang}>
      <AppShell
        skipLabel={t.shell.skip}
        home="/ui"
        homeLabel={t.shell.home}
        nav={t.shell.nav.map((label, i) => ({ to: `/ui?lang=${lang}&area=${i}`, label }))}
        navLabel={t.shell.navLabel}
        searchLabel={t.shell.search}
        onSearch={() => undefined}
        menuLabel={t.shell.menu}
        account={{
          label: t.shell.account,
          initial: "S",
          name: "Selene Varga",
          email: "selene@example.com",
          actions: [
            { label: t.shell.settings, icon: "u-settings", onSelect: () => undefined },
            { label: t.shell.signOut, icon: "u-sign-out", onSelect: () => undefined },
          ],
        }}
        footer={<span>{t.shell.foot}</span>}
      >
        <Room room={room} />
        <main id="main" className="f-page">
          <header>
            <h1
              style={{
                margin: 0,
                font: "600 36px/1.1 var(--font-title)",
                color: "var(--strong)",
              }}
            >
              {t.title}
            </h1>
            <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>{t.sub}</p>
          </header>
          <div
            style={{
              display: "grid",
              gap: 24,
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 400px), 1fr))",
              alignItems: "start",
            }}
          >
            <Panel color="act" title={t.buttons}>
              <div style={row}>
                <Button kind="primary" icon="u-add">
                  {t.primary}
                </Button>
                <Button icon="u-download">{t.ghost}</Button>
                <Button kind="quiet">{t.quiet}</Button>
                <Button kind="danger" icon="u-delete">
                  {t.danger}
                </Button>
                <Button disabled>{t.disabled}</Button>
              </div>
            </Panel>
            <Panel color="act" title={t.tabs}>
              <Tabs
                label={t.label}
                value={tab}
                onChange={setTab}
                items={t.tabItems.map((l, i) => ({ id: String(i), label: l }))}
              />
            </Panel>
            <Panel color="res" title={t.chips}>
              <div style={sec}>
                <div className="f-chips">
                  {t.choice.map((c, i) => (
                    <Chip key={c} pressed={i === pick} onClick={() => setPick(i)}>
                      {c}
                    </Chip>
                  ))}
                </div>
                <div className="f-chips">
                  <Chip kind="conc">{t.conc}</Chip>
                  <Chip kind="buff">{t.buff}</Chip>
                  <Chip kind="cond">{t.cond}</Chip>
                </div>
              </div>
            </Panel>
            <Panel color="log" title={t.fields}>
              <div style={sec}>
                <Field label={t.email} placeholder={t.emailPh} type="email" />
                <Field label={t.code} defaultValue="CRIPTA-7K2" error={t.codeErr} />
                <div
                  className="f-note"
                  style={{ "--nc": "var(--c-log)" } as React.CSSProperties}
                >
                  {t.note}
                </div>
              </div>
            </Panel>
            <Panel color="ini" title={t.hp}>
              <div style={row}>
                <HpRing hp={31} max={38} temp={5} size={72} />
                <HpRing hp={17} max={38} size={72} />
                <HpRing hp={6} max={38} size={72} />
              </div>
            </Panel>
            <Panel color="cmp" title={t.icons}>
              <div style={{ ...row, color: "var(--gold)" }}>
                {ICON_NAMES.map((n) => (
                  <span
                    key={n}
                    title={n}
                    style={{
                      display: "inline-flex",
                      width: 40,
                      height: 40,
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid var(--line)",
                      borderRadius: 6,
                    }}
                  >
                    <Icon name={n} size={24} />
                  </span>
                ))}
              </div>
            </Panel>
            <Panel
              color="grp"
              title={t.group}
              aside={
                <Button kind="quiet" icon="u-link">
                  {t.ghost}
                </Button>
              }
            >
              <div style={sec}>
                <p style={{ margin: 0 }}>{t.sub}</p>
              </div>
            </Panel>
            <Panel
              color="tes"
              title={t.treasure}
              aside={
                <Button kind="quiet" icon="u-add">
                  {t.loot}
                </Button>
              }
              foot={
                <Button kind="primary" onClick={() => setOpen(true)}>
                  {t.dialog}
                </Button>
              }
            >
              <p style={{ margin: 0 }}>{t.note}</p>
            </Panel>
          </div>
        </main>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title={t.dlgTitle}
          color="res"
          closeLabel={t.close}
          actions={
            <>
              <Button onClick={() => setOpen(false)}>{t.quiet}</Button>
              <Button kind="primary">{t.cast}</Button>
            </>
          }
        >
          <p style={{ margin: 0 }}>{t.dlgBody}</p>
        </Dialog>
        {q.get("toast") === "1" && <Toast action={t.undo}>{t.toast}</Toast>}
      </AppShell>
    </div>
  );
}
