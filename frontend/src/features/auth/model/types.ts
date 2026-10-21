export interface SessionPrincipal {
  id: string;
  username: string;
  role: 'ADMIN' | 'WAREHOUSE' | 'SECURITY';
  permissions: readonly string[];
  source: 'legacy-session';
}
export interface LoginInput {
  username: string;
  password: string;
}
export interface AuthContextValue {
  principal: SessionPrincipal | null;
  loading: boolean;
  error: Error | null;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
}
