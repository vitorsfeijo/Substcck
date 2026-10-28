# Desenvolvimento

## Preparação

Requisitos: Node.js 24 e npm. A execução local de M0/M1 não exige Docker nem credenciais de nuvem.

Na raiz do checkout:

```sh
npm ci
npm run db:migrate
npm run dev
```

Opcionalmente copie `.env.example` para `.env` e ajuste as variáveis. A ausência de `.env` usa os valores locais padrão. A migração precisa ser executada antes da primeira inicialização da API e após novas migrações.

- Site: `http://127.0.0.1:5173/Substcck/`.
- Sobre e status de integração: `http://127.0.0.1:5173/Substcck/#/sobre`.
- API: `http://127.0.0.1:3001/api/health`.
- O Vite encaminha `/api` ao backend local; o navegador não recebe conexão de banco.

`npm run dev` inicia ambos os processos e termina o conjunto se algum falhar. Use Ctrl+C para encerrá-los. Depois que a API estiver parada, é seguro executar migrações/provas no mesmo diretório do PGlite. Uma instância PGlite deve possuir seu diretório exclusivamente: não executar `db:verify` enquanto a API usar esse banco.

## Comandos

| Comando                               | Finalidade                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run dev:web` / `npm run dev:api` | Iniciar cada processo separadamente.                                                  |
| `npm run db:migrate`                  | Aplicar migrações SQL pendentes.                                                      |
| `npm run db:verify`                   | Gravar uma prova, fechar a conexão, reabrir, ler e remover a prova; recusa produção.  |
| `npm run db:seed`                     | Preparar dados fictícios A-E no banco local; recusa produção e `DATABASE_URL`.        |
| `npm run lint` / `npm run format`     | Conferir ou aplicar ESLint/Prettier.                                                  |
| `npm run typecheck`                   | Verificar frontend, backend, configurações e testes.                                  |
| `npm test`                            | Testes de API, configuração, persistência e migrações.                                |
| `npm run build` / `npm run build:api` | Gerar `.cache/build/web/` estático e `.cache/build/api/` da API, respectivamente.     |
| `npm run preview`                     | Servir somente o frontend compilado na porta 4173.                                    |
| `npm run check:pages`                 | Conferir prefixo e conteúdo publicável do artefato.                                   |
| `npm run test:e2e`                    | Testar o build em Chromium desktop e celular.                                         |
| `npm run test:e2e:auth`               | Gerar bundle isolado de teste e validar os fluxos de conta com respostas controladas. |
| `npm run check`                       | Executar a cadeia completa de verificações.                                           |

Antes do primeiro teste de navegador, execute `npx playwright install chromium`. Em Linux CI, o workflow instala também as dependências de sistema. Testes de banco usam diretórios temporários próprios, sem dados de usuário.

## Estrutura

```text
web/                     frontend: index.html, componentes, estilos e cliente HTTP
server/                  backend: controllers, serviços, repositórios e modelos
server/data/             adaptadores PostgreSQL/PGlite e executor de migrações
server/db/migrations/    SQL versionado
config/                  configurações de TypeScript, Vite, Vitest e Playwright
infra/                   Dockerfile e Blueprint do Render
tests/e2e/               fluxos de navegador
scripts/                 verificações dos artefatos e da publicação
docs/                    especificação, plano, decisões e guias
docs/references/         PDF original do desafio
docs/images/spec/        imagens e diagramas extraídos do PDF
.github/workflows/       CI e deploy Pages
.cache/                  builds, banco local e resultados de testes ignorados
```

Os comandos npm continuam sendo executados na raiz e as URLs locais e públicas permanecem iguais. `config/` agrupa as configurações explicitamente referenciadas pelos scripts; arquivos necessários à descoberta automática das ferramentas, como `eslint.config.js` e `.prettierrc.json`, permanecem na raiz.

## Banco e migrações

Sem `DATABASE_URL`, desenvolvimento usa PGlite em `./.cache/data/dev`, ignorado pelo Git. As migrações ficam em `server/db/migrations/`: `001_platform.sql` cria os metadados de plataforma, `002_identity.sql` cria usuários/sessões/tentativas de acesso e `003_tcc_domain.sql` cria o domínio de TCC e classificação.

Migrações são ordenadas por nome e registradas com checksum, em transações. Reexecutar não duplica operações; alterar uma migração já aplicada falha explicitamente. Crie outro arquivo SQL para evoluir o esquema. A tabela de migrações é bloqueada durante aplicação para serializar executores; no provisionamento inicial, execute um único processo de migração.

`DATABASE_URL` seleciona o adaptador PostgreSQL (`pg`). Produção exige essa variável e `CORS_ORIGINS` explícita e não usa PGlite como fallback. Use a conexão TLS fornecida pelo provedor, sem imprimir a URL ou versioná-la. A compatibilidade do SQL com PostgreSQL é prevista, mas a conexão real ao Neon não foi provisionada neste marco.

## API de saúde

`GET /api/health` lê o metadado criado pela migração. Quando pronto:

```json
{
  "status": "ok",
  "service": "subtccstack-api",
  "database": "ok",
  "environment": "development"
}
```

Banco inacessível ou não migrado resulta em HTTP 503 e estados `unavailable`, sem detalhes internos. A resposta não deve ser cacheada. A prova técnica de persistência ocorre por comando/teste controlado. CORS aceita somente as origens configuradas e não representa autenticação.

`VITE_API_URL` é a URL pública base terminando em `/api`, sem credenciais. Em desenvolvimento, deixar vazia usa o proxy local. No build de produção, deixá-la vazia apresenta ausência de integração na página Sobre; não simula uma API online.

## Autenticação de M1

O padrão é `AUTH_MODE=disabled`. Nesse modo, o site permite navegação pública e informa que o acesso institucional não está configurado. Não há formulário de senha UFRGS.

### Simulação local explícita

Com a API parada, copie `.env.example` para `.env` e mantenha as origens/endereço de desenvolvimento em loopback. Altere somente o modo de acesso para:

```dotenv
AUTH_MODE=development
```

Depois execute, na raiz:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Abra `http://127.0.0.1:5173/Substcck/#/entrar`. O aviso de simulação deve permanecer visível. Os perfis fixos são aluno autor, aluno pesquisador e professor. O aluno tem acesso à navegação de novo TCC; o professor consulta como leitor e não recebe a ação de cadastro. A tela de novo TCC ainda é uma base protegida para M2.

