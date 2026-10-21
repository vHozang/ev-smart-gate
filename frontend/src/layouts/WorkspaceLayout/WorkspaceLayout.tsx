import type { ReactNode } from 'react';
export interface WorkspaceLayoutProps {
  primary: ReactNode;
  secondary: ReactNode;
  footer?: ReactNode;
}
export function WorkspaceLayout({ primary, secondary, footer }: WorkspaceLayoutProps) {
  return (
    <div className="workspace-layout">
      <div className="workspace-layout__primary">{primary}</div>
      <aside>{secondary}</aside>
      {footer && <footer>{footer}</footer>}
    </div>
  );
}
