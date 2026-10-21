import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { normalizeError, queryKeys } from '@/shared/api';
import type { ApiError } from '@/shared/api';
import { useFeedback, openValidationNoticeModal } from '@/shared/feedback';
import type { ModalContext } from '@/shared/feedback';
import { useAsyncScope } from '@/shared/hooks';
import { Button } from '@/shared/ui/Button';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import { createDriver, updateDriver, driverCreateSchema, driverUpdateSchema } from '../../api';
import type { Driver } from '../../api';

export interface DriverFormProps {
  modal: ModalContext;
  driver?: Driver;
}

const DRIVER_FIELD_LABELS: Record<string, string> = {
  full_name: 'Họ và tên',
  employee_code: 'Mã định danh / Mã nhân sự',
  phone: 'Số điện thoại liên hệ',
  face_image: 'Ảnh khuôn mặt đăng ký AI',
  status: 'Trạng thái hồ sơ',
};

export function DriverForm({ modal, driver }: DriverFormProps) {
  const beginScope = useAsyncScope();
  const { principal } = useAuth();
  const client = useQueryClient();
  const feedback = useFeedback();

  const [fullName, setFullName] = useState(driver?.full_name || '');
  const [employeeCode, setEmployeeCode] = useState(driver?.employee_code || '');
  const [phone, setPhone] = useState(driver?.phone || '');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>(driver?.status || 'ACTIVE');
  const [faceImage, setFaceImage] = useState<File | null>(null);
  const [facePreviewUrl, setFacePreviewUrl] = useState<string | null>(null);
  const [webcamOpen, setWebcamOpen] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);

  const saving = useRef(false);
  const uncertain = useRef(false);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  async function toggleWebcam() {
    setWebcamError(null);
    if (webcamOpen) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setWebcamOpen(false);
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setWebcamError('Trình duyệt không hỗ trợ Webcam.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setWebcamOpen(true);
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
        }
      }, 60);
    } catch {
      setWebcamError('Không thể bật Webcam. Vui lòng cấp quyền Camera hoặc chọn ảnh từ máy.');
    }
  }

  function captureFromWebcam() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setWebcamError('Camera chưa sẵn sàng khung hình, vui lòng thử lại sau 1 giây.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const capturedFile = new File([blob], `enroll-face-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        setFaceImage(capturedFile);
        setFacePreviewUrl(URL.createObjectURL(capturedFile));
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        setWebcamOpen(false);
      },
      'image/jpeg',
      0.92,
    );
  }

  const isDirty =
    fullName !== (driver?.full_name || '') ||
    employeeCode !== (driver?.employee_code || '') ||
    phone !== (driver?.phone || '') ||
    status !== (driver?.status || 'ACTIVE') ||
    faceImage !== null;

  const { setDirty, setPending, close, formId } = modal;

  useEffect(() => {
    setDirty(isDirty);
    return () => setDirty(false);
  }, [isDirty, setDirty]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving.current || uncertain.current || !principal) return;

    setFieldErrors({});
    setValidationError(null);
    setError(null);

    if (driver) {
      const parsed = driverUpdateSchema.safeParse({
        full_name: fullName,
        employee_code: employeeCode,
        phone,
        face_image: faceImage,
        status,
      });
      if (!parsed.success) {
        const nextFieldErrors: Record<string, string> = {};
        const invalidLabels: string[] = [];
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] || '');
          if (key && !nextFieldErrors[key]) {
            nextFieldErrors[key] = issue.message;
          }
          invalidLabels.push(DRIVER_FIELD_LABELS[key] || key || 'Dữ liệu hồ sơ');
        }
        setFieldErrors(nextFieldErrors);
        setValidationError(parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ.');
        openValidationNoticeModal(feedback, {
          id: 'driver-validation-notice',
          title: 'Thiếu hoặc sai thông tin hồ sơ nhận diện',
          fields: invalidLabels,
        });
        return;
      }

      const isCurrent = beginScope();
      saving.current = true;
      setPending(true);
      try {
        const saved = await updateDriver(driver.id, parsed.data);
        if (!isCurrent()) return;
        await client.invalidateQueries({ queryKey: queryKeys.resource(principal.id, 'drivers') });
        if (!isCurrent()) return;
        setPending(false);
        close();
        feedback.notify({
          id: `driver-saved-${saved.id}`,
          tone: 'success',
          title: 'Đã cập nhật hồ sơ nhận diện',
          description: saved.full_name,
        });
      } catch (cause) {
        if (!isCurrent()) return;
        const safe = normalizeError(cause);
        setError(safe);
        if (
          safe.code === 'NETWORK_ERROR' ||
          safe.code === 'CONTRACT_INVALID' ||
          (safe.status !== undefined && safe.status >= 500)
        ) {
          uncertain.current = true;
          setOutcomeUnknown(true);
          modal.setSubmitBlocked(true);
        }
      } finally {
        saving.current = false;
        setPending(false);
      }
    } else {
      const parsed = driverCreateSchema.safeParse({
        full_name: fullName,
        employee_code: employeeCode,
        phone,
        face_image: faceImage,
      });
      if (!parsed.success) {
        const nextFieldErrors: Record<string, string> = {};
        const invalidLabels: string[] = [];
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] || '');
          if (key && !nextFieldErrors[key]) {
            nextFieldErrors[key] = issue.message;
          }
          invalidLabels.push(DRIVER_FIELD_LABELS[key] || key || 'Dữ liệu hồ sơ');
        }
        setFieldErrors(nextFieldErrors);
        setValidationError(parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ.');
        openValidationNoticeModal(feedback, {
          id: 'driver-validation-notice',
          title: 'Thiếu hoặc sai thông tin đăng ký nhận diện',
          fields: invalidLabels,
        });
        return;
      }

      const isCurrent = beginScope();
      saving.current = true;
      setPending(true);
      try {
        const saved = await createDriver(parsed.data);
        if (!isCurrent()) return;
        await client.invalidateQueries({ queryKey: queryKeys.resource(principal.id, 'drivers') });
        if (!isCurrent()) return;
        setPending(false);
        close();
        feedback.notify({
          id: `driver-saved-${saved.id}`,
          tone: 'success',
          title: 'Đã đăng ký hồ sơ nhận diện',
          description: saved.full_name,
        });
      } catch (cause) {
        if (!isCurrent()) return;
        const safe = normalizeError(cause);
        setError(safe);
        if (
          safe.code === 'NETWORK_ERROR' ||
          safe.code === 'CONTRACT_INVALID' ||
          (safe.status !== undefined && safe.status >= 500)
        ) {
          uncertain.current = true;
          setOutcomeUnknown(true);
          modal.setSubmitBlocked(true);
        }
      } finally {
        saving.current = false;
        setPending(false);
      }
    }
  }

  return (
    <form id={formId} className="form-stack" onSubmit={(e) => void handleSubmit(e)} noValidate>
      {outcomeUnknown && (
        <div className="inline-note" role="status">
          <div>
            <strong>Chưa xác nhận được kết quả đăng ký.</strong>
            <p>Dịch vụ có thể đã nhận yêu cầu. Hãy kiểm tra lại danh sách trước khi gửi thêm.</p>
            <Button
              className="mt-3"
              onClick={() => {
                if (principal)
                  void client.invalidateQueries({
                    queryKey: queryKeys.resource(principal.id, 'drivers'),
                  });
                modal.close();
              }}
            >
              Đóng và kiểm tra danh sách
            </Button>
          </div>
        </div>
      )}

      {validationError && (
        <div role="alert" className="form-error">
          {validationError}
        </div>
      )}

      {error && (
        <div role="alert" className="form-error">
          {error.message}
          {error.requestId && <small>Mã yêu cầu: {error.requestId}</small>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field id={`${formId}-full_name`} label="Họ và tên" error={fieldErrors.full_name} required>
          <Input
            id={`${formId}-full_name`}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nhập họ và tên người đăng ký"
            disabled={modal.pending}
            autoComplete="off"
          />
        </Field>

        <Field
          id={`${formId}-employee_code`}
          label="Mã định danh / Mã nhân sự"
          error={fieldErrors.employee_code}
        >
          <Input
            id={`${formId}-employee_code`}
            value={employeeCode}
            onChange={(e) => setEmployeeCode(e.target.value)}
            placeholder="Không bắt buộc (vd: NV-9988)"
            disabled={modal.pending}
            autoComplete="off"
          />
        </Field>

        <Field
          id={`${formId}-phone`}
          label="Số điện thoại liên hệ"
          error={fieldErrors.phone}
        >
          <Input
            id={`${formId}-phone`}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Không bắt buộc (vd: 0901234567)"
            disabled={modal.pending}
            autoComplete="off"
          />
        </Field>

        <Field
          id={`${formId}-face_image`}
          label={driver ? 'Cập nhật ảnh khuôn mặt mới' : 'Ảnh khuôn mặt đăng ký AI'}
          error={fieldErrors.face_image}
          required={!driver}
        >
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={webcamOpen ? 'danger' : 'secondary'}
                disabled={modal.pending}
                onClick={() => void toggleWebcam()}
              >
                {webcamOpen ? 'Tắt Webcam' : 'Bật Webcam chụp khuôn mặt'}
              </Button>
              {webcamOpen && (
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  disabled={modal.pending}
                  onClick={captureFromWebcam}
                >
                  Chụp ảnh khuôn mặt này
                </Button>
              )}
            </div>

            {webcamError && (
              <p className="text-xs text-amber-400">{webcamError}</p>
            )}

            {webcamOpen && (
              <div className="relative rounded-xl overflow-hidden border border-[var(--color-border)] bg-slate-950 aspect-video max-w-sm">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {facePreviewUrl && !webcamOpen && (
              <div className="flex items-center gap-3 p-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10">
                <img
                  src={facePreviewUrl}
                  alt="Ảnh khuôn mặt đã chọn"
                  className="w-16 h-16 rounded-lg object-cover border border-emerald-400"
                />
                <div className="text-xs">
                  <p className="font-semibold text-emerald-300">Đã có ảnh khuôn mặt đăng ký</p>
                  <p className="text-[var(--color-muted)]">{faceImage?.name}</p>
                </div>
              </div>
            )}

            <input
              id={`${formId}-face_image`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="input"
              disabled={modal.pending}
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setFaceImage(file);
                setFacePreviewUrl(file ? URL.createObjectURL(file) : null);
              }}
            />
          </div>
        </Field>

        {driver && (
          <Field id={`${formId}-status`} label="Trạng thái hồ sơ" error={fieldErrors.status}>
            <Select
              id={`${formId}-status`}
              value={status}
              onChange={(e) => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
              disabled={modal.pending}
            >
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="INACTIVE">Ngừng hoạt động</option>
            </Select>
          </Field>
        )}
      </div>

      <p className="field__hint">
        Hồ sơ nhận diện phục vụ đối sánh sinh trắc học tại cổng, hoàn toàn tách biệt với tài khoản
        đăng nhập hệ thống (User) và không thay thế sổ đăng ký nhân sự (EmployeeRegistry).
      </p>
    </form>
  );
}
