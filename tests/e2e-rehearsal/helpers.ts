/**
 * Shared steps for the release rehearsal. The emulator sandbox signs the browser in
 * as its DM (`owner@sandbox.dev`, a real Auth-emulator account); `?devActAs=<uid>`
 * presents a tab as a campaign member while the real token stays the DM's.
 */
import { execFileSync } from "node:child_process";
import { test as base, expect, type Page } from "@playwright/test";
import { visibleWithin } from "../e2e/visible-within";
import { teamFixtureName } from "../e2e/team-fixture";
import { SESSION_GAP_MS } from "../../src/lib/session-log/recorder";

/**
 * The rehearsal's `test`: the browser contexts a test opens itself (a DM, a player)
 * close when it ends. Playwright closes only the ones its fixtures made, so the next
 * spec used to run beside every earlier spec's open tabs, still listening and writing.
 */
export const test = base.extend<{ closeOpenedContexts: undefined }>({
  closeOpenedContexts: [
    async ({ browser }, use) => {
      const before = new Set(browser.contexts());
      await use(undefined);
      await Promise.all(
        browser
          .contexts()
          .filter((context) => !before.has(context))
          .map((context) => context.close())
      );
    },
    { auto: true },
  ],
});

export const SANDBOX_CAMPAIGN = "SANDBOX";
export const PLAYER_BARD = "dev-player-bard";

/** The sandbox heroes' character names, read from the pack (personal data, never
 *  written in public code): the full name, and the first word some rows show. */
export const BARD_NAME = teamFixtureName("bard") ?? "";
export const BARD_FIRST = BARD_NAME.split(" ")[0] ?? "";
export const PALADIN_NAME = teamFixtureName("paladin") ?? "";

/** The emulator project's Firestore REST root (read-only checks; the one write is
 *  {@link startNewSitting}'s). */
const FIRESTORE =
  "http://127.0.0.1:8080/v1/projects/demo-d20folio/databases/(default)/documents";
const OWNER = { Authorization: "Bearer owner" };

/**
 * Make the sandbox campaign's next gesture open a new sitting of its session log, as
 * an evening played after a long pause does (`nextSessionId`): every stored sitting's
 * last write moves back past the gap. Lines already stored keep their own times. A
 * spec that reads one evening's report then reads only its own lines, whatever the
 * earlier specs of the same day recorded.
 */
export async function startNewSitting(): Promise<void> {
  const logs = `${FIRESTORE}/campaigns/${SANDBOX_CAMPAIGN}/sessionLogs`;
  const response = await fetch(`${logs}?pageSize=300&mask.fieldPaths=lastAt`, {
    headers: OWNER,
  });
  if (!response.ok) throw new Error(`session logs: HTTP ${String(response.status)}`);
  const body = (await response.json()) as {
    documents?: Array<{
      name: string;
      fields?: { lastAt?: { integerValue?: string; doubleValue?: number } };
    }>;
  };
  const sittings = (body.documents ?? []).map((doc) => ({
    id: doc.name.split("/").at(-1) ?? "",
    lastAt: Number(
      doc.fields?.lastAt?.integerValue ?? doc.fields?.lastAt?.doubleValue ?? Date.now()
    ),
  }));
  // Each one moves by the same span, so the newest stays the newest. The span puts the
  // newest a gap and an hour before now, even when a spec's faked clock wrote it in
  // the future (an hour ahead: it stayed the open sitting, and the next evening joined it).
  const newest = Math.max(Date.now(), ...sittings.map((s) => s.lastAt));
  const back = SESSION_GAP_MS + 60 * 60 * 1000 + (newest - Date.now());
  for (const { id, lastAt } of sittings) {
    const patched = await fetch(`${logs}/${id}?updateMask.fieldPaths=lastAt`, {
      method: "PATCH",
      headers: { ...OWNER, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: { lastAt: { integerValue: String(Math.round(lastAt - back)) } },
      }),
    });
    if (!patched.ok) throw new Error(`session log ${id}: HTTP ${String(patched.status)}`);
  }
}

/** The spell a hero concentrates on, as stored on the emulator ("" when none). */
export async function storedConcentration(
  uid: string,
  characterId: string
): Promise<string> {
  const response = await fetch(
    `${FIRESTORE}/users/${uid}/characters/${characterId}/combat/state?mask.fieldPaths=playState.state.concentration`,
    { headers: OWNER }
  );
  if (!response.ok) throw new Error(`combat state: HTTP ${String(response.status)}`);
  const body = (await response.json()) as {
    fields?: {
      playState?: {
        mapValue?: {
          fields?: {
            state?: {
              mapValue?: { fields?: { concentration?: { stringValue?: string } } };
            };
          };
        };
      };
    };
  };
  return (
    body.fields?.playState?.mapValue?.fields?.state?.mapValue?.fields?.concentration
      ?.stringValue ?? ""
  );
}

