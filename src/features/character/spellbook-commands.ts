/**
 * The Wizard's «Copia nel libro» write (#1230), on the rules core's copy
 * (`copyIntoSpellbook`): the spell lands on the sheet and its cost leaves the purse
 * through the `adjust-currency` sheet event (the one coin move every payment uses:
 * a purchase, a priced material), all under one 5 s undo that gives both back.
 */
import { negateCurrencyDelta, type CurrencyDelta } from "@/lib/play/material-cost";
import { copyIntoSpellbook } from "@/lib/wizard-spellbook";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";

const COINS = ["pp", "gp", "ep", "sp", "cp"] as const;

export function copySpellToBook(spellId: string, pay: boolean, message: string): void {
  registerUndoableToast(
    { message },
    () => {
      const store = useCharacterStore.getState();
      const before = store.character;
      const next = before ? copyIntoSpellbook(before, spellId, { pay }) : null;
      if (!before || !next) return null;
      const delta: CurrencyDelta = {};
      for (const coin of COINS) {
        const d = next.session.currency[coin] - before.session.currency[coin];
        if (d) delta[coin] = d;
      }
      store.setCharacter({ ...before, character: next.character });
      const paid = Object.keys(delta).length > 0;
      if (
        paid &&
        !useCharacterStore.getState().dispatch({ kind: "adjust-currency", delta })
      ) {
        useCharacterStore.getState().setCharacter(before);
        return null;
      }
      const spells = next.character.spells;
      return () => {
        const current = useCharacterStore.getState();
        if (paid)
          current.dispatch({
            kind: "adjust-currency",
            delta: negateCurrencyDelta(delta),
          });
        const now = useCharacterStore.getState().character;
        // The spell comes off only while the list is still the one the copy made.
        if (now && now.character.spells === spells)
          current.setCharacter({
            ...now,
            character: { ...now.character, spells: before.character.spells },
          });
      };
    },
    { turnScoped: false }
  );
}
