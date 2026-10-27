# Instruções do projeto

## Commits e conclusão de marcos

- Fazer commits incrementais, separados por parte e responsabilidade da implementação. Cada commit deve ter um propósito claro e revisável.
- Separar alterações de funcionalidades ou responsabilidades distintas, como autenticação, TCCs, persistência, interface, infraestrutura e documentação. Não concentrar todo o marco em um único commit.
- Usar mensagens descritivas com tipo e escopo, por exemplo: `feat(auth): validar sessão institucional`, `feat(tcc): criar cadastro`, `ci(pages): ajustar publicação` e `docs(m1): registrar entrega`.
- Executar as verificações pertinentes antes de concluir cada parte e registrar o progresso no plano de implementação.
- Ao concluir cada marco, confirmar que todas as alterações do marco estão commitadas e fazer push dos commits para o remoto, sem pedir nova confirmação para esse fluxo já autorizado pelo usuário.
- Acompanhar o CI/CD após o push e corrigir falhas relacionadas à entrega antes de declarar o marco concluído.
- No encerramento, informar o marco entregue, as validações realizadas e eventuais limitações concretas.

O plano e os critérios de cada marco estão em [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).
