/**
 * The classic sheet's hand taps write their play-log line through
 * `changeResourceByHand` (the session report reads it): receiving Heroic Inspiration
 * on the resource rail logs «gains Heroic Inspiration».
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({}));

import i18n from "@/i18n";
import { ResourceRail } from "@/features/character/molecules/ResourceRail";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useUIStore.setState({ sheetMode: "play" });
  const doc = structuredClone(MOCK_CHARACTER);
  doc.session.logEntries = [];
  doc.session.inspiration = false;
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
});

describe("the resource rail's hand taps", () => {
  it("receiving Heroic Inspiration writes its line", () => {
    render(
      <MemoryRouter>
        <ResourceRail />
      </MemoryRouter>
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: i18n.getFixedT("en")("character.heroicInspiration"),
      })
    );
    const session = useCharacterStore.getState().character?.session;
    expect(session?.inspiration).toBe(true);
    expect(session?.logEntries.at(-1)?.event).toEqual({
      kind: "inspiration-change",
      gained: true,
    });
  });
});
