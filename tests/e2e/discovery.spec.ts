import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { TccDTO } from '../../web/src/models/tcc';

const api = process.env.VITE_API_URL?.trim().replace(/\/+$/, '');
const noResults =
  'Nenhum trabalho encontrado para os critérios informados. Tente ajustar ou remover alguns filtros.';
const downloadError =
  'Ocorreu um erro durante o download, verifique a sua conexão com a internet e tente novamente.';
const pdf = Buffer.from(
  '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
);
const area = { id: 'computacao', name: 'Computação' };
const collection = { id: 'inf', name: 'TCCs INF' };
const author = { id: 'joao', name: 'João da Silva' };
const carlos = { id: 'carlos', name: 'Prof. Carlos Lima' };
const ana = { id: 'ana', name: 'Profª Ana Reis' };
const redes = { id: 'redes', name: 'Redes', area };
const ia = { id: 'ia', name: 'IA', area };
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
function work(id: string, overrides: Partial<TccDTO> = {}): TccDTO {
  return {
    id,
    title: `Pesquisa ${id} — Redes`,
    summary: `Resumo acessível da pesquisa ${id}, com investigação de redes e resultados para a comunidade.`,
    year: 2025,
    semester: 1,
    defendedAt: '2025-05-20',
    author,
    advisor: carlos,
    coadvisor: ana,
    lumeUrl: `https://lume.ufrgs.br/handle/10183/${id}`,
    status: 'PUBLICADO',
    tags: [redes],
    collection,
    media: [],
    file: null,
    views: 3,
    publishedAt: '2025-06-01T00:00:00.000Z',
    createdAt: '2025-05-25T00:00:00.000Z',
    updatedAt: '2025-06-01T00:00:00.000Z',
    ...overrides,
  };
}

