/**
 * The campaign's Note tab (approved prototype camp-notes): the table's shared notes,
 * important ones first then the freshest, each marked by what it is about — «!»
 * important (pinned), «@» a person, «#» a place, from the first tag it carries — with
 * filters (important, people, places, only mine) and a search over title and text.
 * A player never sees a note the DM keeps hidden.
 */
import { describe, expect, it } from "vitest";

import { notesView } from "@/domains/notes/notes-view";
import type { SharedNote } from "@/types/campaign";

const at = (day: number) => new Date(2026, 9, day, 21, 0);
const note = (id: string, extra: Partial<SharedNote>): SharedNote => ({
  id,
  title: "",
  content: "",
  pinned: false,
  createdBy: "u-nico",
  updatedAt: at(1),
  dmOnly: false,
  ...extra,
});
const notes = [
  note("hammer", {
    title: "The hammer is cursed",
    content: "«Don't touch it» #crypt",
    pinned: true,
    updatedAt: at(2),
  }),
  note("orin", {
    title: "Orin the smith",
    content: "pays 200 gp @Orin",
    createdBy: "u-lu",
    updatedAt: at(9),
  }),
  note("brindol", {
    title: "Brindol",
    content: "market, grey mage, #Brindol @grey-mage",
    createdBy: "u-ila",
    updatedAt: at(5),
  }),
  note("secret", {
    title: "The mage is Orin's brother",
    content: "@grey-mage",
    dmOnly: true,
    updatedAt: at(10),
  }),
];

describe("notesView", () => {
  const player = { uid: "u-nico", isDm: false };

  it("important first, then the freshest; a player never sees a hidden note", () => {
    expect(
      notesView(notes, { filter: "all", query: "" }, player).map((n) => n.id)
    ).toEqual(["hammer", "orin", "brindol"]);
    expect(
      notesView(notes, { filter: "all", query: "" }, { uid: "dm", isDm: true })[1]?.id
    ).toBe("secret");
  });

  it("marks each note by what it is about: pinned, else its first tag", () => {
    const kinds = Object.fromEntries(
      notesView(notes, { filter: "all", query: "" }, player).map((n) => [n.id, n.kind])
    );
    expect(kinds).toEqual({ hammer: "important", orin: "person", brindol: "place" });
  });

  it("lists every tag the note carries", () => {
    const brindol = notesView(notes, { filter: "all", query: "" }, player).find(
      (n) => n.id === "brindol"
    );
    expect(brindol?.tags).toEqual(["#Brindol", "@grey-mage"]);
  });

  it("filters important, people, places and only mine", () => {
    const ids = (filter: Parameters<typeof notesView>[1]["filter"]) =>
      notesView(notes, { filter, query: "" }, player).map((n) => n.id);
    expect(ids("important")).toEqual(["hammer"]);
    expect(ids("people")).toEqual(["orin", "brindol"]);
    expect(ids("places")).toEqual(["hammer", "brindol"]);
    expect(ids("mine")).toEqual(["hammer"]);
  });

  it("searches title and text, ignoring case and accents", () => {
    const ids = (query: string) =>
      notesView(notes, { filter: "all", query }, player).map((n) => n.id);
    expect(ids("MARKET")).toEqual(["brindol"]);
    expect(ids("cursèd")).toEqual(["hammer"]);
  });
});
