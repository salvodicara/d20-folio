import { describe, expect, it } from "vitest";
import { applyDamage, applyHealing, clampHp, clampTemp } from "@/lib/combat-hp";

describe("combat-hp — applyDamage (temp absorbs first, current floors at 0)", () => {
  const cases: ReadonlyArray<{
    name: string;
    current: number;
    temp: number;
    amount: number;
    expected: { current: number; temp: number };
  }> = [
    {
      name: "temp fully absorbs (current untouched)",
      current: 20,
      temp: 10,
      amount: 6,
      expected: { current: 20, temp: 4 },
    },
    {
      name: "temp exactly absorbs (temp to 0, current untouched)",
      current: 20,
      temp: 10,
      amount: 10,
      expected: { current: 20, temp: 0 },
    },
    {
      name: "temp partially absorbs, remainder hits current",
      current: 20,
      temp: 5,
      amount: 12,
      expected: { current: 13, temp: 0 },
    },
    {
      name: "no temp — full amount hits current",
      current: 20,
      temp: 0,
      amount: 7,
      expected: { current: 13, temp: 0 },
    },
    {
      name: "damage floors current at 0 (never negative)",
      current: 8,
      temp: 0,
      amount: 50,
      expected: { current: 0, temp: 0 },
    },
    {
      name: "overkill through temp still floors current at 0",
      current: 8,
      temp: 3,
      amount: 50,
      expected: { current: 0, temp: 0 },
    },
    {
      name: "0 damage is a no-op",
      current: 20,
      temp: 5,
      amount: 0,
      expected: { current: 20, temp: 5 },
    },
  ];

  it.each(cases)("$name", ({ current, temp, amount, expected }) => {
    expect(applyDamage(current, temp, amount)).toEqual(expected);
  });
});

describe("combat-hp — applyHealing (clamps at max, never overheals)", () => {
  const cases: ReadonlyArray<{
    name: string;
    current: number;
    amount: number;
    max: number;
    expected: number;
  }> = [
    { name: "heal below max", current: 10, amount: 5, max: 30, expected: 15 },
    { name: "heal exactly to max", current: 25, amount: 5, max: 30, expected: 30 },
    { name: "overheal clamps at max", current: 28, amount: 50, max: 30, expected: 30 },
    { name: "heal from 0", current: 0, amount: 12, max: 30, expected: 12 },
    { name: "0 heal is a no-op", current: 10, amount: 0, max: 30, expected: 10 },
  ];

  it.each(cases)("$name", ({ current, amount, max, expected }) => {
    expect(applyHealing(current, amount, max)).toBe(expected);
  });
});

describe("combat-hp — clampHp (absolute set into [0, max])", () => {
  const cases: ReadonlyArray<{
    name: string;
    value: number;
    max: number;
    expected: number;
  }> = [
    { name: "in range", value: 15, max: 30, expected: 15 },
    { name: "clamps at 0", value: -5, max: 30, expected: 0 },
    { name: "exactly 0", value: 0, max: 30, expected: 0 },
    { name: "clamps at max", value: 99, max: 30, expected: 30 },
    { name: "exactly max", value: 30, max: 30, expected: 30 },
  ];

  it.each(cases)("$name", ({ value, max, expected }) => {
    expect(clampHp(value, max)).toBe(expected);
  });
});

describe("combat-hp — clampTemp (non-negative floor)", () => {
  const cases: ReadonlyArray<{ name: string; value: number; expected: number }> = [
    { name: "positive passes through", value: 7, expected: 7 },
    { name: "negative floors at 0", value: -3, expected: 0 },
    { name: "exactly 0", value: 0, expected: 0 },
  ];

  it.each(cases)("$name", ({ value, expected }) => {
    expect(clampTemp(value)).toBe(expected);
  });
});
