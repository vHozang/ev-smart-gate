import { Skeleton } from '@/shared/ui/Skeleton';
import { createBrowserRouter, Outlet } from 'react-router';
import { RootLayout } from './RootLayout';
import { routeRegistry } from './registry';
import { Guard } from './Guard';
import { RouteError } from './RouteError';
import { paths } from '@/shared/config';
export const router = createBrowserRouter(
  [
    {
      path: paths.login,
      lazy: () => import('@/pages/LoginPage'),
      HydrateFallback: () => (
        <main className="main-content">
          <Skeleton label="Đang mở không gian làm việc" />
        </main>
      ),
      ErrorBoundary: RouteError,
    },
    {
      Component: RootLayout,
      HydrateFallback: () => (
        <main className="main-content">
          <Skeleton label="Đang mở không gian làm việc" />
        </main>
      ),
      ErrorBoundary: RouteError,
      children: [
        ...routeRegistry.map((route) => ({
          path: route.path,
          handle: {
            title: route.title,
            group: route.group,
            gap: route.gap,
            description: route.description,
          },
          element:
            route.public || route.unavailable ? (
              <Outlet />
            ) : (
              <Guard permission={route.permission}>
                <Outlet />
              </Guard>
            ),
          ErrorBoundary: RouteError,
          children: [{ index: true, lazy: route.lazy }],
        })),
        { path: '*', lazy: () => import('@/pages/NotFoundPage') },
      ],
    },
  ],
  { basename: '/console' },
);
