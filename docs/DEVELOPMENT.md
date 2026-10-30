# Desenvolvimento

## Preparação

Requisitos: Node.js 24 e npm. A execução local de M0 a M4 não exige Docker nem credenciais de nuvem.

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

| Comando                               | Finalidade                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run dev:web` / `npm run dev:api` | Iniciar cada processo separadamente.                                                                        |
| `npm run db:migrate`                  | Aplicar migrações SQL pendentes.                                                                            |
| `npm run db:verify`                   | Gravar uma prova, fechar a conexão, reabrir, ler e remover a prova; recusa produção.                        |
| `npm run db:seed`                     | Preparar dados fictícios A-E no banco local; recusa produção e `DATABASE_URL`.                              |
| `npm run files:prune`                 | Remover uploads registrados sem referências e com mais de 24 horas; execução manual.                        |
| `npm run search:reindex`              | Reconstruir termos e hashes do índice público a partir dos TCCs publicados.                                 |
| `npm run search:evaluate`             | Executar o corpus versionado de avaliação da busca por significado, sem acesso à rede.                      |
| `npm run lint` / `npm run format`     | Conferir ou aplicar ESLint/Prettier.                                                                        |
| `npm run typecheck`                   | Verificar frontend, backend, configurações e testes.                                                        |
| `npm test`                            | Testes de API, configuração, persistência e migrações.                                                      |
| `npm run build` / `npm run build:api` | Gerar `.cache/build/web/` estático e `.cache/build/api/` da API, respectivamente.                           |
| `npm run preview`                     | Servir somente o frontend compilado na porta 4173.                                                          |
| `npm run check:pages`                 | Conferir prefixo e conteúdo publicável do artefato.                                                         |
| `npm run test:e2e`                    | Testar o build em Chromium desktop e celular.                                                               |
| `npm run test:e2e:auth`               | Gerar bundle isolado e validar conta, editor, descoberta, significado e conexões com respostas controladas. |
| `npm run check`                       | Executar a cadeia completa de verificações.                                                                 |

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
.cache/                  builds, banco local, uploads e resultados de testes ignorados
```

Os comandos npm continuam sendo executados na raiz e as URLs locais e públicas permanecem iguais. `config/` agrupa as configurações explicitamente referenciadas pelos scripts; arquivos necessários à descoberta automática das ferramentas, como `eslint.config.js` e `.prettierrc.json`, permanecem na raiz.

## Banco e migrações

Sem `DATABASE_URL`, desenvolvimento usa PGlite em `./.cache/data/dev`, ignorado pelo Git. As migrações ficam em `server/db/migrations/`: `001_platform.sql` cria os metadados de plataforma, `002_identity.sql` cria usuários/sessões/tentativas de acesso, `003_tcc_domain.sql` cria o domínio de TCC e classificação, `004_attachments.sql` registra os anexos, `005_publication_requests.sql` registra as requisições de criação idempotentes, `006_discovery_views.sql` cria eventos temporais de exploração e `007_semantic_documents.sql` persiste termos ponderados, hash, versão e referência temporal do índice público de significado.

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

Abra `http://127.0.0.1:5173/Substcck/#/entrar`. O aviso de simulação deve permanecer visível. Os perfis fixos são aluno autor, aluno pesquisador e professor. O aluno tem acesso ao cadastro em `#/novo-tcc` e à lista privada de trabalhos no perfil; o professor consulta como leitor e não recebe a ação de cadastro. A edição e a retomada usam `#/editar-tcc/:id`, com autoria novamente verificada no servidor.

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

## Cadastro, publicação e edição de M2

As operações de escrita exigem sessão de aluno, origem permitida e `X-CSRF-Token`. O servidor deriva a autoria da sessão; IDs e caminhos enviados livremente no cliente não concedem acesso a dados de outro usuário.

