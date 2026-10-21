import { useState } from 'react';
import { Provider } from 'react-redux';
import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { store } from '@/app/store';
import { createQueryClient } from '@/shared/api';
import { FeedbackProvider } from '@/shared/feedback';
import { AuthProvider } from '@/features/auth';
export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient);
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <FeedbackProvider>
          <AuthProvider>{children}</AuthProvider>
        </FeedbackProvider>
      </QueryClientProvider>
    </Provider>
  );
}
