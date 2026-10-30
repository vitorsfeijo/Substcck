# Decisões iniciais de implementação

Este registro resolve os contratos iniciais de T02 a T05 do [plano](IMPLEMENTATION_PLAN.md). A [especificação](SPEC.md) preserva o PDF; as escolhas abaixo são decisões de engenharia do projeto e não exigências atribuídas aos autores do desafio.

## 1. Recorte de M0

M0 entrega a base executável, separação de camadas, persistência mínima reproduzível, configuração pública/privada, verificação automatizada e publicação do frontend mínimo. A API desta fase informa sua saúde e o acesso ao banco. A prova de escrita/leitura ocorre por comando ou teste de integração controlado, sem criar um endpoint público de escrita para visitantes.

Cadastro de TCC, login, uploads, feed com trabalhos reais e busca são entregas seguintes. Contratos futuros definidos neste registro não significam que esses recursos já estão implementados. A publicação no Pages deve ser comprovada por URL e execução do Actions; configuração local isoladamente não conclui T13.

## 2. Stack e destinos de execução - D01

| Parte                          | Escolha                                             | Responsabilidade                                                                                                        |
| ------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Frontend                       | React, TypeScript e Vite                            | Gerar HTML/CSS/JavaScript estáticos e interface responsiva.                                                             |
| Navegação                      | Rotas em hash                                       | Permitir abertura direta e recarregamento no Pages sem reescrita de rotas pelo servidor.                                |
| Hospedagem do frontend         | GitHub Pages do repositório                         | Servir o build sob `/Substcck/`; esse prefixo deve ser configurável para forks e outros nomes de repositório.           |
| CI/CD                          | GitHub Actions                                      | Validar a mesma revisão que será publicada e enviar apenas o artefato do frontend ao Pages.                             |
| API                            | Node.js, TypeScript e Fastify                       | Validar requisições, aplicar negócio/autoria, integrar identidade e LUME e acessar banco/arquivos.                      |
| Destino da API                 | Serviço externo no Render, com imagem de container  | Executar o processo de backend; a API não roda dentro do Pages ou de um job permanente de Actions.                      |
| Banco de produção              | PostgreSQL no Neon                                  | Persistência compartilhada e transações; conexão somente pelo backend.                                                  |
| Banco de desenvolvimento/teste | PGlite com diretório persistente, quando apropriado | Executar PostgreSQL localmente sem exigir credenciais cloud; usar diretório temporário ou instância isolada nos testes. |
| Arquivos futuros               | Cloudflare R2 via API compatível com S3             | Armazenar binários separados do build; credenciais somente no backend.                                                  |

A escolha de Render, Neon e R2 define destinos técnicos. Não afirma que contas, projetos, credenciais ou serviços já foram provisionados; isso deve ser comprovado separadamente no registro de entrega. Não se presume disponibilidade ou gratuidade de nenhum plano.

O adaptador PGlite é uma execução local real de persistência. Ele não comprova que uma conexão Neon esteja provisionada nem que o backend esteja publicado. As migrações devem manter SQL compatível com PostgreSQL e os dois adaptadores. Comandos concretos, variáveis e evidências ficam na documentação de execução correspondente à implementação.

### Limites de camadas

- **Apresentação:** componentes React e clientes HTTP; sem acesso direto ao banco ou segredos.
- **Controller:** contratos HTTP, validação de entrada e tradução de erros.
- **Service:** regras de publicação, rascunho, edição, consulta e integração externa.
- **Repository:** consultas e transações, com filtros de visibilidade públicos explícitos.
- **Model/domain:** tipos e invariantes independentes da interface.
- **Adapters:** conexão PostgreSQL/PGlite, identidade, LUME e armazenamento.

Esse arranjo preserva as responsabilidades dos diagramas do PDF sem exigir correspondência literal de classes Java ou herança no armazenamento.

## 3. Identidade e autoria - D02 e D13

### Contrato institucional

