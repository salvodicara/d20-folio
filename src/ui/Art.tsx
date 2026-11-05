import { useState, type ReactNode } from "react";

import { artUrl, type ArtKind } from "./art-url";
import { usePackIcons } from "./pack-icons";

/**
 * A painted icon, loaded when it scrolls into view and cached by the service worker on
 * first view. An entry whose icon is not painted yet shows `fallback` (its glyph).
 */
export function Art({
  kind,
  id,
  fallback,
  className,
}: {
  kind: ArtKind;
  id: string;
  fallback: ReactNode;
  className?: string;
}) {
  const pack = usePackIcons();
  // A pack entry's icon comes from the pack; every other one from /assets/art.
  const src = pack?.[`${kind}/${id}`] ?? artUrl(kind, id);
  const [failed, setFailed] = useState<string | null>(null);
  if (failed === src) return <>{fallback}</>;
  return (
    <img
      className={className ? `f-art ${className}` : "f-art"}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(src)}
    />
  );
}
