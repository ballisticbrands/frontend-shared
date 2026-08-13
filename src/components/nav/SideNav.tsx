import * as React from "react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

// The left navigation.
//
// Replaces the four-tab strip every brand app used to carry. Tabs put
// Data / Keys / Settings / Support on one visual level, which is how a
// settings panel is organised, not a product: the page you should live
// in (your numbers) had exactly the same weight as the page you visit
// once (billing). A sidebar has room to say which items are the product
// and which are housekeeping, and it grows — Dragon Refunds needs a
// "Refunds" item, DragonSheets needs "Sheets", and a fifth tab would
// have broken the strip.
//
// Items are supplied by the consumer so each brand composes its own
// list; DEFAULT_NAV_ITEMS is the shared spine every brand starts from.

export interface NavItem {
  /** Router path. Matched with startsWith so nested routes stay lit. */
  to: string;
  label: string;
  icon?: React.ReactNode;
  /** Small count or status chip on the right of the row. */
  badge?: React.ReactNode;
  /** Section break above this item, with an optional caption. */
  section?: string;
  /** Renders as an <a> to an external destination instead of a Link. */
  external?: boolean;
}

export interface SideNavProps {
  items: NavItem[];
  /** Brand lockup, rendered at the top. Each app owns its own logo. */
  header?: React.ReactNode;
  /** Account row pinned to the bottom (email + sign out). */
  footer?: React.ReactNode;
  /** Called when a nav item is chosen — lets the mobile drawer close. */
  onNavigate?: () => void;
}

function isActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  // startsWith so /dashboard/anything keeps /dashboard lit, but guard
  // the boundary so /connect-ai never activates /connect.
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function SideNav({ items, header, footer, onNavigate }: SideNavProps) {
  const { pathname } = useLocation();

  return (
    <nav className="flex h-full flex-col gap-1" aria-label="Main">
      {header && <div className="px-3 pb-4 pt-1">{header}</div>}

      <ul className="flex-1 space-y-0.5 px-2">
        {items.map((item) => {
          const active = isActive(pathname, item.to);
          const inner = (
            <>
              {item.icon && (
                <span
                  className={`shrink-0 ${active ? "text-[var(--accent)]" : "text-[var(--muted-foreground)]"}`}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
              )}
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge}
            </>
          );
          const className = [
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
            active
              ? "bg-[var(--muted)] text-[var(--foreground)]"
              : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
          ].join(" ");

          return (
            <li key={item.to}>
              {item.section && (
                <p className="px-3 pb-1 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]/70">
                  {item.section}
                </p>
              )}
              {item.external ? (
                <a
                  href={item.to}
                  target="_blank"
                  rel="noreferrer"
                  className={className}
                  onClick={onNavigate}
                >
                  {inner}
                </a>
              ) : (
                <Link
                  to={item.to}
                  className={className}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                >
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {footer && <div className="border-t border-[var(--border)] p-3">{footer}</div>}
    </nav>
  );
}

/** Hamburger + slide-over, for viewports too narrow for a fixed rail.
 *  Rendered by AppShell; exported in case a brand wants it standalone. */
export function MobileNav(props: SideNavProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        className="rounded-md border border-[var(--border)] p-2 lg:hidden"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M2 4h12M2 8h12M2 12h12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-[var(--border)] bg-[var(--card)] py-4 shadow-xl">
            <SideNav {...props} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