O backend terá um adaptador de identidade institucional. A primeira opção de integração será OIDC, caso o mecanismo institucional disponibilizado à equipe suporte esse protocolo. A escolha não afirma que exista um provedor público OIDC da UFRGS. Antes de conectar produção, a equipe precisa obter protocolo efetivamente autorizado, endpoints, credenciais, regras de vínculo e autorização de uso; se o protocolo disponível diferir, troca-se o adaptador mantendo o contrato abaixo.

O adaptador devolve identidade verificada contendo identificador estável do provedor, nome, e-mail quando disponibilizado e vínculos/papéis comprovados. Endereço com domínio institucional, nome informado pelo cliente ou uma matrícula digitada não comprovam, sozinhos, identidade e autorização.

O backend valida o retorno do provedor, emissor/audiência e validade conforme o protocolo adotado e associa a identidade a um usuário local. O autor de um TCC é obtido dessa sessão/identidade validada; não é um identificador arbitrário escolhido no corpo da requisição.

### Matriz de acesso

| Operação                                          | Visitante | Aluno autor autenticado              | Outro aluno autenticado        | Professor autenticado          |
| ------------------------------------------------- | --------- | ------------------------------------ | ------------------------------ | ------------------------------ |
| Consultar trabalhos publicados e anexos públicos  | Sim       | Sim                                  | Sim                            | Sim                            |
| Pesquisar, filtrar e ler publicados               | Sim       | Sim                                  | Sim                            | Sim                            |
| Cadastrar o próprio TCC                           | Não       | Sim, com vínculo de aluno verificado | Sim, para seu próprio trabalho | Não previsto no fluxo de aluno |
| Ver/retomar rascunho de um autor                  | Não       | Somente o próprio                    | Não                            | Não                            |
| Editar o TCC de um autor                          | Não       | Somente o próprio                    | Não                            | Não                            |
| Aprovar, moderar ou editar trabalho de orientando | Não       | Não previsto                         | Não previsto                   | Não previsto                   |

Não se cria aprovação obrigatória de professor: essa regra não foi especificada. O professor consulta como leitor; funcionalidades adicionais exigem contrato próprio posterior.

### Desenvolvimento e callback

O M0 não concede login fictício nem implementa escrita de TCC. Um adaptador de identidade controlado para testes poderá existir exclusivamente em desenvolvimento/teste e nunca substituir a identidade real em produção. A produção deve recusar iniciar com configuração de autenticação simulada habilitada quando esse recurso for introduzido.

O callback futuro da API terá caminho estável próprio, e o destino após login será a origem pública configurada do frontend, incluindo `/Substcck/` e a rota em hash apropriada. O registro do provedor deve usar exatamente a URL HTTPS efetiva do backend. Desenvolvimento pode usar callback local separado. Redirects de retorno ficam limitados à origem configurada, sem aceitar URL arbitrária enviada pelo visitante.

### Origem de API e configuração

A API aceita a origem real do Pages (`https://vitorsfeijo.github.io`) e origens locais explicitamente configuradas para desenvolvimento; CORS compara origem, não o caminho `/Substcck/`. CORS não substitui autenticação/autoria. A interface usa somente URL pública de API e outros identificadores declaradamente públicos; conexão de banco, credenciais de R2 e segredos de identidade permanecem no backend.

## 4. Campos, limites e estados - D03, D06 e D15

Os limites desta seção são decisões iniciais de produto/engenharia para eliminar ambiguidade. Os limites de cinco tags, três imagens, um arquivo e coorientador opcional vêm do PDF.

### Campos de trabalho

