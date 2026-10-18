# Plano de implementação para 11 falhas de E2E corrigíveis diretamente

> Baseado em: `docs/superpowers/specs/2026-07-17-e2e-direct-failure-repairs-design.md`

1. Adicionar testes de falha para o spec gate do mock WDIO Coding Plan, incluindo os dois specs oficiais de Turbo recovery/switch.
2. Adicionar testes de contrato de `/messages` da Anthropic para o fixture restart/settings com DeepSeek, atualizar as respostas main correspondentes de I25/I29 e a response de títulos necessária, e executar a verificação do fixture.
3. Adicionar testes unitários estáveis com `data-permission-option-kind` para a opção de permissão, junto com a implementação; atualizar o helper de E2E e as asserções de comportamento do caso de refresh.
4. Confirmar a admissão da fila usando evidência de toast em runtime e corrigir as asserções que só faziam match em inglês, para cobrir o locale de workspace em chinês e em inglês.
5. Complementar com testes de função pura a diferença de âncoras de DOM no prepend, capturando a âncora antes da chamada de loadOlder e priorizando a correção da âncora no layout effect de prepend.
6. Executar os testes unitários afetados, a verificação de fixtures de E2E, `pnpm typecheck` e `pnpm lint`; revisar o diff e enviar um Conventional Commit.