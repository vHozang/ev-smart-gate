import type { HTMLAttributes, ReactNode } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  pulse?: boolean;
  children: ReactNode;
}

export function Badge({
  tone = 'neutral',
  pulse = false,
  className = '',
  children,
  ...rest
}: BadgeProps) {
  return (
    <span className={`badge badge--${tone} ${className}`.trim()} {...rest}>
      <span className={`badge__dot ${pulse ? 'badge__dot--pulse' : ''}`} aria-hidden="true" />
      {children}
    </span>
  );
}
