# Todo 84: Fechamento da seleção de Reasoning ausente e da política de requisições auxiliares no Model Selection

> Atualização de atribuição da verificação (2026-09-09): as pendências residuais de teste sub-coberto/falhante/promoção manual deste documento são transferidas para [Todo102](todo-102-verification-debt-closeout.md), encerrando o cronograma de verificação independente aqui; as evidências históricas são preservadas e a transferência não significa que os testes passaram.

> Status: as correções e a aceitação de etapa foram concluídas pelo Todo 88 R11; status sincronizado em 2026-09-08. A escolha ativa de modelo com o nível mais alto já foi implementada e não consta mais como item a desenvolver; itens de execução completa em todos os ambientes que não foram rodados continuam conforme o registro do Todo 88, sem alegar aprovação total.
>
> Data: 2026-09-05
>
> Relação: fecha as convenções dispersas sobre Reasoning ausente/inválido e chamadas auxiliares dos Todo 58, Todo 60, Todo 63, Todo 70, Todo 81.

## Contexto

Correção explícita do usuário em 2026-09-07: quando o usuário seleciona ativamente um novo modelo, deve-se usar o nível mais alto entre os níveis ordenados atuais desse modelo, `values.at(-1)`. Na recuperação de histórico, na seleção persistida ausente ou em nível inválido, a identidade do modelo continua preservada e o nível é esvaziado.

São duas ações de produto distintas, que não devem ter suas semânticas unificadas apenas para facilitar a implementação. A entrada de escolha ativa de modelo constrói explicitamente uma Selection completa, o que não equivale a adicionar um default no Option Spec nem permite que ModelFactory ou a camada de request preencham valores por baixo. As requisições auxiliares continuam usando o nível mais baixo em seus próprios pontos de chamada.

## Regra Final

### 1. Distinguir escolha ativa de modelo da recuperação de seleção existente

```text
用户主动选择新模型
    -> 使用目标模型的最高 Reasoning 档位
    -> 形成包含该档位的新 Selection

恢复或重新校验已有 Selection
    -> 按下图保留有效值、清空失效部分
```

```text
Model Selection
      |
      v
当前 Registry 校验
      |
  +---+----------------------+
  |                          |
Provider/Model 无效       Provider/Model 有效
  |                          |
整份 Selection 置空       校验 reasoning
                             |
                    +--------+--------+
                    |                 |
                 有效              缺失/失效
                    |                 |
                 保留             保留 Provider/Model
                                 reasoning 置空
```

- Quando o usuário troca de modelo ativamente, usa-se `values.at(-1)` do modelo alvo, sem carregar o nível do modelo de origem; sem um nível candidato legítimo, nenhum nível pode ser fabricado.
- Ao ler uma Selection persistida, ler uma Selection do histórico ou revalidar uma escolha existente após a atualização de configuração, segue-se a regra de esvaziamento acima, sem preencher o nível mais alto.
- Esta decisão não muda, isoladamente, o modelo inicial de um Composer novo, nem a prioridade de Recent ou Configured Default, nem a regra de continuidade de mesmo modelo/mesmo nível na troca de conta.
- Uma Selection com Reasoning vazio não pode entrar na execução normal de modelo; o Composer aguarda o usuário selecionar o nível novamente.
- Quando Provider ou Model não existem, não se adivinha a identidade e a Selection inteira é esvaziada.
- O Composer comum apenas exibe o Reasoning inválido como vazio, sem disparar uma notificação genérica de falha de migração; tarefas executáveis (como Automation e o Off-Peak, que ainda pode estar rodando) avisam em seu local de erro original que não conseguem continuar, mantendo o escopo de mensagens contextualizadas do Todo 81.

### 2. Requisições auxiliares: escolha de nível independente e explícita

Uma requisição auxiliar não está reparando nem completando um Model Selection; ela constrói explicitamente parâmetros de requisição temporários em uma única chamada:

```text
辅助调用
  |
  +-- Title
  +-- Memory / Recall
  +-- Connectivity Test
  +-- Goal Completion Verification
  +-- 其他已明确标记为 sidecar 的请求
  |
  `--> reasoning = optionSpecs.reasoningLevel.values[0]
      maxOutputTokens = 调用方明确限制的预算
