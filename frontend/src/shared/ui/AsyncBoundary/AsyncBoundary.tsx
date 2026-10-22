import { Component, Suspense } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Skeleton } from '../Skeleton';
import { StatePanel } from '../StatePanel';
import { Button } from '../Button';
import { normalizeError } from '@/shared/api';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  errorTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[AsyncBoundary caught error]:', error, errorInfo);
    }
  }

  reset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  override render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) {
        return this.props.fallback(error, this.reset);
      }
      const normalized = normalizeError(error);
      const requestId = normalized.requestId;
      const isForbidden = normalized.status === 403;
      const title =
        this.props.errorTitle ??
        (isForbidden ? 'Bạn chưa được cấp quyền truy cập' : 'Không thể tải nội dung');

      return (
        <StatePanel
          kind={isForbidden ? 'forbidden' : 'error'}
          title={title}
          requestId={requestId}
          action={
            <Button variant="secondary" onClick={this.reset}>
              Thử lại
            </Button>
          }
        >
          {normalized.message || 'Đã có lỗi xảy ra trong quá trình xử lý yêu cầu.'}
        </StatePanel>
      );
    }
    return this.props.children;
  }
}

export interface AsyncBoundaryProps extends ErrorBoundaryProps {
  loadingFallback?: ReactNode;
}

export function AsyncBoundary({
  children,
  loadingFallback = <Skeleton rows={3} />,
  ...errorBoundaryProps
}: AsyncBoundaryProps) {
  return (
    <ErrorBoundary {...errorBoundaryProps}>
      <Suspense fallback={loadingFallback}>{children}</Suspense>
    </ErrorBoundary>
  );
}
