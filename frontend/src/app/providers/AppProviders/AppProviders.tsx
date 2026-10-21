import { useState, useEffect } from 'react';
import { Provider } from 'react-redux';
import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { store, useAppDispatch, setAuthStatus } from '@/app/store';
import { createQueryClient } from '@/shared/api';
import { FeedbackProvider, useFeedback } from '@/shared/feedback';
import { AuthProvider, useAuth } from '@/features/auth';

function AuthLifecycleSync() {
  const { principal, loading, error } = useAuth();
  const feedback = useFeedback();
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (loading) return;
    if (error) {
      feedback.reset();
      dispatch(setAuthStatus('expired'));
    } else if (principal) {
      dispatch(setAuthStatus('authenticated'));
    } else {
      feedback.reset();
      dispatch(setAuthStatus('unauthenticated'));
    }
  }, [principal, loading, error, dispatch, feedback]);

  return null;
}

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient);
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <FeedbackProvider>
            <AuthLifecycleSync />
            {children}
          </FeedbackProvider>
        </AuthProvider>
      </QueryClientProvider>
    </Provider>
  );
}
