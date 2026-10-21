import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { CameraIcon, ArrowsOutSimpleIcon, DownloadSimpleIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { Button } from '@/shared/ui/Button';

export interface EvidenceViewerProps {
  source: string | Blob | null | undefined;
  alt: string;
  title?: string;
  metadata?: Record<string, ReactNode>;
  aspectRatio?: '16/9' | '4/3' | '1/1' | 'auto';
  onExpand?: () => void;
  onDownload?: () => void;
  className?: string;
}

export function EvidenceViewer({
  source,
  alt,
  title,
  metadata,
  aspectRatio = '16/9',
  onExpand,
  onDownload,
  className = '',
}: EvidenceViewerProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  // Quản lý Blob URL và resource cleanup
  useEffect(() => {
    setHasError(false);
    if (!source) {
      setObjectUrl(null);
      return;
    }

    if (source instanceof Blob) {
      const url = URL.createObjectURL(source);
      setObjectUrl(url);

      // Resource cleanup khi unmount hoặc khi blob thay đổi
      return () => {
        URL.revokeObjectURL(url);
      };
    }

    // Nguồn là URL dạng string thông thường
    setObjectUrl(source);
  }, [source]);

  const ratioClass = `evidence-viewer__media--${aspectRatio.replace('/', '-')}`;

  return (
    <div className={`evidence-viewer ${className}`} role="region" aria-label={title || 'Bằng chứng ảnh'}>
      {title && (
        <div className="evidence-viewer__header">
          <h4 className="evidence-viewer__title">{title}</h4>
          <div className="evidence-viewer__actions">
            {onExpand && (
              <Button
                size="sm"
                variant="ghost"
                icon={<ArrowsOutSimpleIcon size={16} />}
                onClick={onExpand}
                aria-label="Phóng to bằng chứng"
              >
                Phóng to
              </Button>
            )}
            {onDownload && (
              <Button
                size="sm"
                variant="ghost"
                icon={<DownloadSimpleIcon size={16} />}
                onClick={onDownload}
                aria-label="Tải về tệp bằng chứng"
              >
                Tải về
              </Button>
            )}
          </div>
        </div>
      )}

      <div className={`evidence-viewer__media ${ratioClass}`}>
        {!objectUrl ? (
          <div className="evidence-viewer__placeholder">
            <CameraIcon size={32} />
            <span>Chưa có hình ảnh bằng chứng</span>
          </div>
        ) : hasError ? (
          <div className="evidence-viewer__placeholder evidence-viewer__placeholder--error">
            <WarningCircleIcon size={32} />
            <span>Không thể tải hình ảnh</span>
          </div>
        ) : (
          <img
            src={objectUrl}
            alt={alt}
            className="evidence-viewer__image"
            onError={() => setHasError(true)}
          />
        )}
      </div>

      {metadata && Object.keys(metadata).length > 0 && (
        <dl className="evidence-viewer__meta">
          {Object.entries(metadata).map(([key, value]) => (
            <div key={key} className="evidence-viewer__meta-item">
              <dt className="evidence-viewer__meta-key">{key}</dt>
              <dd className="evidence-viewer__meta-value">{value || '—'}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
