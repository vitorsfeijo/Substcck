# Publicação e CI/CD

## Estado e destino

O frontend gera arquivos estáticos para o GitHub Pages. M0-M4 têm publicações verificadas em [vitorsfeijo.github.io/Substcck](https://vitorsfeijo.github.io/Substcck/). A revisão de M5 está em [DELIVERY_M5.md](DELIVERY_M5.md); a integração completa continua pendente de serviços externos. A existência dos workflows, isoladamente, não comprova uma nova publicação.

API, banco, autenticação institucional e armazenamento são serviços externos ao Pages. Consulte [DECISIONS.md](DECISIONS.md). Sem a variável pública de API, o frontend continua acessível e informa a ausência de integração; não simula um banco compartilhado nem autenticação real.

## Validação local

Com Node.js 24 e npm, execute na raiz:

```sh
npm ci
npx playwright install chromium
npm run check
```

O build usa `/Substcck/` como caminho base padrão. `VITE_BASE_PATH` permite mudar o prefixo caso o nome do repositório ou domínio mude. Navegação em hash permite abrir/recarregar rotas sem depender de regras de reescrita de servidor.

## Habilitar no GitHub

1. Enviar a revisão validada à branch `main` do repositório.
2. Em **Settings → Pages → Build and deployment → Source**, selecionar **GitHub Actions**.
3. Confirmar que o repositório permite executar Actions e publicar no ambiente `github-pages`. Se o plano/visibilidade do repositório limitar Pages ou proteção de branches, resolver essa condição antes de considerar a entrega publicada.
4. Opcionalmente definir, em **Settings → Secrets and variables → Actions → Variables**, `VITE_API_URL`, por exemplo `https://api.exemplo.org/api`, após provisionar o backend. Esse valor é público e será incorporado ao frontend. Não cadastrar senhas, credenciais de banco ou tokens administrativos em variáveis `VITE_*`.
5. Acompanhar **Actions → Deploy Pages**. A execução deve validar, empacotar `.cache/build/web`, publicar e verificar HTML, JavaScript e CSS no endereço retornado pelo deploy.
6. Após confirmação, registrar no README a URL real e o link da execução verificada.

O backend deve aceitar a origem `https://vitorsfeijo.github.io`. Rotas de retorno de autenticação precisam corresponder ao endereço efetivo do frontend e ao adaptador institucional aprovado. Essas configurações são próprias do backend/provedor e não são criadas pelo deploy de Pages.

## Como os workflows se conectam

- `.github/workflows/ci.yml` valida pull requests e pushes em `main`, e pode ser chamado por outro workflow via `workflow_call`.
- O CI instala pelo lockfile e executa lint, tipos, testes, avaliação semântica, prova de persistência, builds e verificação do prefixo. No Chromium, confere o artefato de produção, a interface com respostas controladas e CT01-CT03 com API/banco/arquivos locais reais.
- `.github/workflows/deploy-pages.yml` é disparado por push em `main` ou execução manual nessa mesma branch. Chama o CI reutilizável da própria revisão, solicita seu artefato e só publica se todas as verificações passarem.
- O artefato contém somente `.cache/build/web`. Os arquivos de fonte, PDF, documentos internos, banco local e configurações privadas não são publicados. Configurações de build/teste ficam em `config/`; os comandos do CI continuam executados na raiz.
- Pull requests não publicam e não recebem segredos de produção. O job de validação tem apenas leitura do repositório; permissões `pages: write` e `id-token: write` ficam no job de deploy.
- O ambiente `github-pages` registra a URL. A verificação pós-deploy tem tempo limitado e falha se a página ou seus assets não estiverem disponíveis, ou se a API configurada divergir da incorporada no HTML. Com `VITE_API_URL`, valida cinco GETs públicos reais, banco, CORS com credenciais e contratos; aceita acervo vazio. Ausência da variável registra `unconfigured`, e login desativado é explicitado. Isso não comprova autoria, OIDC ou S3 reais.
- Não há token pessoal incorporado ao cliente. As actions oficiais estão fixadas por revisão.

O CI direto de um push e o CI chamado pelo deploy podem aparecer como duas validações da mesma revisão. Essa duplicação mantém os checks independentes e evita que o deploy use um artefato de outra revisão.

Quando o recurso estiver disponível no repositório, configurar a proteção de `main` para exigir o check **Validate application** e revisão antes de merge. Conferir o nome efetivo do check na primeira execução; um check obrigatório inexistente pode impedir merges.

## Falha, reversão e serviços externos

- Falha antes do deploy preserva a versão anteriormente publicada.
- Falha no smoke check depois do deploy é visível na execução, mas não reverte automaticamente a publicação. Corrigir o problema ou reverter o commit e publicar novamente uma revisão que passe pelo CI.
- Para reverter, usar um commit de reversão na branch principal; o fluxo habitual valida e publica. Não reutilizar um artefato não verificado ou forçar atualização da branch.
- Um rollback do frontend não desfaz migrações nem dados do banco. Mudanças futuras devem manter compatibilidade entre versões ou ter procedimento próprio de recuperação.
- Provisionamento e deploy de API/banco/arquivos são separados. Credenciais desses serviços permanecem no ambiente de backend, não neste workflow do frontend.
- O backend preparado usa `infra/Dockerfile` e `infra/render.yaml`. Ao criar ou ajustar o Blueprint no Render, selecionar `infra/render.yaml` em **Blueprint Path**; a descoberta padrão procuraria na raiz. Consulte [DEVELOPMENT.md](DEVELOPMENT.md) para execução Docker e configuração futura, sem presumir que o serviço Render já foi provisionado.

O roteiro de ambiente limpo, demonstração, provisionamento, backups, reconstrução e reversão está em [OPERATIONS.md](OPERATIONS.md). Uma revisão anterior de frontend/API só deve ser reimplantada após conferir compatibilidade com as migrações já aplicadas.

## Referências

- [GitHub Pages: workflows personalizados](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
- [Configurar origem de publicação](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
- [Vite: publicação no GitHub Pages](https://vite.dev/guide/static-deploy#github-pages).
