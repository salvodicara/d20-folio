/**
 * Rehearsal, classic UI: the DM's fight edits all reach the server, even when someone
 * else's write lands between two of them (a player's roll, a turn passed). The classic
 * screen used to hold its edits for a 2 s autosave: a snapshot landing in that window
 * put the server's fight back on screen, and the DM's next edit was saved over it, so
 * the first edit was lost.
 */
import { expect } from "@playwright/test";
import { rollEachHero, SANDBOX_CAMPAIGN, test, watchErrors } from "./helpers";

const CAMPAIGN = `http://127.0.0.1:8080/v1/projects/demo-d20folio/databases/(default)/documents/campaigns/${SANDBOX_CAMPAIGN}`;
const ADMIN = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const GOBLIN = "Goblin Minion";

interface StoredMonster {
  name: string;
  hidden: boolean;
  revealed: boolean;
}

/** The fight's monsters as the server holds them. */
async function serverMonsters(): Promise<StoredMonster[]> {
  const body = (await (await fetch(CAMPAIGN, { headers: ADMIN })).json()) as {
    fields?: Record<string, unknown>;
  };
  const values =
    (
      body.fields?.encounter as
        | {
            mapValue?: {
              fields?: { combatants?: { arrayValue?: { values?: unknown[] } } };
            };
          }
        | undefined
    )?.mapValue?.fields?.combatants?.arrayValue?.values ?? [];
  return values.flatMap((value) => {
    const fields = (
      value as {
        mapValue?: {
          fields?: Record<
            string,
            { stringValue?: string; booleanValue?: boolean } | undefined
          >;
        };
      }
    ).mapValue?.fields;
    const name = fields?.name?.stringValue;
    if (!fields || !name) return [];
    return [
      {
        name,
        hidden: fields.hidden?.booleanValue === true,
        revealed: fields.revealed?.booleanValue === true,
      },
    ];
  });
}

/** Someone else's write on the campaign (it touches no fight field): every open
 *  device receives a fresh snapshot of the campaign. */
async function someoneElseWrites(): Promise<void> {
  const response = await fetch(`${CAMPAIGN}?updateMask.fieldPaths=updatedAt`, {
    method: "PATCH",
    headers: ADMIN,
    body: JSON.stringify({
      fields: { updatedAt: { timestampValue: new Date().toISOString() } },
    }),
  });
  if (!response.ok) throw new Error(`campaign write ${response.status}`);
}

test("classic UI: the DM's fight edits survive another device's write between them", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const dm = await (await browser.newContext()).newPage();
  const errors = watchErrors(dm);

  await test.step("the DM runs a fight with a goblin in it", async () => {
    await dm.goto(`/campaigns/${SANDBOX_CAMPAIGN}`);
    await dm.getByRole("tab", { name: "Live" }).click();
    const end = dm.getByRole("button", { name: "End encounter" });
    if (await end.isVisible()) {
      await end.click();
      await dm.getByRole("dialog").getByRole("button", { name: "Skip" }).click();
    }
    await dm.getByRole("button", { name: "Run encounter" }).click();
    await rollEachHero(dm);
    await dm
      .getByRole("button", { name: /^Begin (turns|with)/ })
      .first()
      .click();
    await dm.getByRole("button", { name: "Add monster" }).first().click();
    const add = dm.getByRole("dialog");
    await add.getByRole("searchbox", { name: "Search" }).fill("goblin");
    await add.getByRole("button", { name: GOBLIN }).click();
    await add.getByRole("button", { name: "Add monster" }).click();
    if (await add.isVisible()) await add.getByRole("button", { name: "Close" }).click();
    await expect
      .poll(async () => (await serverMonsters()).map((m) => m.name), {
        message: "the goblin is on the server",
        timeout: 15_000,
      })
      .toContain(GOBLIN);
  });

  await test.step("reveal its HP, another write lands, then hide it: both stay", async () => {
    const row = dm.locator("li", { hasText: GOBLIN }).first();
    await row.getByRole("button", { name: GOBLIN, exact: true }).click();
    await row.getByRole("button", { name: "Reveal HP" }).click();
    await someoneElseWrites();
    // Long enough for the snapshot to reach the DM's screen, well inside the old 2 s
    // autosave window.
    await dm.waitForTimeout(600);
    await row.getByRole("button", { name: "Hide combatant" }).click();
    await expect
      .poll(async () => (await serverMonsters()).find((m) => m.name === GOBLIN), {
        message: "both edits are on the server",
        timeout: 10_000,
      })
      .toMatchObject({ hidden: true, revealed: true });
    // And they stay (a late autosave must not undo either).
    await dm.waitForTimeout(3_000);
    expect((await serverMonsters()).find((m) => m.name === GOBLIN)).toMatchObject({
      hidden: true,
      revealed: true,
    });
  });

  await test.step("five quick clicks, another write among them: the screen never goes back, the last one lands", async () => {
    const row = dm.locator("li", { hasText: GOBLIN }).first();
    // Revealed now: Hide HP, Reveal HP, Hide HP, Reveal HP, Hide HP → ends hidden.
    const labels = ["Hide HP", "Reveal HP", "Hide HP", "Reveal HP", "Hide HP"];
    for (const [index, label] of labels.entries()) {
      await row.getByRole("button", { name: label }).click();
      if (index === 2) await someoneElseWrites();
      // The click shows at once and stays: the next label is the opposite one.
      await expect(
        row.getByRole("button", { name: label === "Hide HP" ? "Reveal HP" : "Hide HP" })
      ).toBeVisible({ timeout: 2_000 });
    }
    await expect
      .poll(async () => (await serverMonsters()).find((m) => m.name === GOBLIN), {
        message: "the last click is on the server",
        timeout: 10_000,
      })
      .toMatchObject({ hidden: true, revealed: false });
    await dm.waitForTimeout(1_500);
    await expect(row.getByRole("button", { name: "Reveal HP" })).toBeVisible();
  });

  await test.step("offline, the DM's edits stay on screen and land when the network is back", async () => {
    const row = dm.locator("li", { hasText: GOBLIN }).first();
    await dm.context().setOffline(true);
    await row.getByRole("button", { name: "Reveal HP" }).click();
    await row.getByRole("button", { name: "Reveal combatant" }).click();
    await dm.waitForTimeout(2_000);
    await expect(row.getByRole("button", { name: "Hide HP" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Hide combatant" })).toBeVisible();
    expect((await serverMonsters()).find((m) => m.name === GOBLIN)).toMatchObject({
      hidden: true,
      revealed: false,
    });
    await dm.context().setOffline(false);
    await expect
      .poll(async () => (await serverMonsters()).find((m) => m.name === GOBLIN), {
        message: "the offline edits reach the server",
        timeout: 30_000,
      })
      .toMatchObject({ hidden: false, revealed: true });
  });

  await test.step("the DM ends the encounter", async () => {
    await dm.getByRole("button", { name: "End encounter" }).click();
    await dm.getByRole("dialog").getByRole("button", { name: "Skip" }).click();
  });

  expect.soft(errors).toEqual([]);
});
