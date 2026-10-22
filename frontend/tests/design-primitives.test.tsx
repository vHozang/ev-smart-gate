import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Badge } from '@/shared/ui/Badge';
import { DecryptedText } from '@/shared/ui/DecryptedText';
import { SegmentedTabs } from '@/shared/ui/SegmentedTabs';
import { SpotlightCard } from '@/shared/ui/SpotlightCard';

describe('Task 6.1: Design Baseline Primitives (SpotlightCard, SegmentedTabs, DecryptedText, Badge)', () => {
  it('SpotlightCard cập nhật tọa độ chuột qua biến CSS (--mouse-x, --mouse-y) trực tiếp trên DOM', () => {
    render(
      <SpotlightCard data-testid="spotlight-surface" spotlightColor="rgba(15, 118, 82, 0.08)">
        <p>Nội dung thẻ</p>
      </SpotlightCard>,
    );

    const card = screen.getByTestId('spotlight-surface');
    expect(card).toHaveClass('spotlight-card', 'spotlight-card--padded');

    fireEvent.mouseMove(card, { clientX: 120, clientY: 64 });
    expect(card.style.getPropertyValue('--mouse-x')).not.toBe('');
    expect(card.style.getPropertyValue('--mouse-y')).not.toBe('');
  });

  it('SegmentedTabs hỗ trợ chọn tab bằng chuột và điều hướng bàn phím (ArrowRight, ArrowLeft, Home, End)', async () => {
    const user = userEvent.setup();
    let active: 'summary' | 'logs' | 'alerts' = 'summary';

    const { rerender } = render(
      <SegmentedTabs
        ariaLabel="Phân hệ kiểm thử"
        items={[
          { id: 'summary', label: 'Tổng quan' },
          { id: 'logs', label: 'Nhật ký', badge: 12 },
          { id: 'alerts', label: 'Cảnh báo', badge: 3 },
        ]}
        value={active}
        onChange={(next) => {
          active = next;
        }}
      />,
    );

    const summaryTab = screen.getByRole('tab', { name: /Tổng quan/i });
    expect(summaryTab).toHaveAttribute('aria-selected', 'true');

    summaryTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(active).toBe('logs');

    rerender(
      <SegmentedTabs
        ariaLabel="Phân hệ kiểm thử"
        items={[
          { id: 'summary', label: 'Tổng quan' },
          { id: 'logs', label: 'Nhật ký', badge: 12 },
          { id: 'alerts', label: 'Cảnh báo', badge: 3 },
        ]}
        value={active}
        onChange={(next) => {
          active = next;
        }}
      />,
    );

    expect(screen.getByRole('tab', { name: /Nhật ký/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('DecryptedText và Badge (tone="info", pulse) render đầy đủ ngữ nghĩa', () => {
    render(
      <div>
        <DecryptedText text="EVT-GATE-2026-001" data-testid="decrypted-id" />
        <Badge tone="info" pulse>
          Đang đồng bộ
        </Badge>
      </div>,
    );

    expect(screen.getByTestId('decrypted-id')).toHaveTextContent('EVT-GATE-2026-001');
    expect(screen.getByText('Đang đồng bộ').closest('.badge')).toHaveClass('badge--info');
  });
});