A carga `db:seed` é opcional para o login e serve para reproduzir dados A-E do CT03. Ela recusa produção e qualquer `DATABASE_URL`, inclusive de teste remoto. Não cria credenciais institucionais reais. Os trabalhos têm nomes/descrições de demonstração e URLs de exemplo; não se trata de uma importação de pesquisas reais.

O modo `development` é recusado em produção ou quando host, frontend, API e origens configuradas não forem exclusivamente locais. Não publique esse modo no backend externo.

### Provedor institucional real

O adaptador disponível usa OIDC. Antes de ativá-lo, confirme com a instituição o protocolo autorizado, os endpoints e as claims efetivamente disponíveis. Não se presume um provedor público OIDC da UFRGS.

Variáveis de servidor, com os nomes em `.env.example`:

| Variável                                | Finalidade                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------- |
| `AUTH_MODE=oidc`                        | Ativar o adaptador configurado.                                            |
| `FRONTEND_URL`                          | Endereço do frontend, incluindo o prefixo de projeto, sem query/fragmento. |
| `PUBLIC_API_URL`                        | Base pública da API terminando em `/api`, sem credenciais.                 |
| `OIDC_ISSUER`                           | Emissor HTTPS autorizado.                                                  |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | Credenciais do cliente, exclusivamente no servidor.                        |
| `OIDC_REDIRECT_URI`                     | URL exata `${PUBLIC_API_URL}/auth/callback`, registrada no provedor.       |
| `OIDC_ROLE_CLAIM`                       | Claim de papel explícito `student` ou `professor`; padrão `role`.          |
| `OIDC_ENROLLMENT_CLAIM`                 | Claim de matrícula verificada de aluno; padrão `enrollment`.               |
| `OIDC_DEPARTMENT_CLAIM`                 | Claim de departamento do professor; padrão `department`.                   |
| `OIDC_LOGIN_CLAIM`                      | Identificação institucional; padrão `preferred_username`.                  |
| `SESSION_TTL_SECONDS`                   | Duração de sessão entre 60 e 28.800 segundos; padrão 3.600.                |

