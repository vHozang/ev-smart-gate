export interface SessionPrincipal {
  id: string;
  username: string;
  role: 'ADMIN' | 'WAREHOUSE' | 'SECURITY';
  role_id?: string;
  role_code?: string;
  permissions: readonly string[];
  authz_version?: number;
  must_change_password?: boolean;
  source: 'legacy-session' | 'jwt';
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface ChangePasswordInput {
  current_password: string;
  new_password: string;
}

export interface AuthContextValue {
  principal: SessionPrincipal | null;
  loading: boolean;
  error: Error | null;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  changePassword?: (input: ChangePasswordInput) => Promise<void>;
  can: (permission: string) => boolean;
}
