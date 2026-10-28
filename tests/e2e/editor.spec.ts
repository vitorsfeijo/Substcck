import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const api = process.env.VITE_API_URL?.trim().replace(/\/+$/, '');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
const user = {
  id: 'student-author',
  name: 'Aluno Autor',
  email: 'autor@example.test',
  institutionalLogin: 'aluno.autor',
  role: 'student',
  enrollment: '000001',
  department: null,
};
const tags = [
  {
    id: 'redes',
    name: 'Redes',
    area: { id: 'computacao', name: 'Computação' },
  },
  { id: 'ia', name: 'IA', area: { id: 'computacao', name: 'Computação' } },
  {
    id: 'seguranca',
    name: 'Segurança',
    area: { id: 'computacao', name: 'Computação' },
  },
];
const now = '2026-01-01T00:00:00.000Z';
const existingWork = {
  id: 'own-work',
  title: 'Pesquisa original',
  summary: 'Resumo acessível da pesquisa.',
  year: 2025,
  semester: 2,
  defendedAt: '2025-10-15',
  author: { id: user.id, name: user.name },
  advisor: { id: 'carlos', name: 'Prof. Carlos Lima' },
  coadvisor: null,
  lumeUrl: 'https://lume.ufrgs.br/handle/10183/123',
  status: 'RASCUNHO',
  tags: [tags[0]],
  collection: null,
  media: [],
  file: null,
  views: 0,
  publishedAt: null as string | null,
  createdAt: now,
  updatedAt: now,
};

