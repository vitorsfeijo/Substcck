# Entrega M4 - Trabalhos conexos e busca por significado

**Estado:** M4 concluído em 30/10/2026. T47-T52 implementadas e verificadas localmente e pelo GitHub Actions, com frontend publicado e conferido no Pages. As dependências externas de produção estão discriminadas abaixo.

M4 corresponde ao quinto marco do [plano](IMPLEMENTATION_PLAN.md). As regras estão em [SEARCH_DESIGN.md](SEARCH_DESIGN.md) e resolvem D08/D09 de [DECISIONS.md](DECISIONS.md). São decisões do projeto: o PDF anuncia as funcionalidades, mas não define algoritmo, modelo de IA ou pontuação.

## Escopo implementado

| Tarefa | Implementação                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| T47    | Regra verificável de conexão por tags e áreas distintas, com pontuação, limite e desempates.                                                |
| T48    | Consulta pública de conexões, excluindo a origem e todos os rascunhos.                                                                      |
| T49    | Seção de trabalhos conexos na leitura, com temas em comum, navegação e estados vazio/falha independentes.                                   |
| T50    | Desenho de LSA local, campos/pesos do corpus, limites e avaliação versionada com alvos sem tokens diretos.                                  |
| T51    | Representação SQL de termos/hash atualizada na transação de publicação/edição; reconstrução, preparo inicial e cache por revisão do corpus. |
| T52    | Modo por significado integrado aos filtros, paginação e URL, com alternativa textual explícita.                                             |

## Trabalhos conexos

`GET /api/tccs/:id/related` devolve `{ items: [{ tcc, sharedTags, sharedAreas, score }] }`. A origem precisa estar PUBLICADO; ID privado ou inexistente responde 404. Um candidato precisa compartilhar ao menos uma tag ou área distinta, também estar publicado e ser diferente da origem.

A pontuação é `4 × tags em comum + áreas distintas em comum`. Áreas repetidas por várias tags contam uma vez. Até quatro resultados seguem pontuação decrescente, defesa decrescente, publicação decrescente e ID. Mesmo autor, popularidade e palavras semelhantes não criam uma conexão. A leitura explica os assuntos/áreas compartilhados, sem apresentar a pontuação como probabilidade.

Selecionar um card abre outra pesquisa e conserva o destino interno de retorno à consulta de origem. Sem relações, a seção informa a ausência; em falha, permite tentar novamente. Erro ou resposta inválida de conexões não impede a leitura principal nem o download.

## Busca por significado

O seletor **Modo de busca** oferece **Por texto**, padrão, e **Por significado**. O modo textual continua em `GET /api/tccs`; o modo semântico usa `GET /api/search?mode=semantic&term=...`. A query de `#/buscar` conserva o modo, termo, filtros e página ao recarregar ou voltar da leitura. Limpar filtros mantém o modo escolhido.

A resposta semântica mantém `items`, `total`, `page` e `pageSize`, acrescentando `search: { requestedMode, mode, fallbackReason, notice? }`. Ano, semestre, intervalo de defesa, autor, orientador, tags, áreas e coleção continuam restrições obrigatórias. Diferentes dimensões e múltiplas tags usam AND; áreas usam OR dentro da dimensão. A consulta aprende com o corpus público completo, mas aplica as restrições antes de paginar os resultados. O termo não precisa ocorrer literalmente no alvo. A ordenação semântica usa cosseno, defesa, publicação e ID.

### Técnica, corpus e limites

A implementação TypeScript usa TF-IDF e análise semântica latente por decomposição truncada, projetando documentos e consulta no mesmo espaço e comparando por cosseno. As relações são aprendidas pelas coocorrências no próprio acervo, sem dicionário manual de sinônimos ou filtro por tags apresentado como semântica.

O corpus contém apenas publicados e usa título, resumo, nomes de tags, áreas e coleção com pesos 3, 1, 2, 1 e 1. Caixa, acentos e palavras funcionais portuguesas são normalizados. Autor e orientador não entram no vetor; continuam disponíveis no modo textual e nos filtros estruturados.

O mecanismo é local à API: não exige chave de IA, download de modelo, cobrança por consulta ou envio de consultas/corpus a terceiros. Não é um modelo de linguagem previamente treinado e não promete compreender vocabulário ausente. A qualidade depende da diversidade e das relações existentes no acervo.

