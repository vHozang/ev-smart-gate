import type { ReactNode } from 'react';

export interface WorkspaceLayoutProps {
  eyebrow?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  toolbar?: ReactNode;
  filters?: ReactNode;
  primary: ReactNode;
  secondary: ReactNode;
  footer?: ReactNode;
}

export function WorkspaceLayout({
  eyebrow,
  title,
  description,
  actions,
  toolbar,
  filters,
  primary,
  secondary,
  footer,
}: WorkspaceLayoutProps) {
  const grid = (
    <div className="workspace-layout">
      <div className="workspace-layout__primary">{primary}</div>
      <aside>{secondary}</aside>
      {footer && <footer>{footer}</footer>}
    </div>
  );

  if (!title && !toolbar && !filters) {
    return grid;
  }

  return (
    <section className="page-layout">
      {title && (
        <header className="page-header">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h1>{title}</h1>
            {description && <p className="page-description">{description}</p>}
          </div>
          {actions && <div className="page-actions">{actions}</div>}
        </header>
      )}
      {(toolbar || filters) && <div className="page-toolbar">{toolbar ?? filters}</div>}
      <div className="page-content">{grid}</div>
    </section>
  );
}
