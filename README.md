# Substcck

Proposta de plataforma mobile/web para divulgar, buscar e relacionar TCCs do Instituto de Informática da UFRGS, com resumos acessíveis, imagens e classificação por tags e áreas.

**Site:** [vitorsfeijo.github.io/Substcck](https://vitorsfeijo.github.io/Substcck/).

**Status:** M0 publicado; M1 em validação final, com autenticação configurável, perfis e domínio persistente. Cadastro/publicação e busca na interface continuam nos próximos marcos. A renomeação do repositório e da URL para `Substcck` integra esta entrega e aguarda confirmação do deploy.

**Stack:** React + TypeScript + Vite; API Node.js/Fastify; PostgreSQL. Frontend no GitHub Pages, com CI/CD pelo GitHub Actions. Backend de produção ainda não provisionado.

## Executar localmente

Com Node.js 24, na raiz do projeto:

```sh
npm ci
npm run db:migrate
npm run dev
```

Abra `http://127.0.0.1:5173/Substcck/`. Para validar: `npx playwright install chromium` e `npm run check`.

## Documentação

- [Especificação](docs/SPEC.md): requisitos, fluxos, diagramas e testes extraídos do desafio.
- [Plano de implementação](docs/IMPLEMENTATION_PLAN.md): 60 tarefas com dependências e critérios de conclusão, incluindo CI/CD e publicação.
- [Entrega M1](docs/DELIVERY_M1.md): escopo implementado, validação e limites da integração institucional.
- [Desafio original](docs/references/Desafio_Engenharia_Software.pdf): documento de referência.
- [Imagens da especificação](docs/images/spec): figuras e diagramas extraídos do PDF.
- [Desenvolvimento](docs/DEVELOPMENT.md), [decisões](docs/DECISIONS.md), [rastreabilidade](docs/TRACEABILITY.md) e [publicação](docs/DEPLOYMENT.md).

O banco local roda no servidor, com PGlite; dados e credenciais não são incorporados ao site.

O código está em `web/` e `server/`; configurações em `config/`, infraestrutura em `infra/` e documentação em `docs/`. Arquivos gerados ficam em `.cache/`.
