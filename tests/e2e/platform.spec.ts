import { expect, test } from '@playwright/test';

const configuredApiUrl = process.env.VITE_API_URL?.trim().replace(/\/+$/, '');

test.beforeEach(async ({ page }) => {
  if (!configuredApiUrl) return;

  // Build checks must not depend on or send requests to the deployed backend.
  const healthUrl = new URL(
    `${configuredApiUrl}/health`,
    'http://127.0.0.1:4173',
  ).href;
  await page.route(healthUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        status: 'ok',
        service: 'subtccstack-api',
        database: 'ok',
        environment: 'production',
      }),
    }),
  );
});

test('a página inicial carrega no prefixo do Pages sem erros ou recursos ausentes', async ({
  page,
}) => {
  const browserErrors: string[] = [];
  const missingResources: string[] = [];

  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('response', (response) => {
    if (
      response.url().startsWith('http://127.0.0.1:4173/') &&
      response.status() >= 400
    ) {
      missingResources.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto('./');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /Tornar conhecimento visível/,
    }),
  ).toBeVisible();
  await expect(page).toHaveTitle('Subtccstack — Conhecimento que circula');
  await expect(
    page.getByRole('img', {
      name: /Ilustração conceitual de um TCC conectando/,
    }),
  ).toBeVisible();
  await page.waitForLoadState('networkidle');

  expect(browserErrors).toEqual([]);
  expect(missingResources).toEqual([]);
});

test('a navegação por hash abre a proposta e permite voltar ao início', async ({
  page,
}) => {
  await page.goto('./');
  await page
    .getByRole('navigation', { name: 'Navegação principal' })
    .getByRole('link', { name: 'Sobre o projeto' })
    .click();

  await expect(page).toHaveURL(/\/Subtccstack\/#\/sobre$/);
  await expect(
    page.getByRole('heading', { level: 1, name: /Uma pesquisa pode/ }),
  ).toBeVisible();
  await expect(page.locator('main')).toBeFocused();

  await page.getByRole('link', { name: 'Voltar ao início' }).click();
  await expect(page).toHaveURL(/\/Subtccstack\/#\/$/);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /Tornar conhecimento visível/,
    }),
  ).toBeVisible();
});

test('a abertura direta e o recarregamento de Sobre funcionam em hospedagem estática', async ({
  page,
}) => {
  await page.goto('./#/sobre');
  await expect(
    page.getByRole('heading', { name: 'A base para o que vem.' }),
  ).toBeVisible();
  await page.reload();

  await expect(page).toHaveURL(/\/Subtccstack\/#\/sobre$/);
  await expect(page).toHaveTitle('Sobre — Subtccstack');
  const unconfiguredMessage = page.getByText(
    'O site está disponível. A conexão com o serviço de dados ainda será configurada.',
    { exact: true },
  );
  const connectedMessage = page.getByText(
    'Serviço de dados conectado e banco acessível.',
    { exact: true },
  );
  if (configuredApiUrl) {
    await expect(connectedMessage).toBeVisible();
    await expect(unconfiguredMessage).toHaveCount(0);
  } else {
    await expect(unconfiguredMessage).toBeVisible();
    await expect(connectedMessage).toHaveCount(0);
  }
  await expect(
    page.getByText(/Esta página não recebe cadastros nem publica trabalhos/),
  ).toBeVisible();
});

test('o catálogo é alcançável e a navegação funciona pelo teclado', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Explorar o catálogo' }).click();
  await expect(
    page.getByRole('heading', { name: 'Estamos preparando o catálogo.' }),
  ).toBeInViewport();
  await expect(
    page.getByRole('link', { name: 'Conhecer o repositório LUME' }),
  ).toHaveAttribute('href', 'https://lume.ufrgs.br');

  const navigation = page.getByRole('navigation', {
    name: 'Navegação principal',
  });
  await navigation.getByRole('link', { name: 'Descobrir' }).focus();
  await page.keyboard.press('Tab');
  await expect(
    navigation.getByRole('link', { name: 'Sobre o projeto' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { level: 1, name: /Uma pesquisa pode/ }),
  ).toBeVisible();
});

test('as páginas permanecem dentro da largura da tela', async ({ page }) => {
  for (const route of ['./', './#/sobre']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  }
});
