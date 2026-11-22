/**
 * A sheet that can't be shown says so about the character, never about a campaign
 * (it read «Campagna non trovata» on a solo sheet).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { PlaySheet } from "@/domains/play/ui/PlayScreen";
import { useCharacterStore } from "@/stores/characterStore";

describe("PlaySheet error state", () => {
  it("names the character, not a campaign", () => {
    useCharacterStore.setState({ character: null, error: "load failed" } as never);
    render(
      <MemoryRouter>
        <PlaySheet
          characterId="c1"
          campaign={null}
          back={{ to: "/characters", label: "Characters" }}
        />
      </MemoryRouter>
    );
    expect(screen.getByRole("status").textContent).toBe("Character not found");
  });
});
