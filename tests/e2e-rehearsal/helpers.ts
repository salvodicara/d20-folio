/**
 * Shared steps for the release rehearsal. The emulator sandbox signs the browser in
 * as its DM (`owner@sandbox.dev`, a real Auth-emulator account); `?devActAs=<uid>`
 * presents a tab as a campaign member while the real token stays the DM's.
 */
import { expect, type Page } from "@playwright/test";

export const SANDBOX_CAMPAIGN = "SANDBOX";
export const PLAYER_BARD = "dev-player-catalion";

/** The emulator project's Firestore REST root (read-only checks, never writes). */
const FIRESTORE =
  "http://127.0.0.1:8080/v1/projects/demo-d20folio/databases/(default)/documents";

/** The DM's characters, read straight from the emulator. */
export async function ownerCharacterIds(): Promise<string[]> {
  const response = await fetch(`${FIRESTORE}/users/dev-owner/characters`, {
    headers: { Authorization: "Bearer owner" },
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
  await expect(confirm).toBeVisible({ timeout: 60_000 });
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
  catalion: { email: "catalion@sandbox.dev", characterId: "sandbox-catalion" },
  mandorlino: { email: "mandorlino@sandbox.dev", characterId: "sandbox-mandorlino" },
} as const;

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
      /\/node_modules\/\.vite\/deps\/firebase_auth\.js\?v=[0-9a-f]+/
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
export function actionRow(page: Page, name: string) {
  return page
    .locator(".f-act")
    .filter({ has: page.locator(".f-row-main", { hasText: new RegExp(`^${name}`) }) })
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
