# Entrega M0

## Escopo implementado

- T01-T05: decisões de stack/destinos, acesso, campos, estados, LUME, filtros/feed e rastreabilidade registradas em [DECISIONS.md](DECISIONS.md) e [TRACEABILITY.md](TRACEABILITY.md).
- T06-T08: frontend React/TypeScript, API Fastify de saúde com controller/service/repository/model, adaptadores PostgreSQL/PGlite e migração transacional com checksum.
- T09-T10: comandos de validação, artefato estático sob `/Substcck/`, navegação em hash e configuração pública separada.
- T11-T12: CI reutilizável em PR/push e deploy Pages condicionado à validação da mesma revisão, com permissões restritas e checagem pós-deploy.
- T13: GitHub Pages habilitado com origem Actions e HTTPS; primeira publicação confirmada.

## Publicação confirmada

- Site: [Subtccstack](https://vitorsfeijo.github.io/Substcck/).
- Revisão inicial: `19bb0c497aae59a416e47014362cbbb81f8774b3`.
- [CI inicial bem-sucedido](https://github.com/vitorsfeijo/Substcck/actions/runs/40576576470).
- [Deploy inicial e smoke check bem-sucedidos](https://github.com/vitorsfeijo/Substcck/actions/runs/40576576264).
- A URL pública foi conferida também fora do workflow: HTML, JavaScript e CSS disponíveis; interface renderizada e navegação/recarregamento por hash funcionando, sem exceções no navegador.

## Evidência local

Validação executada em 27/10/2026, com Node.js 24:

- ESLint, Prettier e TypeScript passaram.
- 5 testes de API/configuração/persistência/migração passaram.
- A revisão inclui normalização de finais de linha do SQL e arquivos de banco corretamente versionados para execução em Windows e Linux; a mesma validação passou no runner Linux do GitHub Actions.
- Prova de persistência gravou, fechou, reabriu e leu o banco local.
- Builds do frontend e backend passaram; artefato estático contém somente HTML, CSS e JavaScript esperados.
- 10 testes de navegador passaram: cinco cenários em desktop e celular, incluindo prefixo, hash/reload, foco/teclado e ausência de overflow.
- Comunicação real frontend → proxy → API → banco local conferida no navegador; layout inspecionado em capturas desktop e celular.
- Auditoria das dependências de produção não encontrou vulnerabilidades conhecidas na data da verificação.

## Limites desta entrega

O site mínimo apresenta a proposta e o catálogo ainda vazio. Não implementa cadastro, login, feed real, uploads nem busca; esses comportamentos continuam nos marcos seguintes. Nenhum TCC fictício é apresentado como dado real.

Backend/banco de produção e armazenamento externo têm destinos e arquivos de preparação definidos, mas não foram provisionados por falta de credenciais desses serviços. O site público não presume API online. A integração institucional UFRGS ainda depende de acesso e informações institucionais.

Ver [desenvolvimento](DEVELOPMENT.md) para reprodução local e [publicação](DEPLOYMENT.md) para CI/CD e recuperação.