O retorno do provedor precisa incluir identidade verificada e vínculos explícitos. Um domínio de e-mail não concede papel de aluno/professor. O callback valida a tentativa do navegador e retorna ao perfil no frontend configurado. Não utilizar variáveis `VITE_*` para segredos OIDC ou banco.

Em produção, a sessão é um cookie opaco `HttpOnly`, `Secure` e `SameSite=None`; o identificador correspondente é persistido por hash no servidor. As operações que alteram sessão exigem a origem permitida e o token CSRF apropriado. No navegador, o token CSRF fica em memória; credenciais de sessão não ficam em `localStorage`.

Quando Pages e API estiverem em sites diferentes, a política de cookies entre sites do navegador pode bloquear a sessão. A implantação precisa validar essa condição ou usar domínio próprio para colocar frontend/API no mesmo site. CORS deve permitir a origem exata do frontend e credenciais; não usar `*` como solução para a sessão.

### Rotas disponíveis e escopo

| Rota                                             | Comportamento em M1                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `GET /api/auth/config`                           | Modo de acesso e opções permitidas; não devolve segredos.                  |
| `GET /api/auth/session`                          | Usuário/CSRF da sessão atual, ou ausência de sessão.                       |
| `POST /api/auth/development`                     | Perfil fixo de simulação, somente no modo local explicitamente habilitado. |
| `GET /api/auth/login` / `GET /api/auth/callback` | Início e retorno do provedor OIDC, somente quando configurado.             |
| `POST /api/auth/logout`                          | Revogação da sessão com controle de origem/CSRF.                           |
| `GET /api/me`                                    | Perfil autenticado.                                                        |
| `GET /api/tccs` / `GET /api/tccs/:id`            | Base de consulta pública que exclui rascunhos.                             |
| `GET /api/me/tccs` / `GET /api/me/tccs/:id`      | Consulta privada de trabalhos do aluno autor autenticado.                  |

Não há endpoint HTTP de cadastro/publicação de TCC neste marco. O repositório oferece gravação interna controlada para testes, carga local e implementação de M2. Metadados de arquivos/mídias não representam uploads já implementados.

O comando `test:e2e:auth` usa um bundle separado em `.cache/build/auth-web` e respostas de API controladas. Esse bundle não substitui o artefato de produção em `.cache/build/web` e não é publicado no Pages. A prova de integração real UFRGS continua pendente, independentemente do resultado desses testes.

## Backend externo preparado, sem provisionamento

O `infra/Dockerfile` compila e inicia a API como usuário sem privilégios, aplica migrações de `server/db/migrations/` e usa a porta de `PORT`. Para gerar a imagem a partir da raiz, use `docker build -f infra/Dockerfile .`. `infra/render.yaml` descreve o destino escolhido no Render com deploy automático desativado; não cria serviços sozinho.

Ao criar o Blueprint no Render, selecione `infra/render.yaml` no campo **Blueprint Path**. Para um Blueprint existente, ajuste esse caminho em **Settings**. O caminho personalizado é configurado no Render; não há um segundo `render.yaml` na raiz para descoberta padrão. Esse fluxo é descrito na [documentação oficial de Blueprints](https://render.com/docs/infrastructure-as-code).

Para ativar futuramente: provisionar PostgreSQL no Neon, criar o serviço Render a partir deste repositório, fornecer `DATABASE_URL` apenas ao backend e manter `CORS_ORIGINS=https://vitorsfeijo.github.io`. Validar `/api/health` e definir `VITE_API_URL=https://<host-real>/api` nas variáveis públicas do Actions, seguido de novo deploy do frontend. O acesso real exige também a configuração OIDC descrita acima. Não há credenciais desses provedores configuradas nesta entrega; não se presume gratuidade. R2 e conexão institucional real continuam integrações pendentes.

O nome público e o destino do repositório passam a ser **Substcck**, com prefixo `/Substcck/`. Os identificadores técnicos existentes de API, cookies e emissor local são preservados para compatibilidade. O fechamento de M1 deve confirmar a renomeação no GitHub, o remoto Git e o deploy no novo endereço. Alterações futuras de domínio/prefixo exigem atualizar `VITE_BASE_PATH`, configurações de teste/Pages e URLs de retorno configuradas antes de uma nova publicação.

Referências: [PGlite em Node e persistência](https://pglite.dev/docs/), [Render Blueprint](https://render.com/docs/blueprint-spec) e [deploy estático do Vite](https://vite.dev/guide/static-deploy).
