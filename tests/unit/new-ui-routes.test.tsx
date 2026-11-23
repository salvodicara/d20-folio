/**
 * Which frame each screen opens in, per interface (#1233). With the player's toggle on,
 * the rebuilt screens open in the new frame, but the campaign hub, its member sheet and
 * the campaign list stay classic for everyone until they reach parity (Coordinator,
 * 2026-11-23). The VITE_NEW_UI build (preview, rehearsal) still opens them new.
 */
import { describe, expect, it, vi } from "vitest";
import { matchRoutes, type RouteObject } from "react-router";
import { isValidElement } from "react";

vi.mock("@/lib/firebase", () => ({ db: {}, auth: {}, storage: {} }));

import { buildRouter } from "@/app/router";
import { AppShell } from "@/app/AppShell";

function inClassicFrame(routes: RouteObject[], path: string): boolean {
  const matches = matchRoutes(routes, path) ?? [];
  expect(matches.length).toBeGreaterThan(0);
  return matches.some(
    (m) => isValidElement(m.route.element) && m.route.element.type === AppShell
  );
}

const CAMPAIGN = ["/campaigns/c1", "/campaigns/c1/sheets/u2", "/campaigns"];
const REBUILT = ["/characters", "/characters/c1", "/compendium", "/settings"];

describe("routes per interface", () => {
  it("classic: every screen is classic", () => {
    const { routes } = buildRouter(false, false);
    for (const path of [...CAMPAIGN, ...REBUILT]) {
      expect(inClassicFrame(routes, path), path).toBe(true);
    }
  });

  it("the player's toggle: rebuilt screens new, campaign screens classic", () => {
    const { routes } = buildRouter(true, false);
    for (const path of REBUILT) expect(inClassicFrame(routes, path), path).toBe(false);
    for (const path of CAMPAIGN) expect(inClassicFrame(routes, path), path).toBe(true);
  });

  it("the VITE_NEW_UI build: everything new", () => {
    const { routes } = buildRouter(true, true);
    for (const path of [...CAMPAIGN, ...REBUILT]) {
      expect(inClassicFrame(routes, path), path).toBe(false);
    }
  });
});
