# Entrega M1 - Autenticação e domínio persistente

**Estado:** T14-T22 implementadas e verificadas localmente. CI/CD e publicação da revisão estão em acompanhamento; a integração real com a UFRGS continua como dependência externa.

O aplicativo passa a se chamar **Substcck**. A entrega inclui a renomeação do repositório para `vitorsfeijo/Substcck`, a alteração do prefixo para `/Substcck/` e a [nova URL do Pages](https://vitorsfeijo.github.io/Substcck/). A mudança e o deploy precisam de confirmação antes do fechamento do marco. Identificadores técnicos existentes de serviço, cookies e emissor local são mantidos para compatibilidade.

## Escopo implementado

| Tarefa | Implementação                                                                                                                                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T14    | Usuários persistidos por emissor e identificador opaco do provedor, com vínculo de aluno/professor e matrícula/departamento. A identidade não é deduzida de um e-mail informado pelo cliente.                                                   |
| T15    | Sessões opacas persistidas por hash, expiração, rotação no login e revogação no logout. Adaptador OIDC configurável com PKCE, `state`, `nonce` e validação de assinatura/claims. Simulação local disponível somente por configuração explícita. |
| T16    | Autorização por sessão/papel, proteção CSRF e origem nas operações de sessão, consultas privadas limitadas ao autor e exclusão de rascunhos nas consultas públicas.                                                                             |
| T17    | Navegação de entrada/perfil/saída, identificação de aluno/professor, tratamento de sessão expirada e rota protegida de novo TCC. A rota de cadastro é somente a base da navegação para M2, sem formulário de publicação.                        |
| T18    | Migração do domínio de TCC, autoria, orientador/coorientador, período/data de defesa, link oficial, estado, visualizações e timestamps.                                                                                                         |
| T19    | Persistência de tags, áreas e coleções, com associações e filtros estruturados.                                                                                                                                                                 |
| T20    | Validação dos campos e limites de rascunho/publicação, relações de orientação, anexos e transições; operações internas de gravação são atômicas.                                                                                                |
| T21    | Repositórios de TCC e classificação com escopos públicos e privados separados. O detalhe público não revela um rascunho nem quando seu identificador é conhecido.                                                                               |
| T22    | DTOs com os metadados previstos, incluindo coorientador, mídias e arquivo opcional; carga explícita A-E para reproduzir o cenário CT03 no banco local de desenvolvimento/teste.                                                                 |

As migrações são `002_identity.sql` e `003_tcc_domain.sql`, em `server/db/migrations/`. Os caminhos de execução e configuração estão em [DEVELOPMENT.md](DEVELOPMENT.md).

## Validação local concluída

Em 27/10/2026, `npm run check` passou com 26 testes de backend, 12 verificações de navegador do bundle de produção e 16 testes de autenticação no bundle isolado. Os 14 cenários que exigem API configurada são intencionalmente ignorados no bundle sem API e executados na suíte isolada. Também passaram lint, Prettier, TypeScript, prova de persistência, builds e verificação do artefato Pages. A validação cobriu:

- Identidade estável por emissor/subject e preservação de identificadores opacos.
- OIDC com provedor controlado: assinatura, emissor, audiência, expiração, `state`, `nonce`, PKCE e callback vinculado à tentativa do navegador; rejeição de tentativa repetida.
- Sessão inválida/expirada, rotação, logout com CSRF, origem indevida e separação entre aluno e professor.
- Dados de TCC, limites, gravação atômica, autoria e leitura privada de rascunhos.
- Cenário A-E de filtros combinados e exclusão do trabalho E em rascunho na consulta pública.
- Fluxos de navegador em desktop/celular: acesso desabilitado, simulação local, perfil, logout, rota protegida e expiração da sessão.
- Lint, formatação, TypeScript, migrações, persistência, builds, artefato do Pages e CI/CD da revisão enviada.

Os testes com respostas controladas comprovam o comportamento do adaptador e da aplicação. Não comprovam acesso ao provedor institucional real nem disponibilidade do backend de produção.

## Limites concretos

- O provedor institucional da UFRGS ainda não foi configurado. É necessário obter o protocolo efetivamente autorizado, endpoints, credenciais e claims de vínculo. O aplicativo não solicita nem valida senhas da UFRGS diretamente.
- `AUTH_MODE=disabled` é o padrão. Sem API de produção configurada, o Pages apresenta a ausência de integração; o modo local de simulação não é publicado como acesso institucional real.
- O modo `development` aceita somente perfis fixos identificados como simulação e exige ambiente não produtivo e configuração de acesso local. Não é permitido habilitá-lo em produção.
- Backend Render, PostgreSQL Neon e armazenamento externo ainda exigem provisionamento e credenciais próprios. PGlite local não representa persistência compartilhada de produção.
- Sessões de produção usam cookie `HttpOnly`, `Secure` e `SameSite=None`. Com frontend no Pages e API em outro site, o navegador precisa aceitar esse cookie entre sites. Para ambientes que o bloqueiem, será necessária uma topologia de frontend/API no mesmo site, por exemplo com domínios próprios; essa configuração ainda não foi implantada.
- Cadastro/publicação HTTP, validação remota do LUME e uploads continuam em M2. A persistência de metadados de mídia/arquivo não significa que os binários já estejam armazenados ou disponíveis para download.
- Feed, leitura e busca completos na interface permanecem em M3. Os dados A-E são fictícios, criados somente por comando local explícito e não representam pesquisas publicadas.

## Verificação integrada local

O navegador também foi exercitado com a API Fastify e o banco PGlite reais do ambiente local, sem interceptar as respostas: login do aluno, recarregamento mantendo sessão, cinco TCCs de demonstração no escopo do autor, rascunho inacessível pela rota pública, cookie HttpOnly, logout revogando a sessão no servidor e restrição de cadastro para professor. A interface foi inspecionada em desktop e celular.

## Commits por responsabilidade

- `dfb7095`: identidade persistente e adaptador OIDC.
- `aa1c979`: preservação do identificador opaco do provedor.
- `a845cc3`: domínio, classificações, persistência e dados de demonstração.
- `51d3aa6`: sessões, CSRF, privacidade e autorização por autoria.
- `882a209`: interface de acesso, perfil e marca Substcck.
- `dcaf562`: testes de autenticação, CI e prefixo do Pages renomeado.

## Evidência remota

A confirmação da revisão enviada, das execuções de CI/deploy e da URL pública será registrada após a conclusão do pipeline. A integração institucional real não é atestada por testes com provedor controlado.
