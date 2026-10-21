import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { Button } from '@/shared/ui/Button';

export interface DataTablePaginationProps {
  page: number;
  pageSize: number;
  total?: number;
  pageSizeOptions?: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  disabled?: boolean;
}

export function DataTablePagination({
  page,
  pageSize,
  total,
  pageSizeOptions = [10, 20, 50, 100],
  onPageChange,
  onPageSizeChange,
  disabled = false,
}: DataTablePaginationProps) {
  const totalPages = total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : undefined;
  const hasPrevious = page > 1;
  const hasNext = totalPages !== undefined ? page < totalPages : true;

  const startRecord = (page - 1) * pageSize + 1;
  const endRecord = total !== undefined ? Math.min(page * pageSize, total) : page * pageSize;

  return (
    <div className="data-table-pagination" role="navigation" aria-label="Phân trang dữ liệu">
      <div className="data-table-pagination__info">
        {total !== undefined ? (
          total > 0 ? (
            <span>
              Hiển thị <strong>{startRecord}</strong>–<strong>{endRecord}</strong> trên{' '}
              <strong>{total}</strong> mục
            </span>
          ) : (
            <span>0 mục</span>
          )
        ) : (
          <span>Trang {page}</span>
        )}
      </div>

      <div className="data-table-pagination__controls">
        {onPageSizeChange && (
          <div className="data-table-pagination__size">
            <label htmlFor="data-table-page-size" className="sr-only">
              Số mục mỗi trang
            </label>
            <select
              id="data-table-page-size"
              className="select"
              value={pageSize}
              disabled={disabled}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} / trang
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="data-table-pagination__nav">
          <Button
            size="sm"
            variant="ghost"
            icon={<CaretLeftIcon size={16} />}
            disabled={disabled || !hasPrevious}
            aria-label="Trang trước"
            onClick={() => onPageChange(page - 1)}
          >
            Trước
          </Button>
          <span className="data-table-pagination__pages" aria-current="page">
            Trang {page}
            {totalPages !== undefined && ` / ${totalPages}`}
          </span>
          <Button
            size="sm"
            variant="ghost"
            icon={<CaretRightIcon size={16} />}
            disabled={disabled || !hasNext}
            aria-label="Trang tiếp"
            onClick={() => onPageChange(page + 1)}
          >
            Sau
          </Button>
        </div>
      </div>
    </div>
  );
}
