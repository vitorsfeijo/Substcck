import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { apiBaseUrl } from '../config';
import type { AuthSnapshot, DevelopmentPersona } from '../models/auth';
import {
  endSession,
  enterDevelopment,
  getAuthConfig,
  getSession,
} from '../services/auth';
import { AuthContext } from './context';

const initial: AuthSnapshot = {
  status: apiBaseUrl ? 'loading' : 'ready',
  config: { mode: 'disabled', loginUrl: null },
  user: null,
  csrfToken: null,
  error: null,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [busy, setBusy] = useState(false);
  const runtime = useRef({
    sequence: 0,
    pending: null as AbortController | null,
    mutating: false,
  });

  const refresh = useCallback(async () => {
    if (!apiBaseUrl || runtime.current.mutating) return;
    runtime.current.pending?.abort();
    const controller = new AbortController();
    runtime.current.pending = controller;
    const request = ++runtime.current.sequence;
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const [config, session] = await Promise.all([
        getAuthConfig(apiBaseUrl, controller.signal),
        getSession(apiBaseUrl, controller.signal),
      ]);
      if (session?.user && session.mode !== config.mode) {
        throw new Error('Modo de sessão incompatível.');
      }
      if (request !== runtime.current.sequence) return;
      setSnapshot({
        status: 'ready',
        config,
        user: config.mode === 'disabled' ? null : session?.user || null,
        csrfToken:
          config.mode === 'disabled' ? null : session?.csrfToken || null,
        error: null,
      });
    } catch {
      controller.abort();
      if (request !== runtime.current.sequence) return;
      setSnapshot((current) => ({
        ...current,
        status: 'error',
        user: null,
        csrfToken: null,
        error: 'Não foi possível verificar o acesso agora. Tente novamente.',
      }));
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const connection = runtime.current;
    void Promise.resolve().then(() => {
      if (active) return refresh();
    });
    const recheck = () => {
      void refresh();
    };
    const routeChanged = () => {
      if (
        /^#\/(perfil|novo-tcc|editar-tcc)(?:[/?]|$)/.test(window.location.hash)
      )
        recheck();
    };
    window.addEventListener('focus', recheck);
    window.addEventListener('hashchange', routeChanged);
    return () => {
      active = false;
      ++connection.sequence;
      connection.pending?.abort();
      window.removeEventListener('focus', recheck);
      window.removeEventListener('hashchange', routeChanged);
    };
  }, [refresh]);

  const signIn = async (persona: DevelopmentPersona) => {
    if (
      !apiBaseUrl ||
      snapshot.config.mode !== 'development' ||
      runtime.current.mutating
    )
      return false;
    runtime.current.mutating = true;
    ++runtime.current.sequence;
    runtime.current.pending?.abort();
    setBusy(true);
    setSnapshot((current) => ({ ...current, error: null }));
    try {
      const session = await enterDevelopment(apiBaseUrl, persona);
      if (!session.user) throw new Error('Sessão ausente.');
      setSnapshot((current) => ({
        ...current,
        ...session,
        status: 'ready',
        error: null,
      }));
      return true;
    } catch {
      setSnapshot((current) => ({
        ...current,
        error: 'Não foi possível iniciar a simulação local. Tente novamente.',
      }));
      return false;
    } finally {
      runtime.current.mutating = false;
      setBusy(false);
    }
  };

  const logout = async () => {
    if (!apiBaseUrl || !snapshot.csrfToken || runtime.current.mutating)
      return false;
    runtime.current.mutating = true;
    ++runtime.current.sequence;
    runtime.current.pending?.abort();
    setBusy(true);
    try {
      await endSession(apiBaseUrl, snapshot.csrfToken);
      ++runtime.current.sequence;
      runtime.current.pending?.abort();
      setSnapshot((current) => ({
        ...current,
        status: 'ready',
        user: null,
        csrfToken: null,
        error: null,
      }));
      return true;
    } catch {
      setSnapshot((current) => ({
        ...current,
        error: 'Não foi possível encerrar sua sessão. Tente novamente.',
      }));
      return false;
    } finally {
      runtime.current.mutating = false;
      setBusy(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{ ...snapshot, busy, refresh, enterDevelopment: signIn, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
