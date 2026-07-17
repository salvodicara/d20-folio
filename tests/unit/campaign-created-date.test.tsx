/**
 * campaign-created-date — the PERMANENT end-to-end guard for the "Iniziata {date}"
 * ("Started {date}") start-date on a NEWLY-created campaign card.
 *
 * THE BUG. `createCampaign` routed its `createdAt`/`updatedAt` `serverTimestamp()`
 * sentinels THROUGH `stripUndefined`. A `FieldValue` sentinel is a plain class instance
 * with one enumerable field (`_methodName`), so `stripUndefined` (which special-cases
 * only Date/Timestamp) recursed INTO it and flattened it to a dead
 * `{ _methodName: "serverTimestamp" }` map. Firestore then persisted that map instead of
 * stamping the server time, so an app-created campaign's `createdAt` read back as a plain
 * object (never a Date) and the list card's start date never rendered.
 *
 * THIS TEST drives the REAL pipeline Firebase-free (the fix lives across the io + read
 * boundary, so this exercises both):
 *   1. the REAL `createCampaign` through the REAL `stripUndefined`, with a FAITHFUL
 *      `serverTimestamp` double (a class instance with an enumerable `_methodName`, like
 *      the real sentinel) + a `setDoc` that captures the written payload;
 *   2. the backend's resolve step — replace each still-INTACT sentinel INSTANCE with a
 *      Timestamp (Firestore resolves a real sentinel; it can NOT resolve a flattened
 *      map, which is exactly why the bug produced a non-Date);
 *   3. the REAL `listSharedCampaigns` → `toCampaignDoc` read boundary + a real
 *      `CampaignsListPage` render, asserting the card shows "Started {date}".
 *
 * The discriminator: the fix keeps the sentinel a resolvable INSTANCE (→ Timestamp →
 * Date → the card shows the date). Reverting the fix (sentinel through `stripUndefined`)
 * flattens it to a plain map the resolve step leaves untouched → not a Date → no start
 * date → this test fails.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18n from "@/i18n";

/** A faithful `serverTimestamp()` FieldValue double: a class instance carrying ONE
 *  enumerable field, exactly like the real `ServerTimestampFieldValueImpl` — so the
 *  REAL `stripUndefined` mangles it the SAME way the real one did (into `{ _methodName }`)
 *  if (and only if) it is ever routed through the strip. */
class FakeServerTimestamp {
  _methodName = "serverTimestamp";
}

/** A minimal Firestore `Timestamp` double the read boundary duck-types via `toDate()`. */
class FakeTimestamp {
  private readonly date: Date;
  constructor(date: Date) {
    this.date = date;
  }
  toDate(): Date {
    return this.date;
  }
}

/** The captured `setDoc` writes, keyed by the campaign document id. */
const writes = new Map<string, Record<string, unknown>>();
/** The docs the mocked `getDocs` should return for the list read (set per-test). */
let listDocs: Array<{ id: string; data: () => Record<string, unknown> }> = [];

