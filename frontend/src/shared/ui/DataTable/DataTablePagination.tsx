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
  hasMoreServerData?: boolean;
  hasPrevCursor?: boolean;
  onNextCursor?: () => void;
  onPrevCursor?: () => void;
}

export function DataTablePagination({
  page,
  pageSize,
  total,
  pageSizeOptions = [10, 20, 50, 100],
  onPageChange,
  onPageSizeChange,
  disabled = false,
  hasMoreServerData = false,
  hasPrevCursor = false,
  onNextCursor,
  onPrevCursor,
}: DataTablePaginationProps) {
  const totalPages = total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : undefined;
  const safePage = totalPages !== undefined ? Math.min(page, totalPages) : page;
  const hasPrevious = safePage > 1;
  const hasNext = totalPages !== undefined ? safePage < totalPages : true;

  const startRecord = (safePage - 1) * pageSize + 1;
  const endRecord =
    total !== undefined ? Math.min(safePage * pageSize, total) : safePage * pageSize;

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
          {onPrevCursor && hasPrevCursor && (
            <Button size="sm" variant="secondary" disabled={disabled} onClick={onPrevCursor}>
              Lô trước
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={<CaretLeftIcon size={16} />}
            disabled={disabled || !hasPrevious}
            aria-label="Trang trước"
            onClick={() => onPageChange(safePage - 1)}
          >
            Trước
          </Button>
          <span className="data-table-pagination__pages" aria-current="page">
            Trang {safePage}
            {totalPages !== undefined && ` / ${totalPages}`}
          </span>
          <Button
            size="sm"
            variant="ghost"
            icon={<CaretRightIcon size={16} />}
            disabled={disabled || !hasNext}
            aria-label="Trang tiếp"
            onClick={() => onPageChange(safePage + 1)}
          >
            Sau
          </Button>
          {onNextCursor && hasMoreServerData && (
            <Button size="sm" variant="secondary" disabled={disabled} onClick={onNextCursor}>
              Tải lô tiếp
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