| Limite inicial                                     | Comportamento                                                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Até 512 documentos e 10.000 termos                 | Acima do limite, usa a alternativa textual explícita, sem truncar silenciosamente o acervo.                                                      |
| Ao menos três documentos e duas dimensões efetivas | Exige rank observado de pelo menos três e projeção estritamente menor que esse rank; corpus degenerado não é apresentado como significado.       |
| Até oito dimensões e 64 iterações por componente   | Valores são reduzidos conforme tamanho e rank do corpus.                                                                                         |
| Orçamento de treinamento de dois segundos          | Verificado durante o cálculo; indisponibilidade do modelo leva à alternativa textual.                                                            |
| Cosseno mínimo de 0,3                              | Somente resultados iguais ou superiores a esse limiar entram na lista semântica.                                                                 |
| Energia projetada mínima de `1e-6`                 | Evita amplificar resíduos numéricos em temas fora do subespaço; documentos sem sinal não são classificados e consultas usam alternativa textual. |

Esses são limites operacionais da implementação inicial, não requisitos atribuídos ao PDF nem limite do número de TCCs cadastráveis.

### Alternativa textual e falhas

Corpus insuficiente, consulta sem vocabulário reconhecido, excesso de limite ou falha/inconsistência do índice/modelo resultam em `search.mode: text`, com o termo e os mesmos filtros originais, quando a busca textual estiver disponível. Os motivos são `insufficient_corpus`, `query_out_of_vocabulary`, `corpus_limit` ou `index_unavailable`. A interface informa:

> A busca por significado está indisponível para esta consulta. Exibindo resultados por texto.

O aviso permanece visível mesmo quando o resultado textual está vazio. Uma falha geral da API continua oferecendo nova tentativa e preservando os valores do formulário; não é representada como uma consulta concluída. Nenhum caminho de recuperação relaxa filtros ou inclui rascunhos.

## Representação, cache e recuperação

`007_semantic_documents.sql` persiste termos ponderados, hash da fonte, versão e referência temporal de cada documento público. Publicação/edição e atualização da representação usam a mesma transação, após resolver a classificação. Se a escrita do índice falha, a publicação não fica parcialmente gravada e a versão anterior permanece íntegra. Rascunhos são retirados da representação e a exclusão de um TCC elimina sua referência.

O serviço confere integridade, versão e visibilidade em um snapshot SQL de leitura. A revisão completa do corpus compõe o fingerprint do cache; mudança nos documentos invalida o modelo. Um índice privado ou desatualizado não é usado silenciosamente para servir resultados. Alterações SQL manuais fora dos serviços exigem reconstrução.

Na inicialização, a API prepara os registros faltantes/desatualizados. Em falha, registra aviso e mantém a busca textual disponível; a consulta semântica usa o aviso de alternativa ao detectar a inconsistência. `npm run search:reindex` recalcula a representação a partir dos publicados, aplicando migrações e fazendo a reconstrução em uma transação coordenada com publicação/edição. Um erro desfaz a reconstrução; o lote inicial aceita até 10.000 registros.

Em PGlite, executar o comando com a API local parada, sem dois processos acessando o mesmo diretório. No contêiner, o equivalente é `node build/server/scripts/reindex-search.js`, com as variáveis de banco da API. Não há chamada externa durante o bloqueio de reconstrução. Reindexar a representação não amplia os limites de treinamento descritos acima.

## Avaliação e validação local

O corpus fictício versionado em `server/semantic/evaluation.ts` contém nove documentos em três grupos. `npm run search:evaluate` exige que cada alvo esteja entre os três primeiros, que os três resultados pertençam ao grupo correto e que não haja tokens diretos da consulta na representação do alvo:

| Consulta               | Alvo relevante sem tokens diretos |
| ---------------------- | --------------------------------- |
| `proteção privacidade` | Criptografia hospitalar           |
| `automóveis`           | Roteamento veicular               |
| `colheita`             | Irrigação agrícola                |

O comando emite resultados e tempo observado e falha quando um caso não atende aos critérios. Esses dados não são importados como acervo de produção. Exemplos sintéticos não substituem avaliação de relevância com usuários e pesquisas reais.

Todas as etapas de `npm run check` foram aprovadas: lint/formatação, 85 testes de backend/domínio, avaliação semântica versionada, migrações e persistência após reabertura, tipos/compilação, build/caminhos do Pages, 16 testes de navegador no artefato de produção e 58 no bundle isolado de conta/editor/descoberta/semântica. São 159 execuções de testes aprovadas, além dos três casos de recuperação da avaliação. Os 56 cenários que exigem API configurada são omitidos no build sem API e executados no bundle isolado; quatro cenários de ausência de API são omitidos nesse bundle. Desktop e celular estão cobertos.

