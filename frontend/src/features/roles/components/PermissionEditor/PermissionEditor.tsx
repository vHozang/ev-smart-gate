import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { openValidationNoticeModal, useFeedback } from '@/shared/feedback';
import type { RoleView, PermissionView, PermissionReplaceInput } from '../../model/schema';
import { permissionReplaceSchema } from '../../model/schema';
import { Field } from '@/shared/ui/Field';
import { Input } from '@/shared/ui/Input';
import { Badge } from '@/shared/ui/Badge';
import { ShieldWarningIcon, PlusCircleIcon, MinusCircleIcon } from '@phosphor-icons/react';

export interface PermissionEditorProps {
  role: RoleView;
  catalog: PermissionView[];
  formId: string;
  onSubmit: (data: PermissionReplaceInput) => Promise<void>;
}

export function PermissionEditor({ role, catalog, formId, onSubmit }: PermissionEditorProps) {
  const feedback = useFeedback();
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set(role.permission_codes));
  const [reason, setReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);

  // Tính selection diff
  const originalCodes = useMemo(() => new Set(role.permission_codes), [role.permission_codes]);

  const addedCodes = useMemo(() => {
    return Array.from(selectedCodes).filter((code) => !originalCodes.has(code));
  }, [selectedCodes, originalCodes]);

  const removedCodes = useMemo(() => {
    return Array.from(originalCodes).filter((code) => !selectedCodes.has(code));
  }, [selectedCodes, originalCodes]);

  // Gom nhóm catalog theo group
  const groupedCatalog = useMemo(() => {
    return catalog.reduce<Record<string, PermissionView[]>>((acc, perm) => {
      const g = perm.group || 'Khác';
      if (!acc[g]) acc[g] = [];
      acc[g].push(perm);
      return acc;
    }, {});
  }, [catalog]);

  const handleToggle = (perm: PermissionView) => {
    const next = new Set(selectedCodes);
    if (next.has(perm.code)) {
      next.delete(perm.code);
    } else {
      next.add(perm.code);
      // Tự động gợi ý kích hoạt các dependencies nếu có
      perm.dependencies.forEach((dep) => next.add(dep));
    }
    setSelectedCodes(next);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setReasonError(undefined);

    const parsed = permissionReplaceSchema.safeParse({
      expected_version: role.version,
      reason,
      permission_codes: Array.from(selectedCodes),
    });

    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message || 'Vui lòng nhập lý do thay đổi phân quyền.';
      setErrorMsg(msg);
      setReasonError(msg);
      openValidationNoticeModal(feedback, {
        title: 'Chưa đủ thông tin cập nhật phân quyền',
        fields: ['Lý do cập nhật tập quyền'],
      });
      return;
    }

    await onSubmit(parsed.data);
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4 text-sm">
      <div className="p-3 rounded-lg border surface flex justify-between items-center">
        <div>
          <span className="text-xs text-[var(--color-muted)] block">Vai trò đang phân quyền:</span>
          <strong className="font-semibold text-base mono text-[var(--color-text)]">
            {role.name} ({role.code})
          </strong>
        </div>
        <div className="text-right">
          <span className="text-xs text-[var(--color-muted)] block">Phiên bản:</span>
          <span className="mono font-semibold text-xs">v{role.version}</span>
        </div>
      </div>

      {/* Hiển thị Selection Diff trực quan */}
      <div className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)] space-y-2">
        <span className="text-xs font-semibold block text-[var(--color-text)]">
          Biến động quyền hạn (Selection Diff):
        </span>
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-[var(--color-success)]">
            <PlusCircleIcon size={16} />
            <span>
              Thêm: <strong>+{addedCodes.length}</strong> quyền
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[var(--color-danger)]">
            <MinusCircleIcon size={16} />
            <span>
              Gỡ: <strong>-{removedCodes.length}</strong> quyền
            </span>
          </div>
          <div className="text-[var(--color-muted)] ml-auto">
            Tổng cộng sẽ cấp: <strong>{selectedCodes.size}</strong> quyền
          </div>
        </div>

        {addedCodes.length > 0 && (
          <div className="text-xs flex flex-wrap gap-1 pt-1">
            {addedCodes.map((c) => (
              <span
                key={c}
                className="px-1.5 py-0.5 rounded mono bg-[var(--color-success-subtle)] text-[var(--color-success)]"
              >
                +{c}
              </span>
            ))}
          </div>
        )}

        {removedCodes.length > 0 && (
          <div className="text-xs flex flex-wrap gap-1 pt-1">
            {removedCodes.map((c) => (
              <span
                key={c}
                className="px-1.5 py-0.5 rounded mono bg-[var(--color-danger-subtle)] text-[var(--color-danger)]"
              >
                -{c}
              </span>
            ))}
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-[var(--color-danger-subtle)] text-[var(--color-danger)] text-xs">
          {errorMsg}
        </div>
      )}

      {/* Danh mục quyền catalog gom nhóm */}
      <div className="border rounded-lg surface divide-y divide-[var(--color-border)] max-h-[320px] overflow-auto">
        {Object.entries(groupedCatalog).map(([group, perms]) => (
          <div key={group} className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                Nhóm: {group}
              </span>
              <span className="text-xs text-[var(--color-muted)]">
                {perms.filter((p) => selectedCodes.has(p.code)).length} / {perms.length} đã chọn
              </span>
            </div>

            <div className="space-y-1.5">
              {perms.map((perm) => {
                const isChecked = selectedCodes.has(perm.code);
                return (
                  <label
                    key={perm.code}
                    className="flex items-start gap-2.5 p-2 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded"
                      checked={isChecked}
                      onChange={() => handleToggle(perm)}
                    />
                    <div className="space-y-0.5 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-medium text-[var(--color-text)]">
                          {perm.code}
                        </span>
                        {perm.protected && (
                          <Badge tone="warning">
                            <span className="flex items-center gap-0.5">
                              <ShieldWarningIcon size={12} /> Quyền bảo vệ
                            </span>
                          </Badge>
                        )}
                      </div>
                      <p className="text-[var(--color-muted)]">{perm.description}</p>
                      {perm.dependencies.length > 0 && (
                        <p className="text-[11px] text-[var(--color-muted)]">
                          Phụ thuộc: <span className="mono">{perm.dependencies.join(', ')}</span>
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Field label="Lý do cập nhật tập quyền" required id="perm-reason" error={reasonError}>
        <Input
          id="perm-reason"
          value={reason}
          invalid={Boolean(reasonError)}
          onChange={(e) => {
            setReason(e.target.value);
            if (reasonError) setReasonError(undefined);
          }}
          placeholder="Nhập lý do nghiệp vụ phê duyệt thay đổi phân quyền (tối thiểu 3 ký tự)..."
        />
      </Field>
    </form>
  );
}
