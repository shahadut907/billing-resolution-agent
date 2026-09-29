import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Support workspace · Billing Resolution Agent',
  description:
    'Review billing tickets, investigations, and approved next steps for the Lumina Metrics demo workspace.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <div className="brand">
              <span className="brand__mark" aria-hidden="true" />
              <span className="brand__name">Billing Resolution Agent</span>
            </div>
            <span className="app-header__divider" aria-hidden="true" />
            <span className="app-header__page">Support workspace</span>
            <span
              className="demo-badge"
              title="Demo data. Every record in this workspace is invented for demonstration, and applied changes only ever touch this demo dataset."
            >
              Demo data
            </span>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
