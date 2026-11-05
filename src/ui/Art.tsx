import { useState, type ReactNode } from "react";

import { artUrl, type ArtKind } from "./art-url";

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
  const [missing, setMissing] = useState(false);
  if (missing) return <>{fallback}</>;
  return (
    <img
      className={className ? `f-art ${className}` : "f-art"}
      src={artUrl(kind, id)}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setMissing(true)}
    />
  );
}
