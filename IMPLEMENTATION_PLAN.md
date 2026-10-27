# Plano de implementação

## 1. Base, escopo e modo de execução

Este plano deriva de [SPEC.md](SPEC.md) e do [PDF original renomeado](Desafio_Engenharia_Software.pdf). Os diagramas e as referências visuais estão em [images/spec](images/spec/).

O objetivo é implementar a plataforma de divulgação, leitura, busca e relacionamento de TCCs do INF-UFRGS, cobrindo cadastro e edição, autenticação institucional, classificação, arquivos e imagens, feed, filtros, busca semântica e trabalhos conexos.

O PDF aprofunda RF#01 e RF#02; recursos apenas anunciados também aparecem neste plano, com etapas de definição antes da implementação. As escolhas propostas aqui são de execução e não passam a ser exigências atribuídas ao PDF.

**Direção adicional definida pelo usuário:** entregar o site responsivo no **GitHub Pages**, com **GitHub Actions** para CI/CD, conforme a seção 16 de `SPEC.md`. O frontend terá build estático; backend, autenticação, banco e arquivos compartilhados funcionarão em serviços externos. O provedor desses serviços permanece a definir. O Pages e o Actions não substituem um backend em execução.

**Estado atual:** T01-T12 implementadas e verificadas localmente. T13 aguarda confirmação da primeira publicação no Pages. Veja [a entrega M0](docs/DELIVERY_M0.md) para evidências e limites; T14 em diante permanecem pendentes.

### Regras para manter as entregas pequenas

- Executar uma tarefa numerada por vez e registrar sua conclusão; cada tarefa deve produzir um resultado revisável, preferencialmente em um commit.
- Respeitar as dependências indicadas. Não adicionar recursos de uma fase posterior a uma tarefa anterior apenas por conveniência.
- Registrar decisões pendentes D01 a D15 de `SPEC.md` em documento de decisões, indicando a solução adotada e a evidência de origem.
- Usar o fluxo de sucesso e os estados de falha do PDF como base da validação.
- Testar regras de domínio, acesso, integração, recuperação de falhas e fluxos reais. Evitar testes que apenas repitam getters, estrutura de arquivos ou implementação trivial.
- Simulações locais de UFRGS e LUME devem ser explícitas, isoladas por configuração e incapazes de ser habilitadas acidentalmente em produção.
- Não incluir chat, paywall, comentários, palmas, repostagens ou moderação como novas funcionalidades sem definição adicional de escopo.
- Manter o frontend compatível com o caminho de projeto do Pages e validar o build em pull requests; publicar apenas revisões aprovadas pelo CI da branch principal.
- Preservar persistência compartilhada e autorização no backend. Uma demonstração baseada apenas em armazenamento do navegador não conclui os fluxos multiusuário do projeto.

### Marcos de entrega

| Marco | Resultado demonstrável                                                                                       | Etapas |
| ----- | ------------------------------------------------------------------------------------------------------------ | ------ |
| M0    | Base técnica, contratos e CI/CD definidos; frontend mínimo publicado no Pages e aplicação inicia localmente. | 1-2    |
| M1    | Autenticação e domínio persistente com controle de acesso.                                                   | 3-4    |
| M2    | Autor publica, salva rascunho e edita o próprio TCC.                                                         | 5-7    |
| M3    | Visitante descobre, filtra, lê e baixa trabalhos publicados.                                                 | 8-9    |
| M4    | Relações e busca semântica com critérios definidos e verificados.                                            | 10     |
| M5    | Site publicado no Pages, com backend integrado e CI/CD verificado.                                           | 11-12  |

M2/M3 permitem uma demonstração incremental do núcleo detalhado no PDF. M4 permanece necessário para cobrir as funcionalidades gerais anunciadas; não está sendo removido do projeto.

## 2. Etapa 1 - Resolver contratos e decisões iniciais

**Objetivo:** converter as lacunas relevantes em decisões explícitas, sem criar requisitos silenciosos. Esta etapa não exige implementar a aplicação inteira.

### T01 - Registrar o recorte e a rastreabilidade

- [x] Criar um registro que vincule tarefas a RF#01, RF#02, US#01, US#04, UC01 a UC06 e CT01 a CT03.
- **Conclusão:** cadastro/edição, feed, busca, leitura, download e conexões têm responsáveis funcionais identificáveis; a associação original de busca a RF#02 está documentada.
- **Dependências:** documentação inicial disponível.

