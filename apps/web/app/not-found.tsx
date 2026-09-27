import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="notice">
      <h1>Ticket not found</h1>
      <p className="muted">No ticket with that id exists in the seeded dataset.</p>
      <p>
        <Link href="/">Back to all tickets</Link>
      </p>
    </div>
  );
}
