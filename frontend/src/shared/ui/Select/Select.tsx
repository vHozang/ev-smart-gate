import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className = '', children, invalid, 'aria-invalid': ariaInvalid, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={`input select ${className}`}
      aria-invalid={ariaInvalid ?? (invalid ? true : undefined)}
      {...props}
    >
      {children}
    </select>
  );
});
