import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { TccDTO } from '../../web/src/models/tcc';

const api = process.env.VITE_API_URL?.trim().replace(/\/+$/, '');
const fallbackNotice =
  'A busca por significado está indisponível para esta consulta. Exibindo resultados por texto.';
const noResults =
  'Nenhum trabalho encontrado para os critérios informados. Tente ajustar ou remover alguns filtros.';
const pdf = Buffer.from(
  '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
);
const area = { id: 'computacao', name: 'Computação' };
const tag = { id: 'privacidade', name: 'Privacidade', area };
const author = { id: 'ana', name: 'Ana da Silva' };
const advisor = { id: 'carlos', name: 'Prof. Carlos Lima' };
const collection = { id: 'inf', name: 'TCCs INF' };

function work(id: string, title: string): TccDTO {
  return {
    id,
    title,
    summary:
      'Pesquisa sobre proteção de dados, anonimização e segurança da informação em sistemas de saúde.',
    year: 2025,
    semester: 2,
    defendedAt: '2025-10-15',
    author,
    advisor,
    coadvisor: null,
    lumeUrl: 'https://lume.ufrgs.br/handle/10183/123',
    status: 'PUBLICADO',
    tags: [tag],
    collection,
    media: [],
    file: null,
    views: 0,
    publishedAt: '2025-10-20T00:00:00.000Z',
    createdAt: '2025-10-20T00:00:00.000Z',
    updatedAt: '2025-10-20T00:00:00.000Z',
  };
}

const first = work('A', 'Anonimização de registros clínicos');
first.file = {
  id: 'article',
  originalName: 'privacidade.pdf',
  format: 'PDF',
  path: '/api/attachments/article',
};
const second = work('B', 'Proteção de informações em hospitais');

/** These responses verify the UI contract; backend evaluation verifies semantic relevance. */
async function fixture(page: Page) {
  const state = {
    semanticQueries: [] as URLSearchParams[],
    textQueries: [] as URLSearchParams[],
    relatedRequests: [] as string[],
    failSemantic: false,
    failRelated: false,
    fallback: false,
    empty: false,
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
    const results = () => ({
      items: state.empty ? [] : [first],
      total: state.empty ? 0 : 1,
      page: Number(url.searchParams.get('page') || 1),
      pageSize: Number(url.searchParams.get('pageSize') || 12),
    });
    if (request.method() === 'OPTIONS') return respond({});
    if (path === '/auth/config')
      return respond({ mode: 'disabled', loginUrl: null });
    if (path === '/auth/session')
      return respond({ user: null, csrfToken: null, mode: 'disabled' });
    if (path === '/discovery-options')
      return respond({
        authors: [author],
        advisors: [advisor],
        years: [2025],
        tags: [tag],
        areas: [area],
        collections: [collection],
      });
    if (path === '/search') {
      state.semanticQueries.push(new URLSearchParams(url.search));
      if (state.failSemantic)
        return respond({ message: 'Falha controlada.' }, 503);
      return respond({
        ...results(),
        search: {
          requestedMode: 'semantic',
          mode: state.fallback ? 'text' : 'semantic',
          fallbackReason: state.fallback ? 'index_unavailable' : null,
          ...(state.fallback ? { notice: fallbackNotice } : {}),
        },
      });
    }
    if (path === '/tccs') {
      state.textQueries.push(new URLSearchParams(url.search));
      return respond(results());
    }
    if (path.endsWith('/related')) {
      const id = path.split('/')[2];
      state.relatedRequests.push(id);
      if (state.failRelated) return respond({}, 503);
      return respond({
        items:
          id === first.id
            ? [
                {
                  tcc: second,
                  sharedTags: [tag],
                  sharedAreas: [area],
                  score: 5,
                },
              ]
            : [],
      });
    }
    if (path.endsWith('/views')) return respond({ counted: false });
    if (path === `/tccs/${first.id}`) return respond(first);
    if (path === `/tccs/${second.id}`) return respond(second);
    if (path.startsWith('/tccs/')) return respond({ code: 'NOT_FOUND' }, 404);
    if (path === '/attachments/article')
      return route.fulfill({
        status: 200,
        headers,
        contentType: 'application/pdf',
        body: pdf,
      });
    return respond({ message: 'Fixture não configurada.' }, 404);
  });
  return state;
}

