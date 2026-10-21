import type { ReactNode } from 'react';
import { Skeleton } from '@/shared/ui/Skeleton';

export interface TableColumn<T> {
  id: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
  maxWidth?: string;
  truncate?: boolean;
}

export interface DataTableProps<T> {
  label: string;
  rows: readonly T[];
  columns: readonly TableColumn<T>[];
  rowKey: (row: T) => string;
  caption?: string;
  maxHeight?: string;
  stickyHeader?: boolean;
  loading?: boolean;
  emptyState?: ReactNode;
}

export function DataTable<T>({
  label,
  rows,
  columns,
  rowKey,
  caption,
  maxHeight,
  stickyHeader = false,
  loading = false,
  emptyState,
}: DataTableProps<T>) {
  if (loading && rows.length === 0) {
    return (
      <div className="table-region" role="region" aria-label={label} tabIndex={0}>
        <Skeleton />
      </div>
    );
  }

  if (!loading && rows.length === 0 && emptyState) {
    return (
      <div
        className="table-region table-region--empty"
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        {emptyState}
      </div>
    );
  }

  const regionStyle = maxHeight ? { maxHeight, overflow: 'auto' } : undefined;

  return (
    <div
      className={`table-region ${stickyHeader ? 'table-region--sticky' : ''}`}
      role="region"
      aria-label={label}
      tabIndex={0}
      style={regionStyle}
    >
      <table className="data-table">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column) => {
              const alignClass = column.align ? `data-table-align--${column.align}` : '';
              return (
                <th
                  scope="col"
                  key={column.id}
                  className={[column.className, alignClass].filter(Boolean).join(' ')}
                  style={column.maxWidth ? { maxWidth: column.maxWidth } : undefined}
                >
                  {column.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => {
                const alignClass = column.align ? `data-table-align--${column.align}` : '';
                const truncateClass = column.truncate ? 'data-table-truncate' : '';
                return (
                  <td
                    key={column.id}
                    className={[column.className, alignClass, truncateClass]
                      .filter(Boolean)
                      .join(' ')}
                    style={column.maxWidth ? { maxWidth: column.maxWidth } : undefined}
                  >
                    {column.render(row)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
