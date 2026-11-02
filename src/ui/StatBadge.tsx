/** A header number in its frame: Armour Class in a shield, the others in a hexagon.
 *  The frame is drawn in CSS (a gold edge and a dark fill), not an icon. */
export function StatBadge({
  shape,
  value,
  label,
}: {
  shape: "shield" | "hex";
  value: string;
  label: string;
}) {
  return (
    <div className="f-badge" data-shape={shape}>
      <span className="f-badge-frame">
        <b>{value}</b>
      </span>
      <span className="f-lbl">{label}</span>
    </div>
  );
}
