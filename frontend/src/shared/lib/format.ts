export function formatDate(value: string | number | null | undefined): string {
  if (!value) return 'Chưa có dữ liệu';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Ngày không hợp lệ'
    : new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Bangkok',
      }).format(date);
}

/**
 * Chuyển chuỗi ISO 8601 (ví dụ "2026-10-20T00:00:00Z") sang định dạng YYYY-MM-DD cho <input type="date" />.
 */
export function toDateInputValue(isoValue: string | null | undefined): string {
  if (!isoValue) return '';
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(isoValue.trim());
  if (match?.[1]) {
    return match[1];
  }
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/**
 * Chuyển giá trị YYYY-MM-DD từ <input type="date" /> sang chuỗi ISO 8601 UTC chuẩn contract API.
 */
export function fromDateInputValue(dateValue: string, endOfDay = false): string {
  const trimmed = dateValue.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return endOfDay ? `${trimmed}T23:59:59Z` : `${trimmed}T00:00:00Z`;
  }
  return trimmed;
}
