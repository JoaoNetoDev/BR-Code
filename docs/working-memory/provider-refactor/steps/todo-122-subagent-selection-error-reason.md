# Todo122: preservar e exibir o motivo concreto da falha na seleção de modelo do Subagent

> Status: implementado e com review parcial após a autorização desta rodada em 2026-09-11; 84 testes de Core e dois casos de navegador de detalhe/cópia passaram, e a aceitação final do lote inteiro ainda está pendente. A causa raiz não confirmada no ambiente de inicialização continua fora do escopo desta correção.

## Implementação e Evidências desta Rodada

- Só foi alterada a construção do erro de seleção: as seis causas públicas entram no `context.reason` existente, e uma descrição curta bilíngue entra simultaneamente na message, mantendo compatibilidade com o caminho de background que preserva apenas a message. A seleção antiga só é marcada como selection; a identidade válida vem apenas do resultado do parse, sem se passar por um modelo já executado. Nada foi alterado em parse, herança, override, persistência, permissões ou agendamento.
- Primeiro foram confirmadas sete asserções novas falhando na entrada correta do Vitest do Core, e só então a implementação foi feita. As seis causas foram verificadas via projeção pública real / resultado de ferramenta / conteúdo do modelo pai; os runners reais de foreground e de background falham antes da inicialização preservando a causa e não enviam requisição de modelo. Cinco arquivos, 84 testes, passaram.
- O detalhe e a cópia do ToolLayout real passaram nos casos de navegador de 390 px em chinês claro e 1200 px em inglês escuro, com a cópia contendo a causa estável e a identidade completa. O erro de ferramenta da fixture é injetado pelo teste e não é uma falha real de máquina entre processos; o shared-host/Electron real do celular não foi testado. As capturas seguem usando o corte de três linhas e a cópia preserva o texto completo; a falta de glifos chineses no Linux não conta como aceitação visual de fonte.
- Typecheck do Core, lint dos arquivos alterados e a checagem de arquitetura passaram. O lint completo do Core ainda tem erros preexistentes de arquivo longo demais, e não foram ampliados por causa disso. O review confirmou que tanto o consumo do erro público quanto a message de background não perdem mais a causa, e que não há gravação de Key/Header/configuração completa.

## Problemas Confirmados

`resolveSubagentSelection` lança todas as falhas diferentes como o mesmo `Select an available model before starting a subagent`, deixando o motivo concreto apenas em `context.selectionIssue`. A projeção pública de erro lê campos como `code` e `reason`, mas não lê `selectionIssue`, portanto o motivo concreto não chega ao resultado da ferramenta nem ao detalhe na UI; e o modelo pai só enxerga um erro de configuração genérico.

Ao chamar offline a verificação real de seleção e a projeção de erro, confirmou-se que as cinco causas — conta conectada indisponível, Provider inexistente, modelo inexistente, tier ausente e tier não suportado — resultam na mesma message e no mesmo `CONFIGURATION_ERROR`, sem detalhe distinguível. O log de arquivo original do CLI `tool.call.failed` ainda consegue preservar `error.context.selectionIssue`, portanto não se pode descrever o caso como perda em todos os logs.

## Objetivos e Restrições de Implementação

```text
公共选择解析的实际失败原因
  → Subagent 错误构造
  → 既有公共错误投影／工具结果
  → 父模型、桌面和手机远控错误展示
```

