import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const api = process.env.VITE_API_URL?.trim().replace(/\/+$/, '');

const student = {
  id: 'student-author',
  name: 'Aluno Autor',
  email: 'autor@example.test',
  institutionalLogin: 'aluno.autor',
  role: 'student',
  enrollment: '000001',
  department: null,
};
const professor = {
  id: 'professor',
  name: 'Professora Pesquisadora',
  email: 'professora@example.test',
  institutionalLogin: 'professora.pesquisadora',
  role: 'professor',
  enrollment: null,
  department: 'Informática',
};

async function mockAuth(
  page: Page,
  initialMode: 'development' | 'disabled' | 'oidc' = 'development',
) {
  const state = {
    user: null as typeof student | typeof professor | null,
    expired: false,
    unavailable: false,
    logoutCount: 0,
  };
  if (!api) return state;
  for (const [endpoint, body] of Object.entries({
    'tcc-options': {
      professors: [{ id: professor.id, name: professor.name }],
      tags: [{ id: 'redes', name: 'Redes', area: null }],
      areas: [],
      collections: [],
    },
    'me/tccs': { items: [], total: 0, page: 1, pageSize: 20 },
  })) {
    await page.route(`${api}/${endpoint}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': 'http://127.0.0.1:4173',
          'access-control-allow-credentials': 'true',
        },
        body: JSON.stringify(body),
      }),
    );
  }
  await page.route(`${api}/auth/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = {
      'access-control-allow-origin':
        request.headers().origin || 'http://127.0.0.1:4173',
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,x-csrf-token',
    };
    const respond = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        headers,
        contentType: 'application/json',
        body: JSON.stringify(value),
      });
    if (request.method() === 'OPTIONS') return respond({});
    if (state.unavailable) return respond({ error: 'unavailable' }, 503);
    const session = () => ({
      user: state.user,
      csrfToken: state.user ? 'fixture-csrf-token' : null,
      mode: initialMode,
    });
    if (path.endsWith('/auth/config')) {
      return respond({
        mode: initialMode,
        loginUrl: initialMode === 'oidc' ? `${api}/auth/login` : null,
        ...(initialMode === 'development'
          ? {
              developmentUsers: [
                { id: 'author', name: student.name, role: 'student' },
                { id: 'professor', name: professor.name, role: 'professor' },
              ],
            }
          : {}),
      });
    }
    if (path.endsWith('/auth/session')) {
      if (state.expired) {
        state.user = null;
        return respond({ error: 'expired' }, 401);
      }
      return respond(session());
    }
    if (path.endsWith('/auth/development')) {
      expect(request.method()).toBe('POST');
      const body = request.postDataJSON() as { persona: string };
      state.user = body.persona === 'professor' ? professor : student;
      return respond(session());
    }
    if (path.endsWith('/auth/logout')) {
      expect(request.method()).toBe('POST');
      expect(request.headers()['x-csrf-token']).toBe('fixture-csrf-token');
      ++state.logoutCount;
      state.user = null;
      return respond(session());
    }
    return respond({ error: 'unknown fixture route' }, 404);
  });
  return state;
}