| Rota                                  | Comportamento                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /api/tcc-options`                | Professores, tags, áreas e coleções disponíveis para o formulário.                         |
| `POST /api/tags`                      | Criar/reutilizar tag com nome e área opcional, mediante autorização.                       |
| `POST /api/tccs`                      | Criar publicação ou rascunho privado conforme `intent: publish` ou `intent: draft`.        |
| `PUT /api/tccs/:id`                   | Editar trabalho próprio; publicação existente continua pública somente com revisão válida. |
| `POST /api/attachments?kind=image`    | Enviar uma imagem no campo multipart `file`.                                               |
| `POST /api/attachments?kind=document` | Enviar um documento no campo multipart `file`.                                             |
| `GET /api/attachments/:id`            | Ler anexo próprio ou vinculado a um TCC publicado; rascunhos continuam privados.           |
| `DELETE /api/attachments/:id`         | Remover envio próprio ainda sem vínculo; anexo em uso responde HTTP 409.                   |

O comando de TCC inclui título, resumo, ano/semestre/data de defesa, orientação/coorientação, link LUME, tags, coleção, IDs dos anexos e descrições de imagens. Não enviar `autorId`, caminhos de armazenamento ou um estado arbitrário para tentar substituir a autorização do servidor. Cada criação admite uma `Idempotency-Key` estável; repetir a mesma criação com os mesmos dados não duplica o trabalho. Reusar essa chave com dados diferentes responde HTTP 409. Edição usa PUT no identificador existente.

Publicação valida campos e consulta o LUME antes de gravar. O serviço aceita somente HTTPS no host exato `lume.ufrgs.br`, porta padrão, sem credenciais e até 2.048 caracteres; remove o fragmento. A checagem usa HEAD, com GET limitado se HEAD responder 405/501, até três redirecionamentos revalidados e prazo total de 5 segundos. O corpo de GET é cancelado, sem baixar o artigo inteiro. Domínio indevido, URL inválida, timeout e inacessibilidade impedem a publicação e oferecem rascunho quando permitido.

Salvar rascunho é uma ação explícita. Rascunhos e anexos privados podem ser retomados somente pelo autor. Uma edição inválida de PUBLICADO mantém a versão pública anterior e os valores editados no formulário; não despublica o trabalho nem sobrescreve parcialmente seus dados. As consultas SQL passam a refletir publicação/edição após o commit; não existe worker separado de indexação neste marco.

O formulário mantém o limite de cinco tags e três imagens; permite descrição e prévia das imagens e um documento opcional. No exemplo CT01, usar 2025/2 e uma data de defesa compatível, por exemplo 2025-10-15. URLs dos dados fictícios A-E não comprovam acessibilidade real no LUME; para exercitar a publicação manual, usar um registro oficial acessível.

### Armazenamento e formatos

Desenvolvimento/teste usa `STORAGE_DRIVER=local` e `UPLOAD_DIRECTORY=./.cache/uploads`. Esse diretório contém binários reais e precisa ser preservado junto com os metadados do banco local; não faz parte do Git, de `dist` ou do artefato do Pages. A API gera as chaves dos objetos e não usa nomes de upload como caminhos do sistema.

Imagens PNG, JPEG ou WebP têm limite de 5 MiB cada, até 16 milhões de pixels na decodificação e descrição de até 300 caracteres. O documento opcional único aceita PDF, DOCX ou EPUB de até 25 MiB. O servidor examina conteúdo/estrutura e não confia somente na extensão ou MIME informado. Pacotes ZIP são limitados a mil entradas, 25 MiB por entrada e 100 MiB expandidos; não são extraídos para disco, e entradas inseguras, repetidas ou corrompidas são rejeitadas.

Produção recusa `STORAGE_DRIVER=local`. Sem driver configurado, usa `unconfigured` e responde HTTP 503 a um upload autorizado, sem fingir armazenamento. Para habilitar S3/R2, configurar exclusivamente no servidor:

| Variável                                    | Finalidade                                               |
| ------------------------------------------- | -------------------------------------------------------- |
| `STORAGE_DRIVER=s3`                         | Selecionar o adaptador de objetos.                       |
| `S3_ENDPOINT`                               | Endpoint HTTPS sem credenciais, query ou fragmento.      |
| `S3_BUCKET`                                 | Bucket privado; não tornar listagem ou uploads públicos. |
| `S3_REGION`                                 | Região do provedor; padrão `auto`.                       |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Credenciais de acesso do servidor.                       |

O bucket é acessado pela API, que autoriza a leitura de cada anexo. Não incorporar credenciais S3/R2 em variáveis `VITE_*`. Provisionar o bucket e conferir sua política é uma ação externa ainda pendente.

### Falhas, remoção e uploads antigos

SQL e armazenamento de objetos não compartilham uma transação distribuída. O upload grava o objeto antes do registro; em falha SQL, tenta remover o objeto recém-gravado. A publicação resolve os anexos do autor e grava os vínculos na mesma transação SQL do TCC. Remover uma seleção do formulário não deve excluir um anexo ainda referenciado por um trabalho.

Com a API local parada, `npm run files:prune` remove registros/objetos de uploads sem referências e com mais de 24 horas. No contêiner de produção, o comando equivalente é `node build/server/scripts/prune-attachments.js`, com as mesmas variáveis de banco e armazenamento da API. A operação reconfirma idade e ausência de vínculo sob bloqueio de linha antes de remover, e não cria cron ou automação. Ela percorre metadados elegíveis e não inventaria arquivos/objetos que eventualmente ficaram sem registro após uma interrupção do processo. Anexos vinculados são preservados.

O comando `test:e2e:auth` usa um bundle separado em `.cache/build/auth-web` e respostas de API controladas para conta, editor, descoberta e M4 (`auth.spec.ts`, `editor.spec.ts`, `discovery.spec.ts` e `semantic.spec.ts`). Esse bundle não substitui o artefato de produção em `.cache/build/web` e não é publicado no Pages. As provas de conexão real UFRGS e provisionamento de backend/banco/bucket continuam pendentes, independentemente do resultado desses testes.

## Descoberta, leitura e busca de M3

O visitante não precisa entrar para consultar publicados. A página inicial contém recentes e tópicos em alta; `#/buscar` abre a pesquisa e `#/tcc/:id` abre a leitura. Os cards levam o parâmetro `from` para retornar ao início ou à consulta de busca preservada. O retorno aceita apenas essas rotas internas, sem redirecionar para endereço externo.

