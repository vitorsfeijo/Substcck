# Busca por significado e trabalhos conexos - M4

Estas regras resolvem D08 e D09 de [DECISIONS.md](DECISIONS.md). São decisões do projeto; o PDF não define algoritmos, pontuações ou um provedor de IA.

## Trabalhos conexos

Somente trabalhos PUBLICADO participam. O próprio trabalho é excluído. Um candidato precisa compartilhar ao menos uma tag ou área distinta com a origem. A pontuação é `4 × tags em comum + áreas distintas em comum`. Até quatro resultados são ordenados por pontuação decrescente, data de defesa decrescente, publicação decrescente e ID. Áreas repetidas por tags diferentes contam uma vez.

Exemplo: um candidato com uma tag e uma área comum soma 5; outro com apenas a área soma 1. O primeiro vem antes. Mesmo autor, popularidade e coincidência de palavras não criam uma conexão. Origem privada/inexistente retorna 404; origem sem relação retorna lista vazia. A interface explica os temas em comum, sem apresentar a pontuação como probabilidade.

## Busca por significado

A técnica adotada é análise semântica latente (LSA): vetores TF-IDF de documentos, decomposição truncada e projeção de consulta e documentos no mesmo espaço, com similaridade por cosseno. As relações são aprendidas por coocorrência no próprio corpus. Não há dicionário de sinônimos ou filtro por tags disfarçado de busca semântica.

O corpus contém apenas título, resumo, nomes de tags, áreas e coleção de trabalhos publicados. Título tem peso 3, resumo 1, tags 2, áreas 1 e coleção 1. Nomes de autores/orientadores continuam disponíveis na busca textual e nos filtros estruturados; não compõem o vetor de significado. Caixa, acentos e palavras funcionais portuguesas são normalizados.

O mecanismo roda na API, sem serviço externo, credenciais, cobrança por consulta ou envio do corpus a terceiros. Não é um modelo de linguagem previamente treinado e não promete compreender vocabulário ausente do acervo. A qualidade depende da diversidade e das relações presentes no corpus.

### Contrato e filtros

- Texto permanece padrão em `GET /api/tccs`.
- `GET /api/search?mode=semantic&term=...` aceita os mesmos filtros, página e tamanho da busca textual.
- Filtros de ano, semestre, defesa, autor, orientador, tags, áreas e coleção continuam obrigatórios. O termo é usado para significado, sem exigir sua presença literal no resultado.
- O treinamento considera o corpus público completo; as restrições são aplicadas antes da paginação dos resultados. Pontuação ordena primeiro; empates usam defesa, publicação e ID.
- A resposta mantém `items`, `total`, `page`, `pageSize` e acrescenta `search`, informando modo solicitado, modo efetivo e motivo de eventual alternativa textual.

O modelo é limitado a 512 documentos, vocabulário de 10.000 termos e oito dimensões, reduzidas conforme o tamanho/rank do corpus. Há limite de iterações e prazo de treinamento de dois segundos. Esses limites são operacionais do mecanismo inicial, não requisitos do PDF. Acima do limite, com corpus insuficiente, vocabulário desconhecido ou falha de índice/modelo, a API usa a pesquisa textual com os mesmos filtros e informa a alternativa explicitamente. Nunca retorna vetores de rascunhos nem usa um modelo antigo silenciosamente.

### Persistência e recuperação

Termos ponderados e hash da fonte são persistidos no PostgreSQL. Publicação/edição e atualização dessa representação usam a mesma transação: uma falha mantém a versão anterior íntegra. Rascunhos são removidos da representação pública; exclusão do TCC elimina a referência. O cache do modelo depende da revisão do corpus, nunca apenas de um prazo.

Um comando de reconstrução recalcula a representação a partir dos publicados e serve para migração/recuperação. A inicialização prepara os registros existentes. A consulta verifica a integridade e a visibilidade antes de reutilizar o modelo. Alterações manuais fora do fluxo da aplicação exigem reconstrução.

### Avaliação antes de concluir a entrega

O conjunto versionado em `server/semantic/evaluation.ts` contém nove documentos fictícios em três grupos. `npm run search:evaluate` verifica cada consulta abaixo: alvo entre os três primeiros, os três resultados no grupo correto e nenhum token direto da consulta na representação do alvo.

| Consulta               | Alvo relevante          | Ponte aprendida no corpus                           |
| ---------------------- | ----------------------- | --------------------------------------------------- |
| `proteção privacidade` | Criptografia hospitalar | Sigilo, prontuários, anonimização e dados clínicos. |
| `automóveis`           | Roteamento veicular     | Mobilidade, rotas, tráfego e redes veiculares.      |
| `colheita`             | Irrigação agrícola      | Agricultura, solo, água e sensores.                 |

A regressão de API deve demonstrar que a busca textual não encontra o alvo sem tokens diretos. Também deve verificar consulta irrelevante, caixa/acentos, estabilidade, filtros combinados, paginação, exclusão de rascunhos e atualização após edição. O limiar inicial é cosseno de 0,3. O número de dimensões é reduzido para ser estritamente menor que o rank observado, mantendo ao menos duas dimensões. Rank inferior a três fica indisponível, pois uma única dimensão colapsaria a distinção entre temas.

Antes de normalizar os vetores latentes, exige-se proporção mínima de energia projetada de `1e-6`. Documentos sem sinal suficiente não são classificados; consultas sem representação suficiente usam a alternativa textual. O corte evita transformar resíduo numérico em similaridade alta ao editar um trabalho para um tema fora do subespaço. Essa edição é coberta por regressões do núcleo e da API.

Limiares e dimensões serão conferidos com os resultados efetivos desse conjunto. O registro de entrega deve informar os casos aprovados e os limites observados; exemplos sintéticos não substituem avaliação de relevância por usuários sobre um acervo real.

## Referências da técnica

- [Stanford: latent semantic indexing](https://nlp.stanford.edu/IR-book/html/htmledition/latent-semantic-indexing-1.html).
- [scikit-learn: análise semântica latente por SVD truncada](https://scikit-learn.org/stable/modules/decomposition.html#lsa).

As referências fundamentam a técnica; a implementação TypeScript é local e não depende dessas bibliotecas.
