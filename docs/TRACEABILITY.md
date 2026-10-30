# Rastreabilidade de requisitos e entregas

Este registro atende T01 do [plano de implementação](IMPLEMENTATION_PLAN.md). Os identificadores RF, US, UC e CT vêm da [especificação](SPEC.md); GH01-GH11 são os requisitos adicionais de GitHub Pages/Actions definidos pelo usuário. As [decisões iniciais](DECISIONS.md) resolvem os contratos de T02-T05.

As relações abaixo indicam onde cada requisito será entregue e como será verificado. Não são uma declaração antecipada de que o recurso já funciona. M0 cobre T01-T13; o checklist do plano e o registro de evidências de execução devem indicar a conclusão real de cada tarefa.

M1, correspondente a T14-T22, foi entregue com testes e CI/CD bem-sucedidos. Seu escopo, evidências e dependências externas estão em [DELIVERY_M1.md](DELIVERY_M1.md). Identidade local simulada e provedor OIDC controlado nos testes não representam conexão institucional real com a UFRGS.

M2, correspondente a T23-T35, tem os fluxos de publicação, rascunho, edição e anexos implementados e está em validação final. O escopo e o fechamento remoto estão em [DELIVERY_M2.md](DELIVERY_M2.md); essa implementação não atesta disponibilidade real do LUME nem provisionamento dos serviços externos de produção.

## 1. Requisitos funcionais, histórias e casos de uso

| Origem                   | Comportamento esperado                                                                     | Contrato definido em M0                                                                                    | Implementação principal  | Evidência prevista                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| RF#01 / US#01 / UC01     | Autor cadastra TCC com resumo acessível, tags, metadados e anexos; publica após validação. | Matriz de campos/estados, autoria e uploads em DECISIONS, seções 3-5.                                      | T18-T35, marcos M1/M2.   | CT01, obrigatórios e limites de tags/mídias/arquivo.                                      |
| RF#01 / UC02             | Autor edita o próprio trabalho.                                                            | Edição de publicado é atômica; revalidação inválida preserva versão pública anterior.                      | T16, T20, T24 e T35.     | Edição autorizada, tentativa de outro usuário e falha LUME sem sobrescrita parcial.       |
| UC03                     | Validar integridade/acessibilidade do link LUME no cadastro e edição.                      | HTTPS, host exato, timeout de 5 segundos e redirecionamentos limitados ao host.                            | T23-T26.                 | Link válido, domínio incorreto, link quebrado, timeout e redirect indevido.               |
| RF#02                    | Feed inicial de defendidos recentes e tópicos em alta.                                     | Data de defesa e ranking por eventos em janela de 30 dias, decisões de projeto.                            | T39-T41, marco M3.       | Ordenação conhecida, ranking no período e exclusão de rascunhos.                          |
| US#04 / UC04             | Pesquisar autor/orientando, filtrar simultaneamente, selecionar TCC e obter documento.     | Filtros separados e combinados por AND; tags múltiplas por AND; arquivo opcional tratado por link oficial. | T38 e T42-T46, marco M3. | CT03 e variação sem resultados; download/falha e consulta por autor.                      |
| UC05                     | Ler detalhe com conteúdo e projeto apresentados pelo autor.                                | DTO completo e visibilidade somente de publicados para terceiros.                                          | T36-T38.                 | Navegação do resultado à leitura, metadados/anexos corretos e ID de rascunho inacessível. |
| UC06                     | Explorar trabalhos conexos a partir dos detalhes.                                          | Não apresentar algoritmo ainda indefinido como implementado.                                               | T47-T49, marco M4.       | Conjunto de exemplo com ordenação e exclusão do próprio trabalho/rascunhos.               |
| Feature: tags e áreas    | Classificar e consultar trabalhos por assunto/área.                                        | Tag pode pertencer a uma área; coleção é classificação independente.                                       | T19, T32 e T44.          | Tags sugeridas/novas e filtros funcionais com dados conhecidos.                           |
| Feature: busca semântica | Encontrar trabalhos por significado.                                                       | Deve ter avaliação própria; busca textual/tags não é rotulada como semântica.                              | T50-T52, marco M4.       | Consultas de avaliação e preservação obrigatória dos filtros.                             |

A fonte associa UC04, US#04 e CT03 a RF#02, embora a sentença de RF#02 descreva o feed. Essa associação é preservada, e as duas famílias de comportamento recebem implementação e evidência próprias.

