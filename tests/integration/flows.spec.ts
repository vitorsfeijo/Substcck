import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strToU8, zipSync } from 'fflate';
import sharp from 'sharp';

const api = 'http://127.0.0.1:3002/api';
const origin = 'http://127.0.0.1:4174';
interface Work {
  id: string;
  title: string;
}
interface Fixtures {
  carlos: { id: string };
  tags: Record<string, { id: string }>;
  works: Record<string, Work>;
}
let fixture: Fixtures;
const noResults =
  'Nenhum trabalho encontrado para os critérios informados. Tente ajustar ou remover alguns filtros.';
const pdf = Buffer.from(
  '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
);

test.beforeEach(async ({ request, page }) => {
  const response = await request.post('http://127.0.0.1:3002/__test/reset');
  expect(response.ok()).toBe(true);
  fixture = await response.json();
  page.on('pageerror', (error) => {
    throw error;
  });
});

async function login(page: Page) {
  await page.goto('./#/entrar');
  await expect(
    page.getByText(
      'Simulação local de acesso. Não utiliza credenciais da UFRGS.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: /Aluno Autor \(simulação\)/ }).click();
  await expect(page).toHaveURL(/#\/perfil$/);
}

async function fill(page: Page) {
  await page
    .getByLabel(/^Título \*/)
    .fill('Detecção de anomalias em redes veiculares');
  await page
    .getByLabel(/^Resumo simplificado/)
    .fill(
      'Texto simplificado da pesquisa com redes veiculares, segurança e inteligência artificial.',
    );
  await page.getByLabel(/^Ano da defesa/).fill('2025');
  await page.getByLabel(/^Semestre/).selectOption('2');
  await page.getByLabel(/^Data de defesa/).fill('2025-10-15');
  await page.getByLabel(/^Orientador \*/).selectOption(fixture.carlos.id);
  await page
    .getByLabel(/^Link do LUME/)
    .fill('https://lume.ufrgs.br/handle/10183/qa-valid');
  for (const name of ['Redes', 'IA', 'Segurança'])
    await page.getByRole('checkbox', { name, exact: true }).check();
}

test('CT01 publica com dois PNGs e PDF reais, persiste, aparece no feed e permite baixar como visitante', async ({
  page,
  browser,
}, info) => {
  await login(page);
  await page
    .getByRole('link', { name: 'Cadastrar Novo TCC', exact: true })
    .first()
    .click();
  await fill(page);
  const png = await sharp({
    create: { width: 12, height: 12, channels: 3, background: '#bf3024' },
  })
    .png()
    .toBuffer();
  await page.getByLabel('Selecionar imagens de demonstração').setInputFiles([
    { name: 'diagrama-1.png', mimeType: 'image/png', buffer: png },
    { name: 'diagrama-2.png', mimeType: 'image/png', buffer: png },
  ]);
  await expect(page.getByText('2/3 imagens', { exact: true })).toBeVisible();
  await page.getByLabel('Descrição da imagem 1').fill('Diagrama da proposta');
  await page.getByLabel('Selecionar arquivo do trabalho').setInputFiles({
    name: 'pesquisa.pdf',
    mimeType: 'application/pdf',
    buffer: pdf,
  });
  await expect(page.getByText('pesquisa.pdf', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Publicar TCC', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(
    'TCC publicado com sucesso!',
  );
  const workId = (
    await page.getByRole('link', { name: /Ler publica/ }).getAttribute('href')
  )?.split('/tcc/')[1];
  expect(workId).toBeTruthy();
  const publicContext = await browser.newContext();
  try {
    const response = await publicContext.request.get(api + '/tccs/' + workId);
    expect(response.status()).toBe(200);
    const work = await response.json();
    expect(work).toMatchObject({ status: 'PUBLICADO', coadvisor: null });
    expect(work.media).toHaveLength(2);
    expect(work.tags).toHaveLength(3);
    const feed = await publicContext.request.get(api + '/feed');
    expect(JSON.stringify(await feed.json())).toContain(workId);
    const tagSearch = await publicContext.request.get(
      api + '/tccs?tagIds=' + fixture.tags.redes.id,
    );
    expect(JSON.stringify(await tagSearch.json())).toContain(workId);
    const reader = await publicContext.newPage();
    await reader.setViewportSize(page.viewportSize()!);
    await reader.goto(origin + '/Substcck/#/tcc/' + workId);
    await expect(
      reader.getByRole('heading', { level: 1, name: work.title }),
    ).toBeVisible();
    await expect(
      reader.getByRole('img', { name: 'Diagrama da proposta', exact: true }),
    ).toBeVisible();
    const downloadEvent = reader.waitForEvent('download');
    await reader
      .getByRole('button', { name: 'Baixar Artigo', exact: true })
      .click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe('pesquisa.pdf');
    expect(await readFile((await download.path())!)).toEqual(pdf);
    expect(
      await reader.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await reader.screenshot({
      path: info.outputPath('ct01-reading.png'),
      fullPage: true,
    });
  } finally {
    await publicContext.close();
  }
  await page.goto('./#/editar-tcc/' + workId);
  await page.reload();
  await expect(page.getByLabel(/^Título \*/)).toHaveValue(
    'Detecção de anomalias em redes veiculares',
  );
  await expect(page.getByText('2/3 imagens', { exact: true })).toBeVisible();
});

test('CT02 recusa rascunho sem gravar e depois confirma dados e anexos privados', async ({
  page,
  browser,
}) => {
  await login(page);
  await page.goto('./#/novo-tcc');
  await fill(page);
  await page.getByLabel(/^Link do LUME/).fill('http://exemplo.com/tcc-123');
  await page.getByRole('button', { name: 'Publicar TCC', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Deseja salvar como rascunho',
  );
  await page
    .getByRole('button', { name: 'Voltar ao formulário', exact: true })
    .click();
  await expect(page.getByLabel(/^Título \*/)).toHaveValue(
    'Detecção de anomalias em redes veiculares',
  );
  let own = (await (await page.request.get(api + '/me/tccs')).json()).items;
  expect(own).toHaveLength(5);
  await page.getByLabel('Selecionar arquivo do trabalho').setInputFiles({
    name: 'privado.pdf',
    mimeType: 'application/pdf',
    buffer: pdf,
  });
  await expect(page.getByText('privado.pdf', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Publicar TCC', exact: true }).click();
  await page
    .getByRole('button', { name: 'Salvar como rascunho', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Rascunho salvo com sucesso',
  );
  own = (await (await page.request.get(api + '/me/tccs')).json()).items;
  const draft = own.find(
    (work: Work) => work.title === 'Detecção de anomalias em redes veiculares',
  );
  expect(draft.status).toBe('RASCUNHO');
  expect(draft.lumeUrl).toBe('http://exemplo.com/tcc-123');
  const visitor = await browser.newContext();
  try {
    for (const path of [
      '/tccs/' + draft.id,
      '/tccs/' + draft.id + '/related',
      '/attachments/' + draft.file.id,
    ])
      expect((await visitor.request.get(api + path)).status()).toBe(404);
    for (const path of ['/feed', '/tccs', '/search?mode=semantic&term=redes'])
      expect(
        JSON.stringify(await (await visitor.request.get(api + path)).json()),
      ).not.toContain(draft.id);
  } finally {
    await visitor.close();
  }
  await page.goto('./#/editar-tcc/' + draft.id);
  await page.reload();
  await expect(page.getByLabel(/^Link do LUME/)).toHaveValue(
    'http://exemplo.com/tcc-123',
  );
});

test('CT03 aplica ano orientador e tag na API real, exclui B-E e recupera consulta sem resultado', async ({
  page,
}) => {
  await page.goto('./#/buscar');
  await page.getByLabel('Ano da defesa', { exact: true }).fill('2025');
  await page
    .getByLabel('Orientador', { exact: true })
    .selectOption(fixture.carlos.id);
  await page
    .getByRole('group', { name: 'Assuntos / tags' })
    .getByLabel('Redes', { exact: true })
    .check();
  const submitted = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/tccs' && url.searchParams.get('year') === '2025'
    );
  });
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  const result = await (await submitted).json();
  expect(result.items.map((work: Work) => work.id)).toEqual([
    fixture.works.A.id,
  ]);
  await expect(
    page.getByRole('link', { name: fixture.works.A.title, exact: true }),
  ).toBeVisible();
  for (const key of ['B', 'C', 'D', 'E'])
    await expect(
      page.getByRole('link', { name: fixture.works[key].title, exact: true }),
    ).toHaveCount(0);
  await page
    .getByRole('link', { name: fixture.works.A.title, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: fixture.works.A.title }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Voltar aos resultados/ }).click();
  await page.reload();
  await expect(page.getByLabel('Ano da defesa', { exact: true })).toHaveValue(
    '2025',
  );
  await page.getByLabel('Ano da defesa', { exact: true }).fill('2023');
  await page.getByRole('button', { name: 'Pesquisar', exact: true }).click();
  await expect(page.getByText(noResults, { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Limpar filtros', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: fixture.works.D.title, exact: true }),
  ).toBeVisible();
});

test('LUME indisponível mantém formulário e oferece rascunho na aplicação integrada', async ({
  page,
}) => {
  await login(page);
  await page.goto('./#/novo-tcc');
  await fill(page);
  await page
    .getByLabel(/^Link do LUME/)
    .fill('https://lume.ufrgs.br/unavailable');
  await page.getByRole('button', { name: 'Publicar TCC', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Deseja salvar como rascunho',
  );
  await page
    .getByRole('button', { name: 'Voltar ao formulário', exact: true })
    .click();
  await expect(page.getByLabel(/^Resumo simplificado/)).toHaveValue(
    'Texto simplificado da pesquisa com redes veiculares, segurança e inteligência artificial.',
  );
});

test('DOCX e EPUB atravessam upload armazenamento publicação e download sem alterar os bytes', async ({
  page,
}) => {
  const loginResult = await page.request.post(api + '/auth/development', {
    headers: { origin },
    data: { persona: 'author' },
  });
  expect(loginResult.status()).toBe(200);
  const { csrfToken } = await loginResult.json();
  const headers = { origin, 'x-csrf-token': csrfToken };
  const documents = [
    {
      extension: 'docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: Buffer.from(
        zipSync({
          '[Content_Types].xml': strToU8(
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
          ),
          'word/document.xml': strToU8(
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>',
          ),
        }),
      ),
    },
    {
      extension: 'epub',
      mime: 'application/epub+zip',
      body: Buffer.from(
        zipSync({
          mimetype: [strToU8('application/epub+zip'), { level: 0 }],
          'META-INF/container.xml': strToU8(
            '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/book.opf"/></rootfiles></container>',
          ),
          'EPUB/book.opf': strToU8(
            '<package xmlns="http://www.idpf.org/2007/opf"><manifest/><spine/></package>',
          ),
        }),
      ),
    },
  ];
  for (const document of documents) {
    const name = 'pesquisa.' + document.extension;
    const upload = await page.request.post(api + '/attachments?kind=document', {
      headers,
      multipart: {
        file: { name, mimeType: document.mime, buffer: document.body },
      },
    });
    expect(upload.status()).toBe(201);
    const file = await upload.json();
    const publication = await page.request.post(api + '/tccs', {
      headers,
      data: {
        intent: 'publish',
        title: 'Pesquisa em ' + document.extension,
        summary: 'Resumo público do documento de teste.',
        year: 2025,
        semester: 2,
        defendedAt: '2025-10-15',
        advisorId: fixture.carlos.id,
        lumeUrl: 'https://lume.ufrgs.br/qa-valid',
        tagIds: [fixture.tags.redes.id],
        fileId: file.id,
      },
    });
    expect(publication.status()).toBe(201);
    const { tcc } = await publication.json();
    await page.goto('./#/tcc/' + tcc.id);
    await expect(
      page.getByRole('heading', { level: 1, name: tcc.title }),
    ).toBeVisible();
    const event = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Baixar Artigo', exact: true })
      .click();
    const download = await event;
    expect(download.suggestedFilename()).toBe(name);
    expect(await readFile((await download.path())!)).toEqual(document.body);
  }
});
