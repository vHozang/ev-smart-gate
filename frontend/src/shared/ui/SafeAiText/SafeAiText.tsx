import { useEffect, useMemo, useState } from 'react';
import { sanitizeHtml, stripAllHtml } from './sanitizeHtml';

export interface SafeAiTextProps {
  value: string;
  mode?: 'plain-text' | 'safe-html';
  as?: 'p' | 'span' | 'div';
  className?: string;
}

/**
 * Component hiển thị đầu ra AI an toàn chống XSS (Mục 2.6, DOD-FE-AI-04, FE-NEG-01, FE-NEG-02).
 */
export function SafeAiText({
  value,
  mode = 'plain-text',
  as: Tag = 'p',
  className,
}: SafeAiTextProps) {
  const safeContent = useMemo(
    () => (mode === 'safe-html' ? sanitizeHtml(value) : stripAllHtml(value)),
    [mode, value],
  );

  if (mode === 'plain-text') {
    return <Tag className={className}>{safeContent}</Tag>;
  }

  return <Tag className={className} dangerouslySetInnerHTML={{ __html: safeContent }} />;
}

export interface AiLiveRegionProps {
  message: string;
  politeness?: 'polite' | 'assertive';
  debounceMs?: number;
}

/**
 * Vùng thông báo trợ năng có chống nhiễu (debounce) cho luồng tiến trình AI (Mục 5.4, DOD-FE-AI-08).
 */
export function AiLiveRegion({
  message,
  politeness = 'polite',
  debounceMs = 250,
}: AiLiveRegionProps) {
  const [announcedMessage, setAnnouncedMessage] = useState(message);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setAnnouncedMessage(message);
    }, debounceMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [message, debounceMs]);

  return (
    <div
      className="sr-only"
      role={politeness === 'assertive' ? 'alert' : 'status'}
      aria-live={politeness}
      aria-atomic="true"
      data-testid="ai-live-region"
    >
      {announcedMessage}
    </div>
  );
}