/** The DM's characters, read straight from the emulator. */
export async function ownerCharacterIds(): Promise<string[]> {
  const response = await fetch(`${FIRESTORE}/users/dev-owner/characters`, {
    headers: OWNER,
  });
  const body = (await response.json()) as { documents?: Array<{ name: string }> };
  return (body.documents ?? []).map((doc) => doc.name.split("/").at(-1) ?? "");
}

/** Fail fast on the app's error screen instead of waiting out a timeout. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Maximum update depth|Unhandled/i.test(message.text())
    )
      errors.push(message.text());
  });
  return errors;
}

export async function expectNoCrash(page: Page): Promise<void> {
  await expect(
    page.getByText(/Something went wrong|Qualcosa è andato storto/)
  ).toHaveCount(0);
}

/** Quick build: a class, a species, a name → the new sheet. Returns its id. */
export async function quickBuild(
  page: Page,
  opts: { className: string; species: string; name: string }
): Promise<string> {
  await page.goto("/characters/new?rapid=1");
  await page.getByRole("button", { name: opts.className, exact: true }).click();
  await page
    .getByRole("button", { name: new RegExp(`^${opts.species}\\b`) })
    .first()
    .click();
  await page.getByRole("textbox", { name: /character name/i }).fill(opts.name);
  await page.getByRole("button", { name: `Create ${opts.name}` }).click();
  await expect(page).toHaveURL(/\/characters\/(?!new)[^/?]+/, { timeout: 30_000 });
  return new URL(page.url()).pathname.split("/")[2] ?? "";
}

/** Open a character of the sandbox account by its name, from the character list. */
export async function openCharacter(page: Page, name: string): Promise<string> {
  await page.goto("/characters");
  await page
    .getByRole("link", { name: new RegExp(name) })
    .first()
    .click();
  await expect(page).toHaveURL(/\/characters\/[^/?]+$/, { timeout: 30_000 });
  await expect(page.locator(".f-char")).toBeVisible({ timeout: 60_000 });
  return new URL(page.url()).pathname.split("/")[2] ?? "";
}

/**
 * One level-up through the new screen, as a player in a hurry makes it: the average
 * Hit Points, the named subclass (or feat) when the level asks for one, and the first
 * options of every other open pick, until "Confirm level N" is all that is left.
 */
export async function levelUp(
  page: Page,
  id: string,
  opts: { level: number; className: string; prefer?: string[] }
): Promise<void> {
  await page.goto(`/characters/${id}/level-up`);
  const confirm = page.getByRole("button", { name: `Confirm level ${opts.level}` });
  // A loaded Mac took over a minute to open this screen once (2026-11-07).
  await expect(confirm).toBeVisible({ timeout: 120_000 });
  for (const name of opts.prefer ?? []) {
    const option = page.getByRole("button", { name, exact: true }).first();
    if (
      (await option.count()) > 0 &&
      (await option.getAttribute("aria-pressed")) !== "true"
    )
      await option.click();
  }
  for (let round = 0; round < 10; round++) {
    let clicked = 0;
    for (const section of await page.locator("section.f-lvl-sec").all()) {
      const counter = (await section.innerText()).match(/(\d+)\/(\d+)/);
      if (!counter) continue;
      let need = Number(counter[2]) - Number(counter[1]);
      if (need <= 0) continue;
      const options = section
        .locator("[role=group]")
        .last()
        .locator("button[aria-pressed=false]:not([disabled])");
      for (const option of await options.all()) {
        if (need <= 0) break;
        await option.click();
        need -= 1;
        clicked += 1;
      }
    }
    if (clicked === 0) break;
  }
  await expect(page.getByText(/choices? still to make/)).toHaveCount(0);
  await confirm.click();
  await expect(page).toHaveURL(new RegExp(`/characters/${id}$`), { timeout: 30_000 });
  await expect(page.locator("main")).toContainText(
    new RegExp(`${opts.className}\\s+${opts.level}\\b`)
  );
}

/** The sandbox players (scripts/dev-seed-sandbox.ts), each a real Auth-emulator account. */
export const SANDBOX_USERS = {
  bard: {
    uid: PLAYER_BARD,
    email: "bard@sandbox.dev",
    characterId: "sandbox-bard",
    fixture: "bard",
  },
  paladin: {
    uid: "dev-player-paladin",
    email: "paladin@sandbox.dev",
    characterId: "sandbox-paladin",
    fixture: "paladin",
  },
} as const;

type SandboxHero = (typeof SANDBOX_USERS)[keyof typeof SANDBOX_USERS];

/**
 * Put a sandbox hero back the way a spec needs it: by default as the sandbox seed made
 * it (its own fixture, level 3), so a spec never depends on what an earlier spec, or an
 * earlier run, left on the sheet. `fixture`, `level`, `active` (claimed states) and
 * `state` (play-state fields) override it. The campaign's copy of the hero follows.
 */
