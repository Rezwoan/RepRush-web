'use client';
import { ChevronLeft } from 'lucide-react';

/** The header every `?view=` sub-screen shares: back, title, optional action. */
export function Panel({
  title,
  onBack,
  action,
  children,
}: {
  title: string;
  onBack: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="pb-8">
      <header className="sticky top-0 z-20 -mx-4 flex items-center gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-xl">
        <button onClick={onBack} aria-label="Back" className="press -ml-2 grid h-9 w-9 place-items-center rounded-full">
          <ChevronLeft size={22} />
        </button>
        <h1 className="flex-1 truncate text-xl font-extrabold">{title}</h1>
        {action}
      </header>
      <div className="pt-4">{children}</div>
    </div>
  );
}

/** A tappable settings row. */
export function Row({
  label,
  sub,
  right,
  onClick,
  danger,
}: {
  label: string;
  sub?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  const Cmp = onClick ? 'button' : 'div';
  return (
    <Cmp
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left ${onClick ? 'press' : ''}`}
    >
      <span className="min-w-0 flex-1">
        <span className={`block font-semibold ${danger ? 'text-destructive' : ''}`}>{label}</span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </span>
      {right}
    </Cmp>
  );
}

export function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h2 className="mb-1.5 px-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {children}
      </div>
    </section>
  );
}
