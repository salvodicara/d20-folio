/**
 * "Aggiungi" — the DM's creature dock, beside the tool rail (Owlbear's character dock, ledger
 * §10a; UI spec rule 34).
 *
 * A search field and a grid of cards over the COMPOSED bestiary: the same corpus the encounter
 * picker reads (`@/data/monsters`), handed in as `options` so this component never pulls the
 * lazy monster catalogue into anybody's bundle — the play route resolves it once, for the DM
 * only, exactly as `/compendium` does.
 *
 * Picking a creature is the whole interaction: the host projects the stat block
 * (`projectMonster`) and appends `add-entity` with the mechanics it carries, so a client that
 * never loaded the bestiary still folds the same table (design §2 D2).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlayIcon } from "./PlayIcon";

export interface CreatureOption {
  readonly id: string;
  readonly name: string;
  /** The CR as it prints ("2", "1/4") — the DM's one scanning number. */
  readonly cr: string;
  readonly type: string;
}

export interface AddCreatureProps {
  readonly options: readonly CreatureOption[];
  /** The corpus is still loading (it is lazy, like the compendium's). */
  readonly loading: boolean;
  readonly onPick: (option: CreatureOption) => void;
  readonly onClose: () => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export function AddCreature({ options, loading, onPick, onClose }: AddCreatureProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const found = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const matches =
      needle === ""
        ? options
        : options.filter((option) => option.name.toLocaleLowerCase().includes(needle));
    return matches.slice(0, 60);
  }, [options, query]);

  return (
    <section
      className="pl-float pl-dock pl-panel pl-panel--framed"
      data-testid="pl-add-creature"
    >
      <span className="pl-brackets" />
      <div className="pl-search">
        <PlayIcon id="i-search" />
        <input
          value={query}
          autoFocus
          placeholder={t("play.add.search")}
          aria-label={t("play.add.search")}
          data-testid="pl-add-search"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className="pl-icon-btn"
          onClick={onClose}
          aria-label={t("common.close")}
        >
          <PlayIcon id="i-x" />
        </button>
      </div>

      {loading ? (
        <p className="pl-note">{t("play.add.loading")}</p>
      ) : found.length === 0 ? (
        <p className="pl-note">{t("play.add.none", { query })}</p>
      ) : (
        <div className="pl-dock__grid">
          {found.map((option) => (
            <button
              key={option.id}
              type="button"
              className="pl-dock__card"
              data-testid={`pl-add-${option.id}`}
              onClick={() => onPick(option)}
            >
              <span className="pl-dock__face">{initials(option.name)}</span>
              <b>{option.name}</b>
              <small>{t("polymorph.crShort", { cr: option.cr })}</small>
            </button>
          ))}
        </div>
      )}
      <p className="pl-dock__hint">
        <PlayIcon id="i-info" />
        {t("play.add.hint")}
      </p>
    </section>
  );
}
