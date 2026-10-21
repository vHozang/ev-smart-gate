import { useRef } from 'react';
import type { CSSProperties, HTMLAttributes, MouseEvent, ReactNode } from 'react';

export interface SpotlightCardProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'article' | 'div';
  padded?: boolean;
  spotlightColor?: string;
  children: ReactNode;
}

/**
 * Thẻ bề mặt Liquid Glass kết hợp hiệu ứng ánh sáng hướng tâm theo chuột (React Bits SpotlightCard).
 * Cập nhật tọa độ trực tiếp qua biến CSS (--mouse-x, --mouse-y) trên DOM ref để tránh re-render React.
 */
export function SpotlightCard({
  as: Tag = 'section',
  padded = true,
  spotlightColor,
  className = '',
  style,
  onMouseMove,
  children,
  ...props
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);

  function handleMouseMove(event: MouseEvent<HTMLElement>) {
    const node = cardRef.current;
    if (node) {
      const rect = node.getBoundingClientRect();
      node.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
      node.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
    }
    onMouseMove?.(event);
  }

  const mergedStyle: CSSProperties | undefined = spotlightColor
    ? ({ ...style, '--spotlight-color': spotlightColor } as CSSProperties)
    : style;

  return (
    <Tag
      ref={(node: HTMLElement | null) => {
        cardRef.current = node;
      }}
      className={`spotlight-card ${padded ? 'spotlight-card--padded' : ''} ${className}`.trim()}
      style={mergedStyle}
      onMouseMove={handleMouseMove}
      {...props}
    >
      {children}
    </Tag>
  );
}