| Campo canônico           | Rascunho                               | Publicação                      | Limite e interpretação                                                                 |
| ------------------------ | -------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| `id`                     | Gerado pelo servidor                   | Gerado pelo servidor            | Identificador opaco; armazenamento pode usar UUID, em vez do `int` ilustrativo do UML. |
| `autorId`                | Obrigatório, derivado da sessão        | Obrigatório, derivado da sessão | Um autor por trabalho; não editável por outro usuário.                                 |
| `titulo`                 | Obrigatório                            | Obrigatório                     | 1 a 200 caracteres após aparar espaços.                                                |
| `resumoSimplificado`     | Opcional                               | Obrigatório                     | Até 5.000 caracteres; publicação exige conteúdo não vazio.                             |
| `ano`                    | Opcional                               | Obrigatório                     | Inteiro de 1900 até o ano corrente; coerente com a data de defesa.                     |
| `semestre`               | Opcional                               | Obrigatório                     | 1 ou 2; derivável/coerente com a data de defesa.                                       |
| `dataDefesa`             | Opcional                               | Obrigatório                     | Data válida não futura; necessária para ordenar trabalhos defendidos recentemente.     |
| `orientadorId`           | Opcional                               | Obrigatório                     | Referência a um professor; coorientador deve ser pessoa diferente.                     |
| `coorientadorId`         | Opcional                               | Opcional                        | No máximo um; até dois professores no total.                                           |
| `linkLume`               | Opcional ou ainda inválido/inacessível | Obrigatório e validado          | Máximo de 2.048 caracteres; regra da seção 5.                                          |
| `tags`                   | 0 a 5                                  | 1 a 5                           | Sem duplicatas; nomes de 1 a 50 caracteres após normalização.                          |
| `midias`                 | 0 a 3                                  | 0 a 3                           | Regras de upload abaixo.                                                               |
| `arquivo`                | 0 a 1                                  | 0 a 1                           | DOCX, PDF ou EPUB; ausência é válida.                                                  |
| `colecaoId`              | Opcional                               | Opcional                        | Referência a coleção existente quando informada.                                       |
| `status`                 | `RASCUNHO`                             | `PUBLICADO`                     | Definido por operação validada no servidor.                                            |
| `createdAt`, `updatedAt` | Gerados pelo servidor                  | Gerados pelo servidor           | Instantes UTC; não são datas de defesa.                                                |
| `publishedAt`            | Ausente até primeira publicação        | Definido na primeira publicação | Preservado em edição do trabalho já publicado.                                         |

Ano/semestre representam o período acadêmico da defesa. Data de defesa é um campo adicional decidido pelo projeto para atender RF#02, não um campo explicitamente listado em RF#01. O limite inicial de ano não impõe uma exigência histórica ao PDF e poderá ser revisto por dados reais do catálogo.

Tags são identificadas por nome normalizado para comparação sem diferenças apenas de caixa/espaçamento. A apresentação preserva uma grafia legível. Cada tag pode pertencer a zero ou uma área; uma área pode conter várias tags. Coleção é classificação independente, criada como entidade para viabilizar o filtro de UC04; não transforma automaticamente uma tag em coleção.

### Uploads

- **Imagens:** PNG, JPEG ou WebP, até 5 MiB por imagem; descrição alternativa até 300 caracteres. Verificar formato pelo conteúdo, não somente extensão ou MIME informado.
- **Arquivo do trabalho:** PDF, DOCX ou EPUB, até 25 MiB; um por TCC. Validar a assinatura/estrutura pertinente ao formato e tratar DOCX/EPUB como contêineres sem executá-los.
- Nomes originais são metadados, não caminhos confiáveis. Chaves de armazenamento são geradas no servidor e associadas ao autor/TCC.
- Rascunhos e seus anexos não são públicos. Arquivos de trabalho publicado são entregues por autorização da API/URL temporária apropriada, sem tornar todo o bucket publicamente listável.
- Remoção/substituição só elimina arquivo antigo após a atualização válida das referências; limpeza de uploads abandonados deve respeitar referências existentes.

### Transições

