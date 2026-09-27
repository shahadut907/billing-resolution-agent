import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Billing Resolution Agent — Support Console',
  description:
    'Milestone 1: read-only support console over a seeded synthetic billing dataset. No automated diagnosis or actions yet.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="page">
          <header className="site-header">
            <div className="container site-header__inner">
              <Link href="/" className="brand">
                Billing Resolution Agent
              </Link>
              <nav className="site-nav">
                <Link href="/">Tickets</Link>
              </nav>
              <span className="chip">Milestone 1 · read-only</span>
            </div>
          </header>
          <main className="container page-main">{children}</main>
          <footer className="site-footer">
            <div className="container">
              Milestone 1 displays seeded synthetic data only. The agent does not diagnose,
              decide, act, or contact anyone yet.
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
