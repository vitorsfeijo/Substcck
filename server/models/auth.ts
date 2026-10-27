export type UserRole = 'student' | 'professor';

/** Returned only after the configured identity adapter verifies the provider. */
export interface VerifiedIdentity {
  issuer: string;
  subject: string;
  name: string;
  email: string;
  institutionalLogin: string;
  role: UserRole;
  enrollment?: string;
  department?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  institutionalLogin: string;
  role: UserRole;
  enrollment: string | null;
  department: string | null;
}

export interface AuthorizationAttempt {
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface IdentityAdapter {
  authorizationUrl(attempt: AuthorizationAttempt): Promise<URL>;
  callback(url: URL, attempt: AuthorizationAttempt): Promise<VerifiedIdentity>;
}
