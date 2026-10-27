import { useEffect, useState } from 'react';
import { apiBaseUrl } from '../config';
import type { PlatformState } from '../models/platform';
import { getPlatformHealth } from '../services/platform';

export function PlatformStatus() {
  const [attempt, setAttempt] = useState(0);
  const [platform, setPlatform] = useState<PlatformState>(
    apiBaseUrl ? { state: 'loading' } : { state: 'unconfigured' },
  );

  useEffect(() => {
    if (!apiBaseUrl) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    let cancelled = false;
    getPlatformHealth(apiBaseUrl, controller.signal)
      .then((health) => {
        if (!cancelled) setPlatform({ state: 'online', health });
      })
      .catch(() => {
        // An unmounted component must not update state; a timeout is a visible failure.
        if (!cancelled) setPlatform({ state: 'unavailable' });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  const descriptions = {
    unconfigured:
      'O site está disponível. A conexão com o serviço de dados ainda será configurada.',
    loading: 'Verificando a conexão com o serviço de dados…',
    online: 'Serviço de dados conectado e banco acessível.',
    unavailable: 'Não foi possível conectar ao serviço de dados agora.',
  };

  return (
    <div className="platform-status" aria-live="polite">
      <span
        className={`status-dot status-dot--${platform.state}`}
        aria-hidden="true"
      />
      <div>
        <p>{descriptions[platform.state]}</p>
        {platform.state === 'online' &&
          platform.health.environment === 'development' && (
            <span className="status-detail">
              Ambiente local de desenvolvimento.
            </span>
          )}
        {platform.state === 'unavailable' && (
          <button
            className="text-button"
            onClick={() => {
              setPlatform({ state: 'loading' });
              setAttempt((value) => value + 1);
            }}
          >
            Tentar novamente <span aria-hidden="true">↗</span>
          </button>
        )}
      </div>
    </div>
  );
}