Com a API local parada, execute `npm run db:migrate` e, opcionalmente, `npm run db:seed`; depois inicie `npm run dev`. O conjunto fictício A-E permite reproduzir CT03. Ano 2025, orientador Carlos Lima e tag Redes retornam somente A; Ano 2023 e Redes retornam a mensagem de nenhum resultado. Os identificadores das opções são obtidos da API, sem depender de IDs fixos em produção. A carga não cria anexos binários para os trabalhos A-E: use o editor para enviar um documento de teste quando quiser exercitar download local.

### Contratos públicos

| Operação                     | Resultado                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET /api/feed`              | `{ recent, topics, windowDays: 30 }`, até oito recentes e oito tópicos com eventos válidos na janela.              |
| `GET /api/discovery-options` | Autores, orientadores, anos, tags, áreas e coleções referenciados por trabalhos publicados.                        |
| `GET /api/tccs`              | Página de resultados públicos, com `items`, `total`, `page` e `pageSize`.                                          |
| `GET /api/tccs/:id`          | Detalhe completo de publicado; ID de rascunho ou inexistente retorna 404.                                          |
| `POST /api/tccs/:id/views`   | Corpo `{}`; registra leitura e retorna `{ counted: boolean }`, exigindo origem permitida.                          |
| `GET /api/attachments/:id`   | Imagem ou documento público somente quando vinculado a publicado; continuam válidas as regras privadas de autoria. |

`GET /api/tccs` aceita `term`, `year`, `semester`, `dateFrom`, `dateTo`, `authorId`, `advisorId`, `tagIds`, `areaIds`, `collectionId`, `page` e `pageSize`. Datas usam `AAAA-MM-DD`; listas de IDs usam vírgula. O servidor combina dimensões diferentes por AND, exige todas as tags selecionadas e aceita qualquer uma das áreas selecionadas. Autor e orientador são critérios independentes. A consulta textual compara título, resumo e nomes de autor/orientador sem distinguir caixa e acentos. A ordenação é defesa decrescente, publicação decrescente e ID para desempate.

O formulário conserva os critérios na query de `#/buscar`; recarregar, voltar da leitura e mudar de página mantém a consulta. A interface usa 12 resultados por página por padrão; a API usa 20 quando não informado e aceita no máximo 100. Carregamento, vazio, erro recuperável e ausência de API configurada possuem estados próprios. A mensagem de consulta vazia é:

> Nenhum trabalho encontrado para os critérios informados. Tente ajustar ou remover alguns filtros.

### Documento e recuperação de falhas

Com anexo, **Baixar Artigo** busca o binário autorizado na API, confere resposta, formato/tamanho e usa o nome original sanitizado. Uma falha preserva a leitura e oferece nova tentativa com a mensagem:

> Ocorreu um erro durante o download, verifique a sua conexão com a internet e tente novamente.

Sem anexo, a página oferece **Abrir documento no LUME** para a referência HTTPS oficial. Isso é navegação externa, não um download realizado pela aplicação. Não há scraping nem URL de arquivo inventada. Imagens e documentos não são incorporados ao build do Pages.

### Eventos e tópicos em alta

O GET de detalhe fornece um cookie visitante de sessão antes do registro da leitura. Seu valor opaco não contém usuário ou matrícula; a tabela de deduplicação armazena apenas o hash por TCC e o instante da última leitura contada. Não há fingerprint por IP nem vínculo com o ID da conta. O cookie é `HttpOnly`, sem duração persistente explícita; em produção usa `Secure`, `SameSite=None` e prefixo `__Host-`, e localmente usa `SameSite=Lax`.

