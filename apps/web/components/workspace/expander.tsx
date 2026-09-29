'use client';

import { useState } from 'react';

/**
 * Accessible disclosure section used across the workspace. Collapsed by
 * default unless startOpen; animated with a grid-rows transition (disabled
 * under prefers-reduced-motion).
 */
export function Expander({
  label,
  summary,
  startOpen = false,
  children,
  onToggle,
}: {
  label: string;
  /** Optional one-line preview rendered next to the label when collapsed. */
  summary?: string;
  startOpen?: boolean;
  children: React.ReactNode;
  onToggle?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(startOpen);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    onToggle?.(next);
  };

  return (
    <div className={`expander${open ? ' expander--open' : ''}`}>
      <button type="button" className="expander__trigger" aria-expanded={open} onClick={toggle}>
        <span className="expander__chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span>{label}</span>
        {summary && !open && <span className="expander__summary muted">{summary}</span>}
      </button>
      <div className={`expander__content ${open ? 'expander__content--open' : ''}`}>
        <div className="expander__inner">{children}</div>
      </div>
    </div>
  );
}
