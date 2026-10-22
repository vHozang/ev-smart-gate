import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = '', invalid, 'aria-invalid': ariaInvalid, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`input ${className}`}
      aria-invalid={ariaInvalid ?? (invalid ? true : undefined)}
      {...props}
    />
  );
});
