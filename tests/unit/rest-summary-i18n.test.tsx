/**
 * The Long Rest summary reads in the player's language: the hit-dice row was a
 * hard-coded "N of M" and the panel title glued two English-ordered words
 * ("Riposo Lungo Riepilogo"). Both now come from one translated string each.
 */
import { render, screen, fireEvent, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import i18n from "@/i18n";
import { RestModal } from "@/features/character/RestModal";
import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";

beforeEach(async () => {
  const character = structuredClone(MOCK_CHARACTER);
  character.session.hp = { current: 5, temp: 0 };
  useCharacterStore.setState({ character, readonly: false, loading: false, error: null });
  useAuthStore.setState({ user: null });
  useToastStore.setState({ toasts: [], timers: {} });
  await i18n.changeLanguage("it");
});
afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("Long Rest summary in Italian", () => {
  it("writes the hit-dice count and the title in Italian", async () => {
    render(
      <ItemResourceCommandProvider>
        <RestModal open onClose={() => {}} />
      </ItemResourceCommandProvider>
    );
    fireEvent.click(screen.getByText("Riposo Lungo"));
    const confirm = screen.getAllByRole("button", { name: "Fai Riposo Lungo" }).at(-1);
    if (!confirm) throw new Error("confirm missing");
    fireEvent.click(confirm);
    await screen.findByText("Riposo Lungo Completato");
    const dialog = screen.getAllByRole("dialog").at(-1) as HTMLElement;
    expect(within(dialog).queryByText(/\bof\b/)).toBeNull();
    expect(within(dialog).getByText(/^\d+ di \d+$/)).toBeInTheDocument();
    expect(within(dialog).getByText("Riepilogo del riposo lungo")).toBeInTheDocument();
  });
});