Os 24 novos testes do backend cobrem seis casos de conexões, nove de matemática/relevância e nove da integração de índice/API/SQL. Verificam os três alvos sem tokens diretos, consulta irrelevante, caixa/acentos, estabilidade numérica e IDs, filtros/paginação, privacidade, edição, rollback e reconstrução. A revisão acrescentou a regressão de precisão de microssegundos do PostgreSQL e a edição para um quarto tema isolado: ele deixa de aparecer nas buscas do tema anterior, sem converter ruído da projeção em um resultado relevante. A regressão dos marcos anteriores permaneceu aprovada.

`npm run search:evaluate` aprovou 3/3 alvos entre os três primeiros, sem tokens diretos em comum e com os três primeiros resultados no grupo correto. O último treinamento desse corpus de nove documentos foi observado em 3,4 ms no ambiente local; isso não estabelece SLA ou relevância de produção. As fixtures de navegador verificam a interface, não a qualidade do classificador.

Um percurso adicional usou navegador sem interceptação de rotas, Fastify, PGlite migrado e corpus fictício persistido com nove publicados e um rascunho. Confirmou resultado por significado ausente na busca literal, todas as dimensões estruturadas obrigatórias, conexões, contexto preservado ao voltar/recarregar, alternativa textual explícita e rascunho inacessível. Duas edições autenticadas pela API mudaram o trabalho para um tema existente e depois para Compiladores, um quarto tema isolado; índice/cache/buscas/conexões refletiram ambas. Somente a resposta LUME necessária à edição foi controlada no harness ignorado. Não houve erros de JavaScript nem overflow nas larguras de 360 e 412 pixels. Evidências locais estão em `.cache/qa/m4/`, fora do Git e do build público. Isso não atesta os serviços externos de produção.

## Limites concretos

- Frontend no [GitHub Pages](https://vitorsfeijo.github.io/Substcck/) não executa a API ou o banco; consulta pública continua dependente de serviços externos configurados.
- Sem `VITE_API_URL` de produção, a interface informa a conexão pendente e não simula resultados por significado ou acervo fictício.
- UFRGS, Render, Neon e R2/S3 reais continuam dependentes de provisionamento/configuração; testes locais/controlados não atestam essas integrações.
- LSA depende do corpus e tem os limites operacionais descritos; não é compreensão geral de linguagem nem garantia de relevância para qualquer consulta.
- A revisão final de experiência, operação e entrega completa permanece em T53-T60.

## Evidência remota

- Revisão de implementação/documentação verificada: `7b7a6475e33f8f8777d8d5429cc734d066169127`.
- [CI bem-sucedido](https://github.com/vitorsfeijo/Substcck/actions/runs/41057873025).
- [Deploy Pages e checagem pós-deploy bem-sucedidos](https://github.com/vitorsfeijo/Substcck/actions/runs/41057873189).
- [Site publicado](https://vitorsfeijo.github.io/Substcck/), conferido também no navegador: modo por significado e termo preservados ao recarregar, texto da quinta entrega, ausência de resultados simulados sem API, rotas e assets corretos, sem erros ou overflow nas larguras de 360 e 412 pixels.

A validação remota identificou uma corrida no teste de filtros: a asserção podia observar a consulta inicial antes da submissão. A correção sincroniza com a requisição enviada e preserva a verificação de todos os critérios. A execução seguinte do deploy falhou na resolução temporária de duas actions oficiais; suas revisões foram confirmadas nos repositórios de origem, e a repetição da mesma revisão passou integralmente.

O fechamento documental é um commit posterior, sem mudança de comportamento da aplicação. A publicação do frontend não comprova provisionamento externo nem integração institucional real.

## Commits por responsabilidade

- `4409bda`: regras de conexão e contrato de avaliação do mecanismo semântico.
- `d1bf232`: consulta pública de trabalhos conexos e suas regressões.
- `188d228`: núcleo LSA local e corpus/avaliação versionados.
- `b0def25`: representação persistida, atualização transacional e reconstrução.
- `059d4b5`: API semântica, filtros, cache e alternativa textual explícita.
- `8570494`: navegação entre trabalhos conexos na leitura.
- `e609403`: modo por significado, contexto e estados da pesquisa.
- `457fe8e`: avaliação no CI e regressão de navegador.
- `26838ef`: resultados locais e documentação da entrega.
- `7b7a647`: sincronização da submissão no teste de filtros identificado pelo CI.

O registro dos resultados locais e o fechamento remoto são commits documentais separados.