## 2. Regras transversais de acesso e privacidade

| Regra de SPEC.md                               | Responsabilidade                                                                                 | Implementação            | Verificação                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| RN01/RN02: escrita institucional e autoria     | Adaptador de identidade, service e controller; não confiar em papel/autor enviados pelo cliente. | T14-T17 e T35.           | Visitante e outro usuário não escrevem/alteram TCC alheio; integração simulada nunca habilita escrita real em produção. |
| RN04-RN08: tags, mídias, arquivo e professores | Domínio, validação de entrada e armazenamento.                                                   | T18-T20 e T27-T32.       | Limites 5/6 tags e 3/4 imagens; três formatos de arquivo; coorientador opcional.                                        |
| RN09-RN11: estados e preservação de dados      | Service/repository e estado de formulário.                                                       | T20-T21 e T25-T35.       | CT02, recusa de rascunho e manutenção dos dados após erro.                                                              |
| RN10: rascunho privado                         | Repository/API e autorização de anexos.                                                          | T16, T21, T26-T30 e T55. | Tentativa por ID conhecido não entrega detalhe, arquivo ou mídia; exclusão de feed/busca/conexões.                      |
| RN12: filtros simultâneos                      | Query/repository.                                                                                | T42-T46.                 | Somente A é retornado no cenário CT03.                                                                                  |
| RN13/RN14: descoberta/indexação                | Service de publicação, feed e índice.                                                            | T25, T35, T39-T41 e T51. | Publicação/edição atualiza consulta; rascunho nunca entra no índice público.                                            |

## 3. Casos de teste originais

| Caso | Dados e resultado preservados                                                                                                                                                                           | Entrega e regressão                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| CT01 | “Detecção de anomalias em redes veiculares”, 2025/2, Prof. Carlos Lima, tags Redes/IA/Segurança, 2 PNG e URL LUME válida; status PUBLICADO, mensagem de sucesso, presente no feed e em busca por Redes. | T33 e T57; suporte de API em T25.                           |
| CT02 | Mesmo cadastro com `http://exemplo.com/tcc-123`; aviso de LUME, confirmação RASCUNHO, dados mantidos e ausência do catálogo público; recusa retorna ao formulário preservado.                           | T26, T34 e T57.                                             |
| CT03 | Base A-E original; Ano 2025 + Carlos Lima + Redes retorna somente A, excluindo E em rascunho; Ano 2023 + Redes retorna mensagem de nenhum resultado.                                                    | Dados em T22, consulta/interface em T46 e regressão em T57. |

Esses casos não devem ser marcados como concluídos por testes apenas da saúde da API ou da persistência técnica de M0. O CT01 usa período de 2025; a decisão posterior de registrar data de defesa deve manter uma fixture coerente com esse período.

## 4. Infraestrutura e publicação no GitHub

| Requisito adicional | Responsabilidade/contrato                                                   | Tarefas                             | Evidência necessária                                                               |
| ------------------- | --------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| GH01                | Instalação reproduzível, lint, tipos/compilação, testes e build em PR/push. | T09/T11.                            | Execução do CI para a revisão correspondente.                                      |
| GH02                | Deploy condicionado ao sucesso da validação da mesma revisão.               | T11/T12.                            | Falha de validação impede publicação; artefato identifica o commit correto.        |
| GH03                | Prefixo de projeto e URLs suportadas funcionam.                             | T10/T13.                            | Servir sob `/Substcck/`, abrir/recarregar rotas e carregar CSS/JS/imagens.         |
| GH04                | PR não publica nem recebe segredos de produção.                             | T11/T12.                            | Eventos/permissões/condições dos workflows e execução de PR.                       |
| GH05                | Push validado da principal publica; disparo manual controlado.              | T12/T13.                            | Deploy efetivo de revisão autorizada.                                              |
| GH06                | Ambiente `github-pages` e permissões mínimas.                               | T12.                                | Workflow com identidade temporária e sem token pessoal no bundle.                  |
| GH07                | Somente saída estática pertence ao artefato.                                | T10/T12.                            | Inspeção do artefato e ausência de segredos/configuração privada.                  |
| GH08                | Origem de publicação Actions e prefixo real.                                | T10/T13.                            | Configuração do repositório e site em URL confirmada.                              |
| GH09                | Callbacks de identidade e origem API no endereço real.                      | T03/T07 e implementação futura T15. | Login real completo após integração institucional, além de CORS/URLs configurados. |
| GH10                | Verificação pós-deploy e fluxos integrados.                                 | T13 e T60.                          | M0 confirma frontend mínimo; M5 confirma os fluxos de negócio no ambiente real.    |
| GH11                | Reversão de código e novo deploy validado; banco tratado separadamente.     | T59/T60.                            | Procedimento documentado e evidência de recuperação apropriada à entrega.          |

