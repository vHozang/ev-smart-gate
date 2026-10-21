import type { ReactNode } from 'react';

/**
 * Hiển thị giá trị có thể null/undefined với ký tự fallback an toàn.
 * Tránh hiển thị chuỗi rỗng hoặc giá trị undefined ra giao diện.
 */
export function formatNullable(
  value: ReactNode | string | number | null | undefined,
  fallback = '—',
): ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="muted">{fallback}</span>;
  }
  return value;
}
