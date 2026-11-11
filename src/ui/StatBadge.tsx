/** A header number in its frame: Armour Class in a shield, the others in a hexagon.
 *  The frames are the approved prototype's SVG (x-play .badge__shape): a gold edge over
 *  a dark fill, and a bronze inner line. A distance's unit is set small («9m»). */
const SHAPES = {
  shield: {
    box: "0 0 58 64",
    outer: "M29 2 L54 10 C54 34 46 52 29 62 C12 52 4 34 4 10 Z",
    inner: "M29 7 L49 13.5 C49 33 42 48 29 56.5 C16 48 9 33 9 13.5 Z",
  },
  hex: {
    box: "0 0 58 58",
    outer: "M29 2 L53 15.5 V42.5 L29 56 L5 42.5 V15.5 Z",
    inner: "M29 7 L48.5 18 V40 L29 51 L9.5 40 V18 Z",
  },
} as const;

export function StatBadge({
  shape,
  value,
  label,
}: {
  shape: "shield" | "hex";
  value: string;
  label: string;
}) {
  const s = SHAPES[shape];
  const unit = /^(.*\d)\s*(m|ft|km|mi)$/.exec(value);
  return (
    <div className="f-badge" data-shape={shape}>
      <span className="f-badge-frame">
        <svg viewBox={s.box} aria-hidden="true" data-orn="">
          <path className="f-badge-outer" d={s.outer} />
          <path className="f-badge-inner" d={s.inner} />
        </svg>
        <b>
          {unit ? (
            <>
              {unit[1]}
              <small>{unit[2]}</small>
            </>
          ) : (
            value
          )}
        </b>
      </span>
      <span className="f-lbl">{label}</span>
    </div>
  );
}