### T02 - Escolher stack compatível com GitHub Pages

- [x] Escolher frontend responsivo com saída estática para Pages e definir serviços externos de backend, autenticação, banco e armazenamento; registrar comandos de desenvolvimento e forma de provisionamento.
- **Conclusão:** stack atende ao Pages sem depender de servidor próprio nessa hospedagem; operações dinâmicas têm destino real definido e mantêm a intenção de separação controller/service/repository/model. A decisão não exige usar Java.
- **Dependências:** T01. **Lacunas:** D01.

### T03 - Definir acesso institucional e autoria

- [x] Identificar como integrar o login UFRGS, obter identidade e papel e verificar autoria. Definir callbacks no endereço do Pages e um adaptador local de desenvolvimento se o acesso real não estiver disponível.
- **Conclusão:** há contrato de autenticação e matriz de acesso: visitante consulta, aluno publica/edita o próprio trabalho; atribuições adicionais de professor não são inventadas.
- **Dependências:** T02. **Lacunas:** D02 e D13.

### T04 - Fechar matriz de campos, estados e uploads

- [x] Especificar campos obrigatórios para publicação e rascunho, limites de texto/arquivo, formatos de imagem e transições de edição/publicação.
- **Conclusão:** matriz preserva 1-5 tags na publicação, 0-3 imagens, 0-1 arquivo DOCX/PDF/EPUB e coorientador opcional; decide o efeito de uma edição inválida em TCC já publicado.
- **Dependências:** T01. **Lacunas:** D03, D06 e D15.

### T05 - Definir contratos externos e de descoberta

- [x] Registrar política de URL LUME, timeout/redirecionamentos, download sem anexo, campos de busca/coleção e dados temporais necessários ao feed.
- **Conclusão:** D04, D05, D07, D10 e D11 têm decisões iniciais suficientes para desenhar os contratos. Algoritmos semântico e de conexões podem ser refinados na etapa 10.
- **Dependências:** T02 e T04.

**Saída da etapa:** decisões iniciais e matriz de validação utilizáveis; nenhuma lacuna relevante é convertida em comportamento implícito.

## 3. Etapa 2 - Preparar uma aplicação mínima executável

### T06 - Criar o esqueleto de execução

- [x] Inicializar o frontend estático com uma página e uma operação mínima do backend externo escolhido, mantendo adaptadores locais quando necessários ao desenvolvimento.
- **Conclusão:** comando documentado inicia a aplicação localmente e gera artefato estático; frontend e backend conseguem se comunicar conforme a arquitetura escolhida.
- **Dependências:** T02.

### T07 - Separar módulos e configuração

- [x] Criar os limites de apresentação, negócio, dados e domínio, com configuração de ambiente para autenticação, LUME, banco e armazenamento; separar valores públicos do frontend dos segredos exclusivos do backend.
- **Conclusão:** segredos não são versionados nem incorporados ao bundle; há exemplo de configuração, origem Pages permitida na API e separação conforme a intenção do diagrama de pacotes.
- **Dependências:** T06.

### T08 - Configurar persistência e migrações

- [x] Conectar o banco escolhido e criar o mecanismo de versionamento de esquema, ainda com uma migração mínima.
- **Conclusão:** um ambiente limpo é inicializado por comando reproduzível e a aplicação consegue persistir e consultar dados.
- **Dependências:** T07.

### T09 - Preparar os comandos de verificação

- [x] Disponibilizar formatação/lint, verificação de tipos ou compilação e execução dos testes relevantes à stack.
- **Conclusão:** comandos documentados executam localmente; não é necessário preencher a suíte com testes de estrutura trivial.
- **Dependências:** T06.

### T10 - Ajustar build e navegação para Pages

- [x] Configurar URL base, caminhos de assets e navegação compatível com a hospedagem estática; para o remoto atual, validar o prefixo `/Subtccstack/`.
- **Conclusão:** artefato servido nesse prefixo carrega página, CSS, JavaScript e imagens; abertura direta e recarregamento das rotas suportadas funcionam sem servidor de aplicação no Pages.
- **Dependências:** T06 e T07. **Requisitos:** GH03 e GH08.

### T11 - Criar o workflow de integração contínua

