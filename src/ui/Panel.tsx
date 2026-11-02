import type { ReactNode } from "react";

/** A panel's meaning sets its colour cap: resources, abilities, initiative, log, actions, group, treasure, compendium. */
export type PanelColor =
  | "res"
  | "abi"
  | "ini"
  | "log"
  | "act"
  | "grp"
  | "tes"
  | "cmp"
  | "cond"
  | "dng";

/** The one panel header: colour cap and band reaching the panel edges, title, optional action on the right. */
export function PanelHeader({
  title,
  aside,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <h2 className="f-pnh">
      {children}
      <span className="f-ttl">{title}</span>
      {aside && <span className="f-x">{aside}</span>}
    </h2>
  );
}

/** The one panel: a box with a header, a body and an optional footer of actions. */
export function Panel({
  color = "act",
  title,
  aside,
  foot,
  children,
}: {
  color?: PanelColor;
  title: ReactNode;
  aside?: ReactNode;
  foot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="f-pn" data-c={color}>
      <PanelHeader title={title} aside={aside} />
      <div className="f-pnb">{children}</div>
      {foot && <div className="f-pn-foot">{foot}</div>}
    </section>
  );
}
