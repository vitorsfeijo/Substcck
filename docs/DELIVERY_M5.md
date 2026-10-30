# Revisão M5 - Qualidade e preparação da entrega integrada

**Estado em 30/10/2026:** T53-T59 concluídas e verificadas localmente. **M5 parcialmente entregue:** T60 permanece aberta até provisionar/configurar os serviços externos e verificar os fluxos reais em produção. M0-M4 permanecem concluídos. O frontend pode ser publicado sem que a integração completa esteja concluída.

## Revisão da experiência - T53/T54

A revisão corrigiu o foco ao saltar para o catálogo, receber erro/sucesso no editor, recusar a oferta de rascunho do LUME e remover anexos. As mensagens de upload estão associadas aos controles; corrigir um campo ou selecionar tags limpa o erro obsoleto correspondente. O foco é aplicado após a renderização do React: a regressão encontrou uma corrida com requestAnimationFrame, e oito repetições da correção passaram sem retry.

Foram corrigidos os contrastes da legenda do mapa e do texto sobre fundos de prévia. Os pares verificados ficaram acima de 4,5:1: texto principal/papel 13,70, secundário/papel 5,46, legenda/fundo do mapa 5,04, secundário/prévia 4,76 e texto claro/botão vermelho 5,99. São critérios concretos adotados para a revisão, sem atribuí-los ao PDF ou afirmar certificação formal de acessibilidade.

Seis cenários de qualidade são executados em desktop e celular. Conferem teclado, foco, rótulos, contraste e recuperação de upload/LUME sem perder os valores do formulário. Capturas de leitura CT01 e revisão móvel a 360 px foram inspecionadas; não houve overflow observado.

Os estados de feed vazio/erro, pesquisa sem resultados, download com falha/nova tentativa, conexão vazia/erro e alternativa textual semântica permanecem cobertos pelas regressões anteriores. O upload interrompido mantém o conteúdo editado e permite nova seleção.

## Acesso e operação - T55/T56

A matriz HTTP inclui visitante, aluno autor, outro aluno e professor. Verifica escrita direta, origem/CSRF, autoria e privacidade por ID conhecido. O rascunho e seus anexos ficam fora do detalhe público, feed, opções de descoberta, texto, significado, conexões, download e eventos de leitura; o autor pode retomá-los pela operação privada. Respostas privadas mantêm no-store.

O handler global passou a preservar 400 para JSON inválido, 413 para corpo excessivo e 415 para formato de requisição não suportado. Essas falhas retornavam erro interno genérico apesar dos limites corretos. As mensagens permanecem seguras e têm regressões próprias.

`npm run ops:measure` cria exclusivamente uma base em memória com 184 publicados e 21 rascunhos, confere 184 representações públicas, mede cinco amostras por operação e emite planos `EXPLAIN ANALYZE BUFFERS`. Na execução local observada:

| Operação              | Mediana  |
| --------------------- | -------- |
| Recentes              | 21,17 ms |
| Filtros combinados    | 46,41 ms |
| Busca textual         | 33,09 ms |
| Segunda página        | 15,90 ms |
| Feed                  | 13,31 ms |
| Conexões              | 56,87 ms |
| Significado com cache | 77,54 ms |

O primeiro cálculo semântico levou 279,16 ms e usou efetivamente o modo semântico. Os planos e esse porte não justificaram índices adicionais. Esses valores não incluem rede, concorrência ou infraestrutura de produção e não definem SLA. Os limites de consulta, upload e timeout estão em [OPERATIONS.md](OPERATIONS.md) e [SEARCH_DESIGN.md](SEARCH_DESIGN.md).

