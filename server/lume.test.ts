import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLumeValidator, normalizeLumeUrl } from './services/lume.js';

const link = 'https://lume.ufrgs.br/handle/10183/12345';
const invalidUrl = { valid: false, reason: 'invalid_url' };
const unavailable = { valid: false, reason: 'unreachable' };

afterEach(() => vi.useRealTimers());

describe('LUME URL policy', () => {
  it('accepts the exact HTTPS host, normalizes the default port and removes fragments', () => {
    expect(
      normalizeLumeUrl(' HTTPS://LUME.UFRGS.BR:443/handle/10183/12345#page=4 '),
    ).toBe(link);
    expect(normalizeLumeUrl(link)).toBe(link);
  });

  it('rejects malformed, credentialed and non-allowlisted URLs before any request', async () => {
    const request = vi.fn<typeof fetch>();
    const validator = createLumeValidator({ fetch: request });
    for (const candidate of [
      '',
      'not a url',
      '/handle/10183/12345',
      'http://lume.ufrgs.br/record',
      'https://lume.ufrgs.br:8443/record',
      'https://user@lume.ufrgs.br/record',
      'https://user:password@lume.ufrgs.br/record',
      'https://lume.ufrgs.br.example.com/record',
      'https://sub.lume.ufrgs.br/record',
      'https://lume.ufrgs.br./record',
      'https://lume-ufrgs.br/record',
      'https://127.0.0.1/record',
      'https://lume.ufrgs.br@127.0.0.1/record',
      'file:///etc/passwd',
      'https://lumе.ufrgs.br/record',
      `${link}?q=${'x'.repeat(2048)}`,
      `https://lume.ufrgs.br/${'ç'.repeat(500)}`,
    ])
      expect(await validator.validate(candidate)).toEqual(invalidUrl);
    expect(request).not.toHaveBeenCalled();
  });

  it('does not let injectable test limits exceed production policy', () => {
    for (const timeoutMs of [
      0,
      -1,
      5001,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(() => createLumeValidator({ timeoutMs })).toThrow(RangeError);
    }
    for (const maxRedirects of [-1, 4, 1.5]) {
      expect(() => createLumeValidator({ maxRedirects })).toThrow(RangeError);
    }
  });
});

describe('LUME accessibility checks', () => {
  it('uses a manual HEAD request without credentials and returns a normalized reachable URL', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    expect(
      await createLumeValidator({ fetch: request }).validate(`${link}#summary`),
    ).toEqual({ valid: true, url: link });
    expect(request).toHaveBeenCalledExactlyOnceWith(
      link,
      expect.objectContaining({
        method: 'HEAD',
        redirect: 'manual',
        credentials: 'omit',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('follows at most three same-host redirects and checks every next destination', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: '/record/2' } }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://lume.ufrgs.br:443/record/3#fragment' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 307,
          headers: { location: '/record/final' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(
      await createLumeValidator({ fetch: request }).validate(link),
    ).toEqual({ valid: true, url: 'https://lume.ufrgs.br/record/final' });
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      link,
      'https://lume.ufrgs.br/record/2',
      'https://lume.ufrgs.br/record/3',
      'https://lume.ufrgs.br/record/final',
    ]);
    expect(
      new Set(request.mock.calls.map(([, options]) => options?.signal)).size,
    ).toBe(1);
  });

  it('refuses redirected external hosts, credentials, downgrade and malformed targets before contacting them', async () => {
    for (const destination of [
      'http://lume.ufrgs.br/record',
      'https://evil.example/record',
      '//127.0.0.1/private',
      'https://user:pass@lume.ufrgs.br/record',
      'https://lume.ufrgs.br:8443/record',
      'https://[',
    ]) {
      const request = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: destination },
        }),
      );
      expect(
        await createLumeValidator({ fetch: request }).validate(link),
      ).toEqual(invalidUrl);
      expect(request).toHaveBeenCalledTimes(1);
    }
  });

  it('stops redirect loops, missing destinations and non-success responses', async () => {
    const loop = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { status: 308, headers: { location: link } }),
      );
    expect(await createLumeValidator({ fetch: loop }).validate(link)).toEqual(
      unavailable,
    );
    expect(loop).toHaveBeenCalledTimes(4);
    for (const status of [300, 302, 400, 401, 403, 404, 429, 500, 503]) {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status }));
      expect(
        await createLumeValidator({ fetch: request }).validate(link),
      ).toEqual(unavailable);
    }
  });

  it.each([405, 501])(
    'falls back from HEAD %i to GET and cancels the body without downloading the article',
    async (status) => {
      const cancelled = vi.fn();
      const body = new ReadableStream({ cancel: cancelled });
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { status }))
        .mockResolvedValueOnce(new Response(body, { status: 200 }));
      expect(
        await createLumeValidator({ fetch: request }).validate(link),
      ).toEqual({ valid: true, url: link });
      expect(request.mock.calls.map(([, options]) => options?.method)).toEqual([
        'HEAD',
        'GET',
      ]);
      expect(cancelled).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0]?.[1]?.signal).toBe(
        request.mock.calls[1]?.[1]?.signal,
      );
    },
  );

  it('does not fall back for an inaccessible HEAD or retry an unsuccessful GET', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response(null, { status: 405 }));
    expect(
      await createLumeValidator({ fetch: request }).validate(link),
    ).toEqual(unavailable);
    expect(request).toHaveBeenCalledTimes(2);
    const blocked = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 403 }));
    expect(
      await createLumeValidator({ fetch: blocked }).validate(link),
    ).toEqual(unavailable);
    expect(blocked).toHaveBeenCalledTimes(1);
  });

  it('maps network/TLS failures to an inaccessible result without exposing the error', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('internal TLS detail'));
    expect(
      await createLumeValidator({ fetch: request }).validate(link),
    ).toEqual(unavailable);
  });

  it('enforces a total deadline even when an injected fetch does not honor abort', async () => {
    vi.useFakeTimers();
    const request = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    const result = createLumeValidator({
      fetch: request,
      timeoutMs: 20,
    }).validate(link);
    await vi.advanceTimersByTimeAsync(20);
    expect(await result).toEqual(unavailable);
    expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('shares one timeout across HEAD fallback and redirect hops instead of restarting it', async () => {
    vi.useFakeTimers();
    const request = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(new Response(null, { status: 405 })), 15),
          ),
      )
      .mockImplementationOnce(() => new Promise<Response>(() => {}));
    const result = createLumeValidator({
      fetch: request,
      timeoutMs: 20,
    }).validate(link);
    await vi.advanceTimersByTimeAsync(20);
    expect(await result).toEqual(unavailable);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]?.[1]?.signal).toBe(
      request.mock.calls[1]?.[1]?.signal,
    );
  });
});
