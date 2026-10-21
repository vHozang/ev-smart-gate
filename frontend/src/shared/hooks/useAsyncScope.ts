import { useCallback, useEffect, useRef } from 'react';
import { captureIdentityGuard } from '@/shared/api';
// Chặn callback của màn hình cũ sau unmount hoặc đổi identity.
export function useAsyncScope() {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return useCallback(() => {
    const currentIdentity = captureIdentityGuard();
    return () => alive.current && currentIdentity();
  }, []);
}
