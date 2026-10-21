import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export interface SegmentedTabItem<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
}

export interface SegmentedTabsProps<T extends string> {
  ariaLabel: string;
  items: readonly SegmentedTabItem<T>[];
  value: T;
  onChange: (nextValue: T) => void;
  tabRole?: 'tab' | 'button';
  className?: string;
}

/**
 * Thanh chuyển phân hệ dạng viên thuốc (Segmented Pill Tabs) hỗ trợ điều hướng bàn phím chuẩn WAI-ARIA.
 */
export function SegmentedTabs<T extends string>({
  ariaLabel,
  items,
  value,
  onChange,
  tabRole = 'tab',
  className = '',
}: SegmentedTabsProps<T>) {
  const tabRefs = useRef(new Map<T, HTMLButtonElement>());

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (items.length === 0) return;
    let targetIndex: number | undefined;
    if (event.key === 'ArrowRight') targetIndex = (index + 1) % items.length;
    if (event.key === 'ArrowLeft') targetIndex = (index - 1 + items.length) % items.length;
    if (event.key === 'Home') targetIndex = 0;
    if (event.key === 'End') targetIndex = items.length - 1;

    const targetItem = targetIndex === undefined ? undefined : items[targetIndex];
    if (targetItem) {
      event.preventDefault();
      onChange(targetItem.id);
      tabRefs.current.get(targetItem.id)?.focus();
    }
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className={`segmented-tabs ${className}`.trim()}>
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(node) => {
              if (node) tabRefs.current.set(item.id, node);
              else tabRefs.current.delete(item.id);
            }}
            type="button"
            role={tabRole === 'tab' ? 'tab' : undefined}
            aria-selected={tabRole === 'tab' ? selected : undefined}
            aria-pressed={tabRole === 'button' ? selected : undefined}
            tabIndex={tabRole === 'tab' ? (selected ? 0 : -1) : undefined}
            className={`segmented-tab ${selected ? 'is-selected' : ''}`.trim()}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge !== undefined && <span className="segmented-tab__badge">{item.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
