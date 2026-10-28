export type AuthMode = 'disabled' | 'development' | 'oidc';
export type DevelopmentPersona = 'author' | 'researcher' | 'professor';

export interface User {
  id: string;
  name: string;
  email: string;
  institutionalLogin: string;
  role: 'student' | 'professor';
  enrollment: string | null;
  department: string | null;
}

export interface AuthConfig {
  mode: AuthMode;
  loginUrl: string | null;
  developmentUsers?: {
    id: DevelopmentPersona;
    name: string;
    role: User['role'];
  }[];
}

export interface Session {
  user: User | null;
  csrfToken: string | null;
  mode: AuthMode;
}

export interface AuthSnapshot {
  status: 'loading' | 'ready' | 'error';
  config: AuthConfig;
  user: User | null;
  csrfToken: string | null;
  error: string | null;
}
