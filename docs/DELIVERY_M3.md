# Entrega M3 - Descoberta, leitura, download e filtros

**Estado:** M3 concluído em 28/10/2026. T36-T46 implementadas e verificadas localmente e pelo GitHub Actions, com frontend publicado e conferido no Pages. As dependências externas de produção estão discriminadas abaixo.

M3 corresponde ao quarto marco do [plano](IMPLEMENTATION_PLAN.md). O frontend continua estático no [GitHub Pages](https://vitorsfeijo.github.io/Substcck/). Consulta compartilhada, métricas e arquivos dependem da API e dos serviços externos configurados; o site não transforma dados de demonstração locais em acervo público real.

## Escopo implementado

| Tarefa | Implementação                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| T36    | Consulta pública do detalhe completo, com estado PUBLICADO verificado no servidor e rascunho inacessível por ID público.             |
| T37    | Página de leitura responsiva com resumo, período/data, autoria/orientação/coorientação, classificação, imagens e referência oficial. |
| T38    | Download do anexo com formato/nome corretos e recuperação de erro; sem anexo, link explícito para o LUME.                            |
| T39    | Recentes ordenados por data de defesa, publicação e ID, com limite e exclusão de rascunhos antes da seleção.                         |
| T40    | Eventos UTC de leitura, deduplicação por sessão/TCC em 30 minutos e ranking por tag nos últimos 30 dias, separado do contador total. |
| T41    | Feed de recentes e tópicos em alta, com cards, imagens quando disponíveis, links por assunto e estados de carregamento/vazio/falha.  |
| T42    | Busca textual em título, resumo e nomes de autor/orientador, sem distinguir caixa e acentos.                                         |
| T43    | Interseção de ano, semestre, intervalo de defesa, autor e orientador, mantendo critérios independentes.                              |
| T44    | Filtros por tags, áreas e coleção; todas as tags e qualquer área da seleção, combinadas às demais dimensões.                         |
| T45    | Tela Buscar TCC com formulário, pesquisa, limpeza, resultados paginados e critérios preservados na URL.                              |
| T46    | Mensagem exata de consulta vazia e cenário CT03 A-E, inclusive a variação 2023 com Redes.                                            |

## Navegação e leitura

O início apresenta trabalhos recentes e tópicos em alta. O menu **Buscar TCC** abre `#/buscar`. Cards do feed e da pesquisa abrem `#/tcc/:id`, levando um destino de retorno interno no parâmetro `from`; voltar à pesquisa conserva os filtros e a página. As rotas em hash mantêm abertura direta e recarregamento compatíveis com o prefixo `/Substcck/` do Pages.

A leitura apresenta os dados gravados pelo autor, imagens com descrição, período/data de defesa, autor, orientador, coorientador quando existente, tags/áreas e coleção. Os vínculos de classificação e autoria conduzem à busca correspondente. Trabalho inexistente ou privado não recebe uma página pública com metadados do rascunho.

Com documento anexado, **Baixar Artigo** obtém o binário autorizado, preserva o nome original sanitizado e verifica a resposta antes de iniciar o download no navegador. Imagens e documentos usam a API; não são inseridos no artefato estático. Falha de download mantém a leitura e permite tentar novamente, com a mensagem de UC04 FA02:

> Ocorreu um erro durante o download, verifique a sua conexão com a internet e tente novamente.

Sem arquivo anexado, **Abrir documento no LUME** aponta para a referência oficial HTTPS. Abrir o registro externo não é apresentado como download concluído pela aplicação. Não há scraping ou tentativa de deduzir um arquivo que não foi enviado.

## Contratos HTTP

| Operação                     | Contrato                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /api/feed`              | `{ recent: TccDTO[], topics: (TagDTO & { views: number })[], windowDays: 30 }`; até oito recentes e oito tópicos. |
| `GET /api/discovery-options` | `{ authors, advisors, years, tags, areas, collections }`, derivados apenas de publicados.                         |
| `GET /api/tccs`              | Resultados públicos e metadados `total`, `page`, `pageSize`; visibilidade aplicada antes da paginação.            |
| `GET /api/tccs/:id`          | Detalhe público completo ou 404 para inexistente/rascunho.                                                        |
| `POST /api/tccs/:id/views`   | Corpo `{}`, origem permitida e resposta `{ counted: boolean }`; não exige login.                                  |
| `GET /api/attachments/:id`   | Leitura pública somente de anexo vinculado a PUBLICADO; demais casos seguem autoria privada.                      |

A busca aceita `term`, `year`, `semester`, `dateFrom`, `dateTo`, `authorId`, `advisorId`, `tagIds`, `areaIds`, `collectionId`, `page` e `pageSize`. Datas seguem `AAAA-MM-DD` e listas de IDs usam vírgula. A API aplica valores em consultas parametrizadas, valida filtros e limita a página a 100 itens; seu padrão é 20. A interface usa 12 itens por padrão.

## Busca, filtros e CT03

Dimensões diferentes são combinadas por AND. Múltiplas tags também usam AND: o resultado precisa conter todas. Múltiplas áreas usam OR dentro dessa dimensão: basta uma das áreas escolhidas, sem relaxar as demais condições. Autor/orientando e orientador permanecem filtros distintos. A ordenação usa defesa decrescente, publicação decrescente e ID para desempate.

Os critérios confirmados e a página são serializados na query de `#/buscar`. Recarregar ou retornar da leitura conserva a consulta; limpar os filtros inicia nova pesquisa. Ausência de API, carregamento, falha recuperável e nenhum resultado têm estados próprios. UC04 FA01 usa:

> Nenhum trabalho encontrado para os critérios informados. Tente ajustar ou remover alguns filtros.

Os dados fictícios A-E continuam disponíveis por `npm run db:seed`, somente no ambiente local permitido. O cenário 2025 + Carlos Lima + Redes seleciona apenas A; E permanece rascunho e não participa do resultado público. A variação 2023 + Redes retorna a mensagem de consulta vazia. As opções da interface vêm da API, sem pressupor identificadores fixos do seed em produção.

## Exploração e tópicos em alta

`006_discovery_views.sql` separa deduplicação, eventos e associações das tags de cada evento. O contador acumulado do TCC não é usado como substituto de uma janela temporal. Os tópicos somam eventos de publicados dos últimos 30 dias corridos até o instante atual; eventos antigos ou futuros não contribuem. Empates usam o nome normalizado da tag e seu identificador. Sem eventos válidos, a lista de tópicos fica vazia.

Cada evento captura as tags do TCC naquele instante. Uma edição posterior não reclassifica leituras antigas. Uma leitura contribui uma vez para cada tag capturada, e o ranking continua verificando se o TCC está publicado.

O GET do detalhe entrega um cookie visitante opaco antes de a interface registrar a leitura, incluindo acesso direto por link. Isso permite que requisições concorrentes posteriores usem a mesma sessão. O POST mantém fallback de emissão quando necessário, aceita somente origem explicitamente permitida e não recebe instante, quantidade ou identidade a ser contabilizada do cliente.

O cookie é de sessão, `HttpOnly`, sem `Max-Age`. Localmente usa `SameSite=Lax`; em produção usa `Secure`, `SameSite=None`, `Path=/` e nome com prefixo `__Host-`. O banco guarda apenas o hash por sessão/TCC e o instante da última leitura contada. Não são usados IP, fingerprint ou ID da conta para identificar o visitante.

Repetições da mesma sessão/TCC dentro de 30 minutos não incrementam novamente. A deduplicação, o evento, as tags capturadas e o incremento total pertencem à mesma transação; falha de gravação desfaz o conjunto. Registrar a métrica é independente da apresentação do conteúdo, portanto uma falha de métricas não interrompe a leitura ou o download.

Bloqueio de cookies entre sites pode impedir reconhecer a mesma sessão entre requisições, limitando a deduplicação. Não há fallback por fingerprint ou identidade. Esse comportamento deve ser validado na implantação real de Pages/API; os valores representam eventos sob a política descrita, não pessoas únicas.

## Validação local

`npm run check` passou integralmente: lint/formatação, 61 testes do backend/domínio, migrações e persistência após reabertura, tipos/compilação, build e caminhos do Pages, 14 testes de navegador no artefato de produção e 44 no bundle isolado de conta/editor/descoberta. São 119 execuções aprovadas, com desktop e celular. Os 42 cenários que exigem API configurada são omitidos no build sem API e executados no bundle isolado; os dois cenários de ausência de API são omitidos nesse bundle.

Os nove testes novos de backend verificam detalhe e privacidade, CT03, ordenação/paginação, filtros combinados, janela/desempate dos tópicos, snapshot das tags, deduplicação concorrente, rollback e atributos dos cookies. A regressão de CT01/CT02 permanece aprovada. Os testes de navegador cobrem feed, pesquisa, retorno preservado, vazio/erro, leitura, download correto e recuperação de falha, além de recarregamento e navegação por teclado. A revisão independente não identificou problemas adicionais após a conferência dos fluxos.

Os testes de backend/API executam persistência SQL real em PGlite com dados fictícios. O bundle de navegador com respostas de API controladas é separado do artefato de produção e não é publicado no Pages. LUME ou armazenamento injetados nos testes comprovam os contratos controlados, não acesso aos provedores reais.

Um percurso adicional usou navegador sem interceptação de rotas, Fastify, PGlite migrado e arquivos PNG/PDF reais em disco local. Confirmou ordem D/B/A/C do feed, CT03 retornando somente A, consulta vazia de 2023, retorno/recarregamento conservando filtros, E privado com 404 e deduplicação persistida mantendo uma leitura após recarregar. A primeira consulta ao PDF recebeu uma falha controlada exclusivamente no harness; a nova tentativa baixou bytes idênticos ao arquivo real. Não houve erros de JavaScript nem overflow em celular; foco e campos foram conferidos por teclado. Evidências locais estão em `.cache/qa/m3/`, fora do Git e do build público. A disponibilidade real do LUME não foi usada para comprovar descoberta pública.

## Limites concretos

- API/banco/arquivos de produção e acesso institucional ainda exigem provisionamento/configuração; o frontend no Pages não executa esses serviços.
- Sem `VITE_API_URL` de produção, feed, busca e leitura informam que o acervo precisa ser conectado; não publicam o seed fictício como dados reais.
- Autenticação real UFRGS, Neon, Render e R2/S3 não são comprovados pelos testes locais ou controlados.
- Cookies entre sites podem ser bloqueados, afetando sessão autenticada e deduplicação visitante; essa condição precisa ser validada com os domínios reais.
- Trabalhos conexos e busca semântica permanecem em M4. Busca textual e filtros por tags não são apresentados como busca por significado.

## Commits por responsabilidade

- `a17e06c`: eventos de leitura, deduplicação, consultas e contrato do feed.
- `a9fc854`: API de descoberta e regressões de filtros, privacidade e métricas.
- `3da766f`: página de leitura e download com recuperação de falha.
- `28294cd`: feed, busca, filtros, paginação e integração da navegação.
- `4e05045`: regressão no navegador e integração ao CI.
- `5d6a594`: registro dos resultados locais, decisões e progresso do plano.

O registro de resultados e o progresso do plano são versionados em commit documental separado.

## Evidência remota

- Revisão de implementação/documentação verificada: `5d6a594a2918a6dcf58207e9e8b187d8e8837bb7`.
- [CI bem-sucedido](https://github.com/vitorsfeijo/Substcck/actions/runs/40671683997).
- [Deploy Pages e checagem pós-deploy bem-sucedidos](https://github.com/vitorsfeijo/Substcck/actions/runs/40671684345).
- [Site publicado](https://vitorsfeijo.github.io/Substcck/), conferido também no navegador: menu Buscar TCC, rotas de busca/leitura, critérios preservados ao recarregar, indicação correta de API não configurada, ausência de personas locais em produção e apresentação sem overflow em larguras de 360 e 412 pixels, sem erros ou recursos ausentes.

O fechamento documental é um commit posterior, sem mudança de comportamento da aplicação. A publicação do frontend não comprova provisionamento externo nem integração institucional real.
