/**
 * A Long Rest ends a Hit Point maximum reduction (Harm, a life drain) and wakes the
 * character at the full maximum. The rest dialog said so with the REDUCED maximum:
 * "Hit points restored to maximum (34)" and a summary of "34 → 34 / 34", while the
 * rest itself set 44 / 44. Both now read the maximum the rest restores.
 */
import { render, screen, fireEvent, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import i18n from "@/i18n";
import { RestModal } from "@/features/character/RestModal";
import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
import { effectiveMaxHp } from "@/lib/aggregate-character";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";

const REDUCTION = 10;
const fullMax = effectiveMaxHp(MOCK_CHARACTER.character, MOCK_CHARACTER.session);

beforeEach(async () => {
  const character = structuredClone(MOCK_CHARACTER);
  character.session.hp = { current: 5, temp: 0 };
  character.session.hpMaxReduction = REDUCTION;
  useCharacterStore.setState({ character, readonly: false, loading: false, error: null });
  useAuthStore.setState({ user: null });
  useToastStore.setState({ toasts: [], timers: {} });
  await i18n.changeLanguage("en");
});

function openLongRest() {
  render(
    <ItemResourceCommandProvider>
      <RestModal open onClose={() => {}} />
    </ItemResourceCommandProvider>
  );
  fireEvent.click(screen.getByText("Long Rest"));
}

describe("Long Rest with a reduced Hit Point maximum", () => {
  it("promises the full maximum the rest restores", () => {
    openLongRest();
    expect(
      screen.getByText(`Hit points restored to maximum (${fullMax})`)
    ).toBeInTheDocument();
  });

  it("summarises the full maximum it woke the character at", async () => {
    openLongRest();
    fireEvent.click(screen.getByRole("button", { name: "Complete rest" }));
    await screen.findByText("Long Rest Complete");
    const dialog = screen.getAllByRole("dialog").at(-1) as HTMLElement;
    expect(within(dialog).getByText(`5 → ${fullMax} / ${fullMax}`)).toBeInTheDocument();
    const session = useCharacterStore.getState().character?.session;
    expect(session?.hp.current).toBe(fullMax);
  });
});