A revisão também atualizou Vitest e suas dependências para 4.1.12, corrigindo os avisos de desenvolvimento [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) e [GHSA-xp26-3454-mjgp](https://github.com/advisories/GHSA-xp26-3454-mjgp). Após a atualização, npm audit informou zero vulnerabilidades no conjunto instalado. Isso registra a execução observada, sem prometer ausência de falhas futuras.

## Regressão integrada - T57/T58

`npm run test:e2e:integrated` compila um bundle separado e inicia Fastify, PGlite em diretório persistente e armazenamento de arquivos reais. Executa os mesmos percursos em Chromium desktop/celular, sem interceptar as requisições da aplicação. O banco é fechado e reaberto antes do percurso para conferir migrações e fixtures persistidas.

Somente a resposta HTTP externa do LUME é controlada no harness; normalização/validação de URL, autorização, controllers, serviços, SQL e arquivos permanecem reais. O login é explicitamente local e simulado. A rota de reset só existe no harness fora da imagem de produção, com servidor em loopback e base nova, guardada por configuração de teste. Não toca no banco do desenvolvedor.

| Percurso          | Resultado verificado                                                                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CT01              | Título/resumo/período/orientador, coorientador vazio, Redes/IA/Segurança e dois PNGs; publicação aparece no feed e busca por tag; leitura e download PDF correto em outro contexto; retomada após reload.         |
| CT02              | Link fora do LUME oferece rascunho; recusar mantém dados e não grava TCC; confirmar preserva dados e documento; visitante não acessa rascunho/anexo por ID; autor retoma.                                         |
| CT03              | Dados A-E; ano 2025 + Carlos Lima + Redes retorna só A, excluindo B-D pelos filtros e E pela privacidade; leitura e retorno/reload preservam critérios; 2023 + Redes mostra a mensagem original e permite limpar. |
| LUME indisponível | Resposta externa 503 oferece rascunho; recusa conserva os campos.                                                                                                                                                 |
| DOCX/EPUB         | Upload, publicação, armazenamento e download pela leitura; nome e bytes baixados iguais aos enviados.                                                                                                             |

As regras complementares de obrigatórios, 5/6 tags, 3/4 imagens, tamanhos/conteúdo de arquivos, edição atômica/autoria, feed, download com erro, conexões e avaliação semântica permanecem na regressão completa. O caminho sem anexo oferece o registro LUME conforme D05.

Não se alega reinicialização da API após publicar: a publicação é conferida entre contextos e recarregamentos; a reabertura do banco neste harness valida as fixtures anteriores ao percurso. Testes específicos de persistência fazem gravação/fechamento/reabertura/leitura.

## Resultados locais

- Lint/Prettier, tipos frontend/backend/tools, compilação da API, build de produção e validação do artefato/base Pages aprovados.
- **107 testes de servidor aprovados**, em 15 arquivos, incluindo 17 verificações HTTP do checker de deploy e cinco testes com matrizes de acesso/erros.
- **20 execuções de navegador aprovadas** no artefato de produção; 64 cenários que exigem API de teste são omitidos nesse ambiente.
- **70 execuções aprovadas** na interface com respostas controladas; quatro cenários de ausência de API são omitidos nesse ambiente.
- **10 execuções integradas aprovadas**, cinco percursos em desktop/celular, sem retry.
- Total: **207 execuções aprovadas**, além de **3/3 casos** da avaliação semântica versionada.
- Inicialização por `npm run dev` conferida com o banco existente recuperado: frontend HTTP 200, API/banco/proxy com saúde ok e quatro trabalhos públicos preservados. Processos de conferência encerrados ao terminar.
- Medição de consultas e build Docker aprovados; prova de persistência também executada após a recuperação local descrita abaixo.

Uma execução inicial do novo harness detectou codificação incorreta dos seletores. Outra revelou suposições incorretas do teste sobre mudança automática de URL após salvar; a retomada foi ajustada para a rota suportada. As dez execuções acima correspondem à versão corrigida, preservando as verificações de dados, privacidade e download.

Os arquivos ignorados em `.cache/integration-results/`, `.cache/test-results/` e `.cache/qa/m5/` guardam relatórios, traces, imagens e medições locais. Não são publicados no Pages.

## Banco local e PostgreSQL real

O banco local existente apresentava falha de abertura: faltavam 14 diretórios padrão vazios do PostgreSQL, incluindo pg_notify. O log de diagnóstico identificou o diretório ausente. Foi criada uma cópia integral com manifesto SHA256 dos 1.063 arquivos; a correção foi primeiro validada na cópia, preservando o original.

Criar somente os diretórios faltantes permitiu ler e reabrir todas as 18 tabelas, com cinco TCCs, cinco usuários, três tags e sete migrações. O mesmo reparo foi aplicado ao original após conferir o backup; nenhum arquivo existente foi alterado antes da abertura. A falha era compatível com perda de pastas vazias na movimentação do checkout, sem afirmar como ocorreu. Não foi adicionada reparação automática silenciosa ao adaptador.

Uma prova adicional construiu a imagem Docker e iniciou a API com `NODE_ENV=production` e PostgreSQL 17 efêmero real, em rede isolada. Confirmou sete migrações, saúde e cinco endpoints públicos/CORS com acervo vazio, execução como UID 1000, Node como PID 1 e encerramento SIGTERM com exit 0. O banco não publicou porta no host; containers e redes criados para a prova foram removidos. A evidência está em `.cache/qa/m5/docker-result.json`.

Essa prova usou autenticação desativada e armazenamento não configurado, explicitamente registrados. Não comprova OIDC, Neon ou S3/R2 externos.

## Operação e publicação - T59/T60

[OPERATIONS.md](OPERATIONS.md) permite iniciar o ambiente limpo, demonstrar visitante/autor, configurar banco/arquivos/OIDC/CORS, medir consultas, reconstruir o índice e recuperar código/deploy. Backups de banco e objetos são separados da reversão do frontend; migrações aplicadas não são editadas ou desfeitas automaticamente.

O Blueprint Render explicita configurações pendentes e acesso institucional desativado. A API recebe SIGTERM diretamente pelo exec do processo Node. O build inclui metadado público da base da API; o pós-deploy compara esse valor com o workflow e, quando configurado, verifica cinco GETs públicos reais, CORS e contratos com tempo/tamanho limitados. Acervo vazio é válido; API ausente resulta em estado explícito unconfigured.

O [workflow CI](https://github.com/vitorsfeijo/Substcck/actions/workflows/ci.yml) inclui a regressão integrada, mantendo o artefato público separado dos bundles de teste. O [workflow Pages](https://github.com/vitorsfeijo/Substcck/actions/workflows/deploy-pages.yml) publica a mesma revisão validada e executa o checker ampliado no [site](https://vitorsfeijo.github.io/Substcck/). Os commits são separados por acesso, medição, ferramentas, acessibilidade, pós-deploy, infraestrutura, integração e documentação.

**T60 continua pendente:** o GitHub não tinha `VITE_API_URL` configurada nesta revisão, e não foram disponibilizados serviços de backend/banco/bucket ou provedor institucional. Falta configurar esses serviços e verificar visitante/autor reais, persistência entre sessões/usuários, rascunhos/anexos privados e download após o deploy. A consulta pública de saúde não substitui esses percursos. M5 não é considerado completo apenas pela publicação do frontend ou pelas simulações locais.
