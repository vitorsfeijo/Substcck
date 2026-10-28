# Entrega M2 - Publicação, rascunhos, edição e anexos

**Estado:** M2 concluído em 28/10/2026. T23-T35 implementadas e verificadas localmente e pelo GitHub Actions, com frontend publicado e conferido no Pages. As dependências externas de produção estão discriminadas abaixo.

M2 corresponde ao terceiro marco do [plano](IMPLEMENTATION_PLAN.md). O site continua em [Substcck](https://vitorsfeijo.github.io/Substcck/), com frontend estático no GitHub Pages. A API, o banco e os arquivos de produção continuam dependentes de serviços externos próprios.

## Escopo implementado

| Tarefa | Implementação                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T23    | Política de URL LUME no servidor: HTTPS, host exato, porta padrão, ausência de credenciais e limite de comprimento, antes de qualquer requisição.       |
| T24    | Verificação HTTP com prazo total de 5 segundos e até três redirecionamentos revalidados; HEAD com fallback GET limitado quando necessário.              |
| T25    | Publicação autenticada com validação de campos, LUME, autoria e anexos; persistência em transação e disponibilidade nas consultas públicas após commit. |
| T26    | Salvamento explícito de rascunho privado, inclusive após aviso de falha LUME; recusar a oferta mantém os dados no formulário.                           |
| T27    | Metadados SQL de anexos e adaptadores de binários para disco local e S3 privado, separados do artefato estático publicado.                              |
| T28    | Envio e vínculo de até três imagens PNG, JPEG ou WebP por TCC, com validação pelo conteúdo, tamanho e descrição.                                        |
| T29    | Documento opcional único em PDF, DOCX ou EPUB, com verificação de assinatura/estrutura e limites de tamanho.                                            |
| T30    | Resolução dos anexos por identificadores pertencentes ao autor, preservação dos vínculos em falhas e limpeza manual de uploads antigos sem referências. |
| T31    | Formulário de cadastro com título, resumo, período/data de defesa, orientação, coorientação e link LUME.                                                |
| T32    | Seleção/criação de tags, áreas e coleção, envio e prévia de imagens, descrição e documento opcional.                                                    |
| T33    | Publicação e mensagens de sucesso/validação, com identificação dos campos pendentes e preservação dos dados digitados.                                  |
| T34    | Oferta de rascunho, confirmação/recusa e retomada pela lista privada de trabalhos no perfil.                                                            |
| T35    | Edição do próprio TCC, revalidação de publicação e atualização atômica sem substituir a versão pública anterior em uma edição inválida.                 |

## Publicação, rascunho e edição

`POST /api/tccs` cria o trabalho e `PUT /api/tccs/:id` edita um trabalho do autor autenticado. O comando distingue `intent: publish` de `intent: draft`; autor, estado persistido e referências de arquivos são resolvidos pelo servidor, sem confiar em caminhos ou autoria enviados livremente pelo cliente.

Publicar exige campos completos e LUME acessível. O serviço encerra a consulta externa antes de adquirir os bloqueios usados na gravação SQL. Em seguida, verifica autoria e anexos e salva metadados, tags e vínculos de forma transacional. Uma falha não deixa uma publicação parcial disponível.

Falha LUME apresenta o aviso de UC01/FA02 e informa se é permitido salvar como rascunho. Salvar exige uma ação explícita; o rascunho não entra na consulta pública. Recusar a oferta não cria automaticamente um registro. Rascunhos salvos aparecem na área privada do aluno, com a ação de retomar.

Uma edição de PUBLICADO precisa continuar sendo uma publicação válida. Ela revalida campos e LUME e preserva a versão pública anterior quando falha; não converte o trabalho em rascunho nem grava parcialmente a revisão. O autor pode manter os valores editados no formulário e corrigir o problema.

A criação admite `Idempotency-Key` estável, usada pelo editor para repetir uma requisição sem duplicar a publicação. Reutilizar a mesma chave para dados diferentes resulta em HTTP 409. A chave é associada ao autor; a edição usa o identificador existente e não esse mecanismo de criação.

As consultas públicas e privadas leem o mesmo domínio SQL, com os escopos de visibilidade correspondentes. Depois do commit, a publicação ou revisão já está disponível para essas consultas; não há worker de indexação separado ou busca semântica implementada neste marco.

## Validação do LUME

- Somente `https://lume.ufrgs.br`, com porta padrão, sem usuário/senha incorporados e até 2.048 caracteres. Fragmentos são removidos da URL normalizada.
- Cada resposta de redirecionamento é examinada antes de seguir o destino. Downgrade HTTP, outro host, credenciais ou porta indevida são rejeitados; são permitidos no máximo três redirecionamentos.
- O prazo total de 5 segundos cobre redirecionamentos e fallback, sem reiniciar a contagem em cada requisição.
- O serviço começa com HEAD. Se receber 405 ou 501, tenta GET e cancela o corpo após receber os cabeçalhos, sem baixar o artigo completo para validar a URL.
- Link malformado, domínio indevido, falha de rede, resposta sem sucesso ou timeout impede a publicação. Os testes devem usar respostas controladas para não depender da disponibilidade real do repositório.

Essa política verifica a URL e a acessibilidade; não importa o acervo nem substitui o LUME como referência institucional.

## Anexos e limites

| Tipo      | Limite por TCC                            | Validação implementada                                                                                         |
| --------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Tags      | De 1 a 5 na publicação; até 5 no rascunho | Identificadores existentes, sem duplicatas; novas tags podem ser criadas pela operação autenticada.            |
| Imagens   | De 0 a 3, até 5 MiB cada                  | PNG, JPEG ou WebP pelo conteúdo decodificado; limite de 16 milhões de pixels; descrição de até 300 caracteres. |
| Documento | De 0 a 1, até 25 MiB                      | PDF, DOCX ou EPUB; formato detectado pelo conteúdo, não apenas pelo nome ou MIME informado.                    |

PDF é examinado por cabeçalho, marcadores de objeto e encerramento. DOCX e EPUB são examinados como pacotes ZIP, sem extração de arquivos em disco, com verificação das entradas e estruturas esperadas. O leitor limita a mil entradas, 25 MiB por entrada e 100 MiB expandidos no total; rejeita nomes inseguros/repetidos, corrupção e estruturas não suportadas, como ZIP64. XML com declarações externas não é aceito.

Cada upload recebe um identificador e uma chave de armazenamento gerados no servidor. Nome original e descrição são metadados. O comando de publicação recebe os identificadores de anexos, confirma que pertencem à conta e que não estão vinculados a outro TCC; o cliente não escolhe caminhos do disco ou do bucket.

`GET /api/attachments/:id` permite o autor ou a leitura de um anexo vinculado a PUBLICADO. Anexos de rascunho e uploads ainda não vinculados permanecem privados. Documentos são enviados como download, e as respostas usam `nosniff` e `private, no-store`. A prévia privada de imagem é obtida com credenciais, sem tornar o armazenamento publicamente listável.

## Persistência dos objetos e limpeza

Os metadados SQL e os binários são necessários em conjunto. O objeto é gravado antes de inserir seu registro; se a inserção falha, o serviço tenta desfazer a gravação do objeto. Vínculos de anexos e TCCs são alterados na mesma transação SQL. Remover uma seleção na interface não elimina diretamente um anexo ainda vinculado a um trabalho.

Não há transação distribuída entre PostgreSQL e o armazenamento de objetos. A operação de limpeza percorre os registros de anexos sem referência; ela não inventaria o bucket/disco para descobrir objetos que eventualmente ficaram sem metadados por interrupção do processo.

`npm run files:prune` executa limpeza manual de uploads sem vínculos e com mais de 24 horas. Antes da remoção, volta a conferir a referência e a idade sob bloqueio da linha, evitando remover um upload que foi vinculado durante a seleção dos candidatos. O comando não agenda uma automação recorrente. A API deve estar parada ao usar esse comando no mesmo diretório PGlite local.

## Configuração e execução

O guia de [desenvolvimento](DEVELOPMENT.md) descreve migrações, dados A-E e o modo de identidade local explícito. Na área do aluno, `#/novo-tcc` abre o cadastro; `#/editar-tcc/:id` carrega apenas um trabalho próprio. O perfil lista publicações e rascunhos com ações de edição/retomada.

Desenvolvimento/teste usa armazenamento em `.cache/uploads`, fora do Git e do build de Pages. Produção recusa o disco local. Para produção, configurar `STORAGE_DRIVER=s3`, endpoint HTTPS e bucket privado, região e credenciais de acesso exclusivamente no servidor. Sem armazenamento configurado, o envio autorizado responde HTTP 503, sem simular persistência.

O caso de exemplo CT01 mantém o período 2025/2, com uma data de defesa coerente com esse semestre. O conjunto A-E permanece fictício e é criado somente pelo comando explícito de carga local.

## Validação local

`npm run check` passou integralmente: lint e formatação, 52 testes de backend/domínio, migrações e persistência após reabertura, tipos e compilação, build estático e caminhos do Pages, 12 testes de navegador no artefato de produção e 30 no bundle isolado de acesso/editor. São 94 execuções aprovadas; os 28 cenários que requerem API configurada são omitidos no build sem API e executados no bundle isolado. Desktop e celular estão cobertos.

Os testes verificam CT01/CT02, URL/acessibilidade LUME, privacidade, autoria, CSRF, formatos/tamanhos, limites de ZIP, falhas de gravação, idempotência inclusive concorrente e edição inválida. A revisão também acrescentou regressões para JSON malformado e nomes Unicode longos de anexos. A auditoria das dependências de produção não apontou vulnerabilidades conhecidas nesta data.

O navegador foi exercitado também sem interceptação de API, com Fastify, PGlite migrado e arquivos reais em disco local: login do aluno, upload multipart PNG/PDF, publicação, leitura pública e download de bytes idênticos, edição inválida preservando a versão pública e rascunho privado retomado pelo perfil. Não houve erros de JavaScript nem overflow móvel. Apenas a resposta LUME foi controlada por injeção no harness de teste, fora do código/configuração de execução. Evidências locais ficam em `.cache/qa/m2/` e não são publicadas no Pages.

O CI mantém o artefato de produção separado do bundle de testes de autenticação/editor, que usa respostas de API controladas. Esse bundle não é enviado ao Pages. O build público sem API configurada continua informando a ausência da integração, sem disponibilizar o simulador local como login institucional.

## Limites concretos

- UFRGS, Render, Neon e R2/S3 de produção ainda exigem configuração/provisionamento e credenciais reais; esta implementação não comprova conexão com esses serviços.
- O frontend publicado no GitHub Pages não executa a API nem grava arquivos em seu build. Cadastro funcional de produção depende do backend, identidade, banco e armazenamento configurados.
- Os testes controlados do LUME verificam comportamento e recuperação de falhas; não demonstram disponibilidade contínua do serviço externo.
- Feed, leitura e busca completos na interface permanecem em M3. Metadados e consultas SQL disponíveis não significam que essas telas já foram entregues.
- As limitações de sessão entre sites descritas em [DELIVERY_M1.md](DELIVERY_M1.md) continuam aplicáveis à configuração do backend externo.

## Commits por responsabilidade

- `44fa64b`: política e acessibilidade do LUME.
- `6aedda1`: validação, armazenamento e configuração dos anexos.
- `dfaa422`: publicação, rascunhos, edição e vínculos transacionais, com testes de API.
- `6b2690c`: editor, anexos e lista privada de trabalhos na interface.
- `1df2bf5`: fluxos de navegador e integração ao CI.
- `6dc0d46`: documentação da entrega e dos resultados locais.

O registro de entrega e o plano são versionados em commit de documentação separado.

## Evidência remota

- Revisão de implementação/documentação verificada: `6dc0d4634e1d01236bb8c57ae2796f6f029b9fe3`.
- [CI bem-sucedido](https://github.com/vitorsfeijo/Substcck/actions/runs/40664150959).
- [Deploy Pages e checagem pós-deploy bem-sucedidos](https://github.com/vitorsfeijo/Substcck/actions/runs/40664151074).
- [Site publicado](https://vitorsfeijo.github.io/Substcck/), conferido também no navegador: texto da terceira entrega, recarregamento por hash, redirecionamento da ação protegida, ausência de personas locais em produção e apresentação móvel sem overflow ou recursos ausentes.

O fechamento documental é um commit posterior, sem mudança de comportamento da aplicação. A publicação do frontend não comprova o provisionamento dos serviços externos nem a integração institucional real.