async function fixture(page: Page, initialWork?: typeof existingWork) {
  const state = {
    work: initialWork || null,
    requests: [] as Record<string, unknown>[],
    requestKeys: [] as (string | undefined)[],
    requestMethods: [] as string[],
    uploads: [] as {
      id: string;
      kind: string;
      originalName: string;
      description: string;
      format: string | null;
      mimeType: string;
      size: number;
      url: string;
    }[],
    invalidLume: false,
    unavailable: false,
    newTags: [] as typeof tags,
  };
  if (!api) return state;
  await page.route(`${api}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const headers = {
      'access-control-allow-origin':
        request.headers().origin || 'http://127.0.0.1:4173',
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'access-control-allow-headers':
        'content-type,x-csrf-token,idempotency-key',
    };
    const respond = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        headers,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (method === 'OPTIONS') return respond({});
    if (path.endsWith('/auth/config'))
      return respond({
        mode: 'development',
        loginUrl: null,
        developmentUsers: [{ id: 'author', name: user.name, role: 'student' }],
      });
    if (path.endsWith('/auth/session'))
      return respond({ user, csrfToken: 'fixture-csrf', mode: 'development' });
    if (path.endsWith('/health'))
      return respond({
        status: 'ok',
        service: 'subtccstack-api',
        database: 'ok',
        environment: 'development',
      });
    if (path.endsWith('/tcc-options'))
      return respond({
        professors: [
          { id: 'carlos', name: 'Prof. Carlos Lima' },
          { id: 'ana', name: 'Profª Ana Reis' },
        ],
        tags: [...tags, ...state.newTags],
        areas: [{ id: 'computacao', name: 'Computação' }],
        collections: [{ id: 'inf', name: 'TCCs INF' }],
      });
    if (path.endsWith('/tags') && method === 'POST') {
      expect(request.headers()['x-csrf-token']).toBe('fixture-csrf');
      const input = request.postDataJSON() as { name: string; areaId?: string };
      const tag = {
        id: `new-${state.newTags.length}`,
        name: input.name,
        area: input.areaId ? { id: input.areaId, name: 'Computação' } : null,
      };
      state.newTags.push(tag as (typeof tags)[number]);
      return respond(tag, 201);
    }
    if (path.endsWith('/attachments') && method === 'POST') {
      expect(request.headers()['x-csrf-token']).toBe('fixture-csrf');
      const kind = url.searchParams.get('kind') || 'image';
      const originalName =
        /filename="([^"]+)"/.exec(
          request.postDataBuffer()?.toString('latin1') || '',
        )?.[1] || 'imagem.png';
      const item = {
        id: `attachment-${state.uploads.length + 1}`,
        kind,
        originalName,
        description: '',
        format: kind === 'document' ? 'PDF' : null,
        mimeType: kind === 'document' ? 'application/pdf' : 'image/png',
        size: 100,
        url: '',
      };
      item.url = `/api/attachments/${item.id}`;
      state.uploads.push(item);
      return respond(item, 201);
    }
    if (/\/attachments\/[^/]+$/.test(path)) {
      if (method === 'DELETE') return respond({});
      return route.fulfill({
        status: 200,
        headers,
        contentType: 'image/png',
        body: png,
      });
    }
    if (path.endsWith('/me/tccs'))
      return respond({
        items: state.work ? [state.work] : [],
        total: state.work ? 1 : 0,
        page: 1,
        pageSize: 20,
      });
    if (/\/me\/tccs\/[^/]+$/.test(path))
      return state.work
        ? respond(state.work)
        : respond({ message: 'Trabalho não encontrado.' }, 404);
    if (
      (path.endsWith('/tccs') && method === 'POST') ||
      (/\/tccs\/[^/]+$/.test(path) && method === 'PUT')
    ) {
      expect(request.headers()['x-csrf-token']).toBe('fixture-csrf');
      const command = request.postDataJSON() as Record<string, unknown>;
      if (method === 'POST')
        expect(request.headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
      state.requests.push(command);
      state.requestKeys.push(request.headers()['idempotency-key']);
      state.requestMethods.push(method);
      expect(command).not.toHaveProperty('authorId');
      expect(command).not.toHaveProperty('status');
      if (state.unavailable)
        return respond({ message: 'Não foi possível salvar agora.' }, 503);
      if (command.intent === 'publish' && state.invalidLume)
        return respond(
          {
            code: 'LUME_INVALID',
            message:
              'A URL informada não pertence ao domínio do LUME ou está inacessível. Deseja salvar como rascunho até que a publicação no LUME esteja homologada?',
            canSaveDraft: state.work?.status !== 'PUBLICADO',
          },
          422,
        );
      const status = command.intent === 'publish' ? 'PUBLICADO' : 'RASCUNHO';
      state.work = {
        ...existingWork,
        ...state.work,
        title: String(command.title),
        summary: String(command.summary),
        year: command.year as number,
        semester: command.semester as number,
        defendedAt: String(command.defendedAt || ''),
        lumeUrl: String(command.lumeUrl),
        status,
        tags: [...tags, ...state.newTags].filter((tag) =>
          (command.tagIds as string[]).includes(tag.id),
        ),
        media: [],
        file: null,
        publishedAt: status === 'PUBLICADO' ? now : null,
      };
      const message =
        status === 'RASCUNHO'
          ? 'Rascunho salvo com sucesso'
          : method === 'PUT'
            ? 'TCC atualizado com sucesso!'
            : 'TCC publicado com sucesso!';
      return respond(
        { tcc: state.work, message },
        method === 'POST' ? 201 : 200,
      );
    }
    return respond({ message: 'Fixture não configurada.' }, 404);
  });
  return state;
}

async function fillRequired(page: Page) {
  await page
    .getByLabel(/^Título \*/)
    .fill('Detecção de anomalias em redes veiculares');
  await page
    .getByLabel(/^Resumo simplificado/)
    .fill(
      'Resumo simplificado preenchido para aproximar a comunidade da pesquisa.',
    );
  await page.getByLabel(/^Ano da defesa/).fill('2025');
  await page.getByLabel(/^Semestre/).selectOption('2');
  await page.getByLabel(/^Data de defesa/).fill('2025-10-15');
  await page.getByLabel(/^Orientador \*/).selectOption('carlos');
  await page
    .getByLabel(/^Link do LUME/)
    .fill('https://lume.ufrgs.br/handle/10183/123');
  await page.getByRole('checkbox', { name: 'Redes', exact: true }).check();
}

test.describe('editor de trabalhos com API configurada', () => {
  test.skip(!api, 'Requer o bundle isolado com API de fixtures.');

  test('CT01 publica dados válidos com duas imagens e arquivo opcional', async ({
    page,
  }, testInfo) => {
    const state = await fixture(page);
    await page.goto('./#/novo-tcc');
    await fillRequired(page);
    await page.getByLabel('Selecionar imagens de demonstração').setInputFiles([
      { name: 'figura-1.png', mimeType: 'image/png', buffer: png },
      { name: 'figura-2.png', mimeType: 'image/png', buffer: png },
    ]);
    await expect(page.getByText('2/3 imagens', { exact: true })).toBeVisible();
    await page
      .getByLabel('Descrição da imagem 1')
      .fill('Arquitetura da proposta');
    await page.getByLabel('Selecionar arquivo do trabalho').setInputFiles({
      name: 'artigo.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\n%%EOF'),
    });
    await expect(page.getByText('artigo.pdf', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('editor.png'),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Publicar TCC', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'TCC publicado com sucesso!',
    );
    expect(state.requests).toHaveLength(1);
    expect(state.requests[0]).toMatchObject({
      intent: 'publish',
      mediaIds: ['attachment-1', 'attachment-2'],
      fileId: 'attachment-3',
      mediaDescriptions: { 'attachment-1': 'Arquitetura da proposta' },
    });
    await expect(
      page.getByRole('button', { name: 'Atualizar TCC', exact: true }),
    ).toBeVisible();
    await page.getByLabel(/^Resumo simplificado/).fill('Resumo revisado.');
    await page
      .getByRole('button', { name: 'Atualizar TCC', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'TCC atualizado com sucesso!',
    );
    expect(state.requestMethods).toEqual(['POST', 'PUT']);
    expect(state.requestKeys[1]).toBeUndefined();
  });

  test('campos obrigatórios incompletos mantêm o título e os anexos no formulário', async ({
    page,
  }) => {
    const state = await fixture(page);
    await page.goto('./#/novo-tcc');
    await page.getByLabel(/^Título \*/).fill('Meu rascunho em construção');
    await page.getByLabel('Selecionar imagens de demonstração').setInputFiles({
      name: 'imagem.png',
      mimeType: 'image/png',
      buffer: png,
    });
    await expect(page.getByText('1/3 imagens', { exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: 'Publicar TCC', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText(
      'Preencha todos os campos obrigatórios',
    );
    await expect(page.getByLabel(/^Título \*/)).toHaveValue(
      'Meu rascunho em construção',
    );
    await expect(page.getByLabel(/^Resumo simplificado/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.getByText('1/3 imagens', { exact: true })).toBeVisible();
    expect(state.requests).toHaveLength(0);
  });

  test('CT02 permite recusar a oferta e depois salvar rascunho sem perder dados', async ({
    page,
  }) => {
    const state = await fixture(page);
    state.invalidLume = true;
    await page.goto('./#/novo-tcc');
    await fillRequired(page);
    await page.getByLabel(/^Link do LUME/).fill('https://exemplo.com/tcc');
    await page
      .getByRole('button', { name: 'Publicar TCC', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText(
      'Deseja salvar como rascunho',
    );
    await page
      .getByRole('button', { name: 'Voltar ao formulário', exact: true })
      .click();
    await expect(page.getByLabel(/^Título \*/)).toHaveValue(
      'Detecção de anomalias em redes veiculares',
    );
    expect(state.work).toBeNull();
    await page
      .getByRole('button', { name: 'Publicar TCC', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Salvar como rascunho', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'Rascunho salvo com sucesso',
    );
    expect(state.work?.status).toBe('RASCUNHO');
    await page.getByRole('link', { name: 'Ver meus trabalhos' }).click();
    await expect(
      page.getByRole('link', { name: 'Retomar rascunho' }),
    ).toBeVisible();
  });

  test('edição inválida preserva a versão publicada e não oferece despublicar', async ({
    page,
  }) => {
    const state = await fixture(page, {
      ...existingWork,
      status: 'PUBLICADO',
      publishedAt: now,
    });
    state.invalidLume = true;
    await page.goto('./#/editar-tcc/own-work');
    await expect(page.getByLabel(/^Título \*/)).toHaveValue(
      'Pesquisa original',
    );
    await page.getByLabel(/^Título \*/).fill('Minha revisão ainda não salva');
    await page
      .getByRole('button', { name: 'Atualizar TCC', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText(
      'A versão publicada anterior permanece disponível',
    );
    await expect(
      page.getByRole('button', { name: /Salvar.*rascunho/ }),
    ).toHaveCount(0);
    await expect(page.getByLabel(/^Título \*/)).toHaveValue(
      'Minha revisão ainda não salva',
    );
    expect(state.work?.title).toBe('Pesquisa original');
  });

  test('perfil retoma o rascunho do autor e salva a mesma identidade de trabalho', async ({
    page,
  }) => {
    const state = await fixture(page, existingWork);
    await page.goto('./#/perfil');
    await page.getByRole('link', { name: 'Retomar rascunho' }).click();
    await expect(page).toHaveURL(/#\/editar-tcc\/own-work$/);
    await expect(page.getByLabel(/^Título \*/)).toHaveValue(
      'Pesquisa original',
    );
    await page.getByLabel(/^Título \*/).fill('Rascunho retomado');
    await page
      .getByRole('button', { name: 'Salvar rascunho', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'Rascunho salvo com sucesso',
    );
    expect(state.work?.id).toBe('own-work');
    expect(state.work?.title).toBe('Rascunho retomado');
  });

  test('limite de três imagens impede a quarta antes de enviá-la', async ({
    page,
  }) => {
    const state = await fixture(page);
    await page.goto('./#/novo-tcc');
    await page.getByLabel(/^Título \*/).waitFor();
    await page.getByLabel('Selecionar imagens de demonstração').setInputFiles(
      [1, 2, 3, 4].map((index) => ({
        name: `figura-${index}.png`,
        mimeType: 'image/png',
        buffer: png,
      })),
    );
    await expect(
      page.getByText('Você pode anexar até 3 imagens.', { exact: true }),
    ).toBeVisible();
    expect(state.uploads).toHaveLength(0);
    await page.getByLabel('Selecionar imagens de demonstração').setInputFiles(
      [1, 2, 3].map((index) => ({
        name: `figura-${index}.png`,
        mimeType: 'image/png',
        buffer: png,
      })),
    );
    await expect(page.getByText('3/3 imagens', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Adicionar imagens' }),
    ).toBeDisabled();
    expect(state.uploads).toHaveLength(3);
  });

  test('nova tag é associada à seleção e erro de rede mantém os dados para tentar de novo', async ({
    page,
  }) => {
    const state = await fixture(page);
    state.unavailable = true;
    await page.goto('./#/novo-tcc');
    await fillRequired(page);
    await page.getByLabel('Área temática').selectOption('computacao');
    await page.getByLabel('Nova tag').fill('Sistemas distribuídos');
    await page.getByRole('button', { name: 'Criar tag', exact: true }).click();
    await expect(
      page.getByRole('checkbox', { name: 'Sistemas distribuídos' }),
    ).toBeChecked();
    await page
      .getByRole('button', { name: 'Publicar TCC', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText(
      'Não foi possível salvar agora.',
    );
    await expect(page.getByLabel(/^Título \*/)).toHaveValue(
      'Detecção de anomalias em redes veiculares',
    );
    state.unavailable = false;
    await page
      .getByRole('button', { name: 'Publicar TCC', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'TCC publicado com sucesso!',
    );
    expect(state.requests.at(-1)?.tagIds).toContain('new-0');
    expect(state.requestKeys[1]).toBe(state.requestKeys[0]);
  });
});
