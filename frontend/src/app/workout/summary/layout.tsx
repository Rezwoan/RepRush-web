/**
 * A `<main>` landmark (P13c). These routes live outside the tab shell, which
 * has one, so a screen reader had no way to skip to the content — and every
 * page here has several early returns, so wrapping at the layout is the only
 * place that cannot miss one.
 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