Repetições da mesma sessão/TCC dentro de 30 minutos não contam novamente. Deduplicação, evento UTC, snapshot das tags e contador total são gravados na mesma transação. O ranking soma eventos dos últimos 30 dias até o instante atual e exclui rascunhos; o contador total não substitui essa janela. Editar tags não altera o snapshot de eventos antigos. A leitura continua disponível mesmo quando o registro da métrica falha.

Se o navegador bloquear cookies entre Pages e API em sites distintos, não é possível garantir essa deduplicação entre requisições. Não se substitui o cookie por fingerprint ou identidade do usuário. Validar a política do navegador na implantação ou usar domínios que permitam a sessão conforme a arquitetura escolhida. Os tópicos refletem eventos sob essa política, não uma contagem de pessoas únicas.

O bundle isolado de `test:e2e:auth` cobre conta, editor e descoberta com respostas de API controladas, sem ser publicado no Pages. Os testes de repositório/API executam SQL real em PGlite com dados fictícios. Testes controlados de LUME ou armazenamento não comprovam seus provedores externos; a entrega deve registrar separadamente qualquer percurso integrado com API, banco e arquivos locais reais, sem interceptação HTTP.

## Trabalhos conexos e busca por significado de M4

As regras e a avaliação estão em [SEARCH_DESIGN.md](SEARCH_DESIGN.md). A leitura consulta `GET /api/tccs/:id/related`, com resposta `{ items: [{ tcc, sharedTags, sharedAreas, score }] }`. Somente publicados participam, a origem é excluída e um candidato precisa compartilhar ao menos uma tag ou área distinta. A pontuação é `4 × tags em comum + áreas distintas em comum`; até quatro resultados seguem pontuação, defesa e publicação decrescentes e ID como desempate. A interface mostra os temas em comum e permite abrir outra pesquisa. Lista vazia ou falha recuperável de conexões não impede a leitura nem o download.

### Modos de pesquisa e filtros

`Por texto` permanece padrão, usando `GET /api/tccs`. O seletor **Modo de busca** permite `Por significado`, serializado como `mode=semantic` na query de `#/buscar` e enviado a `GET /api/search?mode=semantic&term=...`. As demais dimensões, paginação, retorno da leitura e recarregamento conservam a consulta. Limpar filtros mantém o modo selecionado.

A operação semântica aceita os mesmos filtros e devolve `items`, `total`, `page`, `pageSize` e `search: { requestedMode, mode, fallbackReason, notice? }`. Ano, semestre, intervalo de defesa, autor, orientador, tags, áreas e coleção continuam restrições obrigatórias, aplicadas antes da paginação. O termo é projetado por significado, sem exigir presença literal no alvo. Resultados semânticos são ordenados por cosseno, depois defesa, publicação e ID; o limiar é 0,3.

Quando o índice/modelo está indisponível, o corpus é insuficiente, a consulta não possui vocabulário reconhecido ou o limite operacional é excedido, a API usa a busca textual com o termo e filtros originais, se ela estiver disponível. O modo efetivo é `text` e o aviso é explícito:

> A busca por significado está indisponível para esta consulta. Exibindo resultados por texto.

O aviso também aparece quando a alternativa textual não encontra resultados. Falha geral da API continua sendo tratada como erro com nova tentativa, sem perder os valores do formulário.

### Corpus, limites e avaliação

O mecanismo local usa TF-IDF e análise semântica latente por decomposição truncada. Título, resumo, tags, áreas e coleção formam a representação de publicados, com pesos 3, 1, 2, 1 e 1, respectivamente. Nomes de autores/orientadores não entram nesse vetor; continuam pesquisáveis no modo textual e nos filtros próprios. Não há dicionário de sinônimos manual, serviço externo, download de modelo, credencial de IA ou envio das consultas a terceiros.

O treinamento considera até 512 documentos e 10.000 termos, com até oito dimensões, 64 iterações por componente e orçamento de dois segundos verificado durante o cálculo. São necessários ao menos três documentos e duas dimensões efetivas, com rank observado de pelo menos três e redução estrita desse rank. A projeção precisa reter ao menos `1e-6` da energia original antes de normalizar: documentos sem sinal suficiente não são classificados e consultas sem representação suficiente usam a alternativa textual. Corpus degenerado ou representação inválida também leva à alternativa textual. Esses limites afetam o mecanismo semântico, não a quantidade de TCCs que a aplicação pode cadastrar. Não se trata de um modelo de linguagem previamente treinado: a qualidade depende das coocorrências, diversidade e vocabulário existentes no acervo.