- [x] Criar `.github/workflows/ci.yml` para pull requests e pushes na branch principal, executando instalação por lockfile, lint, tipos/compilação, testes existentes e build.
- **Conclusão:** uma revisão inválida falha; o artefato válido corresponde à revisão verificada. PRs não publicam no Pages nem recebem segredos de produção. Conferir disponibilidade do recurso de proteção antes de configurar checks obrigatórios na branch.
- **Dependências:** T09 e T10. **Requisitos:** GH01, GH02 e GH04.

### T12 - Criar o workflow de deploy do Pages

- [x] Criar `.github/workflows/deploy-pages.yml` com validação reutilizada do CI e deploy condicionado ao sucesso da mesma revisão da branch principal; usar ambiente `github-pages`, permissões mínimas e actions oficiais para configuração, upload e publicação.
- **Conclusão:** push válido publica somente a pasta de saída; falha do CI impede deploy e PR não publica. Execução manual aceita apenas a branch autorizada. A execução informa a URL publicada, sem expor segredos ou exigir token pessoal no frontend.
- **Dependências:** T11. **Requisitos:** GH02 e GH04-GH07.

### T13 - Habilitar Pages e verificar a primeira publicação

- [ ] Configurar Pages com origem GitHub Actions; publicar o frontend mínimo e verificar a URL, o prefixo e os assets após o deploy.
- **Conclusão:** primeira execução de CI/deploy é bem-sucedida e o frontend abre no endereço real. O site mínimo comprova a infraestrutura, ainda sem declarar os fluxos de negócio implementados.
- **Dependências:** T12. **Requisitos:** GH08 e GH10.

**Saída da etapa / M0:** projeto inicia de forma reproduzível, gera build estático e publica o frontend mínimo no Pages via Actions. Implementação local e workflows concluídos; a publicação é acompanhada em [DELIVERY_M0.md](docs/DELIVERY_M0.md).

## 4. Etapa 3 - Autenticação e autorização

### T14 - Persistir identidade e papéis

- [ ] Implementar identidade de usuário e dados de aluno/professor: nome, e-mail, login institucional e matrícula/departamento conforme o modelo.
- **Conclusão:** a aplicação relaciona o usuário local à identidade institucional sem depender de nomes enviados livremente pelo cliente para provar autoria.
- **Dependências:** T03 e T08.

### T15 - Implementar sessão e login

- [ ] Conectar o adaptador institucional e criar entrada/saída de sessão; se necessário, implementar o adaptador local explicitamente identificado.
- **Conclusão:** login válido estabelece sessão; falha não concede acesso; o modo usado é identificável. Registrar separadamente se a integração real ainda depender de acesso externo.
- **Dependências:** T07 e T14.

### T16 - Aplicar as permissões no servidor

- [ ] Centralizar a autorização de escrita e de autoria, distinguindo consulta pública e dados privados do autor.
- **Conclusão:** requisições diretas de visitante não escrevem dados; outro usuário não edita nem consulta rascunhos privados por conhecer o identificador.
- **Dependências:** T15.

### T17 - Criar navegação de perfil e proteger ações

- [ ] Exibir login/perfil e a ação “Cadastrar Novo TCC” para o papel autorizado, com saída de sessão.
- **Conclusão:** visitante navega publicamente e usuário autorizado alcança o cadastro; a proteção visual acompanha a autorização do servidor.
- **Dependências:** T16.

**Validação da etapa:** testar credencial/sessão inválida, acesso público permitido e escrita indevida negada.

## 5. Etapa 4 - Modelo de TCC e persistência

### T18 - Criar entidades e migração de TCC

- [ ] Modelar TCC, vínculo com autor, orientador/coorientador, ano/semestre, link, resumo, status e visualizações; incluir os dados temporais decididos para o feed.
- **Conclusão:** dados centrais persistem e os estados disponíveis são RASCUNHO e PUBLICADO; extensões temporais estão justificadas em D07.
- **Dependências:** T04, T05, T08 e T14.

### T19 - Modelar tags, áreas e coleções

- [ ] Persistir tags e associação às áreas; implementar a representação decidida para coleções e seus vínculos.
- **Conclusão:** o modelo atende classificação e todos os filtros de UC04; não deixa coleção apenas como um controle visual sem dados.
- **Dependências:** T05 e T18.

### T20 - Implementar regras de publicação no domínio