export function reseedHero(
  hero: SandboxHero,
  options: {
    fixture?: string;
    level?: number;
    active?: readonly string[];
    state?: Record<string, unknown>;
  } = {}
): void {
  execFileSync(
    "node",
    [
      "--import",
      "./scripts/alias-loader.mjs",
      "scripts/rehearsal-set-character.ts",
      hero.uid,
      hero.characterId,
      options.fixture ?? hero.fixture,
      String(options.level ?? 3),
      ...(options.active ?? []),
      ...(options.state ? [`--state=${JSON.stringify(options.state)}`] : []),
    ],
    { stdio: "inherit" }
  );
}

/**
 * Sign this page's browser context in as a sandbox player with a real token (not the
 * `?devActAs` view, whose writes still carry the DM's token and so take the DM's rule
 * path). The sandbox's own sign-in waits for the saved session, so the player stays
 * signed in across reloads. The password is the sandbox seed's local-only one.
 */
export async function signInAs(page: Page, email: string): Promise<void> {
  await page.goto("/characters");
  await expect(page.locator("main")).toBeVisible({ timeout: 60_000 });
  await page.evaluate(async (who) => {
    const source = await (await fetch("/src/lib/auth.ts")).text();
    const authPath = source.match(
      /\/node_modules\/\.vite[^/]*\/deps\/firebase_auth\.js\?v=[0-9a-f]+/
    )?.[0];
    if (!authPath) throw new Error("firebase/auth dep path not found");
    // Browser-side module paths (the dev server serves them); never resolved by tsc.
    const firebasePath = "/src/lib/firebase.ts";
    const firebase = (await import(/* @vite-ignore */ firebasePath)) as {
      auth: unknown;
    };
    const auth = (await import(/* @vite-ignore */ authPath)) as {
      signOut: (a: unknown) => Promise<void>;
      signInWithEmailAndPassword: (a: unknown, e: string, p: string) => Promise<unknown>;
    };
    await auth.signOut(firebase.auth);
    await auth.signInWithEmailAndPassword(firebase.auth, who, "d20-folio-local-only");
  }, email);
  await page.reload();
}

/** The toast the app shows after a move (its text), waiting for it. */
export async function expectToast(page: Page, text: RegExp): Promise<void> {
  await expect(
    page.locator("[role=status]").filter({ hasText: text }).first()
  ).toBeVisible();
}

/** A row of the Play screen's action list by its name, and its action button. */
/**
 * A name as a regex source where any space also matches a non-breaking one: the new
 * UI ties the last two words of row names, toasts and dialog titles together
 * («Warding\u00a0Bond»), so a typed space must not decide the match.
 */
export function spaced(name: string): string {
  return name.replace(/ /g, "\\s");
}

export function actionRow(page: Page, name: string) {
  return page
    .locator(".f-act")
    .filter({
      has: page.locator(".f-row-main", { hasText: new RegExp(`^${spaced(name)}`) }),
    })
    .first();
}

/** Open the campaign's Fight tab as whoever this page is signed in as. */
export async function openFightTab(page: Page): Promise<void> {
  await page.goto(`/campaigns/${SANDBOX_CAMPAIGN}`);
  await page
    .getByRole("tab", { name: "Fight" })
    .or(page.getByRole("button", { name: "Fight", exact: true }))
    .first()
    .click();
}

/** The class level the open sheet shows ("Bard 3 · …" → 3). */
export async function classLevel(page: Page, className: string): Promise<number> {
  const text = await page.locator("main").innerText();
  return Number(text.match(new RegExp(`${className}\\s+(\\d+)`))?.[1] ?? 0);
}

/**
 * The classic campaign hub: the DM types an initiative for each hero still missing one.
 * A hero's own-sheet roll can land meanwhile and redraw the cards, taking the field the
 * DM just opened; then the loop opens the next one instead of typing into nothing.
 */
export async function rollEachHero(dm: Page): Promise<void> {
  await expect(
    dm.getByRole("button", { name: /^Begin (turns|with)/ }).first()
  ).toBeVisible();
  await dm.waitForTimeout(1_500);
  for (let i = 0; i < 6; i++) {
    const roll = dm.getByRole("button", { name: "Roll initiative" }).first();
    if (!(await roll.isVisible())) break;
    const opened = await roll.click({ timeout: 3_000 }).then(
      () => true,
      () => false
    );
    if (!opened) continue;
    // A committed roll keeps its field on the card: the one just opened has focus.
    const input = dm.locator("input.init-edit-input:focus");
    if (!(await visibleWithin(input, 5_000))) continue;
    await input.fill(String(15 - i));
    await input.press("Enter");
  }
}

/**
 * Resolves once the page has sent the saved turn holding `actionId` (a Firestore write
 * of `turnEconomy` naming it). A reload waits for it: a reload within a second of an
 * act can still lose its write (#1178), which this step does not test.
 */
export function turnWriteSent(page: Page, actionId: string): Promise<unknown> {
  return page.waitForRequest(
    (request) => {
      if (!request.url().includes("Firestore/Write/channel")) return false;
      const body = decodeURIComponent((request.postData() ?? "").replace(/\+/g, " "));
      return body.includes("turnEconomy") && body.includes(actionId);
    },
    { timeout: 15_000 }
  );
}
