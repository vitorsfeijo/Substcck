# Operação, demonstração e recuperação

## Ambiente local

Requisitos: Node.js 24 e npm. Sem credenciais de nuvem, desenvolvimento usa PGlite no servidor e arquivos no disco. Não exige Render, Neon, R2 nem acesso institucional para a demonstração local.

Na raiz do checkout:

```sh
npm ci
npm run db:migrate
npm run dev
```

Abra [o site local](http://127.0.0.1:5173/Substcck/). A API está em `http://127.0.0.1:3001/api/health`. O Vite encaminha `/api`; não configure `VITE_API_URL` para iniciar os dois processos localmente.

Para testar como autor, copie `.env.example` para `.env`, mantenha host/URLs/origens locais e altere `AUTH_MODE=development`. Reinicie a API após mudar configuração. Em `#/entrar`, escolha **Aluno Autor (simulação)**. A tela identifica o acesso simulado; nunca use senhas UFRGS. O modo de desenvolvimento é recusado com endereços públicos ou ambiente de produção.

Com a API parada, `npm run db:seed` prepara os trabalhos fictícios A-E do CT03. Não apaga trabalhos existentes e não comprova acesso real aos links LUME de exemplo. O comando recusa banco remoto e produção. Para publicar manualmente, use um registro oficial acessível no LUME; se ele estiver indisponível, o formulário oferece salvar rascunho.

Banco: `.cache/data/dev/`. Arquivos: `.cache/uploads/`. Ambos precisam ser preservados juntos. Não execute migração, reconstrução ou prova de persistência com outro processo PGlite acessando o mesmo diretório. Para encerrar API e site, use Ctrl+C no terminal de `npm run dev`.

## Roteiros de demonstração

**Visitante:** abra o catálogo, consulte ano/orientador/tag, abra um resultado, confira imagens e resumo, explore conexões e volte à consulta. Sem arquivo anexado, a leitura oferece o registro do LUME. A busca por significado depende de relações suficientes no acervo e pode informar a alternativa textual.

**Autor local:** entre com o perfil simulado, cadastre título/resumo/período/data/orientador/link e de uma a cinco tags; anexe até três imagens e um PDF, DOCX ou EPUB opcional. Publique; revise o mesmo trabalho pelo perfil. Com link inválido, recuse a oferta para corrigir os dados ou confirme o rascunho; ele fica apenas na lista privada.

**Isolamento:** abra outro navegador/contexto como visitante ou aluno pesquisador. Publicações são compartilhadas; rascunhos e anexos privados de outro aluno não podem ser consultados ou editados, mesmo por ID.

## Regressão reproduzível

```sh
npx playwright install chromium
npm run check
```

A cadeia inclui lint, tipos, testes de servidor, avaliação semântica, migrações/persistência, builds, artefato Pages, navegador de produção, interface com respostas controladas e integração real local. Veja os totais e evidências da revisão em [DELIVERY_M5.md](DELIVERY_M5.md).

`npm run test:e2e:integrated` pode ser executado separadamente. Ele compila um bundle de teste separado, inicia Fastify em loopback na porta 3002, preview na 4174 e um banco/armazenamento novos em `.cache/qa/integration-*/`. Recusa reutilizar servidor existente, fixa as URLs do bundle e configura a API explicitamente, sem usar `DATABASE_URL` ou arquivos do acervo local. O banco é fechado e reaberto antes do percurso. O navegador não intercepta as requisições da aplicação.

Somente a resposta HTTP externa do LUME é controlada no harness de teste: a política de URL e toda a aplicação continuam reais. Identidades são os perfis locais explícitos. A rota de reset existe apenas em `tests/integration/server.ts`, fora da aplicação e imagem de produção; só altera a base alocada pelo runner. Testes rodam em um worker para evitar concorrência sobre essa base. O relatório fica em `.cache/integration-results/results.json`; imagens e traces usam o mesmo diretório. Os processos iniciados pelo Playwright são encerrados ao terminar.

A suíte cobre CT01-CT03, recusa/confirmação de rascunho, nenhum resultado, LUME indisponível, persistência compartilhada, privacidade, publicação com dois PNGs e os três formatos de documento com comparação dos bytes baixados. Esses resultados não atestam serviços institucionais ou de nuvem reais.

## Medição e limites

`npm run ops:measure` usa exclusivamente PGlite em memória, ignorando banco e credenciais de ambiente. Produz JSON no stdout, com volume do corpus, cinco amostras por consulta, treinamento frio e planos SQL `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`. Redirecione o stdout para um arquivo ignorado em `.cache/qa/` se quiser preservar a medição. Não é teste de carga nem SLA.

Na revisão M5, com 184 publicados e 21 rascunhos, foram observadas medianas de 13 a 78 ms para as sete operações e 279 ms para o primeiro cálculo semântico. Os planos e o porte observado não justificaram novos índices. São números locais, sem concorrência nem rede; medir novamente no PostgreSQL real antes de estabelecer metas.

Limites existentes: JSON 1 MiB; imagem 5 MiB e 16 milhões de pixels; documento 25 MiB; até mil entradas e 100 MiB expandidos por ZIP; LUME até cinco segundos e três redirecionamentos; S3 até dez segundos; PostgreSQL até cinco segundos para conexão e dez por instrução. Respostas a corpo inválido/excessivo/formato indevido são 400/413/415. Busca por significado tem limites próprios em [SEARCH_DESIGN.md](SEARCH_DESIGN.md). Verifique capacidade e backups conforme o acervo crescer.

## Provisionar produção

Os destinos definidos são Render para API, Neon/PostgreSQL para banco e bucket privado R2/S3 para arquivos. Sua existência, permissões, custos e acesso institucional precisam ser verificados na conta do responsável antes de registrar produção como integrada.

1. Crie o PostgreSQL e guarde a conexão TLS apenas no ambiente da API. Configure backups e retenção no provedor; ensaie restauração em outra base antes de depender do backup.
2. Crie o bucket privado e uma credencial do servidor limitada ao bucket necessário. Configure `STORAGE_DRIVER=s3`, endpoint HTTPS, bucket, região e as duas credenciais. Nenhum desses segredos pertence ao frontend.
3. No Render, use o Blueprint Path `infra/render.yaml`. O Blueprint declara o plano inicial e não foi aplicado automaticamente nesta entrega. Preencha as variáveis `sync: false`, incluindo a URL pública da API terminando em `/api`. O serviço roda como usuário sem privilégios, aplica migrações antes de iniciar e atende saúde em `/api/health`.
4. Configure `FRONTEND_URL=https://vitorsfeijo.github.io/Substcck/` e `CORS_ORIGINS=https://vitorsfeijo.github.io`. A origem não contém o caminho do repositório. O frontend usa credenciais; não substitua a origem por `*`.
5. Confirme com a UFRGS o provedor/protocolo e as claims autorizadas. Só ative `AUTH_MODE=oidc` com issuer, client ID/secret, claims e callback `${PUBLIC_API_URL}/auth/callback` corretamente cadastrados. O Blueprint começa com acesso desativado, sem aceitar perfis de demonstração em produção.
6. Valide HTTPS e cookies no navegador escolhido. Pages e API em sites diferentes podem sofrer bloqueio de cookies; um domínio próprio com frontend e API no mesmo site pode ser necessário.
7. Configure no GitHub Actions a variável pública `VITE_API_URL` com a base da API. Faça novo deploy validado; esse valor é incorporado ao build. Segredos de banco, OIDC e S3 ficam só no backend.
8. Confirme visitante e autor reais, escrita/edição, persistência entre contextos, privacidade e download. Saúde pública e respostas controladas não substituem essa validação.

O pós-deploy do Pages verifica HTML/JS/CSS e a URL de API incorporada ao HTML. Quando configurada, também consulta saúde, configuração de acesso, opções de descoberta, feed e uma página de trabalhos; valida CORS com credenciais, esquema e exclusão de rascunhos nas respostas. Aceita acervo vazio. Não autentica nem grava dados, e deixa explícito acesso institucional desativado. Ausência da variável informa `unconfigured`, sem declarar integração completa.

Para checar separadamente a API publicada, execute `npm run check:api` com `API_URL` e `FRONTEND_URL` no ambiente. O checker exige saúde em produção por padrão, limita tempo/tamanho e não segue redirecionamentos. No workflow, uma falha da API configurada faz o pós-deploy falhar; ela não desfaz automaticamente a publicação.

## Recuperação e reversão

Antes de migrar produção, preserve um backup consistente do PostgreSQL e os objetos referenciados. Registre revisão de código, migrações aplicadas e versão das configurações sem copiar segredos para o repositório. Migrações aplicadas têm checksum e não devem ser editadas: corrija com outra migração compatível.

Se um push falhar antes de publicar, o site anterior permanece. Se falhar após publicar, confira a etapa de pós-deploy e corrija a API/configuração ou reverta o código com `git revert <commit>`; faça push e acompanhe um novo CI/deploy bem-sucedido. Uma reversão de vários commits deve respeitar a ordem inversa de dependências. Não force a branch nem reutilize artefatos de outra revisão.

O rollback do frontend não desfaz migrações, metadados ou arquivos. Confirme compatibilidade antes de reimplantar uma revisão anterior da API. Migração incompatível pede correção progressiva ou restauração planejada de banco e objetos, com janela e ponto de recuperação conhecidos; evite reverter apenas metade do acervo.

Após recuperação, valide saúde, CORS, login real, leitura pública, rascunho privado e download, então registre revisão, URL e execução do workflow. `search:reindex` reconstrói representações derivadas; não substitui backup do acervo. `files:prune` remove órfãos antigos e não é ferramenta de rollback.

## Diretório local incompleto após mover o checkout

Na revisão M5, o banco existente não abria porque faltavam 14 pastas padrão vazias, com erro de pg_notify ausente. A causa da ausência não foi comprovada. A recuperação preservou um backup integral com manifesto SHA256, validou a criação das pastas numa cópia e só então aplicou o mesmo reparo ao original. As contagens das 18 tabelas e a prova de gravação/fechamento/reabertura foram preservadas.

Ao mover ou copiar `.cache/data/`, inclua também as pastas vazias. Se um banco existente não abrir, preserve uma cópia completa antes de investigar e use a mesma versão de PGlite/PostgreSQL na comparação. Recriar diretórios vazios só é adequado após comprovar esse diagnóstico na cópia; não reinicialize o banco nem substitua arquivos de dados para tentar eliminar o erro. A aplicação não faz esse reparo silenciosamente.
