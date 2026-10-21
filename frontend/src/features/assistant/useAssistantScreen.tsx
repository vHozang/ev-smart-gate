import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { invalidateResource, normalizeError, queryKeys } from '@/shared/api';
import { useFeedback } from '@/shared/feedback';
import {
  cancelAssistantReport,
  createAssistantReport,
  getAssistantReport,
  listAssistantReports,
} from './api';
import { inspectPromptPrivacy } from './privacyGuard';
import type { ReportStatus, ReportTemplate, ReportView } from './api';

export type StreamConnectionState = 'idle' | 'streaming' | 'disconnected_by_client' | 'completed';

export function useAssistantScreen() {
  const { principal } = useAuth();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const identity = principal?.id ?? 'anonymous';

  const [prompt, setPrompt] = useState('');
  const [maskConfidentialPii, setMaskConfidentialPii] = useState(true);
  const [template, setTemplate] = useState<ReportTemplate | ''>('access-summary');
  const [from, setFrom] = useState('2026-10-20T00:00:00Z');
  const [to, setTo] = useState('2026-10-21T23:59:59Z');
  const [timezone, setTimezone] = useState<'Asia/Bangkok' | 'UTC'>('Asia/Bangkok');
  const [accessMode, setAccessMode] = useState<'pedestrian' | 'motorcycle' | 'car' | 'truck' | ''>(
    '',
  );
  const [direction, setDirection] = useState<'ENTRY' | 'EXIT' | ''>('');
  const [statusFilter, setStatusFilter] = useState<ReportStatus | ''>('');

  const [activeReport, setActiveReport] = useState<ReportView | null>(null);
  const [streamState, setStreamState] = useState<StreamConnectionState>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  const streamAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
    };
  }, []);

  const reportsQuery = useQuery({
    queryKey: queryKeys.resource(identity, 'assistant-reports', {
      status: statusFilter,
    }),
    queryFn: ({ signal }) => listAssistantReports({ status: statusFilter, limit: 20 }, signal),
    enabled: Boolean(principal),
  });

  const privacyCheck = inspectPromptPrivacy(prompt);

  const createMutation = useMutation({
    mutationFn: async () => {
      const check = inspectPromptPrivacy(prompt);
      if (!check.allowed) {
        throw new Error(check.message || 'Nội dung chứa dữ liệu nhạy cảm bị chặn.');
      }
      if (check.requiresMasking && !maskConfidentialPii) {
        throw new Error(
          'Nội dung có dữ liệu cá nhân (Confidential). Vui lòng bật ẩn danh tự động (Masking) trước khi gửi.',
        );
      }
      const safePrompt = check.requiresMasking ? check.maskedPrompt : prompt;
      return createAssistantReport(
        {
          prompt: safePrompt.trim(),
          period: { from, to, timezone },
          filters: {
            access_mode: accessMode || null,
            direction: direction || null,
            access_point_id: null,
          },
          template: template || null,
        },
        `rep-${Date.now()}`,
      );
    },
    onSuccess: async (created) => {
      setActiveReport(created);
      setFormError(null);
      const isTerminal =
        created.status === 'COMPLETED' ||
        created.status === 'FAILED' ||
        created.status === 'CANCELED';
      setStreamState(isTerminal ? 'completed' : 'streaming');
      await invalidateResource(queryClient, identity, 'assistant-reports');
      feedback.notify({
        id: `rep-created-${created.report_id}`,
        title: `Đã khởi tạo báo cáo ${created.report_id}`,
        tone: 'info',
      });
    },
    onError: (err) => {
      setFormError(normalizeError(err).message);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (reportId: string) => cancelAssistantReport(reportId),
    onSuccess: async (updated) => {
      setActiveReport(updated);
      if (updated.status === 'CANCELED' || updated.status === 'COMPLETED') {
        setStreamState('completed');
      }
      await invalidateResource(queryClient, identity, 'assistant-reports');
      feedback.notify({
        id: `rep-cancel-${updated.report_id}-${updated.status}`,
        title:
          updated.status === 'CANCELED'
            ? 'Máy chủ đã xác nhận hủy báo cáo (CANCELED)'
            : updated.status === 'COMPLETED'
              ? 'Báo cáo đã hoàn tất trên máy chủ trước khi lệnh hủy có hiệu lực (COMPLETED)'
              : 'Đã gửi yêu cầu hủy báo cáo (CANCEL_REQUESTED)',
        tone: updated.status === 'COMPLETED' ? 'success' : 'info',
      });
    },
    onError: (err) => {
      setFormError(normalizeError(err).message);
    },
  });

  const refreshReportMutation = useMutation({
    mutationFn: (reportId: string) => getAssistantReport(reportId),
    onSuccess: (refreshed) => {
      setActiveReport(refreshed);
      const isTerminal =
        refreshed.status === 'COMPLETED' ||
        refreshed.status === 'FAILED' ||
        refreshed.status === 'CANCELED';
      if (isTerminal) {
        setStreamState('completed');
      }
    },
    onError: (err) => {
      setFormError(normalizeError(err).message);
    },
  });

  /**
   * Chỉ ngắt luồng theo dõi phía trình duyệt (Client Abort),
   * KHÔNG tự gán trạng thái báo cáo thành CANCELED trên máy chủ (DOD-FE-AI-06, FE-NEG-05).
   */
  const disconnectStream = () => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    setStreamState('disconnected_by_client');
  };

  return {
    data: {
      prompt,
      maskConfidentialPii,
      template,
      from,
      to,
      timezone,
      accessMode,
      direction,
      statusFilter,
      privacyCheck,
      reports: reportsQuery.data?.items ?? [],
      activeReport: activeReport ?? reportsQuery.data?.items[0] ?? null,
      streamState,
    },
    state: {
      unavailable: !principal,
      loading: Boolean(principal) && reportsQuery.isPending,
      fetchingHistory: Boolean(principal) && reportsQuery.isFetching,
      creating: createMutation.isPending,
      canceling: cancelMutation.isPending,
      refreshingReport: refreshReportMutation.isPending,
      error: formError,
    },
    actions: {
      setPrompt: (value: string) => {
        setPrompt(value);
        if (formError) setFormError(null);
      },
      setMaskConfidentialPii,
      setTemplate,
      setFrom,
      setTo,
      setTimezone,
      setAccessMode,
      setDirection,
      setStatusFilter,
      refreshHistory: () => reportsQuery.refetch(),
      selectReport: (report: ReportView) => {
        setActiveReport(report);
        const isTerminal =
          report.status === 'COMPLETED' ||
          report.status === 'FAILED' ||
          report.status === 'CANCELED';
        setStreamState(isTerminal ? 'completed' : 'streaming');
      },
      submitReport: async () => {
        setFormError(null);
        await createMutation.mutateAsync();
      },
      disconnectStream,
      requestServerCancel: async (reportId: string) => {
        setFormError(null);
        await cancelMutation.mutateAsync(reportId);
      },
      refreshReport: async (reportId: string) => {
        setFormError(null);
        await refreshReportMutation.mutateAsync(reportId);
      },
    },
  };
}
