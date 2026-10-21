export interface SkeletonProps {
  rows?: number;
  label?: string;
}
export function Skeleton({ rows = 5, label = 'Đang tải dữ liệu' }: SkeletonProps) {
  return (
    <div className="skeleton-list" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
