# Desenvolvimento

## Preparação

Requisitos: Node.js 24 e npm. Não exige Docker nem credenciais de nuvem para o M0 local.

Na raiz do checkout:

```sh
npm ci
npm run db:migrate
npm run dev
```

Opcionalmente copie `.env.example` para `.env` e ajuste as variáveis. A ausência de `.env` usa os valores locais padrão. A migração precisa ser executada antes da primeira inicialização da API e após novas migrações.

- Site: `http://127.0.0.1:5173/Subtccstack/`.
- Sobre e status de integração: `http://127.0.0.1:5173/Subtccstack/#/sobre`.
- API: `http://127.0.0.1:3001/api/health`.
- O Vite encaminha `/api` ao backend local; o navegador não recebe conexão de banco.

`npm run dev` inicia ambos os processos e termina o conjunto se algum falhar. Use Ctrl+C para encerrá-los. Depois que a API estiver parada, é seguro executar migrações/provas no mesmo diretório do PGlite. Uma instância PGlite deve possuir seu diretório exclusivamente: não executar `db:verify` enquanto a API usar esse banco.

## Comandos

| Comando                               | Finalidade                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev:web` / `npm run dev:api` | Iniciar cada processo separadamente.                                                 |
| `npm run db:migrate`                  | Aplicar migrações SQL pendentes.                                                     |
| `npm run db:verify`                   | Gravar uma prova, fechar a conexão, reabrir, ler e remover a prova; recusa produção. |
| `npm run lint` / `npm run format`     | Conferir ou aplicar ESLint/Prettier.                                                 |
| `npm run typecheck`                   | Verificar frontend, backend, configurações e testes.                                 |
| `npm test`                            | Testes de API, configuração, persistência e migrações.                               |
| `npm run build` / `npm run build:api` | Gerar `dist/` estático e `build/` da API, respectivamente.                           |
| `npm run preview`                     | Servir somente o frontend compilado na porta 4173.                                   |
| `npm run check:pages`                 | Conferir prefixo e conteúdo publicável do artefato.                                  |
| `npm run test:e2e`                    | Testar o build em Chromium desktop e celular.                                        |
| `npm run check`                       | Executar a cadeia completa de verificações.                                          |

Antes do primeiro teste de navegador, execute `npx playwright install chromium`. Em Linux CI, o workflow instala também as dependências de sistema. Testes de banco usam diretórios temporários próprios, sem dados de usuário.

## Estrutura

```text
src/                     interface, configuração pública e cliente HTTP
server/controllers/      contratos HTTP
server/services/         orquestração da saúde da aplicação
server/repositories/     leitura dos metadados da plataforma
server/models/           contratos do backend
server/data/             adaptadores PostgreSQL/PGlite e executor de migrações
db/migrations/           SQL versionado
tests/e2e/               fluxos de navegador
scripts/                 verificações dos artefatos e da publicação
docs/                    decisões, rastreabilidade e execução
.github/workflows/       CI e deploy Pages
```

## Banco e migrações

Sem `DATABASE_URL`, desenvolvimento usa PGlite em `./data/development`, ignorado pelo Git. A migração `001_platform.sql` cria apenas metadados de plataforma. Tabelas de usuários/TCCs são parte do M1, não deste marco.

Migrações são ordenadas por nome e registradas com checksum, em transações. Reexecutar não duplica operações; alterar uma migração já aplicada falha explicitamente. Crie outro arquivo SQL para evoluir o esquema. A tabela de migrações é bloqueada durante aplicação para serializar executores; no provisionamento inicial, execute um único processo de migração.

`DATABASE_URL` seleciona o adaptador PostgreSQL (`pg`). Produção exige essa variável e `CORS_ORIGINS` explícita e não usa PGlite como fallback. Use a conexão TLS fornecida pelo provedor, sem imprimir a URL ou versioná-la. A compatibilidade do SQL com PostgreSQL é prevista, mas a conexão real ao Neon não foi provisionada neste marco.

## API de M0

`GET /api/health` lê o metadado criado pela migração. Quando pronto:

```json
{
  "status": "ok",
  "service": "subtccstack-api",
  "database": "ok",
  "environment": "development"
}
```

Banco inacessível ou não migrado resulta em HTTP 503 e estados `unavailable`, sem detalhes internos. A resposta não deve ser cacheada. M0 não oferece endpoint público de escrita; a prova de persistência ocorre por comando/teste controlado. CORS aceita somente as origens configuradas e não representa autenticação.

`VITE_API_URL` é a URL pública base terminando em `/api`, sem credenciais. Em desenvolvimento, deixar vazia usa o proxy local. No build de produção, deixá-la vazia apresenta ausência de integração na página Sobre; não simula uma API online.

## Backend externo preparado, sem provisionamento

O `Dockerfile` compila e inicia a API como usuário sem privilégios, aplica migrações e usa a porta de `PORT`. `render.yaml` descreve o destino escolhido no Render com deploy automático desativado; não cria serviços sozinho.

Para ativar futuramente: provisionar PostgreSQL no Neon, criar o serviço Render a partir deste repositório, fornecer `DATABASE_URL` apenas ao backend e manter `CORS_ORIGINS=https://vitorsfeijo.github.io`. Validar `/api/health` e definir `VITE_API_URL=https://<host-real>/api` nas variáveis públicas do Actions, seguido de novo deploy do frontend. Não há credenciais desses provedores configuradas nesta entrega; não se presume gratuidade. R2 e autenticação são integrações futuras.

Referências: [PGlite em Node e persistência](https://pglite.dev/docs/), [Render Blueprint](https://render.com/docs/blueprint-spec) e [deploy estático do Vite](https://vite.dev/guide/static-deploy).
