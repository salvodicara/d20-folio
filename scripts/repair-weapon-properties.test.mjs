import assert from "node:assert/strict";
import test from "node:test";
import { hashFirestoreDocument, pathHash } from "./lib/migration-kit.ts";
import { MOCK_CHARACTER } from "../src/lib/mock.ts";
import {
  parseCharacterEnvelope,
  serializeCharacterEnvelope,
} from "../src/lib/character-codec.ts";
import { planWeaponPropertiesRepair } from "./repair-weapon-properties.mjs";

function fixture() {
  const envelope = structuredClone(serializeCharacterEnvelope(MOCK_CHARACTER));
  const weapon = {
    custom: true,
    name: "Test weapon",
    quantity: 2,
    damageDie: "1d8",
    damageType: "piercing",
    attackStat: "DEX",
    instanceId: "test-weapon",
    future: { keep: true },
  };
  const before = {
    ...envelope,
    build: {
      ...envelope.build,
      weapons: [{ srdId: "dagger" }, { srdId: "dagger" }, { srdId: "dagger" }, weapon],
    },
    revision: 9,
    playStateVersion: 1,
    state: {},
    futureRoot: { untouched: true },
  };
  const path = "users/test/characters/test";
  const after = structuredClone(before);
  after.build.weapons[3].properties = "";
  return {
    source: { path, data: before },
    after,
    expected: {
      targetHash: pathHash(path),
      beforeHash: hashFirestoreDocument(before),
      afterHash: hashFirestoreDocument(after),
    },
  };
}

test("repairs only absent empty properties, makes the complete character loadable, preserves every other value", () => {
  const { source, after, expected } = fixture();
  assert.equal(parseCharacterEnvelope(source.data.build, {}).ok, false);
  const snapshot = structuredClone(source);
  const plan = planWeaponPropertiesRepair([source], expected);
  assert.equal(plan.changedDocuments.length, 1);
  assert.deepEqual(plan.documents[0].after, after);
  assert.deepEqual(source, snapshot);
  assert.equal(parseCharacterEnvelope(plan.documents[0].after.build, {}).ok, true);
});

test("a completed repair is idempotent", () => {
  const { source, after, expected } = fixture();
  assert.equal(
    planWeaponPropertiesRepair([{ ...source, data: after }], expected).changedDocuments
      .length,
    0
  );
});

test("refuses unrelated concurrent edits", () => {
  const { source, expected } = fixture();
  source.data.revision++;
  assert.throws(() => planWeaponPropertiesRepair([source], expected), /changed/);
});

test("refuses a mistaken planned after hash", () => {
  const { source, expected } = fixture();
  assert.throws(
    () =>
      planWeaponPropertiesRepair([source], { ...expected, afterHash: "0".repeat(64) }),
    /after hash/
  );
});

for (const value of ["Finesse", "", null, 3]) {
  test("refuses replacing an existing properties value: " + JSON.stringify(value), () => {
    const { source, expected } = fixture();
    source.data.build.weapons[3].properties = value;
    expected.beforeHash = hashFirestoreDocument(source.data);
    expected.afterHash = "0".repeat(64);
    assert.throws(
      () => planWeaponPropertiesRepair([source], expected),
      /missing properties/
    );
  });
}

test("refuses ambiguous or different documents and shared parents", () => {
  const { source, expected } = fixture();
  assert.throws(() => planWeaponPropertiesRepair([], expected));
  assert.throws(() => planWeaponPropertiesRepair([source, source], expected));
  assert.throws(() =>
    planWeaponPropertiesRepair(
      [{ ...source, path: "users/other/characters/other" }],
      expected
    )
  );
  source.data.shared = true;
  expected.beforeHash = hashFirestoreDocument(source.data);
  assert.throws(() => planWeaponPropertiesRepair([source], expected), /shared/);
});

test("refuses to write when another codec defect remains", () => {
  const { source, expected, after } = fixture();
  source.data.build.weapons[3].attackStat = "INVALID";
  after.build.weapons[3].attackStat = "INVALID";
  expected.beforeHash = hashFirestoreDocument(source.data);
  expected.afterHash = hashFirestoreDocument(after);
  assert.throws(() => planWeaponPropertiesRepair([source], expected), /loadable/);
});