- [ ] Consolidar validações de campos e limites; representar transições de rascunho/publicação sem duplicar regras entre tela e servidor.
- **Conclusão:** ausência de obrigatórios e limites excedidos são rejeitados; rascunho segue a matriz definida em T04.
- **Dependências:** T18 e T19.

### T21 - Implementar repositórios de TCC e tags

- [ ] Criar operações de salvar, buscar por ID, consultar por filtros e recuperar tags; separar consultas públicas das consultas privadas do autor.
- **Conclusão:** persistência e leitura funcionam, e consultas públicas excluem rascunhos na própria camada de acesso a dados ou política equivalente.
- **Dependências:** T16, T18 e T19.

### T22 - Fechar DTOs e dados de demonstração

- [ ] Completar contratos de cadastro, detalhe, feed e filtro com mídias, arquivo, link, status, coorientador e coleções conforme necessário; criar dados A-E do CT03.
- **Conclusão:** contratos não perdem campos de RF#01; feed representa listas; cenário A-E pode ser carregado no ambiente de desenvolvimento/teste.
- **Dependências:** T20 e T21. **Lacunas:** D10, D11 e D14.

**Saída da etapa / M1:** domínio e persistência disponíveis com acesso controlado. Testes cobrem limites e exclusão de rascunhos, sem depender da interface.

## 6. Etapa 5 - Validação LUME e publicação

### T23 - Validar estrutura e domínio da URL

- [ ] Implementar a política de URLs decidida em T05 antes de qualquer consulta externa, com normalização e verificação do destino permitido.
- **Conclusão:** URL malformada, domínio indevido e tentativas de acessar destinos não permitidos são rejeitados; o link aceito continua associado ao TCC.
- **Dependências:** T05 e T20.

### T24 - Implementar checagem de acessibilidade LUME

- [ ] Criar `ValidadorLumeService` ou equivalente, com timeout, política de redirecionamento e respostas para sucesso/falha de rede.
- **Conclusão:** link válido, quebrado e servidor indisponível são distinguíveis para o serviço; testes usam respostas controladas, sem depender da disponibilidade real do LUME.
- **Dependências:** T07 e T23.

### T25 - Implementar serviço e operação de publicação

- [ ] Encadear autorização, validação de campos, validação LUME, persistência PUBLICADO e atualização da busca.
- **Conclusão:** publicação válida aparece em consulta pública com tags; erro não deixa publicação parcial visível; sucesso retorna o contrato completo e a mensagem de UC01.
- **Dependências:** T16, T20, T21, T22 e T24.

### T26 - Implementar salvamento explícito de rascunho

- [ ] Oferecer persistência RASCUNHO após falha LUME e confirmação do usuário, sem publicação automática.
- **Conclusão:** dados são preservados e isolados do feed, busca e acesso público por ID; recusar rascunho não grava uma publicação e permite manter o formulário.
- **Dependências:** T25.

**Validação da etapa:** exercitar o núcleo de CT01 e CT02 pela API/camada de aplicação, incluindo URL fora do LUME e indisponibilidade simulada.

## 7. Etapa 6 - Imagens e arquivo do trabalho

### T27 - Criar armazenamento e metadados de anexos

- [ ] Implementar armazenamento de mídias e do arquivo, com nome original, formato, caminho e descrição de mídia conforme o modelo.
- **Conclusão:** referências persistidas resolvem os arquivos correspondentes e respeitam o acesso ao TCC; rascunhos não expõem anexos publicamente.
- **Dependências:** T07, T18 e T21.

### T28 - Implementar envio de até três imagens

- [ ] Criar operação de upload com validação de conteúdo/formato/tamanho definidos em T04 e vínculo ao TCC do autor.
- **Conclusão:** 0 a 3 imagens são aceitas, uma quarta é recusada e envios de outro usuário não alteram o trabalho.
- **Dependências:** T16, T20 e T27.

### T29 - Implementar arquivo opcional DOCX/PDF/EPUB

- [ ] Criar envio e substituição de um único arquivo do trabalho, validando os formatos e limites acordados.
- **Conclusão:** cada formato permitido é aceito; formato indevido é rejeitado; ausência de arquivo continua permitida.
- **Dependências:** T16, T20 e T27.

### T30 - Integrar anexos à publicação e às falhas

- [ ] Associar anexos ao cadastro/rascunho e tratar remoção, substituição e falhas de gravação sem perder dados válidos ou deixar referências quebradas.
- **Conclusão:** falha de upload é recuperável; salvar/publicar preserva vínculos; a política de limpeza de arquivos sem referência está documentada e implementada conforme necessário.
- **Dependências:** T25, T26, T28 e T29.

