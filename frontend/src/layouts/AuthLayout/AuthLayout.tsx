import { paths } from '@/shared/config';
import type { ReactNode } from 'react';
import { ArrowUpRightIcon, ScanIcon, ShieldCheckIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';

export interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="auth-layout">
      <aside className="auth-story">
        <Link to={paths.overview} className="brand">
          <span className="brand-mark">
            <ScanIcon size={23} />
          </span>
          <span>
            EV Smart Gate<small>ACCESS MANAGEMENT</small>
          </span>
        </Link>
        <div className="auth-story__body">
          <p className="eyebrow">NHẬN DIỆN · XÁC MINH · KIỂM SOÁT</p>
          <h1>
            Một không gian.
            <br />
            Mọi lượt ra vào.
          </h1>
          <p>Quản lý nhân viên, phương tiện và hoạt động kho trong cùng một quy trình vận hành.</p>
          <div className="overview-telemetry mt-5" aria-hidden="true">
            <span className="overview-telemetry__chip">FAIL-CLOSED VERIFICATION</span>
            <span className="overview-telemetry__chip">3-STAGE GATE AUDIT</span>
            <span className="overview-telemetry__chip">SELF-HOSTED AI</span>
          </div>
          <div className="gate-art" aria-hidden="true">
            <div className="gate-art__lane" />
            <div className="gate-art__scanner">
              <ScanIcon size={54} />
            </div>
            <span className="gate-art__line" />
            <span className="gate-art__post" />
          </div>
        </div>
        <div className="auth-story__footer">
          <ShieldCheckIcon size={19} />
          <span>Kiểm soát truy cập theo quyền được cấp</span>
          <ArrowUpRightIcon size={18} />
        </div>
      </aside>
      <section className="auth-form-panel">{children}</section>
    </main>
  );
}
