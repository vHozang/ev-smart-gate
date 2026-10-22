import { useEffect, useState } from 'react';
import { CameraIcon, CheckCircleIcon, EyeIcon } from '@phosphor-icons/react';
import { normalizeError } from '@/shared/api';
import { openValidationNoticeModal, useFeedback } from '@/shared/feedback';
import { formatDate } from '@/shared/lib';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { EvidenceViewer } from '@/shared/ui/EvidenceViewer';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import {
  captureDockSession,
  fetchDockCaptureBlob,
  finalizeDockSession,
  getDockSession,
  type CargoState,
  type DockSessionDetail,
} from '../../api';

export interface DockSessionModalProps {
  inspectionId: string;
  initialSession?: DockSessionDetail;
  canCapture: boolean;
  canFinalize: boolean;
  onUpdated?: () => Promise<void> | void;
}

const cargoStateLabels: Record<CargoState, string> = {
  EMPTY: 'Thùng rỗng (EMPTY)',
  LOADING: 'Đang xếp hàng (LOADING)',
  LOADED: 'Đã xếp đầy (LOADED)',
  ANOMALY: 'Bất thường (ANOMALY)',
  UNKNOWN: 'Chưa xác định (UNKNOWN)',
};

export function DockSessionModal({
  inspectionId,
  initialSession,
  canCapture,
  canFinalize,
  onUpdated,
}: DockSessionModalProps) {
  const feedback = useFeedback();
  const [session, setSession] = useState<DockSessionDetail | null>(initialSession ?? null);
  const [loading, setLoading] = useState(!initialSession);
  const [error, setError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | undefined>(undefined);
  const [noteError, setNoteError] = useState<string | undefined>(undefined);

  const [captureFile, setCaptureFile] = useState<File | null>(null);
  const [captureCargoState, setCaptureCargoState] = useState<CargoState>('LOADING');
  const [capturing, setCapturing] = useState(false);

  const [finalState, setFinalState] = useState<CargoState>('LOADED');
  const [operatorNote, setOperatorNote] = useState('');
  const [finalizing, setFinalizing] = useState(false);

  const [selectedCaptureIndex, setSelectedCaptureIndex] = useState<number | null>(null);
  const [captureBlob, setCaptureBlob] = useState<Blob | null>(null);
  const [loadingBlob, setLoadingBlob] = useState(false);

  const loadDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const detail = await getDockSession(inspectionId);
      setSession(detail);
      setFinalState(
        detail.current_cargo_state === 'UNKNOWN' ? 'LOADED' : detail.current_cargo_state,
      );
      if (detail.operator_note) {
        setOperatorNote(detail.operator_note);
      }
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionId]);

  useEffect(() => {
    if (selectedCaptureIndex === null) {
      setCaptureBlob(null);
      return;
    }
    const controller = new AbortController();
    setLoadingBlob(true);
    fetchDockCaptureBlob(inspectionId, selectedCaptureIndex, controller.signal)
      .then((blob) => {
        setCaptureBlob(blob);
      })
      .catch(() => {
        setCaptureBlob(null);
      })
      .finally(() => {
        setLoadingBlob(false);
      });
    return () => controller.abort();
  }, [inspectionId, selectedCaptureIndex]);

  const handleCaptureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCaptureError(undefined);
    if (!captureFile) {
      const msg = 'Vui lòng chọn ảnh chụp thùng hàng tại Dock.';
      setError(msg);
      setCaptureError(msg);
      openValidationNoticeModal(feedback, {
        title: 'Chưa chọn ảnh kiểm hàng tại Dock',
        fields: ['Ảnh chụp thùng xe / hàng hóa'],
      });
      return;
    }
    setCapturing(true);
    setError(null);
    try {
      await captureDockSession(inspectionId, {
        image: captureFile,
        cargo_state: captureCargoState,
      });
      setCaptureFile(null);
      await loadDetail();
      await onUpdated?.();
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setCapturing(false);
    }
  };

  const handleFinalizeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNoteError(undefined);
    if (operatorNote.trim().length < 3) {
      const msg = 'Vui lòng nhập ghi chú xác nhận kiểm hàng tối thiểu 3 ký tự.';
      setError(msg);
      setNoteError(msg);
      openValidationNoticeModal(feedback, {
        title: 'Chưa đủ thông tin chốt phiên Dock',
        fields: ['Ghi chú xác nhận của nhân viên kho'],
      });
      return;
    }
    setFinalizing(true);
    setError(null);
    try {
      await finalizeDockSession(inspectionId, {
        operator_note: operatorNote.trim(),
        final_cargo_state: finalState,
      });
      await loadDetail();
      await onUpdated?.();
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setFinalizing(false);
    }
  };

  if (loading && !session) {
    return <p className="text-xs text-[var(--color-muted)]">Đang tải thông tin phiên Dock...</p>;
  }

  return (
    <div className="space-y-4 text-sm" data-testid="dock-session-modal">
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}

      {session && (
        <>
          <div className="p-3 rounded-lg border surface flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold mono">Phiên Dock: {session.id}</p>
              <p className="text-xs text-[var(--color-muted)]">
                Đơn hàng: <span className="mono">{session.order_id}</span> · Số lần chụp:{' '}
                <strong>{session.capture_count}</strong>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="info">{cargoStateLabels[session.current_cargo_state]}</Badge>
              <Badge
                tone={
                  session.status === 'APPROVED'
                    ? 'success'
                    : session.status === 'REVIEW_REQUIRED'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {session.status}
              </Badge>
            </div>
          </div>

          {session.captures && session.captures.length > 0 && (
            <div className="p-3 rounded-lg border surface space-y-2">
              <span className="text-xs font-semibold text-[var(--color-muted)] block">
                Lịch sử ảnh chụp & quan sát AI tại Dock ({session.captures.length})
              </span>
              <div className="space-y-2">
                {session.captures.map((cap) => (
                  <div
                    key={cap.index}
                    className="p-2.5 rounded border border-[var(--color-border)] flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-semibold mono">Ảnh #{cap.index + 1}</span> ·{' '}
                      <span>{formatDate(cap.captured_at)}</span> ·{' '}
                      <Badge tone="neutral">{cargoStateLabels[cap.cargo_state]}</Badge>
                      {cap.detections.length > 0 && (
                        <p className="text-[11px] text-[var(--color-muted)] mt-1">
                          AI phát hiện:{' '}
                          {cap.detections
                            .map((d) => `${d.class_name} (${(d.confidence * 100).toFixed(0)}%)`)
                            .join(', ')}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<EyeIcon size={15} />}
                      onClick={() => setSelectedCaptureIndex(cap.index)}
                    >
                      Xem ảnh
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedCaptureIndex !== null && (
            <div className="p-3 rounded-lg border surface space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">
                  Bằng chứng ảnh chụp Dock #{selectedCaptureIndex + 1}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setSelectedCaptureIndex(null)}>
                  Ẩn ảnh
                </Button>
              </div>
              {loadingBlob ? (
                <p className="text-xs text-[var(--color-muted)]">Đang tải ảnh bằng chứng...</p>
              ) : (
                <EvidenceViewer
                  source={captureBlob}
                  alt={`Ảnh kiểm hàng Dock #${selectedCaptureIndex + 1}`}
                  title={`Ảnh chụp phiên ${session.id}`}
                />
              )}
            </div>
          )}

          {canCapture && session.status !== 'APPROVED' && session.status !== 'CANCELLED' && (
            <form
              onSubmit={(e) => void handleCaptureSubmit(e)}
              className="p-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] space-y-3"
            >
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                Ghi nhận ảnh kiểm tra hàng hóa tại Dock
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field
                  id="dock-capture-file"
                  label="Ảnh chụp thùng xe / hàng hóa"
                  error={captureError}
                  required
                >
                  <input
                    id="dock-capture-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    aria-label="Ảnh chụp thùng xe / hàng hóa"
                    onChange={(e) => {
                      setCaptureFile(e.target.files?.[0] ?? null);
                      if (captureError) setCaptureError(undefined);
                    }}
                    className="input text-xs"
                  />
                </Field>
                <Field id="dock-capture-state" label="Trạng thái hàng hóa quan sát">
                  <Select
                    id="dock-capture-state"
                    value={captureCargoState}
                    onChange={(e) => setCaptureCargoState(e.target.value as CargoState)}
                  >
                    <option value="EMPTY">Thùng rỗng (EMPTY)</option>
                    <option value="LOADING">Đang xếp hàng (LOADING)</option>
                    <option value="LOADED">Đã xếp đầy (LOADED)</option>
                    <option value="ANOMALY">Bất thường (ANOMALY)</option>
                  </Select>
                </Field>
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  pending={capturing}
                  icon={<CameraIcon size={16} />}
                >
                  Tải ảnh kiểm hàng
                </Button>
              </div>
            </form>
          )}

          {canFinalize && session.status !== 'APPROVED' && session.status !== 'CANCELLED' && (
            <form
              onSubmit={(e) => void handleFinalizeSubmit(e)}
              className="p-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] space-y-3"
            >
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                Hoàn tất kiểm tra & chốt phiên Dock (Finalize)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field id="dock-final-state" label="Trạng thái hàng hóa chốt cuối" required>
                  <Select
                    id="dock-final-state"
                    value={finalState}
                    onChange={(e) => setFinalState(e.target.value as CargoState)}
                  >
                    <option value="LOADED">Đã xếp đầy (LOADED)</option>
                    <option value="LOADING">Đang xếp hàng (LOADING)</option>
                    <option value="EMPTY">Thùng rỗng (EMPTY)</option>
                    <option value="ANOMALY">Bất thường (ANOMALY)</option>
                  </Select>
                </Field>
                <Field
                  id="dock-operator-note"
                  label="Ghi chú xác nhận của nhân viên kho"
                  error={noteError}
                  required
                >
                  <Input
                    id="dock-operator-note"
                    value={operatorNote}
                    invalid={Boolean(noteError)}
                    onChange={(e) => {
                      setOperatorNote(e.target.value);
                      if (noteError) setNoteError(undefined);
                    }}
                    placeholder="Nhập ghi chú niêm phong / kiểm đếm..."
                  />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  variant="primary"
                  pending={finalizing}
                  icon={<CheckCircleIcon size={16} />}
                >
                  Hoàn tất phiên Dock
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