const { navigateSpy } = vi.hoisted(() => ({ navigateSpy: vi.fn() }));

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/lib/firebase", () => ({ db: { __db: true } }));
// Storage transitively imports firebase — stub it so the suite stays Firebase-free (CI).
vi.mock("@/lib/storage", () => ({
  deleteCampaignBanner: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (
    sel: (s: {
      user: { uid: string; photoURL: string | null };
      profile: { displayName: string };
    }) => unknown
  ) => sel({ user: { uid: "u1", photoURL: null }, profile: { displayName: "Tav" } }),
}));
vi.mock("@/stores/toastStore", () => ({
  useToastStore: { getState: () => ({ showToast: vi.fn() }) },
}));
vi.mock("@/stores/confirmStore", () => ({
  useConfirmStore: { getState: () => ({ confirm: vi.fn() }) },
}));
vi.mock("react-router", async (imp) => {
  const actual = await imp<typeof import("react-router")>();
  return { ...actual, useNavigate: () => navigateSpy };
});
// A faithful firebase/firestore double: serverTimestamp returns the sentinel INSTANCE,
// setDoc captures the written payload, getDocs replays the resolved doc for the list.
vi.mock("firebase/firestore", () => ({
  serverTimestamp: () => new FakeServerTimestamp(),
  setDoc: (ref: { id: string }, data: Record<string, unknown>) => {
    writes.set(ref.id, data);
    return Promise.resolve();
  },
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  collection: (...a: unknown[]) => ({ __col: a }),
  query: (...a: unknown[]) => ({ __q: a }),
  where: (...a: unknown[]) => ({ __where: a }),
  getDocs: () => Promise.resolve({ docs: listDocs }),
  // Unused-by-this-test exports campaign-io imports at module load — inert stubs.
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  onSnapshot: vi.fn(() => () => {}),
  arrayUnion: (...a: unknown[]) => ({ __arrayUnion: a }),
  arrayRemove: (...a: unknown[]) => ({ __arrayRemove: a }),
  deleteField: () => ({ __deleteField: true }),
  limit: (...a: unknown[]) => ({ __limit: a }),
  runTransaction: vi.fn(),
  writeBatch: vi.fn(),
}));

import { createCampaign, listSharedCampaigns } from "@/features/campaigns/campaign-io";
import { CampaignsListPage } from "@/features/campaigns/CampaignsListPage";

/** Firestore's server-side resolve: an INTACT sentinel instance becomes a Timestamp;
 *  a flattened `{ _methodName }` map (the bug) is a plain object and stays untouched. */
function resolveSentinels(value: unknown, ts: FakeTimestamp): unknown {
  if (value instanceof FakeServerTimestamp) return ts;
  if (Array.isArray(value)) return value.map((v) => resolveSentinels(v, ts));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveSentinels(v, ts);
    return out;
  }
  return value;
}

describe("campaign-created-date — a new campaign's card shows the start date", () => {
  beforeEach(() => {
    writes.clear();
    listDocs = [];
    navigateSpy.mockClear();
  });

  it("createCampaign → resolved Timestamp → the list card renders 'Started {date}'", async () => {
    // 1. Create through the REAL io the modal calls (identical args to CreateCampaignModal).
    const code = await createCampaign("u1", { name: "Goblins", displayName: "Tav" });
    const written = writes.get(code);
    expect(written).toBeDefined();

    // The fix's core invariant: createdAt/updatedAt are written as the RAW, resolvable
    // sentinel INSTANCE — NOT flattened by stripUndefined into a `{ _methodName }` map.
    expect(written?.createdAt).toBeInstanceOf(FakeServerTimestamp);
    expect(written?.updatedAt).toBeInstanceOf(FakeServerTimestamp);

    // 2. The backend resolves the sentinels to a real Timestamp (a fixed instant).
    const startedOn = new Date("2026-06-15T12:00:00.000Z");
    const resolved = resolveSentinels(written, new FakeTimestamp(startedOn)) as Record<
      string,
      unknown
    >;

    // 3. Read back through the REAL list boundary (listSharedCampaigns → toCampaignDoc),
    //    then render the real list page and assert the card's start date is present.
    listDocs = [{ id: code, data: () => resolved }];
    const [parsed] = await listSharedCampaigns("u1");
    expect(parsed?.createdAt).toBeInstanceOf(Date); // the sentinel resolved to a Date

    const { container } = render(
      <MemoryRouter>
        <CampaignsListPage />
      </MemoryRouter>
    );

    await screen.findByText("Goblins");
    // The card composes `DM Tav · Started {date}` in the `.ch-sub` line. Assert the
    // localized start-date segment, formatted exactly as the card does (short date in
    // the active locale) — proving `createdAt` reached the card as a real Date.
    const expectedDate = startedOn.toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const sub = container.querySelector(".ch-sub");
    expect(sub?.textContent).toContain(
      i18n.t("campaigns.cardStarted", { date: expectedDate })
    );
  });
});