test('acesso não configurado não oferece credenciais nem simulação', async ({
  page,
}) => {
  await mockAuth(page, 'disabled');
  await page.goto('./#/entrar');
  await expect(
    page.getByRole('heading', {
      name: 'A conexão com a universidade ainda não está disponível.',
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Nenhuma credencial da UFRGS é solicitada nesta página.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(
    page.getByText('Escolha um perfil de demonstração.'),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Continuar como visitante' }).click();
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: /Tornar conhecimento visível/,
    }),
  ).toBeVisible();
});

test.describe('acesso com API configurada', () => {
  test.skip(!api, 'Requer o build isolado de fixtures de autenticação.');

  test('aluno entra, acessa seu perfil e encerra a sessão com CSRF', async ({
    page,
  }) => {
    const state = await mockAuth(page);
    await page.goto('./#/entrar');
    await expect(page.getByRole('note')).toHaveText(
      'Simulação local de acesso. Não utiliza credenciais da UFRGS.',
    );
    await page.getByRole('button', { name: /Aluno Autor/ }).click();
    await expect(page).toHaveURL(/#\/perfil$/);
    await expect(
      page.getByRole('heading', { name: student.name, exact: true }),
    ).toBeVisible();
    await expect(page.getByText('000001', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Cadastrar Novo TCC/ }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: student.name, exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Sair da conta', exact: true })
      .click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page
        .getByRole('navigation')
        .getByRole('link', { name: 'Entrar', exact: true }),
    ).toBeVisible();
    expect(state.logoutCount).toBe(1);
  });

  test('visitante volta à ação protegida após escolher o perfil de aluno', async ({
    page,
  }) => {
    await mockAuth(page);
    await page.goto('./#/novo-tcc');
    await expect(page).toHaveURL(/#\/entrar\?next=%2Fnovo-tcc$/);
    await page.getByRole('button', { name: /Aluno Autor/ }).click();
    await expect(page).toHaveURL(/#\/novo-tcc$/);
    await expect(
      page.getByRole('form', { name: 'Cadastrar Novo TCC' }),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: /^Título \*/ }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Voltar ao perfil' }).click();
    await expect(
      page.getByRole('heading', { name: student.name, exact: true }),
    ).toBeVisible();
  });

  test('professor não recebe ação de cadastro e acesso direto é recusado', async ({
    page,
  }) => {
    await mockAuth(page);
    await page.goto('./#/entrar');
    await page.getByRole('button', { name: /Professora Pesquisadora/ }).click();
    await expect(
      page.getByRole('heading', { name: professor.name, exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Informática', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Cadastrar Novo TCC/ }),
    ).toHaveCount(0);
    await page.goto('./#/novo-tcc');
    await expect(
      page.getByRole('heading', {
        name: 'Este espaço é reservado ao aluno autor.',
      }),
    ).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);
  });

  test('sessão expirada remove acesso ao perfil e à ação protegida', async ({
    page,
  }) => {
    const state = await mockAuth(page);
    await page.goto('./#/entrar');
    await page.getByRole('button', { name: /Aluno Autor/ }).click();
    await expect(
      page.getByRole('heading', { name: student.name, exact: true }),
    ).toBeVisible();
    state.expired = true;
    await page.reload();
    await expect(page).toHaveURL(/#\/entrar\?next=\/perfil$/);
    await expect(
      page.getByRole('link', { name: /Cadastrar Novo TCC/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: student.name, exact: true }),
    ).toHaveCount(0);
  });

  test('retorno de login não aceita destino externo', async ({ page }) => {
    await mockAuth(page);
    await page.goto('./#/entrar?next=https%3A%2F%2Fexample.invalid');
    await page.getByRole('button', { name: /Aluno Autor/ }).click();
    await expect(page).toHaveURL(/\/Substcck\/#\/perfil$/);
  });

  test('falha de serviço oferece nova tentativa sem conceder acesso', async ({
    page,
  }) => {
    const state = await mockAuth(page);
    state.unavailable = true;
    await page.goto('./#/perfil');
    await expect(page.getByRole('alert')).toContainText(
      'Não foi possível verificar o acesso agora.',
    );
    await expect(
      page.getByRole('link', { name: /Cadastrar Novo TCC/ }),
    ).toHaveCount(0);
    state.unavailable = false;
    await page
      .getByRole('button', { name: 'Tentar novamente', exact: true })
      .click();
    await expect(page).toHaveURL(/#\/entrar\?next=\/perfil$/);
    await expect(
      page.getByRole('button', { name: /Aluno Autor/ }),
    ).toBeVisible();
  });

  test('acesso institucional encaminha ao backend e não pede senha no site', async ({
    page,
  }) => {
    await mockAuth(page, 'oidc');
    await page.goto('./#/entrar');
    await expect(
      page.getByRole('link', { name: /Entrar com acesso institucional/ }),
    ).toHaveAttribute('href', `${api}/auth/login`);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(
      page.getByText('Escolha um perfil de demonstração.'),
    ).toHaveCount(0);
  });
});