test('modo por significado sem API permanece indisponível sem simular resultados', async ({
  page,
}) => {
  test.skip(!!api, 'Verifica o artefato de produção sem API configurada.');
  await page.goto('./#/buscar?mode=semantic&term=proteger%20dados');
  await expect(page.getByLabel('Modo de busca', { exact: true })).toHaveValue(
    'semantic',
  );
  await expect(
    page.getByLabel('Modo de busca', { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Pesquisar', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText('Resultados por significado', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('O acervo ainda precisa ser conectado.', { exact: true }),
  ).toBeVisible();
});

test.describe('busca por significado e conexões com API configurada', () => {
  test.skip(!api, 'Requer o bundle isolado com API controlada.');

  test('modo selecionado serializa os critérios e usa a operação semântica', async ({
    page,
  }) => {
    const state = await fixture(page);
    await page.goto('./#/buscar');
    await expect(page.getByLabel('Modo de busca', { exact: true })).toHaveValue(
      'text',
    );
    await page
      .getByLabel('Modo de busca', { exact: true })
      .selectOption('semantic');
    await page
      .getByLabel('Termo de pesquisa', { exact: true })
      .fill('proteger dados');
    await page.getByLabel('Ano da defesa', { exact: true }).fill('2025');
    await page
      .getByLabel('Orientador', { exact: true })
      .selectOption(advisor.id);
    await page
      .getByRole('group', { name: 'Assuntos / tags' })
      .getByLabel(tag.name, { exact: true })
      .check();
    await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
    await expect(
      page.getByText('Resultados por significado', { exact: true }),
    ).toBeVisible();
    const query = state.semanticQueries.at(-1)!;
    expect(query.get('mode')).toBe('semantic');
    expect(query.get('term')).toBe('proteger dados');
    expect(query.get('year')).toBe('2025');
    expect(query.get('advisorId')).toBe(advisor.id);
    expect(query.get('tagIds')).toBe(tag.id);
    await expect(page).toHaveURL(/mode=semantic/);
    expect(state.textQueries.every((item) => !item.has('mode'))).toBe(true);
  });

  test('abrir leitura e voltar ou recarregar mantém o modo e os filtros confirmados', async ({
    page,
  }) => {
    await fixture(page);
    await page.goto(
      './#/buscar?mode=semantic&term=proteger%20dados&year=2025&tagIds=privacidade',
    );
    await expect(
      page.getByText('Resultados por significado', { exact: true }),
    ).toBeVisible();
    const resultCriteria = Object.fromEntries(
      new URLSearchParams(new URL(page.url()).hash.split('?')[1]),
    );
    await page.getByRole('link', { name: first.title, exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: first.title }),
    ).toBeVisible();
    await page.getByRole('link', { name: /Voltar aos resultados/ }).click();
    await expect(page).toHaveURL(/#\/buscar\?/);
    expect(
      Object.fromEntries(
        new URLSearchParams(new URL(page.url()).hash.split('?')[1]),
      ),
    ).toEqual(resultCriteria);
    await page.reload();
    await expect(page.getByLabel('Modo de busca', { exact: true })).toHaveValue(
      'semantic',
    );
    await expect(
      page.getByLabel('Termo de pesquisa', { exact: true }),
    ).toHaveValue('proteger dados');
    await expect(page.getByLabel('Ano da defesa', { exact: true })).toHaveValue(
      '2025',
    );
    await expect(
      page
        .getByRole('group', { name: 'Assuntos / tags' })
        .getByLabel(tag.name, { exact: true }),
    ).toBeChecked();
  });

  test('fallback por texto é explícito e conserva a consulta inclusive sem resultados', async ({
    page,
  }) => {
    const state = await fixture(page);
    state.fallback = true;
    await page.goto('./#/buscar?mode=semantic&term=proteger%20dados&year=2025');
    await expect(page.getByText(fallbackNotice, { exact: true })).toBeVisible();
    await expect(
      page.getByText('Resultados por significado', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: first.title, exact: true }),
    ).toBeVisible();
    state.empty = true;
    await page.reload();
    await expect(page.getByText(fallbackNotice, { exact: true })).toBeVisible();
    await expect(page.getByText(noResults, { exact: true })).toBeVisible();
    await expect(page.getByLabel('Modo de busca', { exact: true })).toHaveValue(
      'semantic',
    );
    await expect(
      page.getByLabel('Termo de pesquisa', { exact: true }),
    ).toHaveValue('proteger dados');
    await expect(page.getByLabel('Ano da defesa', { exact: true })).toHaveValue(
      '2025',
    );
  });

  test('falha da busca permite repetir sem perder modo e filtros', async ({
    page,
  }) => {
    const state = await fixture(page);
    state.failSemantic = true;
    await page.goto('./#/buscar?mode=semantic&term=proteger%20dados&year=2025');
    await expect(page.getByRole('alert')).toBeVisible();
    state.failSemantic = false;
    await page
      .getByRole('button', { name: 'Tentar novamente', exact: true })
      .click();
    await expect(
      page.getByText('Resultados por significado', { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Modo de busca', { exact: true })).toHaveValue(
      'semantic',
    );
    await expect(page.getByLabel('Ano da defesa', { exact: true })).toHaveValue(
      '2025',
    );
    expect(state.semanticQueries.at(-1)?.get('term')).toBe('proteger dados');
  });

  test('conexões apresentam temas em comum e permitem continuar a exploração', async ({
    page,
  }) => {
    await fixture(page);
    await page.goto('./#/tcc/A');
    await expect(
      page.getByRole('heading', { name: 'Trabalhos conexos', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Em comum: Privacidade, Computação.', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('list', { name: 'Trabalhos conexos', exact: true })
      .getByRole('link', { name: second.title, exact: true })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: second.title }),
    ).toBeVisible();
    await expect(
      page.getByText('Ainda não há trabalhos conexos para esta pesquisa.', {
        exact: true,
      }),
    ).toBeVisible();
    const width = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(width.content).toBeLessThanOrEqual(width.viewport + 1);
  });

  test('conexões indisponíveis não impedem leitura e download e admitem nova tentativa', async ({
    page,
  }) => {
    const state = await fixture(page);
    state.failRelated = true;
    await page.goto('./#/tcc/A');
    await expect(
      page.getByText('Não foi possível carregar os trabalhos conexos agora.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: first.title }),
    ).toBeVisible();
    const pending = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Baixar Artigo', exact: true })
      .click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe('privacidade.pdf');
    expect(await readFile((await download.path())!)).toEqual(pdf);
    state.failRelated = false;
    await page
      .getByRole('button', {
        name: 'Tentar carregar conexões novamente',
        exact: true,
      })
      .click();
    await expect(
      page
        .getByRole('list', { name: 'Trabalhos conexos', exact: true })
        .getByRole('link', { name: second.title, exact: true }),
    ).toBeVisible();
  });

  test('ID privado não apresenta metadados nem solicita conexões', async ({
    page,
  }) => {
    const state = await fixture(page);
    await page.goto('./#/tcc/E');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Trabalho não encontrado.' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Trabalhos conexos', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Baixar Artigo', exact: true }),
    ).toHaveCount(0);
    expect(state.relatedRequests).not.toContain('E');
  });
});
