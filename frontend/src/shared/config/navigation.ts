import type { Icon } from '@phosphor-icons/react';
export interface NavigationItem {
  id: string;
  path: string;
  title: string;
  group: string;
  icon: Icon;
  permission?: string;
  unavailable?: boolean;
}
