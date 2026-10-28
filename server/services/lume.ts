export type LumeValidationResult =
  | { valid: true; url: string }
  | { valid: false; reason: 'invalid_url' | 'unreachable' };

export interface LumeValidator {
  validate(link: string): Promise<LumeValidationResult>;
}

export interface LumeValidatorOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxRedirects?: number;
}

/** Only this exact HTTPS host may be contacted, including after redirects. */
export function normalizeLumeUrl(link: string): string | null {
  if (typeof link !== 'string' || !link.trim() || link.length > 2048) {
    return null;
  }
  try {
    const url = new URL(link.trim());
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'lume.ufrgs.br' ||
      (url.port !== '' && url.port !== '443') ||
      url.username !== '' ||
      url.password !== ''
    ) {
      return null;
    }
    url.hash = '';
    return url.href.length <= 2048 ? url.href : null;
  } catch {
    return null;
  }
}

async function discardBody(response: Response) {
  try {
    // GET fallback and redirect bodies are never read into memory.
    await response.body?.cancel();
  } catch {
    // A closed/already-cancelled body does not change the HTTP result.
  }
}

export function createLumeValidator(
  options: LumeValidatorOptions = {},
): LumeValidator {
  const request = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  const maxRedirects = options.maxRedirects ?? 3;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 5000) {
    throw new RangeError('A validação LUME exige timeout de até 5 segundos.');
  }
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 3) {
    throw new RangeError(
      'A validação LUME permite no máximo 3 redirecionamentos.',
    );
  }

  return {
    async validate(link) {
      const initial = normalizeLumeUrl(link);
      if (!initial) return { valid: false, reason: 'invalid_url' };

      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('O repositório LUME não respondeu no prazo.'));
        }, timeoutMs);
      });

      const check = async (): Promise<LumeValidationResult> => {
        let current = initial;
        let method: 'HEAD' | 'GET' = 'HEAD';
        let redirects = 0;
        while (!controller.signal.aborted) {
          const response = await request(current, {
            method,
            redirect: 'manual',
            signal: controller.signal,
            credentials: 'omit',
            headers: { Accept: 'text/html,application/pdf;q=0.9,*/*;q=0.5' },
          });
          await discardBody(response);
          if (controller.signal.aborted) break;

          if ([301, 302, 303, 307, 308].includes(response.status)) {
            if (redirects >= maxRedirects) {
              return { valid: false, reason: 'unreachable' };
            }
            const location = response.headers.get('location');
            if (!location) return { valid: false, reason: 'unreachable' };
            let destination: string | null;
            try {
              destination = normalizeLumeUrl(new URL(location, current).href);
            } catch {
              destination = null;
            }
            if (!destination) return { valid: false, reason: 'invalid_url' };
            current = destination;
            redirects++;
            continue;
          }

          if (method === 'HEAD' && [405, 501].includes(response.status)) {
            method = 'GET';
            continue;
          }
          return response.ok
            ? { valid: true, url: current }
            : { valid: false, reason: 'unreachable' };
        }
        return { valid: false, reason: 'unreachable' };
      };

      try {
        return await Promise.race([check(), deadline]);
      } catch {
        return { valid: false, reason: 'unreachable' };
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    },
  };
}
