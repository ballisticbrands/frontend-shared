import * as React from "react";
import { MobileNav, SideNav, type NavItem } from "../nav/SideNav";

// The signed-in chrome: fixed left rail on desktop, slide-over drawer
// below `lg`, and a scrolling content column.
//
// The rail is `sticky` rather than `fixed` so the content column keeps
// normal document flow — a fixed rail forces every page inside it to
// manage its own left offset, and the pages here are shared across
// brands that each set their own container widths.
//
// Route guarding is deliberately NOT here. Each brand's AppLayout
// already owns the "bounce to /sign-in" decision (and Dragon Refunds
// guards differently from DragonBot), so this component renders chrome
// and nothing else.

export interface AppShellProps {
  items: NavItem[];
  /** Brand lockup for the top of the rail. */
  navHeader?: React.ReactNode;
  /** Account block for the bottom of the rail. */
  navFooter?: React.ReactNode;
  /** Right-hand side of the mobile top bar (the rail carries this on
   *  desktop, so it's mobile-only chrome). */
  mobileActions?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({
  items,
  navHeader,
  navFooter,
  mobileActions,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Mobile top bar. Hidden once the rail is visible. */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-2.5 lg:hidden">
        <div className="flex items-center gap-3">
          <MobileNav items={items} header={navHeader} footer={navFooter} />
          {navHeader}
        </div>
        {mobileActions}
      </div>

      <div className="mx-auto flex w-full max-w-[1400px]">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-[var(--border)] bg-[var(--card)] py-4 lg:block">
          <SideNav items={items} header={navHeader} footer={navFooter} />
        </aside>

        {/* min-w-0 so wide children (tables, code blocks) scroll inside
            their own container instead of stretching the flex row and
            pushing the rail off-screen. */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

/** Standard page frame inside the shell: title, optional description,
 *  optional right-aligned actions, then content. Every shared page uses
 *  it so headings line up across brands. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <div className="mt-1 text-[13px] leading-relaxed text-[var(--muted-foreground)]">
            {description}
          </div>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageContainer({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-5 py-7 sm:px-8">{children}</div>;
}
