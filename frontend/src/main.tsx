import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { IconContext } from '@phosphor-icons/react';
import { AppProviders } from '@/app/providers/AppProviders';
import { router } from '@/app/router';
import { installSessionCredentials } from '@/features/auth';
import '@/app/styles/index.css';
installSessionCredentials();
const root = document.getElementById('root');
if (!root) throw new Error('Thiếu root element');
createRoot(root).render(
  <StrictMode>
    <IconContext.Provider value={{ weight: 'regular' }}>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </IconContext.Provider>
  </StrictMode>,
);
