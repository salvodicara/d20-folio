// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  parseRoute,
  routeHash,
  NavigationController,
} from "@/features/identity/navigation";

beforeEach(() => window.history.replaceState(null, "", "/"));
describe("scoped shell navigation", () => {
  it("recognizes old links and allows only non-sensitive route filters", () => {
    expect(parseRoute("#preferences").page).toBe("preferences");
    expect(
      parseRoute("#characters?filter=independent&query=secret&note=private")
    ).toEqual({ page: "characters", filter: "independent" });
    expect(parseRoute("#library?tab=sharing&family=subclass")).toEqual({
      page: "library",
      tab: "sharing",
      family: "subclass",
    });
    expect(parseRoute("#library?tab=bad&family=bad")).toEqual({ page: "library" });
    expect(parseRoute("#missing").page).toBe("unavailable");
  });
  it("roundtrips a character lookup request without an active actor", () => {
    const route = parseRoute("#campaign?campaign=one&owner=marco&character=lyra");
    expect(route).toEqual({
      page: "campaign",
      campaign: "one",
      owner: "marco",
      character: "lyra",
    });
    expect(routeHash(route)).toBe("#campaign?campaign=one&owner=marco&character=lyra");
    expect(parseRoute("#characters?character=lyra")).toEqual({ page: "characters" });
    expect(parseRoute("#characters?owner=x%2Fy&character=z")).toEqual({
      page: "characters",
    });
  });
  it("returns a direct detail to its own parent instead of unrelated browser history", () => {
    window.history.replaceState(
      { external: true },
      "",
      "#characters?owner=marco&character=lyra"
    );
    const nav = new NavigationController("marco");
    nav.back();
    expect(nav.snapshot().route).toEqual({ page: "characters" });
    expect(window.history.state as unknown).toMatchObject({ external: true });
  });
  it("remembers list query by route and invalidates frames across A to B to A", () => {
    const nav = new NavigationController("marco");
    nav.go({ page: "library", family: "subclass" });
    nav.updateFrame({ query: "Moon", scroll: 321 });
    nav.go({ page: "preferences" });
    nav.go({ page: "library" }, { resume: true });
    expect(nav.snapshot().route.family).toBe("subclass");
    expect(nav.snapshot().frame).toMatchObject({ query: "Moon", scroll: 321 });
    nav.invalidate();
    nav.go({ page: "preferences" });
    nav.go({ page: "library" }, { resume: true });
    expect(nav.snapshot().frame.query).toBeUndefined();
  });
  it("never restores another account's transient frame", () => {
    const first = new NavigationController("marco");
    first.go({ page: "characters" });
    first.updateFrame({ query: "private name", scroll: 56 });
    const second = new NavigationController("sara");
    expect(second.snapshot().frame).toEqual({});
  });
});

it("keeps campaign context when a feature command only changes destination", () => {
  window.history.replaceState(null, "", "#campaign?campaign=lanterns");
  const nav = new NavigationController("marco");
  nav.go({ page: "library", tab: "creations" });
  expect(nav.snapshot().route.campaign).toBe("lanterns");
});

it("invalidates navigation callbacks across departure and return but preserves typing", () => {
  const nav = new NavigationController("marco");
  nav.go({ page: "library" });
  const check = nav.ticket();
  nav.updateFrame({ query: "Moon" });
  expect(check).not.toThrow();
  nav.go({ page: "account" });
  nav.go({ page: "library" });
  expect(check).toThrow("navigation-changed");
});

it("does not reuse a prior same-account frame in a fresh authentication lifetime", () => {
  const old = new NavigationController("marco");
  old.updateFrame({ query: "private" });
  const fresh = new NavigationController("marco", false);
  expect(fresh.snapshot().frame).toEqual({});
  fresh.activate();
  fresh.restore();
  expect(fresh.snapshot().frame).toEqual({});
  expect(new NavigationController("marco").snapshot().frame).toEqual({});
});

it("roundtrips a received Library copy using its domain identity", () => {
  const route = {
    page: "library" as const,
    entry: "p09-owner~offer-copy",
    kind: "subclass",
  };
  expect(parseRoute(routeHash(route))).toEqual(route);
  expect(parseRoute("#library?entry=bad%2Fpath&kind=subclass")).toEqual({
    page: "library",
  });
});
