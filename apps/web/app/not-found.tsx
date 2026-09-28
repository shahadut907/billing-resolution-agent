import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="not-found glass">
      <h1>Ticket not found</h1>
      <p>The ticket you requested does not exist in this sandbox dataset.</p>
      <Link href="/" className="btn btn--primary">
        Back to the workspace
      </Link>
    </main>
  );
}