**Saída da etapa:** cadastro suporta todos os anexos de RF#01; os limites são aplicados no servidor.

## 8. Etapa 7 - Formulário de cadastro, rascunhos e edição

### T31 - Construir os campos textuais do formulário

- [ ] Criar tela de “Cadastrar Novo TCC” com título, resumo simplificado, ano/semestre, orientador, coorientador e URL LUME.
- **Conclusão:** campos seguem a matriz de T04, com escrita limpa e layout utilizável em celular e desktop.
- **Dependências:** T17 e T22.

### T32 - Adicionar seleção/criação de tags e anexos

- [ ] Integrar sugestões e novas tags, classificação e controles de imagem/arquivo, incluindo prévia e remoção antes da publicação.
- **Conclusão:** seleção limita a 5 tags e 3 imagens; arquivo opcional é identificável; vínculos de área/coleção seguem o modelo decidido.
- **Dependências:** T19, T28, T29 e T31.

### T33 - Conectar publicação e erros obrigatórios

- [ ] Integrar “Publicar TCC”, estado de envio, sucesso e validação com destaque vermelho dos campos pendentes.
- **Conclusão:** CT01 completa o fluxo pela interface; UC01 FA01 preserva tudo que já foi preenchido e mostra “Preencha todos os campos obrigatórios”.
- **Dependências:** T25, T30 e T32.

### T34 - Conectar oferta de rascunho e retomada

- [ ] Exibir aviso completo de FA02 e ações de salvar/recusar; permitir ao autor localizar e retomar o rascunho salvo.
- **Conclusão:** CT02 funciona com confirmação e recusa; salvar mostra “Rascunho salvo com sucesso”; retomar recupera dados e anexos.
- **Dependências:** T26 e T33.

### T35 - Implementar edição do próprio TCC

- [ ] Reutilizar formulário e regras em UC02, incluindo revalidação LUME, atualização da busca e política de estados definida em T04.
- **Conclusão:** autor altera o próprio trabalho sem duplicá-lo; acesso indevido é negado; edição inválida tem comportamento explícito e preserva dados conforme a decisão registrada.
- **Dependências:** T21, T24, T33 e T34.

**Saída da etapa / M2:** demonstração de publicação, rascunho e edição com imagens e arquivo. Validar CT01, CT02, obrigatórios, limites e autoria.

## 9. Etapa 8 - Leitura, download e feed

### T36 - Implementar consulta pública de detalhes

- [ ] Expor metadados, resumo, autores/orientadores, tags, imagens, link LUME e disponibilidade de arquivo de um TCC publicado.
- **Conclusão:** UC05 lê todos os dados relevantes; ID de rascunho não entrega detalhe nem anexos a terceiros.
- **Dependências:** T21, T22 e T30.

### T37 - Construir a página de leitura

- [ ] Criar página de detalhe focada em leitura, com imagens e acesso ao documento oficial, mantendo navegação de volta à descoberta.
- **Conclusão:** clicar em um TCC abre conteúdo conforme US#04/UC04; layout é legível em celular e desktop, sem paywall.
- **Dependências:** T36.

### T38 - Implementar download e recuperação de erro

- [ ] Entregar o arquivo correto com nome/formato adequados e aplicar a decisão de T05 quando não houver anexo; conectar “Baixar Artigo”.
- **Conclusão:** arquivos publicados podem ser baixados; erro mostra a mensagem de UC04 FA02 e permite repetir; TCC sem anexo não apresenta ação quebrada.
- **Dependências:** T29, T36 e T37. **Lacuna:** D05.

### T39 - Implementar consulta de trabalhos recentes

- [ ] Recuperar apenas publicados, com ordenação e desempate conforme a definição de defesa/recência registrada em D07.
- **Conclusão:** um conjunto com datas/semestres diferentes retorna a ordem prevista e nunca inclui rascunhos.
- **Dependências:** T18, T21 e T25.

### T40 - Registrar exploração e calcular tópicos em alta

- [ ] Implementar os eventos/dados e a consulta por período definidos para popularidade; aproveitar `visualizacoes` quando pertinente sem pressupor que o contador total resolve uma janela temporal.
- **Conclusão:** janela e fórmula são documentadas; dados de exemplo produzem o ranking esperado e excluem rascunhos; não é necessário criar um painel analítico novo.
- **Dependências:** T05, T19 e T36. **Lacunas:** D07 e D13.