| Operação               | Resultado válido                                                                                              | Resultado inválido                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Publicar novo trabalho | Salvar atomicamente como PUBLICADO, associar anexos/tags e atualizar índice.                                  | Campos inválidos retornam ao formulário; link LUME inválido/inacessível oferece salvar rascunho.                    |
| Confirmar rascunho     | Salvar como RASCUNHO com autoria e título, mantendo demais dados existentes.                                  | Rejeitar dados fora dos limites; nenhum registro público é criado.                                                  |
| Recusar rascunho       | Retornar ao formulário mantendo valores no cliente.                                                           | Não publicar nem salvar automaticamente o trabalho.                                                                 |
| Retomar rascunho       | Somente o autor recupera dados e anexos.                                                                      | Outros usuários recebem resposta sem conteúdo privado.                                                              |
| Publicar rascunho      | Validar novamente todos os campos e o LUME e passar a PUBLICADO.                                              | Preservar rascunho e retornar validações; não torná-lo público.                                                     |
| Editar PUBLICADO       | Revalidar e substituir a versão pública atomicamente; preservar `publishedAt` e atualizar `updatedAt`/índice. | Manter a versão pública anterior e os valores editados no formulário; não despublicar ou sobrescrever parcialmente. |

Uma edição inválida de trabalho publicado não cria automaticamente um rascunho de revisão nem novo estado de domínio. Esse fluxo poderá ser ampliado depois, mas o contrato inicial mantém os dois estados da fonte. As mensagens de UC01/UC04 são preservadas conforme a especificação.

## 5. Integração LUME e documento - D04 e D05

### URL aceita para publicar

1. Interpretar a URL no servidor com parser de URL, sem depender de comparação por substring.
2. Aceitar somente HTTPS, host exatamente `lume.ufrgs.br`, porta padrão e sem usuário/senha incorporados; comprimento máximo de 2.048 caracteres. Não aceitar nomes apenas semelhantes ou subdomínios não autorizados.
3. Consultar o registro com timeout total de 5 segundos. Permitir no máximo três redirecionamentos, todos ainda em HTTPS e no mesmo host autorizado; validar cada destino antes de segui-lo. Não seguir destino fora dessa política.
4. Verificar resposta final de sucesso. A estratégia HTTP pode tentar HEAD e recorrer a GET limitado quando o servidor não suportar HEAD; não baixar o artigo completo para validar o registro.
5. Tratar timeout, domínio inválido, erro de rede, resposta sem sucesso ou redirecionamento indevido como falha de validação de publicação, oferecendo FA02.

Aliases ou hostnames adicionais só entram depois de confirmados pela equipe e adicionados explicitamente à lista de destinos. A disponibilidade remota é verificada pelo backend, não por uma requisição do navegador ao LUME. Os testes usam respostas simuladas do serviço para não depender da rede real.

### Documento opcional

- Com arquivo anexado, a ação **Baixar Artigo** entrega o anexo autorizado com nome e formato corretos.
- Sem arquivo anexado, oferecer **Abrir documento no LUME** como link para o registro oficial; a aplicação não promete um download direto de arquivo inexistente nem faz scraping para inventar essa URL.
- Falha em download existente mostra a mensagem de UC04 FA02 e permite tentar novamente. Abrir link externo não deve ser relatado como download concluído pela aplicação.

## 6. Busca, feed e contratos de dados - D07 a D11

### Busca e classificação

- Consulta textual inicial em título, resumo, nome do autor/orientando e nome de orientador; comparação normalizada sem diferenciar caixa e acentos. Ordenação por data de defesa decrescente, publicação decrescente e identificador para desempate, compartilhada com a consulta de recentes.
- Filtros disponíveis: intervalo de data de defesa, ano, semestre, autor, orientador, tags, áreas e coleção. Todos os critérios de dimensões diferentes são combinados com **AND**.
- Múltiplas tags selecionadas também usam **AND**: o TCC deve ter todas. Múltiplas áreas selecionadas usam OR dentro da dimensão, pois um trabalho pode atingir uma área por qualquer tag; documentar esse comportamento no controle da interface.
- Autor/orientando e orientador são filtros separados. Um nome de professor não substitui automaticamente um filtro de autor.
- Retornar apenas publicados em busca pública, detalhe, feed, anexos públicos e trabalhos conexos. Acesso privado ao rascunho usa operação do autor autenticado.
- Listagens paginadas, limite padrão 20 e máximo 100 por página; resposta contém itens e metadados de paginação. Ordenação deve ser estável para um conjunto de dados inalterado.
- Na interface de M3, a pesquisa usa 12 itens por página por padrão. Critérios e página ficam na query de `#/buscar`, permitindo abertura direta, recarregamento e retorno da leitura com a consulta preservada. As opções de autor, orientador, ano e classificação são derivadas somente de trabalhos publicados.

