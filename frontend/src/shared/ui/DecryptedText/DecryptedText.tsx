import { useEffect, useRef, useState } from 'react';
import type { HTMLAttributes } from 'react';

export interface DecryptedTextProps extends HTMLAttributes<HTMLSpanElement> {
  text: string;
  animateOnHover?: boolean;
}

const CIPHER_CHARS = '0123456789ABCDEF#/-:';

/**
 * Hiển thị chuỗi kỹ thuật / mã định danh kiểu monospace (React Bits DecryptedText).
 * Mặc định hiển thị nguyên vẹn chuỗi gốc khi render để đảm bảo khả năng đọc tức thì và ổn định kiểm thử;
 * hỗ trợ hiệu ứng giải mã ký tự ngắn khi di chuột (nếu người dùng không bật prefers-reduced-motion).
 */
export function DecryptedText({
  text,
  animateOnHover = true,
  className = '',
  onMouseEnter,
  ...props
}: DecryptedTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setDisplayText(text);
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
    };
  }, [text]);

  function triggerScramble() {
    if (!animateOnHover || typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
    }

    let iteration = 0;
    const totalLength = text.length;
    timerRef.current = window.setInterval(() => {
      iteration += Math.max(1, Math.ceil(totalLength / 6));
      if (iteration >= totalLength) {
        setDisplayText(text);
        if (timerRef.current !== null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return;
      }

      const next = text
        .split('')
        .map((char, idx) => {
          if (char === ' ' || char === '·' || char === '-' || idx < iteration) {
            return char;
          }
          return CIPHER_CHARS[(idx + iteration) % CIPHER_CHARS.length];
        })
        .join('');
      setDisplayText(next);
    }, 28);
  }

  return (
    <span
      className={`decrypted-text ${className}`.trim()}
      onMouseEnter={(event) => {
        triggerScramble();
        onMouseEnter?.(event);
      }}
      {...props}
    >
      {displayText}
    </span>
  );
}
