/** Explicit table-time boundaries for exact typed magic-item resources. */

import { useMemo, useRef, useState } from "react";
import { Clock3, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  createItemResourceBoundaryCycle,
  useOptionalItemResourceCommands,
} from "@/features/character/center/useItemResourceCommands";
import {
  availableTableClockBoundaries,
  type TableClockBoundary,
} from "@/lib/views/item-resource-boundary-view";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";

/**
 * Dawn and dusk are story declarations, never device-time events or rests.
 * The command provider preflights every physical roll before this control makes
 * one atomic, undoable batch commit.
 */
export function TableClockControl() {
  const { t } = useTranslation();
  const character = useCharacterStore((state) => state.character);
  const readonly = useCharacterStore((state) => state.readonly);
  const commands = useOptionalItemResourceCommands();
  const [open, setOpen] = useState(false);
  const [inFlight, setInFlight] = useState<TableClockBoundary | null>(null);
  const inFlightRef = useRef(false);
  const available = useMemo(
    () => (character ? availableTableClockBoundaries(character) : []),
    [character]
  );

  if (!character || readonly || !commands || available.length === 0) return null;

  async function declareBoundary(kind: TableClockBoundary): Promise<void> {
    if (inFlightRef.current || !commands) return;
    inFlightRef.current = true;
    setInFlight(kind);
    setOpen(false);
    try {
      const prepared = await commands.prepareBoundary({ kind });
      if (!prepared || prepared.entries.length === 0) return;
      const cycle = createItemResourceBoundaryCycle(commands, prepared);
      registerUndoableToast(
        { message: t(`magicItems.tableClockApplied_${kind}`) },
        () => {
          const committed = cycle.apply();
          return committed ? () => commands.revertBoundary(committed) : null;
        },
        { turnScoped: false }
      );
    } finally {
      inFlightRef.current = false;
      setInFlight(null);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rh-action min-h-11 rail:min-h-0"
          aria-label={t("magicItems.tableClock")}
          disabled={inFlight !== null}
        >
          <Icon as={Clock3} size="xs" decorative />
          {t("magicItems.tableClock")}
        </button>
      </PopoverTrigger>
      <PopoverContent
        rubric={t("magicItems.tableClock")}
        side="bottom"
        align="end"
        collisionPadding={12}
        className="max-w-[17rem]"
      >
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm text-text-secondary">
            {t("magicItems.tableClockHint")}
          </p>
          <div className="flex flex-col gap-2">
            {available.map((kind) => {
              const BoundaryIcon = kind === "dawn" ? Sun : Moon;
              return (
                <Button
                  key={kind}
                  variant="secondary"
                  size="sm"
                  block
                  className="min-h-11 justify-start rail:min-h-0"
                  loading={inFlight === kind}
                  disabled={inFlight !== null}
                  onClick={() => void declareBoundary(kind)}
                >
                  <Icon as={BoundaryIcon} size="sm" decorative />
                  {t(`magicItems.tableClockDeclare_${kind}`)}
                </Button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
