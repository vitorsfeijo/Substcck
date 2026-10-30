import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const api = process.env.VITE_API_URL?.trim().replace(/\/+$/, '');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
const user = {
  id: 'quality-author',
  name: 'Aluno Autor',
  email: 'autor@example.test',
  institutionalLogin: 'autor',
  role: 'student',
  enrollment: '00001',
  department: null,
};

async function fixture(page: Page) {
  const state = { uploadCount: 0, failSecondUpload: false, invalidLume: false };
  if (!api) return state;
  await page.route(`${api}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = {
      'access-control-allow-origin':
        request.headers().origin || 'http://127.0.0.1:4173',
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
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
    if (request.method() === 'OPTIONS') return respond({});
    if (path.endsWith('/auth/config'))
      return respond({
        mode: 'development',
        loginUrl: null,
        developmentUsers: [{ id: 'author', name: user.name, role: user.role }],
      });
    if (path.endsWith('/auth/session'))
      return respond({ user, csrfToken: 'csrf-quality', mode: 'development' });
    if (path.endsWith('/feed'))
      return respond({ recent: [], topics: [], windowDays: 30 });
    if (path.endsWith('/tcc-options'))
      return respond({
        professors: [{ id: 'advisor', name: 'Professor Orientador' }],
        tags: Array.from({ length: 6 }, (_, index) => ({
          id: `tag-${index}`,
          name: `Tema ${index + 1}`,
          area: null,
        })),
        areas: [],
        collections: [],
      });
    if (path.endsWith('/attachments') && request.method() === 'POST') {
      state.uploadCount++;
      if (state.failSecondUpload && state.uploadCount === 2)
        return route.abort('connectionfailed');
      const originalName =
        /filename="([^"]+)"/.exec(
          request.postDataBuffer()?.toString('latin1') || '',
        )?.[1] || 'figura.png';
      return respond(
        {
          id: `upload-${state.uploadCount}`,
          kind: 'image',
          originalName,
          description: '',
          format: null,
          mimeType: 'image/png',
          size: 100,
          url: `/api/attachments/upload-${state.uploadCount}`,
        },
        201,
      );
    }
    if (
      path.endsWith('/tccs') &&
      request.method() === 'POST' &&
      state.invalidLume
    )
      return respond(
        {
          code: 'LUME_INVALID',
          message: 'LUME indisponível. Deseja salvar como rascunho?',
          canSaveDraft: true,
        },
        422,
      );
    return respond({}, 404);
  });
  return state;
}

async function fillRequired(page: Page) {
  await page
    .getByLabel(/^Título \*/)
    .fill('Pesquisa com revisão de acessibilidade');
  await page
    .getByLabel(/^Resumo simplificado/)
    .fill('Resumo preservado durante a recuperação.');
  await page.getByLabel(/^Ano da defesa/).fill('2025');
  await page.getByLabel(/^Semestre/).selectOption('2');
  await page.getByLabel(/^Data de defesa/).fill('2025-10-15');
  await page.getByLabel(/^Orientador \*/).selectOption('advisor');
  await page
    .getByLabel(/^Link do LUME/)
    .fill('https://lume.ufrgs.br/handle/10183/123');
  await page.getByRole('checkbox', { name: 'Tema 1', exact: true }).check();
}

test('atalhos de teclado levam o foco ao conteúdo e ao catálogo', async ({
  page,
}) => {
  await fixture(page);
  await page.goto('./');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Pular para o conteúdo' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.getByRole('button', { name: 'Explorar o catálogo' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#catalogo')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.locator('#catalogo').getByRole('link', { name: 'Buscar TCC' }),
  ).toBeFocused();
});

test('textos da página inicial mantêm contraste legível nos seus fundos', async ({
  page,
}) => {
  await fixture(page);
  await page.goto('./');
  const contrasts = await page.evaluate(() => {
    const luminance = (color: string) => {
      const channels = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((value) => {
          const normalized = value / 255;
          return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    return [
      ['.hero-description', 'html'],
      ['.research-map figcaption', '.research-map'],
      ['.hero-actions .button-primary', '.hero-actions .button-primary'],
      ['.site-footer p', '.site-footer'],
    ].map(([text, background]) => {
      const foreground = luminance(
        getComputedStyle(document.querySelector(text)!).color,
      );
      const behind = luminance(
        getComputedStyle(document.querySelector(background)!).backgroundColor,
      );
      return {
        text,
        ratio:
          (Math.max(foreground, behind) + 0.05) /
          (Math.min(foreground, behind) + 0.05),
      };
    });
  });
  for (const { text, ratio } of contrasts)
    expect(ratio, text).toBeGreaterThanOrEqual(4.5);
});

test.describe('revisão do editor com API configurada', () => {
  test.skip(!api, 'Requer o bundle isolado com API de fixtures.');

  test('erros são associados aos campos e o limite de tags funciona pelo teclado', async ({
    page,
  }, testInfo) => {
    await fixture(page);
    if (testInfo.project.name === 'mobile')
      await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('./#/novo-tcc');
    await page.getByLabel(/^Título \*/).fill('Título preservado');
    await page
      .getByRole('button', { name: 'Publicar TCC', exact: true })
      .click();
    await expect(page.locator('.editor-feedback')).toBeFocused();
    const summary = page.getByLabel(/^Resumo simplificado/);
    await expect(summary).toHaveAttribute('aria-invalid', 'true');
    await expect(summary).toHaveAccessibleDescription(
      'Informe o resumo simplificado.',
    );
    await summary.fill(
      'Resumo corrigido sem descartar o restante do formulário.',
    );
    await expect(summary).toHaveAttribute('aria-invalid', 'false');
    await expect(summary).toHaveAccessibleDescription('');
    await expect(page.getByLabel(/^Título \*/)).toHaveValue(
      'Título preservado',
    );
    await expect(
      page.getByRole('group', { name: /^Tags temáticas/ }),
    ).toHaveAccessibleDescription('Selecione ao menos uma tag.');
    for (let index = 1; index <= 5; index++) {
      const tag = page.getByRole('checkbox', {
        name: `Tema ${index}`,
        exact: true,
      });
      await tag.focus();
      await page.keyboard.press('Space');
      await expect(tag).toBeChecked();
    }
    await expect(
      page.getByRole('group', { name: /^Tags temáticas/ }),
    ).toHaveAttribute('aria-invalid', 'false');
    await expect(
      page.getByRole('checkbox', { name: 'Tema 6', exact: true }),
    ).toBeDisabled();
    const first = page.getByRole('checkbox', { name: 'Tema 1', exact: true });
    await first.focus();
    await page.keyboard.press('Space');
    await expect(
      page.getByRole('checkbox', { name: 'Tema 6', exact: true }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('editor-quality.png'),
      fullPage: true,
    });
  });

  test('envio interrompido mantém o primeiro anexo e permite recuperar o segundo', async ({
    page,
  }) => {
    const state = await fixture(page);
    state.failSecondUpload = true;
    await page.goto('./#/novo-tcc');
    await page.getByLabel(/^Título \*/).fill('Dados preservados durante envio');
    await page.getByLabel('Selecionar imagens de demonstração').setInputFiles([
      { name: 'primeira.png', mimeType: 'image/png', buffer: png },
      { name: 'segunda.png', mimeType: 'image/png', buffer: png },
    ]);
    await expect(page.getByRole('alert')).toContainText(
      'Os arquivos já enviados e seus dados continuam disponíveis',
    );
    await expect(page.locator('.editor-feedback')).toBeFocused();
    await expect(page.getByText('1/3 imagens', { exact: true })).toBeVisible();
    await expect(page.getByText('primeira.png', { exact: true })).toBeVisible();
    await expect(page.getByLabel(/^Título \*/)).toHaveValue(
      'Dados preservados durante envio',
    );
    await page.getByLabel('Selecionar imagens de demonstração').setInputFiles({
      name: 'segunda.png',
      mimeType: 'image/png',
      buffer: png,
    });
    await expect(page.getByText('2/3 imagens', { exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: 'Remover imagem 2', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Adicionar imagens', exact: true }),
    ).toBeFocused();
    await expect(page.getByText('1/3 imagens', { exact: true })).toBeVisible();
  });

  test('limite de imagens anuncia o erro e descreve o controle de envio', async ({
    page,
  }) => {
    const state = await fixture(page);
    await page.goto('./#/novo-tcc');
    await page.getByLabel(/^Título \*/).waitFor();
    await page.getByLabel('Selecionar imagens de demonstração').setInputFiles(
      [1, 2, 3, 4].map((index) => ({
        name: `${index}.png`,
        mimeType: 'image/png',
        buffer: png,
      })),
    );
    await expect(page.getByRole('alert')).toContainText(
      'Confira o limite de imagens',
    );
    await expect(page.locator('.editor-feedback')).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Adicionar imagens', exact: true }),
    ).toHaveAccessibleDescription('Você pode anexar até 3 imagens.');
    expect(state.uploadCount).toBe(0);
  });

  test('recusar rascunho devolve o foco ao link LUME preservando a pesquisa', async ({
    page,
  }) => {
    const state = await fixture(page);
    state.invalidLume = true;
    await page.goto('./#/novo-tcc');
    await fillRequired(page);
    await page
      .getByRole('button', { name: 'Publicar TCC', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('LUME indisponível');
    const back = page.getByRole('button', {
      name: 'Voltar ao formulário',
      exact: true,
    });
    await back.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel(/^Link do LUME/)).toBeFocused();
    await expect(page.getByLabel(/^Título \*/)).toHaveValue(
      'Pesquisa com revisão de acessibilidade',
    );
    await expect(
      page.getByRole('checkbox', { name: 'Tema 1', exact: true }),
    ).toBeChecked();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
