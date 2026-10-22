import { ApiError, normalizeError } from '@/shared/api';
import { alertResponseSchema, listAlertsPage, issueAlertWsTicket } from './api';
import type { AlertItem, AlertStatus, NormalizedAlertPage } from './api';

export const MAX_ALERT_BUFFER_SIZE = 1000;
export const MAX_RESYNC_BATCHES = 20;
export const WS_CLOSE_HISTORY_GAP = 4409;
export const WS_CLOSE_UNAUTHORIZED = 4401;
export const WS_CLOSE_FORBIDDEN = 4403;

export type AlertSyncStatus =
  'idle' | 'connecting' | 'syncing' | 'synced' | 'reconnecting' | 'gap_detected' | 'degraded';

const STATUS_RANK: Record<AlertStatus, number> = {
  OPEN: 0,
  ACKNOWLEDGED: 1,
  RESOLVED: 2,
  FALSE_POSITIVE: 2,
};

/**
 * So sánh và chọn bản ghi cảnh báo mới hơn khi trùng ID (chống hạ cấp trạng thái do gói tin đến trễ / out-of-order).
 */
export function pickNewerAlert(existing: AlertItem, incoming: AlertItem): AlertItem {
  if (incoming.sequence > existing.sequence) {
    return incoming;
  }
  if (incoming.sequence < existing.sequence) {
    return existing;
  }
  const existingRank = STATUS_RANK[existing.status] ?? 0;
  const incomingRank = STATUS_RANK[incoming.status] ?? 0;
  if (incomingRank > existingRank) {
    return incoming;
  }
  if (incomingRank < existingRank) {
    return existing;
  }
  if (incoming.resolved_at && !existing.resolved_at) {
    return incoming;
  }
  return existing;
}

/**
 * Hợp nhất danh sách cảnh báo hiện tại với lô cảnh báo mới (từ REST snapshot/batch hoặc WS buffer),
 * loại bỏ bản ghi trùng, chống out-of-order hạ cấp state, và sắp xếp theo sequence giảm dần.
 */
export function mergeAlertLists(
  current: readonly AlertItem[],
  incoming: readonly AlertItem[],
): { items: AlertItem[]; highestSequence: number } {
  const byId = new Map<string, AlertItem>();
  let highestSequence = 0;

  for (const item of current) {
    byId.set(item.id, item);
    if (item.sequence > highestSequence) {
      highestSequence = item.sequence;
    }
  }

  for (const candidate of incoming) {
    const prev = byId.get(candidate.id);
    const chosen = prev ? pickNewerAlert(prev, candidate) : candidate;
    byId.set(chosen.id, chosen);
    if (chosen.sequence > highestSequence) {
      highestSequence = chosen.sequence;
    }
  }

  const items = Array.from(byId.values()).sort((a, b) => {
    if (b.sequence !== a.sequence) {
      return b.sequence - a.sequence;
    }
    return b.id.localeCompare(a.id);
  });

  return { items, highestSequence };
}

/**
 * Tính thời gian chờ kết nối lại có giới hạn (bounded exponential backoff + jitter).
 */
export function computeReconnectBackoffMs(
  attempt: number,
  randomFn: () => number = Math.random,
): number {
  const base = 1000;
  const max = 30_000;
  const exp = Math.min(max, base * Math.pow(2, Math.max(0, attempt)));
  const jitter = Math.floor(randomFn() * 400);
  return Math.min(max, exp + jitter);
}

/**
 * Phân tích an toàn khung tin WebSocket; cô lập payload sai định dạng để không làm sập AppShell.
 */