### Feed

- **Recentes:** `dataDefesa` decrescente, seguida de `publishedAt` e identificador para desempate; `publishedAt` não substitui a data real da defesa.
- **Tópicos em alta:** quantidade de visualizações válidas de trabalhos publicados por tag nos últimos 30 dias corridos, usando eventos com instante UTC; desempate pelo nome normalizado da tag. Uma visualização de um trabalho conta uma vez para cada tag desse trabalho.
- Repetições na mesma sessão para o mesmo trabalho em 30 minutos não incrementam novamente o ranking. O contador total de visualizações e os eventos temporais têm funções distintas.
- Em M3, o GET do detalhe público entrega um cookie de sessão visitante opaco antes do POST de leitura, cobrindo também acesso por link direto. O cookie é `HttpOnly`, sem `Max-Age`, com `SameSite=Lax` localmente e `Secure; SameSite=None; Path=/` em produção. A persistência de deduplicação guarda apenas seu hash por TCC, sem endereço IP, fingerprint ou associação ao identificador da conta.
- O POST aceita apenas uma origem explicitamente configurada. Deduplicação, evento, snapshot de tags e incremento do contador total são gravados em uma transação. Uma falha desfaz o conjunto e permite repetir sem deixar contagem parcial.
- As tags são capturadas no instante do evento: editar a classificação de um TCC não reclassifica retroativamente suas leituras antigas. O ranking considera eventos dentro dos últimos 30 dias até o instante atual, sem eventos futuros, e exclui trabalhos que não estejam publicados. Cada evento contribui uma vez para cada tag capturada.
- Bloqueio de cookies entre sites pode impedir reconhecer a mesma sessão entre requisições. Nesse caso, a deduplicação não é garantida; o sistema não recorre a fingerprint por IP ou identidade. A leitura não depende do sucesso de registrar métricas. Os números representam eventos válidos conforme essa política, não pessoas únicas.
- O feed retorna até oito trabalhos recentes e oito tópicos com eventos na janela. Ausência de eventos produz uma lista vazia de tópicos, sem inventar popularidade a partir do contador total.
- A janela de 30 dias e a fórmula são decisões iniciais do projeto, não métricas fornecidas pelo PDF. Não há painel novo de análise de alcance no recorte inicial.

### DTOs e erros

Os nomes são normalizados em TypeScript; não reproduzir tipos singulares inadequados do desenho. `TccDTO` transporta identidade do trabalho, título/resumo, ano/semestre/data de defesa, autor, orientador/coorientador, link LUME, tags/áreas, coleção, mídias, arquivo opcional, estado e datas relevantes conforme a visibilidade. Em M3, `FeedDTO` retorna `recent: TccDTO[]`, `topics: (TagDTO & { views: number })[]` e `windowDays: 30`. `FiltroBusca` inclui todos os filtros acima. `GET /api/discovery-options` retorna autores, orientadores, anos, tags, áreas e coleções disponíveis no domínio público; `GET /api/feed` compõe recentes e tópicos; `POST /api/tccs/:id/views` registra exploração sem exigir login.

Operações de escrita recebem entrada própria de criação/edição, em vez de confiar em `autorId`, status ou contadores enviados no DTO de leitura. Erros de validação identificam o campo e preservam a mensagem de negócio adequada; um erro de integração não retorna conexão de banco, segredo ou pilha interna ao visitante.

