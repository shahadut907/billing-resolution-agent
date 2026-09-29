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
          <header className="app-header">
            <span className="app-header__mark" aria-hidden="true" />
            <div>
              <p className="app-header__title">Billing Resolution Agent</p>
              <p className="app-header__subtitle">Lumina Metrics, Inc. — synthetic support sandbox</p>
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
