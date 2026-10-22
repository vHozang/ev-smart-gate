export const paths = {
  overview: '/',
  login: '/login',
  vehicles: '/vehicles',
  drivers: '/people/enrollments',
  orders: '/warehouse/orders',
  system: '/system',
  settings: '/settings',
  gate: '/gate',
  pedestrian: '/pedestrian',
  users: '/admin/users',
  roles: '/admin/roles',
  audit: '/admin/audit',
  dashboard: '/dashboard',
  assistant: '/assistant',
} as const;
export function loginPath(next: string): string {
  return `${paths.login}?next=${encodeURIComponent(next)}`;
}