### Busca por significado e conexões de M4 - D08 e D09

[SEARCH_DESIGN.md](SEARCH_DESIGN.md) registra os algoritmos, corpus, limites, avaliação e recuperação de T47-T52. Essas escolhas são do projeto; o PDF não fornece pontuação, modelo ou provedor de IA.

- **D08:** análise semântica latente local (TF-IDF e decomposição truncada), aprendida por coocorrências do corpus público. A consulta é projetada no mesmo espaço dos documentos; não é sinônimo de busca literal nem de filtro por tag. Texto permanece o modo padrão e a alternativa explícita quando significado estiver indisponível, sempre com os mesmos filtros estruturados. O corpus versionado de avaliação inclui alvos relevantes sem tokens diretos da consulta.
- **D09:** trabalhos publicados que compartilham tags ou áreas distintas são ordenados por `4 × tags em comum + áreas distintas em comum`, seguidos de defesa, publicação e ID. A origem e rascunhos são excluídos, com até quatro resultados; não há relação inferida por mesmo autor ou popularidade.
- A indexação dos termos ponderados e seu hash usa a mesma transação da publicação/edição. O cache do modelo depende da revisão do corpus público; reconstrução e inicialização preparam registros antigos, sem expor índice privado ou usar silenciosamente uma revisão antiga.
- O mecanismo local não envia consultas ou corpus a terceiros e não exige credenciais de IA. Não é um modelo de linguagem previamente treinado; qualidade e vocabulário dependem do acervo. Os limites iniciais e os critérios de avaliação estão no desenho, sem presumir compreensão geral de linguagem.

## 7. Situação das lacunas de SPEC.md

| Lacuna | Decisão inicial                                                         | O que permanece fora de M0                                               |
| ------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| D01    | Stack/destinos definidos na seção 2.                                    | Provisionar e comprovar backend/banco/arquivos externos.                 |
| D02    | Contrato institucional, autoria e callback definidos na seção 3.        | Obter e validar a integração institucional real.                         |
| D03    | Matriz de rascunho/publicação e limites na seção 4.                     | Implementar domínio e formulários.                                       |
| D04    | HTTPS, host exato, timeout e redirecionamentos na seção 5.              | Implementar e testar adaptador LUME.                                     |
| D05    | Download de anexo ou link claramente identificado ao LUME.              | Implementar leitura/download.                                            |
| D06    | Revalidação e edição atômica preservam versão pública anterior em erro. | Implementar edição/autoria e atualização do índice.                      |
| D07    | Data de defesa, timestamps e eventos/ranking de 30 dias definidos.      | Implementar feed, eventos e consultas de popularidade.                   |
| D08    | LSA local, corpus, avaliação e alternativa textual em SEARCH_DESIGN.md. | Verificar a implementação e a relevância no acervo real.                 |
| D09    | Pontuação por tags/áreas, limite e desempates em SEARCH_DESIGN.md.      | Verificar consulta, privacidade e navegação das conexões.                |
| D10    | Áreas/coleções, período e semântica de filtros definidos.               | Criar entidades e consultas.                                             |
| D11    | DTOs completos, entradas separadas e listas explícitas.                 | Implementar contratos dos fluxos de negócio.                             |
| D12    | Manter a associação original de RF#02 a busca e feed.                   | Não renumerar o PDF para corrigir essa assimetria.                       |
| D13    | Sem moderação ou interações novas; professor leitor.                    | Integração institucional real e contagem de exploração.                  |
| D14    | Normalizar nomes na implementação preservando figuras originais.        | Não implementar a seta inconsistente repositório → LUME como regra nova. |
| D15    | Limites iniciais de texto/uploads e configuração explicitados.          | Revisar operação real e metas na etapa de qualidade.                     |

Os próximos marcos podem revisar decisões com novos dados. Toda alteração que afete comportamento deve atualizar este registro, contratos/testes correspondentes e a rastreabilidade, sem reescrever a descrição histórica do PDF.
