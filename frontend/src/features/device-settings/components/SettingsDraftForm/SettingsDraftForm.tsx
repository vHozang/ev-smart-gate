import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/features/auth';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';
import { Select } from '@/shared/ui/Select';
import type { ModalContext } from '@/shared/feedback';
import { canPrepareLocalDraft } from '../../model/types';
import type { DraftKind, SettingsFormValues } from '../../model/types';
import {
  draftReviewRows,
  emptySettingsForm,
  settingsDraftSchema,
  settingsFormSchema,
} from '../../model/draft';
import type { SettingsDraft } from '../../model/draft';
export interface SettingsDraftFormProps {
  kind: DraftKind;
  modal: ModalContext;
}
export function SettingsDraftForm({ kind, modal }: SettingsDraftFormProps) {
  const { principal } = useAuth();
  const allowed = canPrepareLocalDraft(principal);
  const [review, setReview] = useState<SettingsDraft | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isDirty },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: emptySettingsForm(kind),
  });
  const values = useWatch({ control });
  const fingerprint = JSON.stringify(values);
  const { setDirty } = modal;
  useEffect(() => {
    setDirty(isDirty);
    return () => setDirty(false);
  }, [isDirty, setDirty]);
  useEffect(() => {
    setReview(null);
  }, [fingerprint]);
  useEffect(() => {
    if (kind === 'bindings' && values.accessMode === 'PEDESTRIAN' && values.plateCameraRef)
      setValue('plateCameraRef', '', { shouldDirty: true, shouldValidate: true });
  }, [kind, values.accessMode, values.plateCameraRef, setValue]);
  useEffect(() => {
    if (review) heading.current?.focus();
  }, [review]);
  function input(key: keyof SettingsFormValues, label: string, hint?: string, required = true) {
    const id = `${modal.formId}-${key}`;
    const error = errors[key]?.message;
    return (
      <Field key={key} id={id} label={label} required={required} hint={hint} error={error}>
        <Input
          id={id}
          {...register(key)}
          autoComplete="off"
          aria-invalid={!!error}
          aria-describedby={
            [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
          }
          inputMode={key === 'timeoutMs' || key === 'debounceMs' ? 'numeric' : undefined}
        />
      </Field>
    );
  }
  function select(
    key: keyof SettingsFormValues,
    label: string,
    choices: readonly [string, string][],
  ) {
    const id = `${modal.formId}-${key}`;
    const error = errors[key]?.message;
    return (
      <Field key={key} id={id} label={label} required error={error}>
        <Select
          id={id}
          {...register(key)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        >
          <option value="">Chọn {label.toLocaleLowerCase('vi')}</option>
          {choices.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </Select>
      </Field>
    );
  }
  const locationFields = (
    <>
      {input('accessPointRef', 'Mã điểm ra vào')}
      {input('laneRef', 'Mã làn')}
    </>
  );
  const directionField = select('direction', 'Hướng di chuyển', [
    ['ENTRY', 'Chiều vào'],
    ['EXIT', 'Chiều ra'],
  ]);
  const connectionField = input(
    'connectionProfileRef',
    'Mã profile kết nối',
    'Chỉ nhập mã tham chiếu; thông tin xác thực do dịch vụ quản lý.',
  );
  function reviewDraft(form: SettingsFormValues) {
    if (!canPrepareLocalDraft(principal)) return;
    const result = settingsDraftSchema.safeParse(form);
    if (result.success) setReview(result.data);
  }
  return (
    <form id={modal.formId} onSubmit={handleSubmit(reviewDraft)} noValidate className="form-stack">
      <p className="inline-note">
        Bản nháp chỉ ở phiên làm việc này. Kiểm tra biểu mẫu không xác nhận thiết bị tồn tại, kết
        nối được hoặc cấu hình đã áp dụng.
      </p>
      {!allowed && (
        <p className="form-error" role="alert">
          Bạn không có quyền chuẩn bị bản nháp cấu hình.
        </p>
      )}
      <fieldset disabled={!allowed} className="settings-form-fields">
        <legend className="sr-only">Thông tin bản nháp cấu hình</legend>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {input('name', 'Tên cấu hình')}
          {kind === 'cameras' && (
            <>
              {locationFields}
              {directionField}
              {select('purpose', 'Vai trò camera', [
                ['FACE', 'Khuôn mặt'],
                ['PLATE', 'Biển số'],
                ['OVERVIEW', 'Giám sát'],
              ])}
              {connectionField}
            </>
          )}
          {kind === 'models' && (
            <>
              {select('task', 'Tác vụ nhận diện', [
                ['FACE_VERIFICATION', 'Xác minh mặt 1:1'],
                ['FACE_DETECTION', 'Phát hiện khuôn mặt'],
                ['PLATE_OCR', 'Đọc biển số'],
                ['LIVENESS', 'Kiểm tra liveness'],
              ])}
              {input(
                'modelRef',
                'Mã mô hình',
                'Tham chiếu mô hình sẽ được đối chiếu danh mục của dịch vụ.',
              )}
              {input('modelVersion', 'Phiên bản mô hình')}
            </>
          )}
          {kind === 'barriers' && (
            <>
              {locationFields}
              {connectionField}
              {input(
                'timeoutMs',
                'Thời gian chờ ACK (ms)',
                'Có thể để trống; giới hạn thiết bị thật cần được xác nhận.',
                false,
              )}
            </>
          )}
          {kind === 'readers' && (
            <>
              {locationFields}
              {directionField}
              {connectionField}
              {input(
                'debounceMs',
                'Chống quét lặp (ms)',
                'Có thể để trống; giá trị sẽ được kiểm tra theo khả năng đầu đọc.',
                false,
              )}
            </>
          )}
          {kind === 'bindings' && (
            <>
              {locationFields}
              {directionField}
              {select('accessMode', 'Chế độ kiểm soát', [
                ['PEDESTRIAN', 'Nhân viên đi bộ'],
                ['MOTORCYCLE', 'Xe máy'],
                ['CAR', 'Ô tô'],
                ['TRUCK', 'Xe tải'],
              ])}
              {input('faceCameraRef', 'Mã camera khuôn mặt')}
              {values.accessMode &&
                values.accessMode !== 'PEDESTRIAN' &&
                input('plateCameraRef', 'Mã camera biển số')}
              {input('readerRef', 'Mã đầu đọc thẻ')}
              {input(
                'barrierRef',
                'Mã bộ chấp hành',
                'Để trống khi cần xác nhận loại thiết bị phù hợp cho lối đi.',
                false,
              )}
            </>
          )}
        </div>
        <div className="mt-5">
          {input(
            'notes',
            'Ghi chú',
            'Không nhập mật khẩu, token hoặc thông tin sinh trắc học.',
            false,
          )}
        </div>
      </fieldset>
      {kind === 'models' && (
        <p className="field__hint">
          Ngưỡng nhận diện chỉ chỉnh được khi có danh mục model cùng đơn vị và khoảng hợp lệ từ dịch
          vụ.
        </p>
      )}
      {kind === 'cameras' && (
        <p className="field__hint">
          Vùng ROI và hiệu chuẩn sẽ được thiết lập trên hình ảnh camera thật khi dịch vụ sẵn sàng.
        </p>
      )}
      {review && allowed && (
        <section className="draft-review" aria-labelledby="draft-review-title">
          <div className="draft-review__heading">
            <h3 id="draft-review-title" ref={heading} tabIndex={-1}>
              Xem lại bản nháp
            </h3>
            <span className="draft-tag">Chưa lưu</span>
          </div>
          <p className="field__hint" role="status">
            Biểu mẫu hợp lệ ở phía giao diện. Chưa kiểm tra kết nối và chưa áp dụng.
          </p>
          <dl className="settings-summary">
            {draftReviewRows(review).map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </form>
  );
}
