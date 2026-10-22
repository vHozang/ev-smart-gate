import { Badge } from '@/shared/ui/Badge';
import type { EmployeeCard } from '../../api';

export interface CardDetailProps {
  card: EmployeeCard;
  driverLabel?: string;
}

const statusToneMap: Record<EmployeeCard['status'], 'success' | 'danger' | 'warning' | 'neutral'> =
  {
    ACTIVE: 'success',
    BLOCKED: 'danger',
    LOST: 'warning',
    REPLACED: 'neutral',
  };

const statusLabelMap: Record<EmployeeCard['status'], string> = {
  ACTIVE: 'Đang hoạt động',
  BLOCKED: 'Đã khóa',
  LOST: 'Báo mất',
  REPLACED: 'Đã thay thế',
};

export function CardDetail({ card, driverLabel }: CardDetailProps) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: 'var(--space-3)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            UID thẻ (đã che bảo mật)
          </div>
          <div className="mono" style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>
            {card.card_uid_masked}
          </div>
        </div>
        <Badge tone={statusToneMap[card.status]}>{statusLabelMap[card.status]}</Badge>
      </div>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-3)',
          margin: 0,
        }}
      >
        <div>
          <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Mã bản ghi thẻ
          </dt>
          <dd className="mono" style={{ margin: '4px 0 0' }}>
            {card.id}
          </dd>
        </div>
        <div>
          <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Tài xế sở hữu
          </dt>
          <dd style={{ margin: '4px 0 0' }}>{driverLabel || card.driver_id}</dd>
        </div>
        <div>
          <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Lý do trạng thái
          </dt>
          <dd style={{ margin: '4px 0 0' }}>{card.status_reason || 'Không có ghi chú'}</dd>
        </div>
        <div>
          <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Thời điểm cấp thẻ
          </dt>
          <dd style={{ margin: '4px 0 0' }}>
            {card.issued_at ? new Date(card.issued_at).toLocaleString('vi-VN') : 'Chưa ghi nhận'}
          </dd>
        </div>
        {card.replaces_card_id && (
          <div>
            <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Thay thế cho thẻ cũ
            </dt>
            <dd className="mono" style={{ margin: '4px 0 0' }}>
              {card.replaces_card_id}
            </dd>
          </div>
        )}
        {card.replaced_by_card_id && (
          <div>
            <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Đã được thay bằng thẻ
            </dt>
            <dd className="mono" style={{ margin: '4px 0 0' }}>
              {card.replaced_by_card_id}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
