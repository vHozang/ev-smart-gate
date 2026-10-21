/**
 * Quản lý đồng bộ sự kiện Auth giữa các tab trình duyệt.
 * Tuyệt đối không broadcast raw access token hoặc credentials qua channel.
 * (Tuân thủ hợp đồng FE-01 / JWT-03).
 */

export type AuthEventType = 'LOGOUT' | 'REFRESH_SUCCESS';

export interface AuthBroadcastEvent {
  type: AuthEventType;
  timestamp: number;
}

const CHANNEL_NAME = 'evsg:auth-events';

type AuthListener = (event: AuthBroadcastEvent) => void;
const listeners = new Set<AuthListener>();

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (channel) return channel;
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (messageEvent: MessageEvent<AuthBroadcastEvent>) => {
        const data = messageEvent.data;
        if (data && typeof data.type === 'string') {
          for (const listener of listeners) {
            listener(data);
          }
        }
      };
    } catch {
      channel = null;
    }
  }
  return channel;
}

export function broadcastAuthEvent(type: AuthEventType) {
  const ch = getChannel();
  if (ch) {
    try {
      ch.postMessage({ type, timestamp: Date.now() });
    } catch {
      /* Bỏ qua nếu môi trường không hỗ trợ */
    }
  }
}

export function subscribeAuthBroadcast(listener: AuthListener): () => void {
  getChannel(); // Khởi tạo channel nếu chưa có
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