- Reaproveitar a causa já retornada pelo parse público, sem reavaliar na UI ou na camada de erro se conta, Provider, modelo ou tier estão disponíveis.
- Alinhar-se ao contrato de erro existente preferencialmente no ponto de construção do erro do Subagent, por exemplo: a causa estável entra no `context.reason` já existente e a identidade necessária entra nos campos Provider/Model já existentes; evitar estender um protocolo de erro dedicado só para uma ferramenta ou codificar Subagent de forma fixa na camada genérica de erro.
- O usuário precisa conseguir distinguir: modelo não selecionado, conexão da conta atual indisponível, Provider indisponível, modelo inexistente/inutilizável, tier de pensamento não selecionado e tier de pensamento não suportado. A linguagem voltada ao usuário atende a chinês e inglês; a causa estável serve ao julgamento por máquina, e não se pode depender de parsear o texto exibido.
- Falhas de inicialização em foreground e em background preservam a causa; o detalhe do erro e o conteúdo da cópia não podem voltar a degradar para a frase única "selecione primeiro um modelo disponível"; e o resultado de ferramenta do modelo pai também deve receber o motivo concreto, não apenas a UI.
- Usar apenas os fatos já disponíveis no momento da falha para complementar o contexto, distinguindo a seleção original da seleção válida, sem apresentar o Provider original como se fosse o Provider de execução remapeado. Não consultar a conta nem disparar requisições de modelo adicionais, e não outputting Key, Header, configuração completa ou o corpo da conversa.
- Não alterar as condições de falha, o parse da seleção válida, nem a prioridade de herança e override internos; não preencher tier automaticamente, não fazer fallback para o modelo pai, não substituir o Provider e não modificar dados persistidos.
- Atualizar a spec correspondente antes da implementação e seguir os requisitos da cadeia de mudança de ferramentas; adicionar primeiro testes com poder discriminante e só então alterar o código. Manter a correção de escopo pequeno, sem refazer todo o sistema de erros.

## Aceitação e Review

- [ ] Cobrir todas as causas de falha de seleção acima, verificando a causa estável, a informação legível e a identidade necessária; a seleção explícita normal, a herança e o comportamento de override interno permanecem inalterados.
- [ ] Validar pela cadeia real de projeção de erro público e de resultado de ferramenta, e não apenas assertando o `Error.context` lançado; com cobertura tanto de foreground quanto de background.
- [ ] Validar por E2E de interação de UI a mensagem de falha, o detalhe e o conteúdo da cópia; cobrindo desktop e controle remoto do celular, e os dois idiomas, sem alterar a fronteira existente de transmissão em tempo real. Registrar com honestidade as verificações não executadas e não encerrar com base nelas.
- [ ] Confirmar que os logs originais ainda permitem localizar o problema e não vazam informação sensível; após a falha, nenhum outro modelo é iniciado às escondidas nem a escolha é reescrita.
- [ ] Executar em lote os testes relevantes, a checagem de tipos e o lint, e fazer o review completo dos requisitos deste item antes de marcar como concluído.

## Contexto da Investigação de Campo (não faz parte desta correção)

Condições do relato: versão nova, worktree local; na captura o general-purpose interno mostra GLM-5.3/máximo, mas a inicialização reporta o erro acima. Ainda não se obteve a seleção real e o `selectionIssue` da máquina no momento da falha, portanto não se pode anunciar que a causa raiz do incidente foi encontrada.

Duas pistas a verificar: o Runtime existente não lê a configuração de Subagent salva depois; e um profile de usuário/projeto com o mesmo nome sobrescreve o profile interno exibido na página de configurações, sendo que a configuração do projeto ainda pode conter um Provider antigo não migrado. Se for de fato um Runtime criado depois do salvamento, a primeira pista não explica a primeira falha. Nenhum dos dois é tratado como Bug confirmado nesta correção, e a estratégia de refresh de configuração não é rediscutida aqui.

A ausência do tier default implícito antigo depois da migração é outra condição de reprodução, mas não explica diretamente a situação atual em que a captura da versão nova mostra "máximo". Esta tarefa não define nem implementa, de passagem, uma migração de preenchimento de tier.

## Pontos de Entrada de Código

- `apps/zcode-cli/packages/core/src/runtime/helpers/subagent-selection.ts`
- `apps/zcode-cli/packages/core/src/errors/error-payload.ts`
- `apps/zcode-cli/packages/core/src/tool/executor/errors.ts`
- `apps/zcode-cli/packages/core/src/subagent/runner.ts`
- `apps/zcode-cli/packages/adapters/src/logging/serialize.ts`
- `packages/ui/src/ToolCallBlocks/ToolLayout.tsx`
