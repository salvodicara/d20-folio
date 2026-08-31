/**
 * The armed engine effects and their possessor-declared pulses: one row per
 * active recurring/reactive phase (Moonbeam's beam, Fire Shield's
 * retaliation), with the pulse walking the same modal protocol as a cast.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { MechanicsCastModal } from "@/components/sheet/MechanicsCastModal";
import { localizeSrd } from "@/i18n/resolver";
import { useLocale } from "@/hooks/useLocale";
import { characterMaterialRef, characterWorldState } from "@/lib/mechanics-world-store";
import {
  activeEnginePulses,
  useMechanicsPulse,
  type EnginePulseRef,
} from "@/features/character/useMechanicsPulse";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";

function PulseFlow({
  maxHp,
  onClose,
  pulse,
  spellName,
}: {
  readonly maxHp: number;
  readonly onClose: () => void;
  readonly pulse: EnginePulseRef;
  readonly spellName: string;
}) {
  const doc = useCharacterStore((state) => state.character);
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const cast = useMechanicsPulse(pulse, maxHp);
  if (!doc || uid === null) return null;
  return (
    <MechanicsCastModal
      cast={cast}
      material={characterMaterialRef(doc, uid)}
      onClose={onClose}
      slots={[]}
      spellName={spellName}
    />
  );
}

export function EnginePulseStrip({ maxHp }: { readonly maxHp: number }) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const doc = useCharacterStore((state) => state.character);
  const uid = useAuthStore((state) => state.user?.uid ?? null);
  const [openPulse, setOpenPulse] = useState<EnginePulseRef | null>(null);

  const pulses = useMemo(() => {
    if (!doc || uid === null) return [];
    return activeEnginePulses(characterWorldState(doc, uid, maxHp));
  }, [doc, maxHp, uid]);

  if (pulses.length === 0) return null;
  const nameOf = (pulse: EnginePulseRef): string =>
    pulse.spellId === null
      ? pulse.occurrenceId
      : localizeSrd("spell", pulse.spellId, "name", locale);
  return (
    <div role="group" aria-label={t("mechanics.pulse.strip")}>
      {pulses.map((pulse) => (
        <Button
          key={`${pulse.occurrenceId}:${pulse.phaseId}`}
          onClick={() => setOpenPulse(pulse)}
          variant="secondary"
        >
          {t("mechanics.pulse.declare", { name: nameOf(pulse) })}
        </Button>
      ))}
      {openPulse && (
        <PulseFlow
          maxHp={maxHp}
          onClose={() => setOpenPulse(null)}
          pulse={openPulse}
          spellName={nameOf(openPulse)}
        />
      )}
    </div>
  );
}