export function parseIncomingAlertFrame(
  rawData: unknown,
): { kind: 'alert'; alert: AlertItem } | { kind: 'heartbeat' } | { kind: 'invalid' } {
  if (typeof rawData !== 'string') {
    return { kind: 'invalid' };
  }
  try {
    const parsed: unknown = JSON.parse(rawData);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      if (record.type === 'ping' || record.type === 'pong' || record.type === 'heartbeat') {
        return { kind: 'heartbeat' };
      }
      const direct = alertResponseSchema.safeParse(parsed);
      if (direct.success) {
        return { kind: 'alert', alert: direct.data };
      }
      const candidate = record.payload ?? record.alert;
      if (candidate) {
        const validated = alertResponseSchema.safeParse(candidate);
        if (validated.success) {
          return { kind: 'alert', alert: validated.data };
        }
      }
    }
    return { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}

export interface AlertsStreamState {
  items: AlertItem[];
  syncStatus: AlertSyncStatus;
  highestSequence: number;
  hasHistoryGap: boolean;
  gapWarning: string | null;
  invalidEventCount: number;
  lastSyncedAt: string | null;
  error: ApiError | null;
}

export interface AlertsStreamOptions {
  authSource?: 'legacy-session' | 'jwt';
  batchLimit?: number;
  fetchPage?: (
    params: { after_sequence: number; limit: number },
    signal?: AbortSignal,
  ) => Promise<NormalizedAlertPage>;
  issueTicket?: (signal?: AbortSignal) => Promise<{ ticket: string; expires_at: string }>;
  createSocket?: (url: string) => WebSocket;
  onStateChange: (state: AlertsStreamState) => void;
}

export class AlertsStreamController {
  private state: AlertsStreamState = {
    items: [],
    syncStatus: 'idle',
    highestSequence: 0,
    hasHistoryGap: false,
    gapWarning: null,
    invalidEventCount: 0,
    lastSyncedAt: null,
    error: null,
  };

  private buffer: AlertItem[] = [];
  private isCatchingUp = false;
  private disposed = false;
  private socket: WebSocket | null = null;
  private resyncController: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;

  private readonly options: Required<
    Pick<AlertsStreamOptions, 'authSource' | 'batchLimit' | 'fetchPage' | 'issueTicket'>
  > &
    Pick<AlertsStreamOptions, 'createSocket' | 'onStateChange'>;

  constructor(options: AlertsStreamOptions) {
    this.options = {
      authSource: options.authSource ?? 'legacy-session',
      batchLimit: options.batchLimit ?? 100,
      fetchPage: options.fetchPage ?? listAlertsPage,
      issueTicket: options.issueTicket ?? issueAlertWsTicket,
      createSocket: options.createSocket,
      onStateChange: options.onStateChange,
    };
  }

  public getState(): AlertsStreamState {
    return this.state;
  }

  private updateState(patch: Partial<AlertsStreamState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.options.onStateChange(this.state);
  }

  public async start(): Promise<void> {
    if (this.disposed) return;
    this.updateState({ syncStatus: 'connecting', error: null });
    await this.openSocket();
    await this.resyncFromRest(this.state.highestSequence);
  }

  public stop(): void {
    this.disposed = true;
    this.buffer = [];
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.resyncController) {
      this.resyncController.abort();
      this.resyncController = null;
    }
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      try {
        this.socket.close(1000, 'client_stopped');
      } catch {
        // Bỏ qua lỗi khi đóng socket đã đóng
      }
      this.socket = null;
    }
  }

  public applyLocalUpdate(updated: AlertItem): void {
    if (this.disposed) return;
    const merged = mergeAlertLists(this.state.items, [updated]);
    this.updateState({
      items: merged.items,
      highestSequence: Math.max(this.state.highestSequence, merged.highestSequence),
    });
  }

  /**
   * Đưa sự kiện từ WebSocket vào bộ đệm (nếu đang chạy snapshot/batch catch-up)
   * hoặc hợp nhất trực tiếp và kiểm tra khoảng trống sequence.
   */
  public handleIncomingRawFrame(rawData: unknown): void {
    if (this.disposed) return;
    const parsed = parseIncomingAlertFrame(rawData);
    if (parsed.kind === 'heartbeat') {
      return;
    }
    if (parsed.kind === 'invalid') {
      this.updateState({
        invalidEventCount: this.state.invalidEventCount + 1,
      });
      return;
    }

    const alert = parsed.alert;
    if (this.isCatchingUp) {
      if (this.buffer.length >= MAX_ALERT_BUFFER_SIZE) {
        // Bộ đệm đầy quá 1000 sự kiện khi đang catch-up: giữ 1000 sự kiện mới nhất và đánh dấu cảnh báo
        this.buffer.shift();
        this.buffer.push(alert);
        this.markHistoryGap(
          'Bộ đệm sự kiện thời gian thực vượt ngưỡng 1000 bản ghi trong lúc đồng bộ; một số sự kiện trung gian có thể bị lược bỏ.',
        );
      } else {
        this.buffer.push(alert);
      }
      return;
    }

    // Nếu phát hiện nhảy cóc sequence > highestSequence + 1 (khi đã có baseline), kích hoạt REST resync
    if (this.state.highestSequence > 0 && alert.sequence > this.state.highestSequence + 1) {
      this.buffer.push(alert);
      void this.resyncFromRest(this.state.highestSequence);
      return;
    }

    const merged = mergeAlertLists(this.state.items, [alert]);
    this.updateState({
      items: merged.items,
      highestSequence: merged.highestSequence,
      lastSyncedAt: new Date().toISOString(),
    });
  }

  private markHistoryGap(reason: string): void {
    this.updateState({
      hasHistoryGap: true,
      syncStatus: 'gap_detected',
      gapWarning: reason,
    });
  }

  /**
   * Đồng bộ nhiều lô (multi-batch) theo `after_sequence` cho tới khi `has_more === false`
   * rồi xả (drain) bộ đệm WS.
   */
  public async resyncFromRest(fromSequence = this.state.highestSequence): Promise<void> {
    if (this.disposed) return;
    if (this.resyncController) {
      this.resyncController.abort();
    }
    const controller = new AbortController();
    this.resyncController = controller;
    this.isCatchingUp = true;

    this.updateState({
      syncStatus: this.state.hasHistoryGap ? 'gap_detected' : 'syncing',
      error: null,
    });

    let cursor = fromSequence;
    let batchesFetched = 0;
    let accumulated = [...this.state.items];
    let detectedGap = this.state.hasHistoryGap;
    let gapMessage = this.state.gapWarning;

    try {
      while (batchesFetched < MAX_RESYNC_BATCHES) {
        const page = await this.options.fetchPage(
          { after_sequence: cursor, limit: this.options.batchLimit },
          controller.signal,
        );
        if (this.disposed || controller.signal.aborted) return;

        batchesFetched += 1;

        if (
          cursor > 0 &&
          page.oldest_available_sequence > 0 &&
          page.oldest_available_sequence > cursor + 1
        ) {
          detectedGap = true;
          gapMessage = `Khoảng sự kiện từ #${cursor + 1} đến #${page.oldest_available_sequence - 1} không còn trong bộ lưu trữ lịch sử.`;
        }

        const mergedBatch = mergeAlertLists(accumulated, page.items);
        accumulated = mergedBatch.items;
        const nextCursor = Math.max(cursor, page.next_after_sequence, mergedBatch.highestSequence);

        if (!page.has_more || page.items.length === 0 || nextCursor === cursor) {
          cursor = nextCursor;
          break;
        }
        cursor = nextCursor;
      }

      // Hợp nhất các sự kiện trong buffer WS nhận được trong lúc tải snapshot/batches
      const buffered = this.buffer.splice(0, this.buffer.length);
      const finalMerged = mergeAlertLists(accumulated, buffered);
      this.isCatchingUp = false;

      this.updateState({
        items: finalMerged.items,
        highestSequence: Math.max(cursor, finalMerged.highestSequence),
        hasHistoryGap: detectedGap,
        gapWarning: gapMessage,
        syncStatus: detectedGap ? 'gap_detected' : 'synced',
        lastSyncedAt: new Date().toISOString(),
        error: null,
      });
    } catch (cause) {
      if (this.disposed || controller.signal.aborted) return;
      this.isCatchingUp = false;
      const safeError = normalizeError(cause);

      if (safeError.status === 410 || safeError.code === 'ALERT_HISTORY_GAP') {
        this.markHistoryGap(
          safeError.message ||
            'Máy chủ báo mất khoảng lịch sử cảnh báo (410 ALERT_HISTORY_GAP). Không thể khẳng định đồng bộ đầy đủ.',
        );
        return;
      }

      this.updateState({
        syncStatus: 'degraded',
        error: safeError,
      });
    }
  }

  private async buildWsUrl(signal?: AbortSignal): Promise<string> {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    if (this.options.authSource === 'jwt') {
      const { ticket } = await this.options.issueTicket(signal);
      return `${protocol}//${host}/ws/v2/security/alerts?ticket=${encodeURIComponent(ticket)}`;
    }
    return `${protocol}//${host}/ws/v1/security/alerts`;
  }

  private async openSocket(): Promise<void> {
    if (this.disposed) return;
    if (typeof WebSocket === 'undefined' && !this.options.createSocket) {
      return;
    }

    try {
      const wsUrl = await this.buildWsUrl();
      if (this.disposed) return;

      const ws = this.options.createSocket
        ? this.options.createSocket(wsUrl)
        : new WebSocket(wsUrl);
      this.socket = ws;

      ws.onopen = () => {
        if (this.disposed) return;
        this.reconnectAttempt = 0;
      };

      ws.onmessage = (event: MessageEvent) => {
        this.handleIncomingRawFrame(event.data);
      };

      ws.onclose = (event: CloseEvent) => {
        if (this.disposed) return;
        if (event.code === WS_CLOSE_HISTORY_GAP) {
          this.markHistoryGap(
            'Kết nối realtime đóng với mã 4409 (ALERT_HISTORY_GAP) — phát hiện thiếu khoảng sự kiện.',
          );
          return;
        }
        if (event.code === WS_CLOSE_UNAUTHORIZED || event.code === WS_CLOSE_FORBIDDEN) {
          this.updateState({
            syncStatus: 'degraded',
            error: new ApiError(
              'WS_AUTH_CLOSED',
              'Phiên nhận cảnh báo thời gian thực đã hết hạn hoặc bị thu hồi quyền.',
              event.code === WS_CLOSE_FORBIDDEN ? 403 : 401,
            ),
          });
          return;
        }
        this.scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose sẽ xử lý lịch kết nối lại
      };
    } catch {
      if (!this.disposed) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;
    const delay = computeReconnectBackoffMs(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.updateState({
      syncStatus: this.state.hasHistoryGap ? 'gap_detected' : 'reconnecting',
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.disposed) {
        void this.openSocket();
        void this.resyncFromRest(this.state.highestSequence);
      }
    }, delay);
  }
}