### T41 - Montar o feed inicial

- [ ] Integrar trabalhos recentes e tópicos em alta em cards visuais, com imagem quando disponível e acesso à leitura/filtro por tag.
- **Conclusão:** RF#02 é demonstrável; feed vazio, carregamento e erro têm estados utilizáveis; os trabalhos são visualmente separados.
- **Dependências:** T37, T39 e T40.

**Saída da etapa:** visitante descobre trabalhos, lê e baixa documentos; RF#02 possui feed e cálculo verificável de tópicos.

## 10. Etapa 9 - Busca textual e filtros combinados

### T42 - Implementar pesquisa textual básica

- [ ] Pesquisar os campos textuais definidos, incluindo a identificação do autor/orientando; registrar normalização e ordenação adotadas.
- **Conclusão:** termos retornam trabalhos publicados relevantes e o nome do orientando encontra seus trabalhos, conforme US#04.
- **Dependências:** T21 e T22.

### T43 - Implementar filtros de ano/data, autor e orientador

- [ ] Aplicar os filtros estruturados com interseção de condições e o recorte temporal definido.
- **Conclusão:** autor e orientador são critérios independentes; cada filtro reduz corretamente os resultados e pode ser combinado com o termo.
- **Dependências:** T05 e T42.

### T44 - Implementar filtros de tags, áreas e coleções

- [ ] Conectar classificação aos filtros restantes e à semântica de seleção múltipla definida em D10.
- **Conclusão:** nenhuma opção prevista é apenas decorativa; combinações distintas seguem a política registrada e excluem rascunhos.
- **Dependências:** T19 e T43.

### T45 - Construir a tela “Buscar TCC”

- [ ] Apresentar barra de pesquisa, controles de filtro e “Pesquisar”, retornando os resultados em feed e permitindo limpar/ajustar a consulta.
- **Conclusão:** seleção combinada é compreensível em celular e desktop e abrir resultado leva à página de leitura.
- **Dependências:** T37, T41 e T44.

### T46 - Tratar consulta vazia e validar CT03

- [ ] Integrar a mensagem exata de UC04 FA01; executar cenário A-E e a variação com ano 2023.
- **Conclusão:** 2025 + Carlos Lima + Redes retorna apenas A; 2023 + Redes retorna a mensagem e permite pesquisar novamente.
- **Dependências:** T22 e T45.

**Saída da etapa / M3:** fluxo completo UC04 demonstrável com filtros, detalhe e download, além de CT01 a CT03 disponíveis como regressão.

## 11. Etapa 10 - Trabalhos conexos e busca semântica

Estas funcionalidades constam no escopo geral do PDF, mas seus algoritmos não estão definidos. As tarefas de desenho abaixo estabelecem critérios antes de implementar; não presumem um provedor ou tecnologia de IA.

### T47 - Definir a regra de trabalhos conexos

- [ ] Escolher sinais, pontuação, limite e desempate para UC06; considerar tags/áreas compartilhadas como uma possibilidade compatível com `buscarPorTags`.
- **Conclusão:** exemplos de entrada e saída tornam a regra verificável; o próprio TCC e os rascunhos são excluídos; o algoritmo adotado está identificado como decisão do projeto.
- **Dependências:** T19 e T46. **Lacuna:** D09.

### T48 - Implementar a consulta de conexões

- [ ] Implementar `mapearTrabalhosConexos` e a operação de leitura correspondente.
- **Conclusão:** conjunto de trabalhos conhecido gera as conexões e a ordem de T47; ausência de conexão é tratada sem erro.
- **Dependências:** T47.

### T49 - Exibir conexões nos detalhes

- [ ] Inserir trabalhos relacionados na leitura, permitindo navegar entre eles conforme a extensão UC06 de UC05.
- **Conclusão:** usuário alcança outro TCC relacionado e continua a exploração; seção vazia não sugere relações inexistentes.
- **Dependências:** T37 e T48.

### T50 - Definir o contrato e a avaliação da busca semântica