`npm run search:evaluate` executa o corpus fictício versionado em `server/semantic/evaluation.ts`, com nove documentos em três grupos. Verifica `proteção privacidade` → Criptografia hospitalar, `automóveis` → Roteamento veicular e `colheita` → Irrigação agrícola. Cada alvo deve estar entre os três primeiros, esses três resultados devem pertencer ao grupo correto e o alvo não pode compartilhar tokens diretos com a consulta. A saída inclui resultados e tempo observado; o comando falha se um caso não atender aos critérios. O corpus é de avaliação e não é importado como acervo de produção. O conjunto sintético não substitui avaliação de relevância com usuários e documentos reais.

### Persistência e reconstrução

`007_semantic_documents.sql` cria a representação SQL pública. Publicação/edição e atualização dos termos/hash usam a mesma transação, incluindo os vínculos de classificação; uma falha conserva a publicação anterior e não grava um índice parcial. Rascunhos são retirados dessa representação e a exclusão de um TCC elimina sua referência. O serviço confere versão, estado público e referência temporal; o modelo em memória é reutilizado apenas se o fingerprint do corpus continuar igual. Não há reutilização silenciosa de um modelo antigo após mudança do corpus.

A inicialização prepara os registros faltantes ou desatualizados. Se essa preparação falhar, registra aviso e mantém a busca textual disponível; a busca por significado identifica a inconsistência e usa a alternativa explícita. Alterações SQL manuais fora dos serviços precisam de reconstrução.

Com a API local parada, execute `npm run search:reindex` para aplicar migrações e reconstruir termos/hashes de todos os publicados. O comando usa uma transação e bloqueio coordenado com publicação/edição, sem chamadas externas durante o bloqueio; um erro desfaz a reconstrução. O lote inicial aceita até 10.000 registros. No contêiner, use `node build/server/scripts/reindex-search.js`, com as mesmas variáveis de banco da API. Não abra dois processos no mesmo diretório PGlite; pare a API antes do comando local. A reconstrução da representação não remove os limites de treinamento descritos acima.

Sem `VITE_API_URL` de produção, os controles de consulta permanecem indisponíveis e a interface não simula resultados semânticos. O backend, banco, arquivos e acesso institucional ainda exigem o provisionamento já documentado; os testes locais ou com respostas controladas não comprovam essas conexões externas.

## Backend externo preparado, sem provisionamento

O `infra/Dockerfile` compila e inicia a API como usuário sem privilégios, aplica migrações de `server/db/migrations/` e usa a porta de `PORT`. Para gerar a imagem a partir da raiz, use `docker build -f infra/Dockerfile .`. `infra/render.yaml` descreve o destino escolhido no Render com deploy automático desativado; não cria serviços sozinho.

Ao criar o Blueprint no Render, selecione `infra/render.yaml` no campo **Blueprint Path**. Para um Blueprint existente, ajuste esse caminho em **Settings**. O caminho personalizado é configurado no Render; não há um segundo `render.yaml` na raiz para descoberta padrão. Esse fluxo é descrito na [documentação oficial de Blueprints](https://render.com/docs/infrastructure-as-code).

Para ativar futuramente: provisionar PostgreSQL no Neon, criar o serviço Render a partir deste repositório, fornecer `DATABASE_URL` apenas ao backend e manter `CORS_ORIGINS=https://vitorsfeijo.github.io`. Validar `/api/health` e definir `VITE_API_URL=https://<host-real>/api` nas variáveis públicas do Actions, seguido de novo deploy do frontend. O acesso real exige também a configuração OIDC descrita acima. Não há credenciais desses provedores configuradas nesta entrega; não se presume gratuidade. R2 e conexão institucional real continuam integrações pendentes.

O nome público e o destino do repositório passam a ser **Substcck**, com prefixo `/Substcck/`. Os identificadores técnicos existentes de API, cookies e emissor local são preservados para compatibilidade. O fechamento de M1 deve confirmar a renomeação no GitHub, o remoto Git e o deploy no novo endereço. Alterações futuras de domínio/prefixo exigem atualizar `VITE_BASE_PATH`, configurações de teste/Pages e URLs de retorno configuradas antes de uma nova publicação.

Referências: [PGlite em Node e persistência](https://pglite.dev/docs/), [Render Blueprint](https://render.com/docs/blueprint-spec) e [deploy estático do Vite](https://vite.dev/guide/static-deploy).
