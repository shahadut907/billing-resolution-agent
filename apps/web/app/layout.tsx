import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Billing Resolution Agent — Support Workspace',
  description:
    'AI-assisted billing support workspace: bounded read-only investigations, human approval, exactly-once sandbox actions.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="app-header glass">
            <div className="app-header__brand">
              <span className="app-header__mark" aria-hidden="true" />
              <div>
                <p className="app-header__title">Billing Resolution Agent</p>
                <p className="app-header__subtitle">Lumina Metrics, Inc. — synthetic support sandbox</p>
              </div>
            </div>
            <div className="app-header__labels">
              <span className="badge badge--sandbox" title="All data is synthetic; applied changes only ever touch this sandbox dataset.">
                Sandbox data
              </span>
              <span className="badge badge--readmore" title="Investigations are advisory; only an authorized reviewer decision can apply a permitted change.">
                Human-in-the-loop
              </span>
            </div>
          </header>
          {children}
          <footer className="app-footer">
            All records are invented for demonstration. Investigations are advisory drafts; a
            permitted change happens only after an authenticated reviewer approves it, exactly once.
          </footer>
        </div>
      </body>
    </html>
  );
}