- [ ] Definir corpus/campos, técnica, dependências, atualização de índice, comportamento com filtros e um conjunto de consultas para avaliação; decidir o uso de serviço externo apenas se necessário.
- **Conclusão:** existem exemplos de consultas por significado e resultados esperados, limites de custo/operação e comportamento em falha; a definição vai além de renomear a busca por palavra-chave.
- **Dependências:** T46. **Lacuna:** D08.

### T51 - Implementar a indexação semântica

- [ ] Criar e atualizar a representação escolhida ao publicar/editar, com reconstrução do índice e remoção de conteúdo que deixe de ser público.
- **Conclusão:** rascunhos não entram no corpus público; mudanças são refletidas; falhas de indexação têm recuperação definida.
- **Dependências:** T25, T35 e T50.

### T52 - Integrar consulta semântica com os filtros

- [ ] Executar o mecanismo escolhido e apresentar resultados mantendo todas as restrições estruturadas; aplicar o comportamento de fallback definido em T50.
- **Conclusão:** avaliação de T50 é executada, filtros continuam obrigatórios e indisponibilidade não expõe rascunhos nem impede recuperação da pesquisa.
- **Dependências:** T44, T45 e T51.

**Saída da etapa / M4:** UC06 e busca semântica implementados com decisões e evidências próprias, sem atribuir ao PDF critérios que ele não forneceu.

## 12. Etapa 11 - Revisar experiência e qualidade

### T53 - Revisar mobile/web e navegação por teclado

- [ ] Conferir cadastro, feed, filtros e leitura em tamanhos de celular e desktop; corrigir foco, rótulos, contraste e mensagens associadas aos campos.
- **Conclusão:** os fluxos principais são utilizáveis sem perda de informação nos dois contextos; erros não dependem somente da cor vermelha para serem compreendidos.
- **Dependências:** T35, T41, T46, T49 e T52.
- **Nota:** os critérios concretos de acessibilidade são decisões de qualidade; o PDF exige experiência acessível, sem especificar uma norma formal.

### T54 - Revisar estados de carregamento, vazio e falha

- [ ] Conferir consulta sem resultados, feed sem dados, upload interrompido, LUME indisponível, download com falha e recuperação da busca semântica.
- **Conclusão:** cada falha tem mensagem e próxima ação; dados de formulário são preservados nos caminhos especificados.
- **Dependências:** T53.

### T55 - Revisar acesso e publicação de dados

- [ ] Verificar autorização em operações diretas, propriedade dos TCCs/anexos e exclusão de rascunhos de detalhe, feed, busca textual/semântica, conexões e download.
- **Conclusão:** matriz de acesso de T03 é satisfeita em todos os pontos de entrada, incluindo tentativas por ID conhecido.
- **Dependências:** T52 e T54.

### T56 - Revisar consultas e operação básica

- [ ] Medir consultas em uma base de demonstração, ajustar índices/paginação conforme necessário e conferir limites de upload, timeout e recuperação de integrações.
- **Conclusão:** comportamento e limitações são documentados; critérios operacionais adotados estão separados das exigências originais, sem metas fictícias atribuídas ao PDF.
- **Dependências:** T54 e T55.

**Saída da etapa:** experiência revisada e riscos observados tratados, com evidência compatível com o porte do projeto.

## 13. Etapa 12 - Verificação final e entrega

### T57 - Consolidar regressão dos casos originais

- [ ] Executar CT01, CT02 e CT03 em ambiente controlado, incluindo recusa do rascunho e nenhum resultado; registrar dados e resultados.
- **Conclusão:** todos os resultados descritos no PDF são reproduzidos pela aplicação integrada, sem dependência de um link público instável para a suíte automatizada.
- **Dependências:** T56.

### T58 - Validar os fluxos não cobertos pelos três CTs

- [ ] Conferir obrigatórios ausentes, 5/6 tags, 3/4 imagens, coorientador opcional, três formatos de arquivo, edição/autoria, download com erro, feed, conexões e avaliação semântica.
- **Conclusão:** existem verificações relevantes para os limites e fluxos de risco; cenário somente com URL LUME segue D05.
- **Dependências:** T57.

### T59 - Documentar ambientes e recuperação de deploy

- [ ] Documentar configuração, migrações, dados de exemplo, comandos, armazenamento, callbacks/CORS no Pages e provisionamento/deploy do backend; preparar roteiro visitante/autor e procedimento de reversão de código seguido de novo deploy validado.
- **Conclusão:** outra pessoa consegue iniciar um ambiente limpo e demonstrar os marcos; ambientes reais e simulados estão diferenciados e a recuperação do frontend não presume desfazer automaticamente o banco.
- **Dependências:** T58.

