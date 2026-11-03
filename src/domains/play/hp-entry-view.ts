/**
 * What entered damage will do, for the note of «Danni e cure» (approved prototype
 * x-play-hp): the damage after the character's own defenses, what a pool (Arcane Ward)
 * and the temporary HP take first, the HP before and after, and the concentration
 * save's DC. It runs the very path the Danni button commits (`resolveDamageIntake`,
 * then the engine's pure `takeDamage`), so the note and the result never disagree.
 */
import { concentrationSaveDc } from "@/lib/compute";
import { resolveDamageIntake, type DamageDefenses } from "@/lib/damage-intake";
import { takeDamage } from "@/lib/play/damage";
import type { CharacterDoc } from "@/types/character";
import type { DamageType } from "@/types/damage";

export interface HpEntryNote {
  /** The damage after the character's defenses. */
  net: number;
  /** The defense that changed it, if one did. */
  defense: "immune" | "resisted" | "doubled" | "reduced" | null;
  /** What absorbing pools (Arcane Ward) take first. */
  absorbed: number;
  /** Temporary HP it takes. */
  fromTemp: number;
  from: number;
  to: number;
  /** The concentration save's DC, 0 when there is no save to make. */
  concentrationDc: number;
}

export function hpEntryNote(
  doc: CharacterDoc,
  amount: number,
  type: DamageType | undefined,
  defenses: DamageDefenses
): HpEntryNote | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const intake = resolveDamageIntake([{ amount, ...(type ? { type } : {}) }], defenses);
  const part = intake.parts[0];
  const net = intake.netTotal;
  const { current, temp } = doc.session.hp;
  const taken = net > 0 ? takeDamage(doc, net) : null;
  const absorbed = Object.values(taken?.spent.pools ?? {}).reduce((a, b) => a + b, 0);
  const after = taken?.session.hp ?? { current, temp };
  return {
    net,
    defense: !part
      ? null
      : part.immune
        ? "immune"
        : part.resisted
          ? "resisted"
          : part.doubled
            ? "doubled"
            : part.flatReduction > 0
              ? "reduced"
              : null,
    absorbed,
    fromTemp: Math.max(0, temp - after.temp),
    from: current,
    to: after.current,
    concentrationDc:
      doc.session.concentration && taken ? concentrationSaveDc(taken.dealt) : 0,
  };
}
