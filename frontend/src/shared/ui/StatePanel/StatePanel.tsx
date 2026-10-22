import {
  WarningCircleIcon,
  TrayIcon,
  LockKeyIcon,
  PlugsIcon,
  QuestionIcon,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';

export interface StatePanelProps {
  kind?: 'empty' | 'error' | 'forbidden' | 'unavailable' | 'outcome_unknown';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  requestId?: string;
}

const icons = {
  empty: TrayIcon,
  error: WarningCircleIcon,
  forbidden: LockKeyIcon,
  unavailable: PlugsIcon,
  outcome_unknown: QuestionIcon,
};

export function StatePanel({
  kind = 'empty',
  title,
  children,
  action,
  requestId,
}: StatePanelProps) {
  const Icon = icons[kind];
  return (
    <section className={`state-panel state-panel--${kind}`} aria-label={title}>
      <div className="state-panel__icon">
        <Icon size={25} />
      </div>
      <h2>{title}</h2>
      <div className="state-panel__description">{children}</div>
      {requestId && <p className="mono muted">Mã yêu cầu: {requestId}</p>}
      {action && <div className="state-panel__action">{action}</div>}
    </section>
  );
}

export function EmptyState(props: Omit<StatePanelProps, 'kind'>) {
  return <StatePanel kind="empty" {...props} />;
}

export function ErrorState(props: Omit<StatePanelProps, 'kind'>) {
  return <StatePanel kind="error" {...props} />;
}

export function ForbiddenState(props: Omit<StatePanelProps, 'kind'>) {
  return <StatePanel kind="forbidden" {...props} />;
}

export function OutcomeUnknownState(props: Omit<StatePanelProps, 'kind'>) {
  return <StatePanel kind="outcome_unknown" {...props} />;
}