### T60 - Publicar e validar a versão completa no Pages

- [ ] Atualizar decisões e matriz de tarefas; publicar a versão validada pelo workflow, com backend configurado; verificar a página inicial e os fluxos integrados após o deploy. Incluir uma verificação automática pós-deploy de disponibilidade e carregamento do frontend.
- **Conclusão:** registrar URL efetiva e execução bem-sucedida; verificar visitante, autor, persistência entre sessões/usuários autorizados, privacidade de rascunhos e anexos, filtros e download. Uma falha pós-deploy aparece no workflow; limitações institucionais reais permanecem explícitas. README aponta ao site publicado somente após confirmação da URL.
- **Dependências:** T13 e T59. **Requisitos:** GH09-GH11.

**Saída da etapa / M5:** site da aplicação publicado no GitHub Pages, integrado aos serviços externos e verificável via CI/CD. M0 está em execução conforme o registro de entrega; os marcos posteriores permanecem neste plano e não são considerados concluídos pela implementação da base.

## 14. Matriz de cobertura do plano

| Item da especificação                  | Tarefas principais        | Evidência prevista                                                                        |
| -------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| RF#01 / US#01 / UC01                   | T04, T18-T34              | CT01, CT02, obrigatórios e limites de tags/mídias/arquivo.                                |
| UC02 - Edição                          | T04, T16, T35             | Edição pelo autor, revalidação LUME e atualização da busca.                               |
| UC03 - LUME                            | T05, T23-T26              | URL válida, domínio incorreto, link quebrado e indisponibilidade.                         |
| RF#02 - Feed                           | T05, T39-T41              | Recentes e tópicos no período; ausência de rascunhos.                                     |
| US#04 / UC04                           | T42-T46, T38              | CT03, busca por autor/orientando, filtros simultâneos e download.                         |
| UC05 - Leitura                         | T36-T38                   | Detalhe público consistente e arquivo correto.                                            |
| Classificação por tags/áreas           | T19, T32, T44             | Associação e filtragem funcional, incluindo coleções de UC04.                             |
| UC06 - Conexões                        | T47-T49                   | Exemplos de conexões, ordem e exclusão do próprio TCC/rascunhos.                          |
| Busca semântica                        | T50-T52                   | Conjunto de avaliação por significado e filtros preservados.                              |
| Visitante e autenticação institucional | T03, T14-T17, T55         | Consulta livre e escrita institucional autorizada por autoria.                            |
| Diagramas de arquitetura               | T07, T18-T22, T23-T26     | Responsabilidades separadas e contratos completos.                                        |
| CT01 a CT03                            | T22, T33-T34, T46, T57    | Execução integrada com resultados registrados.                                            |
| Qualidade e entrega                    | T53-T60                   | Revisão mobile/web, falhas, acesso e ambiente reproduzível.                               |
| GH01-GH11 - Pages e Actions            | T02-T03, T06-T13, T59-T60 | Build estático, CI em PR/push, deploy validado, callback/origens, URL real e recuperação. |

## 15. Dependências externas a acompanhar

- **UFRGS:** integração real depende de informações e acesso ao mecanismo institucional. Adaptador local permite desenvolver, mas não comprova autenticação real em produção.
- **LUME:** validar o serviço real quando disponível; testes de regressão devem continuar determinísticos. A indisponibilidade deve oferecer o fluxo de rascunho previsto.
- **GitHub:** frontend será hospedado no Pages e publicado pelo Actions; habilitação e permissões de Pages/Actions do repositório precisam ser verificadas em T13. Configuração da branch principal deve concordar com os gatilhos dos workflows.
- **Backend, banco e arquivos:** provedor e credenciais dependem de T02; serviços são externos ao Pages e exigem provisionamento e política de acesso. Manter exemplos de ambiente sem segredos e registrar se o deploy desses serviços é manual ou automatizado separadamente.
- **Busca semântica:** se a técnica escolhida exigir modelo ou serviço externo, registrar disponibilidade, dados enviados, custo e alternativa antes da integração.

Uma dependência externa não resolvida deve aparecer na entrega como limitação concreta. Não marcar integração simulada como validação da integração real.

Referências de CI/CD: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [workflows personalizados de Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) e [configuração da origem de publicação](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