```

- Uma chamada auxiliar não pode escrever de volta no Composer, na Session ou em uma Selection persistida.
- A política do nível mais baixo só aparece ao construir os parâmetros de uma chamada auxiliar e não pode descer para virar default do Model Selection.
- A execução principal de um Goal comum e a continuação de Goal não são requisições auxiliares de baixo custo e continuam usando o Model Selection completo atual; apenas o Goal Completion Verification usa a política auxiliar.
- O teste de conectividade continua usando explicitamente o nível mais baixo, sem depender do estado atual de reasoning do Composer.

## Escopo de Implementação (fechado pelo Todo 88; requisitos de aceitação preservados)

1. Restaurar a entrada pública de construção que, na escolha ativa de modelo do usuário, usa o Reasoning mais alto, junto com suas chamadas, complementando testes que diferenciem isso do esvaziamento na recuperação de histórico; não fazer o preenchimento descer à camada de execução.
2. Garantir que toda Selection normal exija Reasoning válido antes de entrar na execução; proibir que ModelFactory ou outras camadas inferiores preencham o nível silenciosamente.
3. Preservar e unificar a semântica de recuperação de «Provider/Model inválido esvazia tudo, Reasoning inválido esvazia apenas o Reasoning».
4. Verificar os consumidores como Composer, recuperação de Session, Model Selection View, Automation, Off-Peak, Subagent, Bot e Repo Wiki, evitando que cada um re-adivinhe ou complete o Reasoning por conta própria.
5. Esclarecer os pontos de chamada e os limites de teste das requisições auxiliares, confirmando especialmente que a execução principal de um Goal não entra em `auxiliaryModelOptions` por engano e que apenas o Goal Completion Verification usa o nível mais baixo.
6. Limpar nomenclatura, comentários, documentação e testes relacionados à antiga regra de «preencher com o nível mais alto por padrão», evitando deixar lógica de ponte.

## Critérios de Aceitação

- Depois que o usuário seleciona ativamente um novo modelo, o nível padrão é o nível mais alto atual daquele modelo; na recuperação de persistência/histórico e na validação de escolhas existentes, um Reasoning ausente ou inválido continua vazio, sem rebaixar nem subir o nível automaticamente.
- Quando Provider/Model ficam inválidos, a Selection inteira fica vazia; quando apenas o Reasoning fica inválido, a identidade do modelo é preservada.
- O Composer consegue reconhecer o Reasoning vazio e pedir ao usuário que selecione novamente, sem exibir a notificação genérica de migração impossível de corrigir.
- Tarefas como Automation e o Off-Peak que podem continuar executando não rodam com Selection vazia e dão um erro compreensível na posição original da tarefa.
- A configuração comum de Goal e a continuação de Goal usam a Selection atual completa; o Goal Completion Verification usa o Reasoning mais baixo e seu próprio orçamento de saída.
- Requisições auxiliares como Title, Memory e Connectivity continuam passando explicitamente o nível mais baixo e não modificam nenhuma Selection persistida.
- Passam os testes direcionados cobrindo criação, recuperação de persistência, mudanças no Registry, Composer, Goal, Automation e teste de conectividade, além do typecheck completo, do lint e das regressões de E2E existentes.

## Registro de Implementação (2026-09-05)

A seguir está o registro histórico da implementação original e não representa o comportamento atual. O commit `a43049c265d` chegou a cancelar o preenchimento do nível mais alto na escolha ativa de modelo; esse comportamento foi corrigido pelo Todo 88 R11 conforme a nova decisão de 2026-09-07, e o encerramento se apoia na aceitação posterior, não nos resultados de teste antigos abaixo.

- A normalização da Selection comum passou a ser `normalizeModelSelection`: a identidade de Provider/Model é preservada e o Reasoning ausente ou inválido é esvaziado; foram removidos o fallback pela ordem do Registry e o preenchimento automático do nível mais alto.
- Composer, Repo Wiki, Session Facade e as entradas de seleção do Registry não materializam mais automaticamente o Reasoning mais alto; a troca de modelo pode salvar primeiro a identidade do modelo, e o Reasoning precisa ser explicitamente selecionado antes de executar.
- `resolveRegistryThoughtLevel` não volta mais ao nível mais alto para valores ausentes ou inválidos; `setModel` só permite manter temporariamente um Reasoning ausente no limite de seleção da UI, sem afrouxar a validação de execução do Runtime/ModelFactory.
- A política do nível mais baixo de `auxiliaryModelOptions` foi mantida; a execução principal de Goal e a continuação seguem iguais, e o Goal Completion Verification continua usando a política auxiliar.
- Testes direcionados aprovados: Provider 7 testes, Bootstrap 35 testes, UI 36 testes, Core 84 testes; `pnpm typecheck` e `pnpm lint` aprovados (o lint mantém os warnings já existentes do workspace, sem errors).

## Correções Posteriores e Fechamento (sincronização de status de 2026-09-08)

- [R11 do Todo 88](todo-88-provider-audit-regression-repair.md) já conectou a escolha ativa de modelo do Composer, das tarefas agendadas, das tarefas ociosas, do Subagent e do Wiki à construção pública do nível mais alto, e completou as duas entradas de `/model` no Bot. A recuperação de histórico sem nível continua vazia, sem preenchimento no ModelFactory.
- Evidências existentes: 33 casos de configuração de seleção/Facade/Composer aprovados; serviço do Bot 93/93; Pro `desktop-e2e-20260907-163541-147` 3/3, além da verificação de subrequisição real do I20. Aqui só se sincronizam resultados já registrados; nesta rodada não houve reexecução de testes.
- Limitações como execução completa de desktop/celular não realizada seguem conforme o Todo 88. A migração posterior de dependências de ambiente, proteção da intenção original e auditoria de campos antigos fica a cargo do Todo 96/97, sem voltar a listar o recurso de nível mais alto como não implementado.

## Não Objetivos

- Não redesenhar a estratificação do Provider Config nem a estrutura de Personal Provider Instance; esse conteúdo cabe ao Todo 76.
- Não modificar a semântica de produto, de fila ou o fluxo de verificação de conclusão do Goal, apenas fechar a atribuição do nível de modelo dele.
- Não gravar o nível mais baixo das chamadas auxiliares no campo `default` do Model Config.