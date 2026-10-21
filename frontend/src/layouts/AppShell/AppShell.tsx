import { paths } from '@/shared/config';
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import {
  ArrowLineLeftIcon,
  ArrowLineRightIcon,
  KeyIcon,
  ListIcon,
  ScanIcon,
  SignInIcon,
  SignOutIcon,
  XIcon,
  CaretRightIcon,
  QuestionIcon,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import type { NavigationItem } from '@/shared/config';
import { Button } from '@/shared/ui/Button';
export interface AppShellProps {
  children: ReactNode;
  navigation: readonly NavigationItem[];
  title: string;
  group: string;
  collapsed: boolean;
  onCollapse: () => void;
  username?: string;
  userRole?: string;
  onChangePassword?: () => void;
  onLogout?: () => void;
  logoutPending?: boolean;
}
export function AppShell({
  children,
  navigation,
  title,
  group,
  collapsed,
  onCollapse,
  username,
  userRole,
  onChangePassword,
  onLogout,
  logoutPending,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const groups = [...new Set(navigation.map((item) => item.group))];
  function navigationContent(mobile = false) {
    return (
      <>
        <Link className="brand" to={paths.overview} onClick={() => setMobileOpen(false)}>
          <span className="brand-mark">
            <ScanIcon size={23} />
          </span>
          <span className="brand__name">
            EV Smart Gate<small>ACCESS MANAGEMENT</small>
          </span>
        </Link>
        <nav aria-label={mobile ? 'Điều hướng di động' : 'Điều hướng chính'} className="navigation">
          {groups.map((section) => (
            <div className="navigation__group" key={section}>
              <p className="navigation__heading">{section}</p>
              {navigation
                .filter((item) => item.group === section)
                .map((item) => (
                  <NavLink
                    key={item.id}
                    end={item.path === '/'}
                    to={item.path}
                    title={item.title}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) => `navigation__link ${isActive ? 'is-active' : ''}`}
                  >
                    <item.icon size={20} />
                    <span className="navigation__label">{item.title}</span>
                    {item.unavailable && (
                      <span className="navigation__soon" aria-label="Đang chuẩn bị">
                        ·
                      </span>
                    )}
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar__bottom">
          <Link to={paths.system} className="navigation__link" title="Trợ giúp kết nối">
            <QuestionIcon size={20} />
            <span className="navigation__label">Trạng thái hệ thống</span>
          </Link>
          <div className="sidebar__identity">
            <span className="identity-mark">
              {username ? username.slice(0, 2).toUpperCase() : 'EV'}
            </span>
            <div className="navigation__label">
              <strong>{username || 'Không gian vận hành'}</strong>
              <span>
                {username
                  ? userRole
                    ? `Vai trò: ${userRole}`
                    : 'Tài khoản đã đăng nhập'
                  : 'Đăng nhập để làm việc'}
              </span>
            </div>
          </div>
        </div>
      </>
    );
  }
  return (
    <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
      <div className={`app-shell ${collapsed ? 'is-collapsed' : ''}`}>
        <a className="skip-link" href="#main-content">
          Đến nội dung chính
        </a>
        <aside id="desktop-sidebar" className="sidebar">
          {navigationContent()}
        </aside>
        <div className="app-shell__body">
          <header className="topbar">
            <div className="topbar__navigation">
              <Dialog.Trigger asChild>
                <button
                  className="icon-button mobile-menu"
                  aria-label="Mở điều hướng"
                  aria-controls="mobile-navigation"
                  aria-expanded={mobileOpen}
                >
                  <ListIcon size={22} />
                </button>
              </Dialog.Trigger>
              <button
                className="icon-button desktop-toggle"
                onClick={onCollapse}
                aria-label={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
                aria-expanded={!collapsed}
                aria-controls="desktop-sidebar"
              >
                {collapsed ? <ArrowLineRightIcon size={20} /> : <ArrowLineLeftIcon size={20} />}
              </button>
              <nav className="breadcrumb" aria-label="Đường dẫn">
                <span>{group}</span>
                <CaretRightIcon size={12} />
                <strong aria-current="page">{title}</strong>
              </nav>
            </div>
            <div className="topbar__actions">
              <span className="topbar__workspace">
                {userRole ? `Ca trực · ${userRole}` : 'Không gian vận hành'}
              </span>
              {username ? (
                <>
                  {onChangePassword && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<KeyIcon size={16} />}
                      onClick={onChangePassword}
                    >
                      Đổi mật khẩu
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    pending={logoutPending}
                    icon={<SignOutIcon size={18} />}
                    onClick={onLogout}
                  >
                    Đăng xuất
                  </Button>
                </>
              ) : (
                <Link className="button button--secondary button--sm" to={paths.login}>
                  <SignInIcon size={17} />
                  Đăng nhập
                </Link>
              )}
            </div>
          </header>
          <main id="main-content" className="main-content" tabIndex={-1}>
            {children}
          </main>
          <footer className="shell-footer">
            <span>EV Smart Gate</span>
            <span>Kiểm soát ra vào & quản lý kho</span>
          </footer>
        </div>
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content
          id="mobile-navigation"
          className="mobile-sidebar"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Điều hướng</Dialog.Title>
          <Dialog.Close className="icon-button drawer-close" aria-label="Đóng điều hướng">
            <XIcon size={20} />
          </Dialog.Close>
          {navigationContent(true)}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
