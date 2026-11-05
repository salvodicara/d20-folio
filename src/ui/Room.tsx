/** The five painted rooms of the castle (approved 2026-11-02), one per area of the app. */
export type RoomName = "sanctum" | "study" | "war-room" | "library" | "armoury";

/**
 * The room behind a page: a bright band on top, the same room dark and soft behind the
 * content. `small` is a shorter band; `band` a thin strip (~120 px) for a page whose
 * content must start on the first screen (owner, 2026-11-05).
 */
export function Room({
  room,
  small,
  band,
}: {
  room: RoomName;
  small?: boolean;
  band?: boolean;
}) {
  const bg = { backgroundImage: `url(/assets/backgrounds/room-${room}.webp)` };
  return (
    <>
      <div className="f-room-dim" style={bg} aria-hidden="true" />
      <div
        className={band ? "f-room f-band" : small ? "f-room f-sm" : "f-room"}
        style={bg}
        aria-hidden="true"
      />
    </>
  );
}
