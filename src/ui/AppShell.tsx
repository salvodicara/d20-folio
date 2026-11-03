import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type SubmitEvent,
} from "react";
import { createPortal } from "react-dom";
import { Link, NavLink } from "react-router";
import { Icon } from "./Icon";
import { Menu } from "./Menu";
import type { IconName } from "./icon-names";

/** The top bar's slot a page fills with its own phone bar (Play: ← · name · class). */
const PageBarSlot = createContext<HTMLElement | null>(null);

/** A page's own phone top bar: on phone it replaces the logo, ☰ and the account. */
export function PhoneBar({ children }: { children: ReactNode }) {
  const slot = useContext(PageBarSlot);
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
      <PageBarSlot.Provider value={pageBar}>{children}</PageBarSlot.Provider>
      <footer className="f-foot">{footer}</footer>
      <Menu open={open === "nav"} onClose={close} title={menuLabel}>
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
            {account.email && <span className="f-menu-sub">{account.email}</span>}
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
