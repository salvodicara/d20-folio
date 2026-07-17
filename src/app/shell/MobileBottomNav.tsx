/**
 * MobileBottomNav — the realm switcher for phones (C2). The topbar hub tabs are
 * desktop chrome (`hidden md:flex`); below `md` they collapse, which left the
 * command palette as the ONLY way to change realm. This fixed bottom nav restores
 * thumb-zone navigation between the three hubs (Characters · Campaigns ·
 * Compendium) with the active realm gilded, and is hidden from `md` up where the
 * topbar tabs take over. The DESIGN spec's "rail → bottom nav + drawer below
 * --bp-mobile" promise (index.css), now delivered.
 */
import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import { ScrollText, Tent, BookOpen } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { realmTarget } from "@/lib/realm-memory";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const { t } = useTranslation();
  const items = [
    { to: "/characters", label: t("nav.characters"), icon: ScrollText },
    { to: "/campaigns", label: t("nav.campaigns"), icon: Tent },
    { to: "/compendium", label: t("nav.compendium"), icon: BookOpen },
  ];
  return (
    <nav className="m-nav md:hidden" aria-label={t("nav.primary")}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={realmTarget(item.to)}
          className={({ isActive }) => cn("m-nav-item", isActive && "active")}
        >
          <Icon as={item.icon} size="sm" decorative />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
