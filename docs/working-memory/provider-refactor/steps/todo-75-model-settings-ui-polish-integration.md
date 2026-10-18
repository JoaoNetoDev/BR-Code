# Todo 75: integração do UI polish da página de configurações de modelos e adaptação à arquitetura atual

> Atualização de atribuição de verificação (2026-09-09): as pendências de teste, falhas e promoções manuais restantes neste documento foram transferidas uniformemente para [Todo102](todo-102-verification-debt-closeout.md), encerrando o agendamento de verificação independente neste documento; as evidências históricas são preservadas e a transferência não significa que os testes passaram.

> As pendências de E2E gráfico de Desktop posteriores são consolidadas pelo Todo 78 e este Todo não as agenda mais separadamente.

> Correção de decisão em 2026-09-07: a frase "não há mais o agrupamento de configurações avançadas" abaixo registra apenas o resultado da integração na época, substituída por decisões posteriores do usuário. Devem ser adicionados dois contêineres com título, "Configurações de raciocínio" (níveis + Mapping) e "Configurações avançadas" (MFJS), sem colapso; a correção da omissão é executada pelo Todo 88 / R13.

> Status: concluído (código e validação local concluídos; E2E gráfico de desktop pendente do ambiente Mac)
>
> Data: 2026-09-04
>
> Origem: `fix/model-settings-ui-polish`

## Objetivo

Integrar ao m2 atual as melhorias de UI relacionadas à página de configurações de modelos do branch do designer e concluir a organização necessária sobre o código atual da refatoração de Provider. Apenas exibição, layout, interação e os testes correspondentes são ajustados, sem alterar Provider, Registry, Overlay, persistência da seleção de modelo ou semântica de runtime das requisições.

## Mudanças preservadas

- layout de campos do diálogo de edição de modelo e disposição do ID do modelo com o interruptor de habilitação;
- opções em forma de ícones do modal de entrada e das capacidades do modelo;
- dimensionamento e novo ponto de entrada do editor de níveis de Reasoning;
- espaçamento interno da lista de modelos, linhas separadoras no arraste e botão de adicionar modelo;
- botões de ação do cabeçalho da página de configurações e estilo do feedback de salvamento do Provider;
- testes unitários de UI de configurações de modelos e cobertura E2E adicionados pelo branch do designer.

## Organização após a integração

- o produto atual não tem a camada "Configurações avançadas"; são removidos o colapso, o agrupamento e as descrições correspondentes da documentação;
- os níveis de Reasoning usam a fonte comum da UI conforme o proposal do designer;
- o E2E mantém a verificação estrutural e comportamental, reduzindo a dependência de classes CSS específicas, espaçamento em pixels e detalhes de implementação interna;
- confirmar que o campo de ID do modelo e o interruptor de habilitação funcionam normalmente em janelas estreitas, sem nova semântica responsiva;
- preservar dados de compatibilidade de baixo nível como Audio/PDF, sem apagá-los silenciosamente por causa do estreitamento da UI.

## Execução e aceitação

1. Integrar `origin/fix/model-settings-ui-polish`, registrando o resultado da mesclagem.
2. Concluir a organização acima no código m2 atual e verificar que a abstração de Provider e a cadeia de salvamento não foram alteradas.
3. Executar os testes unitários de configurações de modelos, o E2E, `pnpm typecheck` e `pnpm lint`.
4. Revisar amplamente o escopo das mudanças e confirmar que desktop/Web, chinês/inglês e temas claro/escuro não têm regressões evidentes.
5. Após a verificação, fazer commit e push do branch m2 atual.

## Resultado da implementação

- `origin/fix/model-settings-ui-polish` foi integrado, preservando as mudanças de UI e a cobertura de testes do branch do designer.
- O nível de produto inexistente "Configurações avançadas" foi removido; Reasoning, Mapping e MFJS Tool Schema passam a ser exibidos diretamente como configuração comum de modelo.
- Implementação, E2E e documentos de design foram sincronizados, sem alteração de Provider, Registry, Overlay, persistência da seleção de modelo ou semântica de runtime das requisições.
- Foram aprovados 7 arquivos de teste de UI de configurações de modelos com 74 testes, além de `pnpm typecheck`, `pnpm lint` e dos testes afetados antes do push; o E2E gráfico de desktop não foi executado no ambiente atual e precisa ser rodado no Mac conforme o processo existente.
- Commits de mesclagem: `700b5ba77c`, `d10f45c65f`; enviado para `provider-refactor-m2`.