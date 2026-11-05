/**
 * A state on a monster that changes its saves against ONE caster's spells, in a real
 * fight, Italian, dark theme, desktop. The state is seeded on the Goblin
 * (`d20-dev-combat-effects`); the viewer's evoker casts Fireball at the three monsters
 * and the tray's Goblin row names the mode and its source, only when the evoker is the
 * creature that put the state there.
 *
 * The cases (a feature and the chip it reads) live in the private pack
 * (`content-pack/fixtures/e2e/incoming-save-chips.json`): the features that give such
 * states are not SRD, so without the pack the spec skips. A review shot lands under
 * REVIEW_SHOTS when set, else in the test output dir.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";
import { DESKTOP, freezeMotion, seedLang, seedUI } from "./surfaces";

// Cold dev-server compiles under parallel workers can exceed the default 30 s.
test.describe.configure({ timeout: 90_000 });

interface ChipCase {
  name: string;
  /** The effect's identity: id, source and payload (the fight's part is added here). */
  effect: Record<string, unknown>;
  /** The chip the row reads, in Italian. */
  chipIt: string;
}

const CASES_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../content-pack/fixtures/e2e/incoming-save-chips.json"
);
const CASES: ChipCase[] = existsSync(CASES_FILE)
  ? (JSON.parse(readFileSync(CASES_FILE, "utf8")) as ChipCase[])
  : [];

/** The viewer's evoker in the dev fight, and the other PC (`d20-dev-combat-ally`). */
const ME = "pc-mock-uid";
const ALLY = "pc-mock-ally";

function shotPath(name: string): string {
  const dir = process.env.REVIEW_SHOTS;
  return dir ? `${dir}/${name}` : test.info().outputPath(name);
}

/** The case's state on the Goblin (`monster-1`), put there by `actor` until the
 *  start of its next turn. */
function stateOnGoblin(c: ChipCase, actor: string) {
  return {
    ...c.effect,
    actor: { kind: "pc", combatantId: actor, memberUid: "mock-uid", characterId: "x" },
    target: { kind: "monster", combatantId: "monster-1" },
    duration: {
      kind: "turn-boundary",
      combatantId: actor,
      round: 3,
      phase: "turn-start",
    },
  };
}

/** The evoker's own turn against Goblin, Goblin Chief and Ogre with the state seeded,
 *  then Fireball at all three: returns the open tray. */
async function fireballAtAll(page: Page, effect: unknown) {
  await page.setViewportSize(DESKTOP);
  await seedLang(page, "it");
  await seedUI(page, "dark", "play");
  await page.addInitScript(
    (seeded) => {
      window.localStorage.setItem("d20-dev-combat-chronicle", "1");
      window.localStorage.setItem("d20-dev-combat-ally", "1");
      window.localStorage.setItem("d20-dev-combat-effects", seeded);
    },
    JSON.stringify([effect])
  );
  await page.goto("/characters/scn-evoker-wizard?tab=play");
  await expect(page.locator('.turn[data-phase="my-turn"]')).toBeVisible({
    timeout: 45_000,
  });
  const allChip = page.getByRole("button", { name: /^tutti$/i });
  if (await allChip.isVisible()) await allChip.click();
  await freezeMotion(page);

  await page
    .getByRole("button", { name: /^Lancia: Palla di Fuoco/ })
    .first()
    .click();
  await page.getByRole("button", { name: /^Slot di livello 3/ }).click();
  const picker = page.getByRole("dialog", { name: /su chi\?/i });
  const enemies = picker.locator('.cl-target[data-side="enemy"]');
  await expect(enemies).toHaveCount(3);
  for (let i = 0; i < 3; i++) await enemies.nth(i).click();
  await picker.getByRole("button", { name: "Lancia su 3" }).click();

  const tray = page.getByTestId("damage-tray");
  await expect(tray).toBeVisible();
  await expect(tray.getByTestId("damage-tray-row")).toHaveCount(3);
  return tray;
}

test("the private pack's cases are present", () => {
  test.skip(!existsSync(CASES_FILE), "SRD-only build: no pack cases");
  expect(CASES.length).toBeGreaterThan(0);
});

for (const [i, c] of CASES.entries()) {
  test(`case ${i + 1}: the marking caster's spell shows the chip on the Goblin's row`, async ({
    page,
  }) => {
    test.info().annotations.push({ type: "case", description: c.name });
    const tray = await fireballAtAll(page, stateOnGoblin(c, ME));
    const goblin = tray
      .getByTestId("damage-tray-row")
      .filter({ hasText: "Goblin" })
      .filter({ hasNotText: "Chief" });
    await expect(goblin.getByText(c.chipIt, { exact: true })).toBeVisible();
    // Only the marked creature: the Goblin Chief's and the Ogre's rows carry none.
    await expect(tray.getByText(c.chipIt, { exact: true })).toHaveCount(1);
    await page.screenshot({ path: shotPath(`incoming-save-chip-${i + 1}.png`) });
  });

  test(`case ${i + 1}: another PC's mark gives no chip on this caster's spell`, async ({
    page,
  }) => {
    test.info().annotations.push({ type: "case", description: c.name });
    const tray = await fireballAtAll(page, stateOnGoblin(c, ALLY));
    await expect(tray.getByText(c.chipIt, { exact: true })).toHaveCount(0);
  });
}
