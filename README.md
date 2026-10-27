# Subtccstack

Proposta de plataforma mobile/web para divulgar, buscar e relacionar TCCs do Instituto de Informática da UFRGS, com resumos acessíveis, imagens e classificação por tags e áreas.

**Site:** [vitorsfeijo.github.io/Subtccstack](https://vitorsfeijo.github.io/Subtccstack/).

**Status:** M0 concluído e publicado. Frontend responsivo, API de saúde, banco local persistente e CI/CD verificados. Cadastro, login e busca serão desenvolvidos nos próximos marcos.

**Stack:** React + TypeScript + Vite; API Node.js/Fastify; PostgreSQL. Frontend no GitHub Pages, com CI/CD pelo GitHub Actions. Backend de produção ainda não provisionado.

## Executar localmente

Com Node.js 24, na raiz do projeto:

```sh
npm ci
npm run db:migrate
npm run dev
```

Abra `http://127.0.0.1:5173/Subtccstack/`. Para validar: `npx playwright install chromium` e `npm run check`.

## Documentação

- [Especificação](SPEC.md): requisitos, fluxos, diagramas e testes extraídos do desafio.
- [Plano de implementação](IMPLEMENTATION_PLAN.md): 60 tarefas com dependências e critérios de conclusão, incluindo CI/CD e publicação.
- [Desafio original](Desafio_Engenharia_Software.pdf): documento de referência.
- [Imagens da especificação](images/spec/): figuras e diagramas extraídos do PDF.
- [Desenvolvimento](docs/DEVELOPMENT.md), [decisões](docs/DECISIONS.md), [rastreabilidade](docs/TRACEABILITY.md) e [publicação](docs/DEPLOYMENT.md).

O banco local roda no servidor, com PGlite; dados e credenciais não são incorporados ao site.
