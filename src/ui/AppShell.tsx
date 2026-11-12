import { useContext, useState, type ReactNode, type SubmitEvent } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink } from "react-router";
import { Icon } from "./Icon";
import { Menu } from "./Menu";
import { PageBarSlot, type PageMenuAction } from "./shell-bar";
import type { IconName } from "./icon-names";

/** A page's own phone top bar: on phone it replaces the logo, ☰ and the account. */
export function PhoneBar({ children }: { children: ReactNode }) {
  const { slot } = useContext(PageBarSlot);
  return slot ? createPortal(children, slot) : null;
}

export interface ShellLink {
  to: string;
  label: string;
}

export interface ShellAction {
  label: string;
  icon: IconName;
  onSelect: () => void;
}

/**
 * The new app's frame (approved prototype, D&D Beyond model): a top bar with the logo,
 * the three areas, the compendium search and the account; on phone the areas and the
 * search move into a menu sheet behind ☰, and there is no bottom tab bar. The page
 * (its room backdrop and `.f-page` column) is the children; the legal line closes it.
 */
export function AppShell({
  skipLabel,
  home,
  homeLabel,
  nav,
  navLabel,
  searchLabel,
  status,
  onSearch,
  menuLabel,
  account,
  footer,
  children,
}: {
  skipLabel: string;
  home: string;
  homeLabel: string;
  nav: ShellLink[];
  navLabel: string;
  searchLabel: string;
  /** Live status beside the search (the fight's round and whose turn). */
  status?: ReactNode;
  onSearch: (query: string) => void;
  menuLabel: string;
  account: {
    label: string;
    initial: string;
    name: string;
    email?: string;
    actions: ShellAction[];
  };
  footer: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<"nav" | "account" | null>(null);
  const [pageBar, setPageBar] = useState<HTMLElement | null>(null);
  const [pageActions, setPageActions] = useState<PageMenuAction[]>([]);
  const close = () => setOpen(null);
  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q");
    close();
    onSearch(typeof q === "string" ? q.trim() : "");
  };
  const search = (
    <form className="f-srch" role="search" onSubmit={submit}>
      <Icon name="u-search" />
      <input name="q" type="search" placeholder={searchLabel} aria-label={searchLabel} />
    </form>
  );
  const links = nav.map((l) => (
    <NavLink key={l.to} to={l.to} onClick={close}>
      {l.label}
    </NavLink>
  ));
  return (
    <div className="fui f-app">
      <a href="#main" className="f-skip">
        {skipLabel}
      </a>
      <header className="f-tb">
        <div className="f-tb-page" ref={setPageBar} />
        <Link className="f-brand" to={home} aria-label={homeLabel}>
          <img src="/assets/brand/folio-logo.svg" alt="" width={32} height={32} />
          Folio
        </Link>
        <nav className="f-tb-nav" aria-label={navLabel}>
          {links}
        </nav>
        <div className="f-tb-r">
          {status}
          <div className="f-tb-srch">{search}</div>
          <button
            type="button"
            className="f-burger"
            aria-label={menuLabel}
            aria-haspopup="dialog"
            onClick={() => setOpen("nav")}
          >
            <Icon name="u-menu" />
          </button>
          <button
            type="button"
            className="f-av"
            aria-label={account.label}
            aria-haspopup="dialog"
            onClick={() => setOpen("account")}
          >
            {account.initial}
          </button>
        </div>
      </header>
      <PageBarSlot.Provider
        value={{ slot: pageBar, openMenu: () => setOpen("nav"), setPageActions }}
      >
        {children}
      </PageBarSlot.Provider>
      <footer className="f-foot">{footer}</footer>
      <Menu open={open === "nav"} onClose={close} title={menuLabel}>
        {pageActions.map((a) => (
          <button
            key={a.label}
            type="button"
            className="f-menu-it"
            onClick={() => {
              close();
              a.onSelect();
            }}
          >
            <Icon name={a.icon} />
            {a.label}
          </button>
        ))}
        <nav className="f-menu-nav" aria-label={navLabel}>
          {links}
        </nav>
        <div className="f-menu-srch">{search}</div>
      </Menu>
      <Menu
        open={open === "account"}
        onClose={close}
        title={
          <>
            <b>{account.name}</b>
            {/* an account with no name shows its email once, as the name */}
            {account.email && account.email !== account.name && (
              <span className="f-menu-sub">{account.email}</span>
            )}
          </>
        }
      >
        {account.actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className="f-menu-it"
            onClick={() => {
              close();
              a.onSelect();
            }}
          >
            <Icon name={a.icon} />
            {a.label}
          </button>
        ))}
      </Menu>
    </div>
  );
}