async function fixture(page: Page) {
  const state = {
    works: [
      work('D', { advisor: ana, defendedAt: '2025-05-22' }),
      work('B', {
        title: 'Pesquisa B — IA',
        tags: [ia],
        defendedAt: '2025-05-21',
      }),
      work('A', {
        media: [
          {
            id: 'figure',
            url: '/api/attachments/figure',
            description: 'Diagrama da arquitetura de redes.',
          },
        ],
        file: {
          id: 'paper',
          originalName: 'trabalho.pdf',
          format: 'PDF',
          path: '/api/attachments/paper',
        },
      }),
      work('C', { year: 2024, semester: 2, defendedAt: '2024-11-20' }),
    ],
    queries: [] as URLSearchParams[],
    views: [] as string[],
    failFeed: false,
    failSearch: false,
    failRead: false,
    failDownload: false,
    failMetric: false,
  };
  if (!api) return state;
  await page.route(`${api}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.slice(new URL(api).pathname.length);
    const headers = {
      'access-control-allow-origin':
        request.headers().origin || 'http://127.0.0.1:4173',
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    };
    const respond = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        headers,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (request.method() === 'OPTIONS') return respond({});
    if (path === '/auth/config')
      return respond({ mode: 'disabled', loginUrl: null });
    if (path === '/auth/session')
      return respond({ user: null, csrfToken: null, mode: 'disabled' });
    if (path === '/feed')
      return state.failFeed
        ? respond({}, 503)
        : respond({
            recent: state.works,
            topics: [
              { ...redes, views: 8 },
              { ...ia, views: 2 },
            ],
            windowDays: 30,
          });
    if (path === '/discovery-options')
      return respond({
        authors: [author],
        advisors: [carlos, ana],
        years: [2025, 2024],
        tags: [redes, ia],
        areas: [area],
        collections: [collection],
      });
    if (path === '/tccs') {
      state.queries.push(new URLSearchParams(url.search));
      if (state.failSearch) return respond({}, 503);
      const q = url.searchParams;
      const normalize = (value: string) =>
        value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
      const selected = state.works.filter((item) => {
        const matches = (key: string, value: unknown) =>
          !q.has(key) || q.get(key) === String(value);
        return (
          matches('year', item.year) &&
          matches('semester', item.semester) &&
          matches('authorId', item.author.id) &&
          matches('advisorId', item.advisor?.id) &&
          matches('collectionId', item.collection?.id) &&
          (!q.get('term') ||
            normalize(
              `${item.title} ${item.summary} ${item.author.name} ${item.advisor?.name}`,
            ).includes(normalize(q.get('term')!))) &&
          (!q.get('dateFrom') || item.defendedAt! >= q.get('dateFrom')!) &&
          (!q.get('dateTo') || item.defendedAt! <= q.get('dateTo')!) &&
          (!q.get('tagIds') ||
            q
              .get('tagIds')!
              .split(',')
              .every((id) => item.tags.some((tag) => tag.id === id))) &&
          (!q.get('areaIds') ||
            item.tags.some((tag) =>
              q
                .get('areaIds')!
                .split(',')
                .includes(tag.area?.id || ''),
            ))
        );
      });
      const pageNumber = Number(q.get('page') || 1);
      const pageSize = Number(q.get('pageSize') || 20);
      return respond({
        items: selected.slice(
          (pageNumber - 1) * pageSize,
          pageNumber * pageSize,
        ),
        total: selected.length,
        page: pageNumber,
        pageSize,
      });
    }
    if (path.endsWith('/views')) {
      state.views.push(path.split('/')[2]);
      return state.failMetric ? respond({}, 503) : respond({ counted: true });
    }
    if (path.endsWith('/related')) return respond({ items: [] });
    if (path.startsWith('/tccs/')) {
      if (state.failRead) return respond({}, 503);
      const found = state.works.find(
        (item) => item.id === decodeURIComponent(path.slice('/tccs/'.length)),
      );
      return found ? respond(found) : respond({ code: 'NOT_FOUND' }, 404);
    }
    if (path === '/attachments/paper')
      return state.failDownload
        ? respond({}, 503)
        : route.fulfill({
            status: 200,
            headers,
            contentType: 'application/pdf',
            body: pdf,
          });
    if (path === '/attachments/figure')
      return route.fulfill({
        status: 200,
        headers,
        contentType: 'image/png',
        body: png,
      });
    return respond({ message: 'Fixture não configurada.' }, 404);
  });
  return state;
}

test('busca e leitura sem API configurada explicam a conexão pendente', async ({
  page,
}) => {
  test.skip(
    !!api,
    'Este cenário verifica o artefato público sem API configurada.',
  );
  await page.goto('./#/buscar');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Buscar TCC' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Pesquisar', exact: true }),
  ).toBeDisabled();
  await page.goto('./#/tcc/A');
  await expect(page.getByRole('button', { name: 'Baixar Artigo' })).toHaveCount(
    0,
  );
  await expect(page.getByText(/conectad|configurad/i).first()).toBeVisible();
});

test.describe('descoberta pública com API configurada', () => {
  test.skip(!api, 'Requer o bundle isolado com API controlada.');

  test('feed apresenta recentes e tópicos e abre leitura sem exigir login', async ({
    page,
  }) => {
    const state = await fixture(page);
    await page.goto('./');
    await page.getByRole('button', { name: 'Explorar o catálogo' }).click();
    await expect(
      page.getByRole('link', { name: 'Pesquisa A — Redes', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'Pesquisa A — Redes', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Pesquisa A — Redes' }),
    ).toBeVisible();
    await expect(
      page.getByText('Diagrama da arquitetura de redes.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Baixar Artigo', exact: true }),
    ).toBeVisible();
    await expect.poll(() => state.views).toContain('A');
    await expect(page.getByRole('button', { name: /Aluno Autor/ })).toHaveCount(
      0,
    );
  });

  test('CT03 combina ano orientador e Redes, mantém a URL e permite ajustar a consulta vazia', async ({
    page,
  }) => {
    const state = await fixture(page);
    await page.goto('./#/buscar');
    await page.getByLabel('Ano da defesa', { exact: true }).fill('2025');
    await page.getByLabel('Orientador', { exact: true }).selectOption('carlos');
    await page
      .getByRole('group', { name: 'Assuntos / tags' })
      .getByLabel('Redes', { exact: true })
      .check();
    await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
    await expect.poll(() => state.queries.at(-1)?.get('year')).toBe('2025');
    await expect(
      page.getByRole('link', { name: 'Pesquisa A — Redes', exact: true }),
    ).toBeVisible();
    for (const id of ['B', 'C', 'D', 'E'])
      await expect(
        page.getByRole('link', { name: new RegExp(`Pesquisa ${id}`) }),
      ).toHaveCount(0);
    expect(state.queries.at(-1)?.get('year')).toBe('2025');
    expect(state.queries.at(-1)?.get('advisorId')).toBe('carlos');
    expect(state.queries.at(-1)?.get('tagIds')).toBe('redes');
    const resultUrl = page.url();
    await page
      .getByRole('link', { name: 'Pesquisa A — Redes', exact: true })
      .click();
    await page.getByRole('link', { name: /Voltar aos resultados/ }).click();
    await expect(page).toHaveURL(resultUrl);
    await page.reload();
    await expect(page.getByLabel('Ano da defesa', { exact: true })).toHaveValue(
      '2025',
    );
    // 2023 can be reached through a bookmarked URL even when it has no published works.
    await page.goto('./#/buscar?year=2023&tagIds=redes');
    await expect(page.getByText(noResults, { exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: 'Limpar filtros', exact: true })
      .click();
    await expect(
      page.getByRole('link', { name: 'Pesquisa D — Redes', exact: true }),
    ).toBeVisible();
  });

  test('todos os filtros são enviados e tags múltiplas exigem todos os assuntos', async ({
    page,
  }) => {
    const state = await fixture(page);
    state.works.find((item) => item.id === 'A')!.tags = [redes, ia];
    await page.goto('./#/buscar');
    await page.getByLabel('Termo de pesquisa', { exact: true }).fill('Joao');
    await page.getByLabel('Ano da defesa', { exact: true }).fill('2025');
    await page.getByLabel('Semestre', { exact: true }).selectOption('1');
    await page
      .getByLabel('Defesa a partir de', { exact: true })
      .fill('2025-05-01');
    await page.getByLabel('Defesa até', { exact: true }).fill('2025-05-31');
    await page
      .getByLabel('Autor / orientando', { exact: true })
      .selectOption('joao');
    await page.getByLabel('Orientador', { exact: true }).selectOption('carlos');
    await page.getByLabel('Coleção', { exact: true }).selectOption('inf');
    await page
      .getByRole('group', { name: 'Assuntos / tags' })
      .getByLabel('Redes', { exact: true })
      .check();
    await page
      .getByRole('group', { name: 'Assuntos / tags' })
      .getByLabel('IA', { exact: true })
      .check();
    await page
      .getByRole('group', { name: 'Áreas', exact: true })
      .getByLabel('Computação', { exact: true })
      .check();
    await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
    await expect.poll(() => state.queries.at(-1)?.get('term')).toBe('Joao');
    await expect(
      page.getByRole('link', { name: 'Pesquisa A — Redes', exact: true }),
    ).toBeVisible();
    for (const id of ['B', 'C', 'D'])
      await expect(
        page.getByRole('link', { name: new RegExp(`Pesquisa ${id}`) }),
      ).toHaveCount(0);
    const query = state.queries.at(-1)!;
    for (const [key, value] of Object.entries({
      term: 'Joao',
      year: '2025',
      semester: '1',
      dateFrom: '2025-05-01',
      dateTo: '2025-05-31',
      authorId: 'joao',
      advisorId: 'carlos',
      collectionId: 'inf',
      areaIds: 'computacao',
    }))
      expect(query.get(key)).toBe(value);
    expect(query.get('tagIds')!.split(',').sort()).toEqual(['ia', 'redes']);
  });

  test('download falho mantém leitura e permite baixar os bytes corretos na nova tentativa', async ({
    page,
  }) => {
    const state = await fixture(page);
    state.failDownload = true;
    state.failMetric = true;
    await page.goto('./#/tcc/A');
    await page
      .getByRole('button', { name: 'Baixar Artigo', exact: true })
      .click();
    await expect(page.getByText(downloadError, { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Pesquisa A — Redes' }),
    ).toBeVisible();
    state.failDownload = false;
    const pending = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Baixar Artigo', exact: true })
      .click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe('trabalho.pdf');
    expect(await readFile((await download.path())!)).toEqual(pdf);
  });

  test('sem anexo oferece o LUME e ID privado não revela detalhes', async ({
    page,
  }) => {
    await fixture(page);
    await page.goto('./#/tcc/B');
    await expect(
      page.getByRole('link', { name: /Abrir documento no LUME/ }),
    ).toHaveAttribute('href', 'https://lume.ufrgs.br/handle/10183/B');
    await expect(
      page.getByRole('button', { name: 'Baixar Artigo', exact: true }),
    ).toHaveCount(0);
    await page.goto('./#/tcc/E');
    await expect(
      page.getByText(/não encontrado|não está disponível/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/Resumo acessível da pesquisa E/)).toHaveCount(
      0,
    );
  });

  test('feed e busca recuperam falhas sem perder os filtros', async ({
    page,
  }) => {
    const state = await fixture(page);
    state.failFeed = true;
    await page.goto('./');
    await page
      .locator('#catalogo')
      .getByRole('button', { name: /Tentar novamente/ })
      .click({ trial: true });
    state.failFeed = false;
    await page
      .locator('#catalogo')
      .getByRole('button', { name: /Tentar novamente/ })
      .click();
    await expect(
      page.getByRole('link', { name: 'Pesquisa A — Redes', exact: true }),
    ).toBeVisible();
    state.failSearch = true;
    await page.goto('./#/buscar?year=2025&advisorId=carlos&tagIds=redes');
    await expect(page.getByLabel('Ano da defesa', { exact: true })).toHaveValue(
      '2025',
    );
    state.failSearch = false;
    await page.getByRole('button', { name: /Tentar novamente/ }).click();
    await expect(
      page.getByRole('link', { name: 'Pesquisa A — Redes', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Orientador', { exact: true })).toHaveValue(
      'carlos',
    );
  });

  test('paginação preserva a consulta e a leitura funciona após recarregar no Pages', async ({
    page,
  }) => {
    await fixture(page);
    await page.goto('./#/buscar?tagIds=redes&pageSize=2');
    await expect(
      page.getByRole('link', { name: 'Pesquisa D — Redes', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Pesquisa A — Redes', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'Próxima página', exact: true })
      .click();
    await expect(
      page.getByRole('link', { name: 'Pesquisa C — Redes', exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/page=2/);
    await page
      .getByRole('link', { name: 'Pesquisa C — Redes', exact: true })
      .click();
    await page.reload();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Pesquisa C — Redes' }),
    ).toBeVisible();
    const width = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(width.content).toBeLessThanOrEqual(width.viewport + 1);
  });
});
