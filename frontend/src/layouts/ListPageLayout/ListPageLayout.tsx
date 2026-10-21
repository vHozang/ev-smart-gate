import type { ReactNode } from 'react';
export interface ListPageLayoutProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}
export function ListPageLayout({
  eyebrow,
  title,
  description,
  actions,
  toolbar,
  children,
  footer,
}: ListPageLayoutProps) {
  return (
    <section className="page-layout">
      <header className="page-header">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
          {description && <p className="page-description">{description}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </header>
      {toolbar && <div className="page-toolbar">{toolbar}</div>}
      <div className="page-content">{children}</div>
      {footer && <footer className="page-footer">{footer}</footer>}
    </section>
  );
}
