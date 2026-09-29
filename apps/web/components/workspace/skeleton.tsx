'use client';

/**
 * Layout-matching placeholders shown while data loads. Static shapes with a
 * subtle shared pulse (disabled under prefers-reduced-motion) so the page
 * never shows an endless spinner.
 */

export function SkeletonBox({ w, h, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <span
      className="skeleton"
      style={{
        width: typeof w === 'number' ? `${w}px` : (w ?? '100%'),
        height: h ? `${h}px` : '12px',
        borderRadius: `${r}px`,
      }}
      aria-hidden="true"
    />
  );
}

export function TicketListSkeleton() {
  return (
    <div className="skeleton-list" role="status" aria-label="Loading tickets">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-row__top">
            <SkeletonBox w={64} h={10} />
            <SkeletonBox w={44} h={10} />
          </div>
          <SkeletonBox h={12} />
          <SkeletonBox w="65%" h={10} />
        </div>
      ))}
    </div>
  );
}

export function CaseSkeleton() {
  return (
    <div className="case-skeleton" role="status" aria-label="Loading ticket">
      <SkeletonBox w="35%" h={11} />
      <SkeletonBox w="70%" h={22} r={8} />
      <div className="skeleton-facts">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton-facts__item">
            <SkeletonBox w={52} h={9} />
            <SkeletonBox w={96} h={13} />
          </div>
        ))}
      </div>
      <SkeletonBox h={64} r={8} />
      <SkeletonBox w="30%" h={11} />
      <SkeletonBox h={90} r={8} />
    </div>
  );
}

export function InvestigationSkeleton() {
  return (
    <div className="investigation-skeleton" role="status" aria-label="Loading investigation">
      <div className="skeleton-row__top">
        <SkeletonBox w={110} h={18} r={9} />
      </div>
      <SkeletonBox h={13} />
      <SkeletonBox w="92%" h={13} />
      <SkeletonBox w="78%" h={13} />
      <div className="skeleton-inline">
        <SkeletonBox w={120} h={11} />
        <SkeletonBox w={60} h={11} />
      </div>
      <SkeletonBox h={58} r={8} />
    </div>
  );
}