## 5. Evidência mínima do primeiro marco

| Tarefas M0 | Artefato/resultado esperado                                 | Como demonstrar                                                                                                             |
| ---------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| T01        | Este registro.                                              | Todas as famílias RF/US/UC/CT/GH possuem destino e evidência.                                                               |
| T02-T05    | DECISIONS.md.                                               | Stack/destinos, matriz de acesso/campos e contratos LUME/feed/filtros explícitos.                                           |
| T06-T07    | Frontend/API e configuração separados por responsabilidade. | Inicialização local e comunicação frontend → API de saúde; ausência de segredos no build.                                   |
| T08        | Migração versionada e adaptador persistente.                | Inicializar banco limpo, gravar/ler prova controlada, reiniciar e confirmar persistência. Execução local não comprova Neon. |
| T09        | Comandos de verificação.                                    | Registrar resultados reais de lint, tipos/compilação, testes e build.                                                       |
| T10        | Build estático compatível com o prefixo.                    | Abrir artefato servido no caminho de projeto e recarregar uma rota em hash.                                                 |
| T11-T12    | Workflows CI/deploy.                                        | Validar estrutura e executar pipeline; não confundir YAML existente com CI remoto bem-sucedido.                             |
| T13        | Primeira publicação no Pages.                               | URL efetiva e execução de deploy bem-sucedida. Sem acesso externo, registrar pendência concreta e manter a tarefa aberta.   |

## 6. Dependências externas a distinguir

- **Publicação GitHub:** acesso ao repositório, Actions/Pages habilitados e permissão para configurar/publicar. Arquivos locais não provam essas condições.
- **Backend/banco/arquivos de produção:** Render, Neon e R2 são destinos decididos; a conclusão de provisionamento exige credenciais/configuração e evidência própria. PGlite local não é banco compartilhado de produção.
- **UFRGS:** contrato de adaptador pode ser definido em M0; integração real depende de informações institucionais que não constam no PDF.
- **LUME:** testes controlados comprovam o tratamento de estados; checagem do serviço real é evidência adicional da integração, sujeita à disponibilidade externa.

A existência dessas dependências não retira o comportamento do escopo. O registro de entrega deve indicar quais foram satisfeitas e quais continuam pendentes, sem marcar um requisito de negócio completo por uma simulação ou pela conclusão de M0.

## 7. Evidência de M2

| Tarefas     | Requisitos/casos relacionados          | Implementação a verificar                                                                                                                 |
| ----------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| T23-T24     | UC03; RF#01; UC01/UC02                 | Política de URL e acessibilidade LUME, redirecionamentos e prazo total, sem depender da rede externa nos testes de regressão.             |
| T25-T26     | RF#01; US#01; UC01; CT01/CT02          | Publicação autenticada, campos obrigatórios, idempotência de criação, aviso LUME e salvamento explícito de rascunho privado.              |
| T27-T30     | RF#01; US#01; RN06/RN07                | Binários e metadados vinculados por IDs do autor, formatos/tamanhos/quantidades, acesso privado e recuperação de falha/limpeza de órfãos. |
| T31-T34     | US#01; UC01 e alternativas; CT01/CT02  | Formulário com orientação, período/data, tags, imagens/documento e dados mantidos quando o usuário corrige ou recusa rascunho.            |
| T35         | RF#01; UC02; RN02/RN11                 | Edição do próprio trabalho, revalidação e gravação atômica sem substituir publicação válida por uma edição inválida.                      |
| CI/CD de M2 | GH01-GH08/GH10, no recorte do frontend | Verificações da revisão enviada, bundle de teste separado do artefato público e confirmação do deploy antes de fechar o marco.            |

