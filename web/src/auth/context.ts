import { createContext, useContext } from 'react';
import type { AuthSnapshot, DevelopmentPersona } from '../models/auth';

export interface AuthContextValue extends AuthSnapshot {
  busy: boolean;
  refresh(): Promise<void>;
  enterDevelopment(persona: DevelopmentPersona): Promise<boolean>;
  logout(): Promise<boolean>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('Contexto de acesso ausente.');
  return value;
}
