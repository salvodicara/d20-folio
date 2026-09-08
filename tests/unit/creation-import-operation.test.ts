vi.mock("@/lib/firebase", () => ({}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase/firestore";
import { SessionController } from "@/lib/identity/session";
import { createImportRepository } from "@/lib/character-creation/import-repository";
import { analyzeImport, reviewImport } from "@/lib/character-creation/import-review";

const memory = vi.hoisted(() => new Map<string, unknown>());
vi.mock("firebase/firestore", () => {
  const snapshot = (path: string) => ({
    exists: () => memory.has(path),
    data: () => memory.get(path),
  });
  return {
    doc: (_db: unknown, path: string) => ({ path }),
    getDocFromServer: (ref: { path: string }) => Promise.resolve(snapshot(ref.path)),
    runTransaction: async (_db: unknown, action: (tx: unknown) => Promise<unknown>) => {
      const staged = new Map<string, unknown>();
      const result = await action({
        get: (ref: { path: string }) => Promise.resolve(snapshot(ref.path)),
        set: (ref: { path: string }, data: unknown) =>
          staged.set(ref.path, structuredClone(data)),
      });
      for (const [path, data] of staged) memory.set(path, data);
      return result;
    },
  };
});
beforeEach(() => {
  memory.clear();
  memory.set("users/owner", { status: "active" });
});

const original = JSON.stringify({
  schema: 3,
  edition: "2014",
  build: {
    name: "Elia",
    race: "human",
    classes: [{ classId: "wizard", level: 1 }],
    lore: { backstory: "Private narrative" },
    overrides: { hpMax: 11 },
  },
  state: { hp: { current: 7, temp: 2 } },
});
const review = reviewImport(analyzeImport(original), "2014", ["origins"]);
function client() {
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  return { session, repo: createImportRepository({} as Firestore, session) };
}
describe("reviewed import intent authority", () => {
  it("binds the same bytes to the same destination without exposing private originals in receipts", async () => {
    const { repo } = client();
    const a = await repo.intent(original, review),
      b = await repo.intent(original, review);
    expect(a.character).toEqual(b.character);
    expect(a.character.id).toMatch(/^import-[0-9a-f]{64}$/);
    expect(a.opId).not.toBe(b.opId);
    expect(a.output.sheet.state).toEqual({ hp: { current: 7, temp: 2 } });
    expect(a.output.sheet.build.overrides).toEqual({ hpMax: 11 });
    expect(a.output.currentAssignment).toBeNull();
    expect(a.review.unresolved).toContain("origins");
    expect(JSON.stringify(a)).not.toContain("Private narrative");
    expect(a).not.toHaveProperty("original");
    expect(Object.isFrozen(a.output)).toBe(true);
  });
  it("fences A to B to A and restored envelopes before touching the transport", async () => {
    const { repo, session } = client();
    const op = await repo.intent(original, review);
    session.transition({ uid: "other", campaignId: null, activeCharacterId: null });
    session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
    await expect(repo.commit(op)).rejects.toThrow("stale-session");
    await expect(client().repo.commit(op)).rejects.toThrow("stale-session");
  });
  it.each(["initial", "review"])(
    "fences queued auth changes after hashing a %s intent",
    async (kind) => {
      const { repo, session } = client();
      const previous = await repo.intent(original, review);
      const ticket = session.ticket.bind(session);
      vi.spyOn(session, "ticket").mockImplementation(() => {
        const check = ticket();
        return () => {
          check();
          queueMicrotask(() =>
            session.transition({
              uid: "other",
              campaignId: null,
              activeCharacterId: null,
            })
          );
        };
      });
      await expect(
        kind === "initial"
          ? repo.intent(original, review)
          : repo.reviewIntent(previous.output, original, null, review)
      ).rejects.toThrow("stale-session");
      expect(memory.size).toBe(1);
    }
  );
  it("rejects a changed output or forged reviewed status before transport", async () => {
    const { repo } = client();
    const op = await repo.intent(original, review);
    await expect(
      repo.commit({ ...op, output: { ...op.output, name: "Changed" } })
    ).rejects.toThrow("intent-mismatch");
    await expect(repo.intent(original, { ...review, unresolved: [] })).rejects.toThrow(
      "invalid-import-review"
    );
  });
  it("commits five exact documents once and reconciles the original receipt", async () => {
    const { repo } = client();
    const op = await repo.intent(original, review);
    const receipt = await repo.commit(op);
    const path = `folioAccounts/owner/characters/${op.character.id}`;
    expect(memory.get(path + "/private/import")).toEqual({
      schema: 1,
      sourceSchema: 3,
      original,
    });
    expect(memory.get(path + "/private/notes")).toEqual({ text: "Private narrative" });
    expect(memory.get(path + "/reconciliation/import")).toMatchObject({
      schema: 1,
      sourceSchema: 3,
      declaredEdition: "2014",
      revision: 0,
      reviewed: ["origins"],
      unresolved: ["origins", "classes", "overrides", "state"],
    });
    expect(receipt).toEqual({ operation: op, revision: 0 });
    expect(await repo.commit(op)).toEqual(receipt);
    expect(await client().repo.reconcile(op)).toEqual(receipt);
    expect(memory.size).toBe(6);
    const second = await repo.intent(original, { ...review, declaredEdition: "2024" });
    await expect(repo.commit(second)).rejects.toThrow("stale-base");
    expect(memory.size).toBe(6);
  });
  it("never leaves child records for a blocked account or a conflicting destination", async () => {
    const { repo } = client();
    const op = await repo.intent(original, review);
    memory.set("users/owner", { status: "blocked" });
    await expect(repo.commit(op)).rejects.toThrow("permission-denied");
    expect(memory.size).toBe(1);
    memory.set("users/owner", { status: "active" });
    memory.set(`folioAccounts/owner/characters/${op.character.id}`, { name: "Existing" });
    await expect(repo.commit(op)).rejects.toThrow("stale-base");
    expect(memory.size).toBe(2);
  });

  it("changes edition review with full-base CAS while preserving the original and mechanical state", async () => {
    const { repo } = client();
    const initial = await repo.intent(original, review);
    await repo.commit(initial);
    const base = await repo.read(initial.character);
    const update = await repo.reviewIntent(initial.output, original, base, {
      ...review,
      declaredEdition: "2024",
    });
    const competing = await repo.reviewIntent(initial.output, original, base, {
      ...review,
      declaredEdition: "unknown",
    });
    await repo.commit(update);
    expect(await repo.read(initial.character)).toMatchObject({
      declaredEdition: "2024",
      revision: 1,
    });
    await expect(repo.commit(competing)).rejects.toThrow("stale-base");
    const path = `folioAccounts/owner/characters/${initial.character.id}`;
    expect(memory.get(path)).toEqual(initial.output);
    expect(memory.get(path + "/private/import")).toEqual({
      schema: 1,
      sourceSchema: 3,
      original,
    });
    expect(memory.size).toBe(7);
  });

  it("exposes incompatible remote reconciliation instead of reading it as an empty baseline", async () => {
    const { repo } = client();
    const initial = await repo.intent(original, review);
    memory.set(
      `folioAccounts/owner/characters/${initial.character.id}/reconciliation/import`,
      { schema: 99 }
    );
    await expect(repo.read(initial.character)).rejects.toThrow(
      "incompatible-import-review"
    );
  });

  it("rejects coerced edition tokens in remote review records", async () => {
    const { repo } = client();
    const op = await repo.intent(original, review);
    await repo.commit(op);
    const path = `folioAccounts/owner/characters/${op.character.id}/reconciliation/import`;
    memory.set(path, { ...(memory.get(path) as object), declaredEdition: ["2024"] });
    await expect(repo.read(op.character)).rejects.toThrow("incompatible-import-review");
  });

  it("preserves analyzable input but refuses an oversized operation before send", async () => {
    const source = JSON.parse(original) as { build: Record<string, unknown> };
    source.build.features = [{ description: "é".repeat(305000) }];
    const bytes = JSON.stringify(source);
    const analysis = analyzeImport(bytes);
    expect(analysis.original).toBe(bytes);
    await expect(
      client().repo.intent(bytes, reviewImport(analysis, "2014", []))
    ).rejects.toThrow("import-operation-too-large");
    expect(memory.size).toBe(1);
  });
});