CT01 e CT02 foram exercitados pela API e pela interface com respostas controladas do LUME. As 94 execuções aprovadas, o percurso com API/banco/arquivos locais reais e os resultados de CI/deploy estão registrados em [DELIVERY_M2.md](DELIVERY_M2.md), com as limitações dos serviços externos explícitas. A integração de leitura/feed/busca completa na interface permanece em M3.

## 8. Evidência de M3

| Tarefas     | Requisitos/casos relacionados          | Implementação a verificar                                                                                                                                 |
| ----------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T36-T37     | RF#01; RF#02; US#04; UC04/UC05         | Detalhe público completo, rascunho inacessível, leitura responsiva e retorno ao feed/consulta preservada.                                                 |
| T38         | UC04 FA02; D05                         | Download com nome/formato corretos, falha recuperável e link LUME explícito quando não há anexo.                                                          |
| T39-T41     | RF#02; RN13; D07/D13                   | Recentes por defesa/publicação/ID; eventos UTC e ranking dos últimos 30 dias; deduplicação em 30 minutos e cards com estados de carregamento/vazio/falha. |
| T42-T44     | US#04; UC04; RN12; D10                 | Texto normalizado, autor/orientador independentes, AND entre dimensões/tags, OR entre áreas e coleção funcional.                                          |
| T45-T46     | US#04; UC04 FA01; CT03                 | Critérios e paginação na URL, resultados em feed, cenário A-E e consulta 2023 + Redes vazia com mensagem exata.                                           |
| CI/CD de M3 | GH01-GH08/GH10, no recorte do frontend | Regressão dos marcos anteriores, bundle de teste separado e confirmação de publicação da revisão validada.                                                |

As implementações e os contratos estão descritos em [DELIVERY_M3.md](DELIVERY_M3.md), com 119 execuções de testes aprovadas, percurso integrado com API/SQL/arquivos locais reais e evidências de CI/deploy. Testes locais/controlados não atestam os serviços externos. Busca semântica e conexões permanecem em T47-T52.

## 9. Evidência de M4

| Tarefas     | Requisitos/casos relacionados    | Implementação a verificar                                                                                      |
| ----------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| T47-T48     | UC06; classificação; D09         | Pontuação de tags/áreas, limite e desempates definidos; consulta só de publicados, sem origem/rascunhos.       |
| T49         | UC05 com extensão UC06           | Conexões na leitura, justificativa por temas compartilhados, navegação e estados vazio/erro recuperável.       |
| T50         | Busca semântica; D08             | LSA local, corpus/campos, limites, alternativa textual e avaliação versionada sem atribuir o algoritmo ao PDF. |
| T51         | RN10/RN14; publicação/edição     | Termos e hash atualizados atomicamente, remoção de privados, cache por fingerprint e reconstrução recuperável. |
| T52         | Busca semântica; filtros de UC04 | Consulta por significado com filtros obrigatórios e paginação, modo na URL e alternativa textual explícita.    |
| CI/CD de M4 | GH01-GH08/GH10                   | Regressão anterior, avaliação semântica e interface desktop/celular, com publicação da revisão validada.       |

O desenho está em [SEARCH_DESIGN.md](SEARCH_DESIGN.md) e a implementação está descrita em [DELIVERY_M4.md](DELIVERY_M4.md), com 159 execuções de testes aprovadas, 3/3 alvos da avaliação semântica, percurso com API/SQL locais reais e evidências de CI/deploy. As respostas controladas de UI não demonstram relevância semântica; os exemplos sintéticos não atestam qualidade sobre qualquer acervo real. A integração externa de produção permanece distinta dessas verificações.

## 10. Revisão de M5

T53/T54: regressões de teclado/foco, contraste e recuperação de upload/LUME, em desktop e celular. T55: matriz HTTP de visitante, autor, outro aluno e professor cobrindo detalhe, feed, buscas, conexões, métricas e anexos privados. T56: limites e erros de requisição, medição com 205 trabalhos fictícios e planos SQL. T57/T58: CT01-CT03 e download PDF/DOCX/EPUB com aplicação local integrada, sem interceptação da API no navegador. T59: configuração, demonstração e recuperação em [OPERATIONS.md](OPERATIONS.md).

[DELIVERY_M5.md](DELIVERY_M5.md) registra resultados locais e remotos. O checker pós-deploy confere a API configurada, mas T60 continua aberta até provisionamento e percurso real de visitante/autor, persistência e arquivos em produção. Docker/PostgreSQL local não comprova Neon, R2 ou UFRGS.
