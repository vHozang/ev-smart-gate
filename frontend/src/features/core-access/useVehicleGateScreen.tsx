import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { normalizeError, queryKeys } from '@/shared/api';
import { openValidationNoticeModal, useFeedback } from '@/shared/feedback';
import {
  createSampleCaptureBundle,
  listAccessPoints,
  listVehicleTypes,
  reconcileAccessEvent,
  resolveVehicleTypeCatalogItem,
  verificationRequestSchema,
  verifyVehicleGate,
} from './api';
import type { VerificationRequest, VerificationView } from './api';

export function useVehicleGateScreen() {
  const { principal } = useAuth();
  const feedback = useFeedback();
  const identity = principal?.id ?? 'anonymous';

  const [direction, setDirection] = useState<'ENTRY' | 'EXIT'>('ENTRY');
  const [gateId, setGateId] = useState('GATE-VEH-01');
  const [eventId, setEventId] = useState('');
  const [captureBundleId, setCaptureBundleId] = useState('');
  const [legacyCheckInput, setLegacyCheckInput] = useState('sedan');
  const [latestVerification, setLatestVerification] = useState<VerificationView | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [verifyFieldErrors, setVerifyFieldErrors] = useState<{
    gate_id?: string;
    event_id?: string;
    capture_bundle_id?: string;
  }>({});

  const vehicleTypesQuery = useQuery({
    queryKey: queryKeys.resource(identity, 'vehicle-types', {}),
    queryFn: ({ signal }) => listVehicleTypes(signal),
    enabled: Boolean(principal),
    placeholderData: keepPreviousData,
  });

  const accessPointsQuery = useQuery({
    queryKey: queryKeys.resource(identity, 'access-points', {}),
    queryFn: ({ signal }) => listAccessPoints(signal),
    enabled: Boolean(principal),
    placeholderData: keepPreviousData,
  });

  const sampleBundleMutation = useMutation({
    mutationFn: (options?: {
      access_mode?: 'motorcycle' | 'car' | 'truck';
      card_uid?: string;
      faceImageFile?: File | null;
      plateImageFile?: File | null;
    }) =>
      createSampleCaptureBundle({
        access_point_id: gateId.trim() || 'GATE-VEH-01',
        access_mode: options?.access_mode ?? 'car',
        card_uid: options?.card_uid,
        faceImageFile: options?.faceImageFile,
        plateImageFile: options?.plateImageFile,
      }),
    onSuccess: (created) => {
      const nextEventId = eventId.trim().length >= 8 ? eventId.trim() : `EVT-VEH-${Date.now()}`;
      setEventId(nextEventId);
      setCaptureBundleId(created.capture_bundle_id);
      setVerifyFieldErrors({});
      setFormError(null);
      feedback.notify({
        id: `sample-veh-bundle-${created.capture_bundle_id}`,
        title: 'Đã thu nhận gói Camera AI (CaptureBundle)',
        description: `Mã gói: ${created.capture_bundle_id.slice(0, 8)}… · Sẵn sàng xác minh phương tiện.`,
        tone: 'success',
      });
    },
    onError: (err) => {
      setFormError(normalizeError(err).message);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (input: VerificationRequest) => verifyVehicleGate(direction, input),
    onSuccess: (result) => {
      setLatestVerification(result);
      setFormError(null);
      feedback.notify({
        id: `veh-verify-${result.event_id}`,
        title: `Đã nhận kết quả xác minh sự kiện ${result.event_id}`,
        tone: result.permit_granted ? 'success' : 'warning',
      });
    },
    onError: (err) => {
      setFormError(normalizeError(err).message);
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: (targetEventId: string) => reconcileAccessEvent(targetEventId),
    onSuccess: (result) => {
      setLatestVerification(result);
      setFormError(null);
      feedback.notify({
        id: `veh-reconcile-${result.event_id}`,
        title: `Đã đối soát trạng thái sự kiện ${result.event_id}`,
        tone: 'info',
      });
    },
    onError: (err) => {
      setFormError(normalizeError(err).message);
    },
  });

  const catalogItems = vehicleTypesQuery.data?.items ?? [];
  const legacyResolution = resolveVehicleTypeCatalogItem(legacyCheckInput, catalogItems);

  const submitVerification = async () => {
    setFormError(null);
    setVerifyFieldErrors({});
    const parsed = verificationRequestSchema.safeParse({
      event_id: eventId.trim(),
      gate_id: gateId.trim(),
      capture_bundle_id: captureBundleId.trim(),
    });
    if (!parsed.success) {
      const nextErrors: {
        gate_id?: string;
        event_id?: string;
        capture_bundle_id?: string;
      } = {};
      const missing: string[] = [];
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'gate_id' && !nextErrors.gate_id) {
          nextErrors.gate_id = issue.message;
          missing.push('Mã cổng / làn kiểm soát (gate_id)');
        } else if (key === 'event_id' && !nextErrors.event_id) {
          nextErrors.event_id = issue.message;
          missing.push('Mã sự kiện định danh (event_id)');
        } else if (key === 'capture_bundle_id' && !nextErrors.capture_bundle_id) {
          nextErrors.capture_bundle_id = issue.message;
          missing.push('Mã gói thu nhận (capture_bundle_id)');
        }
      }
      setVerifyFieldErrors(nextErrors);
      setFormError(
        parsed.error.issues[0]?.message || 'Dữ liệu xác minh phương tiện chưa hợp lệ.',
      );
      openValidationNoticeModal(feedback, {
        title: 'Chưa đủ thông tin xác minh phương tiện tại cổng',
        fields: missing,
      });
      return;
    }
    await verifyMutation.mutateAsync(parsed.data);
  };

  const reconcileByEventId = async (targetEventId: string) => {
    setFormError(null);
    await reconcileMutation.mutateAsync(targetEventId);
  };

  return {
    data: {
      vehicleTypes: catalogItems,
      accessPoints: accessPointsQuery.data?.items ?? [],
      direction,
      gateId,
      eventId,
      captureBundleId,
      verifyFieldErrors,
      legacyCheckInput,
      legacyResolution,
      latestVerification,
    },
    state: {
      unavailable: !principal,
      loading: Boolean(principal) && (vehicleTypesQuery.isPending || accessPointsQuery.isPending),
      verifying: verifyMutation.isPending,
      generatingBundle: sampleBundleMutation.isPending,
      reconciling: reconcileMutation.isPending,
      error:
        formError ||
        (vehicleTypesQuery.error ? normalizeError(vehicleTypesQuery.error).message : null),
    },
    actions: {
      setDirection,
      setGateId: (val: string) => {
        setGateId(val);
        if (verifyFieldErrors.gate_id) {
          setVerifyFieldErrors((prev) => ({ ...prev, gate_id: undefined }));
        }
      },
      setEventId: (val: string) => {
        setEventId(val);
        if (verifyFieldErrors.event_id) {
          setVerifyFieldErrors((prev) => ({ ...prev, event_id: undefined }));
        }
      },
      setCaptureBundleId: (val: string) => {
        setCaptureBundleId(val);
        if (verifyFieldErrors.capture_bundle_id) {
          setVerifyFieldErrors((prev) => ({ ...prev, capture_bundle_id: undefined }));
        }
      },
      setLegacyCheckInput,
      generateSampleBundle: async (options?: {
        access_mode?: 'motorcycle' | 'car' | 'truck';
        card_uid?: string;
        faceImageFile?: File | null;
        plateImageFile?: File | null;
      }) => {
        setFormError(null);
        await sampleBundleMutation.mutateAsync(options);
      },
      scanAndVerifyFromCamera: async (options?: {
        access_mode?: 'motorcycle' | 'car' | 'truck';
        card_uid?: string;
        faceImageFile?: File | null;
        plateImageFile?: File | null;
      }) => {
        setFormError(null);
        setVerifyFieldErrors({});
        const safeGateId = gateId.trim() || 'GATE-VEH-01';
        if (!gateId.trim()) {
          setGateId(safeGateId);
        }
        const created = await sampleBundleMutation.mutateAsync(options);
        const nextEventId = `EVT-VEH-${Date.now()}`;
        setEventId(nextEventId);
        setCaptureBundleId(created.capture_bundle_id);
        await verifyMutation.mutateAsync({
          event_id: nextEventId,
          gate_id: safeGateId,
          capture_bundle_id: created.capture_bundle_id,
        });
      },
      submitVerification,
      reconcileByEventId,
      reloadCatalog: () => {
        void vehicleTypesQuery.refetch();
        void accessPointsQuery.refetch();
      },
    },
  };
}
