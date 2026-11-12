/**
 * A sideways-scrolling row of tabs (the compendium's kinds, the campaign's tabs on a
 * phone): each cut edge says so, and the selected tab is brought fully into view,
 * never left under the fade or past the edge.
 */
import { describe, expect, it } from "vitest";

import { edgesCut, scrollLeftToShow } from "@/ui/scroll-more";

describe("edgesCut", () => {
  const row = (scrollLeft: number) => ({
    scrollLeft,
    clientWidth: 300,
    scrollWidth: 900,
  });

  it("at the start only the end is cut", () => {
    expect(edgesCut(row(0))).toEqual({ start: false, end: true });
  });
  it("in the middle both edges are cut", () => {
    expect(edgesCut(row(300))).toEqual({ start: true, end: true });
  });
  it("at the end only the start is cut", () => {
    expect(edgesCut(row(600))).toEqual({ start: true, end: false });
  });
  it("a row that fits is cut nowhere", () => {
    expect(edgesCut({ scrollLeft: 0, clientWidth: 300, scrollWidth: 300 })).toEqual({
      start: false,
      end: false,
    });
  });
});

describe("scrollLeftToShow", () => {
  const view = { scrollLeft: 0, clientWidth: 300 };
  it("leaves a visible tab where it is", () => {
    expect(scrollLeftToShow(view, { offsetLeft: 100, offsetWidth: 80 }, 48)).toBe(0);
  });
  it("scrolls a tab past the end clear of the fade", () => {
    expect(scrollLeftToShow(view, { offsetLeft: 500, offsetWidth: 100 }, 48)).toBe(348);
  });
  it("scrolls a tab before the start clear of the fade", () => {
    expect(
      scrollLeftToShow(
        { scrollLeft: 400, clientWidth: 300 },
        { offsetLeft: 200, offsetWidth: 80 },
        48
      )
    ).toBe(152);
  });
  it("never scrolls before zero", () => {
    expect(
      scrollLeftToShow(
        { scrollLeft: 400, clientWidth: 300 },
        { offsetLeft: 10, offsetWidth: 80 },
        48
      )
    ).toBe(0);
  });
});
