import type { ReactNode } from 'react';
import { MagnifyingGlassIcon, XCircleIcon } from '@phosphor-icons/react';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';

export interface DataTableFilterProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  children?: ReactNode;
  onReset?: () => void;
  hasActiveFilters?: boolean;
}

export function DataTableFilter({
  search,
  onSearchChange,
  searchPlaceholder = 'Tìm kiếm dữ liệu…',
  children,
  onReset,
  hasActiveFilters = false,
}: DataTableFilterProps) {
  return (
    <div className="data-table-filter" role="search" aria-label="Bộ lọc dữ liệu bảng">
      {onSearchChange && (
        <div className="search-field" style={{ flex: '1 1 240px', minWidth: '200px' }}>
          <MagnifyingGlassIcon size={18} />
          <Input
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={search || ''}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      )}

      {children && <div className="data-table-filter__custom">{children}</div>}

      {hasActiveFilters && onReset && (
        <Button
          size="sm"
          variant="ghost"
          icon={<XCircleIcon size={16} />}
          onClick={onReset}
          aria-label="Xóa tất cả bộ lọc"
        >
          Xóa bộ lọc
        </Button>
      )}
    </div>
  );
}
