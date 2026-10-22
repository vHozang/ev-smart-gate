import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ApiError } from '@/shared/api';

export const reportEventSchema = z
  .object({
    schema_version: z.literal('1.0'),
    report_id: z.uuid(),
    sequence: z.number().int().min(1),
    stage: z.enum([
      'QUEUED',
      'RUNNING',
      'VALIDATING',
      'COMPLETED',
      'FAILED',
      'CANCEL_REQUESTED',
      'CANCELED',
    ]),
    occurred_at: z.string(),
    terminal: z.boolean(),
  })
  .strict();

export type ReportEvent = z.infer<typeof reportEventSchema>;

export const MAX_SSE_BUFFER_BYTES = 64 * 1024;

export interface ParsedSseBatch {
  events: ReportEvent[];
  remainder: string;
  highestSequence: number;
}

export interface AiReportPipelineStep {
  id: 'QUEUED' | 'RUNNING' | 'VALIDATING' | 'COMPLETED' | 'FAILED' | 'CANCELED';
  label: string;
  description: string;
}

export const AI_REPORT_PIPELINE_STEPS: ReadonlyArray<AiReportPipelineStep> = [
  {
    id: 'QUEUED',
    label: 'Đã tiếp nhận (QUEUED)',
    description: 'Hệ thống đã kiểm tra quyền truy cập và đưa yêu cầu vào hàng đợi worker nội bộ.',
  },
  {
    id: 'RUNNING',
    label: 'Đang tổng hợp & phân tích AI (RUNNING)',
    description: 'Worker trích xuất snapshot dữ liệu tổng hợp và thực thi mô hình tự chủ nội bộ.',
  },
  {
    id: 'VALIDATING',
    label: 'Kiểm chứng số liệu & chính sách (VALIDATING)',
    description:
      'Đối chiếu số liệu, trích dẫn nguồn (citations), schema và kiểm tra an toàn đầu ra.',
  },
  {
    id: 'COMPLETED',
    label: 'Hoàn tất kiểm chứng (COMPLETED)',
    description: 'Báo cáo đã đạt chuẩn grounding và sẵn sàng để người vận hành xem xét.',
  },
  {
    id: 'FAILED',
    label: 'Chuyển sang mẫu dự phòng / Lỗi (FAILED)',
    description: 'Không thể hoàn tất qua mô hình; hệ thống đã chuyển sang luồng kiểm tra an toàn.',
  },
  {
    id: 'CANCELED',
    label: 'Đã hủy theo yêu cầu (CANCELED)',
    description: 'Máy chủ đã xác nhận dừng tác vụ và giải phóng tài nguyên xử lý.',
  },
];

/**
 * Bộ phân tích khung SSE (Server-Sent Events) tăng dần theo chuẩn UTF-8:
 * - Giới hạn bộ đệm chống tràn bộ nhớ (MAX_SSE_BUFFER_BYTES).
 * - Loại bỏ sự kiện trùng lặp hoặc cũ hơn lastSequence.
 * - Chỉ chấp nhận sự kiện hợp lệ theo schema_version = "1.0".
 */
export function parseSseFrames(
  buffer: string,
  lastSequence: number,
  expectedReportId?: string,
): ParsedSseBatch {
  if (buffer.length > MAX_SSE_BUFFER_BYTES) {
    throw new ApiError(
      'SSE_BUFFER_OVERFLOW',
      'Bộ đệm luồng sự kiện báo cáo vượt ngưỡng an toàn (64 KiB).',
    );
  }

  const normalized = buffer.replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const remainder = blocks.pop() ?? '';
  const events: ReportEvent[] = [];
  let highestSequence = lastSequence;

  for (const rawBlock of blocks) {
    const lines = rawBlock
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith(':'));

    if (lines.length === 0) continue;

    const dataLines = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());

    if (dataLines.length === 0) continue;

    const payloadText = dataLines.join('\n');
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(payloadText);
    } catch {
      continue;
    }

    const validated = reportEventSchema.safeParse(parsedJson);
    if (!validated.success) continue;

    const evt = validated.data;
    if (expectedReportId && evt.report_id !== expectedReportId) continue;
    if (evt.sequence <= highestSequence) continue;

    highestSequence = evt.sequence;
    events.push(evt);
  }

  return {
    events,
    remainder,
    highestSequence,
  };
}

export interface UseEphemeralAiBufferResult {
  visibleText: string;
  appendChunk: (chunk: string) => void;
  flush: () => void;
  clear: () => void;
  snapshot: () => string;
}

/**
 * Bộ đệm RAM tạm thời (Ephemeral Buffer) cho luồng AI Streaming (Mục 4.5, 4.6, DOD-FE-AI-05, FE-NEG-08):
 * - Gom chunk vào `useRef` và chỉ flush lên React state theo nhịp `flushIntervalMs` (mặc định 80ms)
 *   để tránh re-render từng token.
 * - Tuyệt đối không ghi vào localStorage/sessionStorage.
 * - Tự động xóa sạch buffer và hủy timer khi component unmount.
 */
export function useEphemeralAiBuffer(flushIntervalMs = 80): UseEphemeralAiBufferResult {
  const bufferRef = useRef('');
  const [visibleText, setVisibleText] = useState('');
  const timerRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (bufferRef.current.length === 0) {
      return;
    }
    const chunk = bufferRef.current;
    bufferRef.current = '';
    setVisibleText((current) => current + chunk);
  }, []);

  const appendChunk = useCallback(
    (chunk: string) => {
      bufferRef.current += chunk;
      if (timerRef.current === null) {
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          flush();
        }, flushIntervalMs);
      }
    },
    [flush, flushIntervalMs],
  );

  const clear = useCallback(() => {
    bufferRef.current = '';
    setVisibleText('');
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const snapshot = useCallback(() => {
    return visibleText + bufferRef.current;
  }, [visibleText]);

  useEffect(() => {
    return () => {
      bufferRef.current = '';
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return {
    visibleText,
    appendChunk,
    flush,
    clear,
    snapshot,
  };
}
