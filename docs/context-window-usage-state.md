# Context Window Usage State (fato atual)

A fonte de verdade de conversation para o context usage é o V4 `ConversationSnapshot.usage`, e não o `taskRuntime` legado do renderer.

```text
CLI usage events -> ProductProjection.usage -> snapshot/delta
  -> SessionDataLayer -> composer toolbar / status UI
```

`V4ComposerToolbar` lê `snapshot.usage.contextWindow` para exibir o uso. A UI não soma tokens localmente nem monta o usage a partir do antigo task stream; após a restauração, o snapshot sobrescreve.

## Restauração a frio após compact

Todo123: a restauração a frio consulta o Registry em modo somente leitura usando a identidade explícita de `runtime.getSessionModelSelection() ?? record.restoredModelSelection`, sem exigir que o nível de raciocínio esteja completo, sem criar um Model de execução e sem gravar a seleção de volta.
A mesma carga de histórico obtém a capacidade uma única vez e entrega o usage seed correspondente à projeção junto com o resultado da carga; não há cache separado.
A capacidade desconhecida é null no maxTokens do seed interno, e o protocolo continua usando contextWindow=null inteiro.
Os tokens já usados são preservados; depois que a capacidade é restaurada, o valor pode ser exibido novamente, mas não pode regredir para 200.000. Eventos reais de uso e novos eventos durante a restauração têm prioridade sobre o seed antigo; um ModelSelected do mesmo modelo pode atualizar o limite sem recalcular o uso.

```text
identidade de restauração -> metadados do Registry (uma vez) -> eventos de histórico + usage seed
                                           |
                                  repõe eventos live
                                           |
                      cada caminho de entrega original de continuous / replayable
```

Na restauração a frio, a projeção do runtime ainda pode não ter usage; o primeiro frame precisa restaurar, a partir das mensagens persistidas do active-branch, a marca de água mais recente, sem voltar além do compact summary até o assistant anterior à compactação:

```text
active branch tail
  ├─ assistant       -> provider total / input + output
  └─ compact summary -> truePostCompactTokenCount ?? postCompactTokenCount
                                              |
                                              v
                                      cold snapshot usage
```

Quando o runtime tem `contextUsed > 0`, o runtime continua sendo priorizado; somente o fallback da restauração a frio escolhe a marca de água acima em ordem reversa.
Apenas o boundary de um user compact summary persistido com tokens válidos se torna a nova marca de água; boundaries de assistant antigos ou histórico incompleto continuam usando o fallback existente de assistant tokens. A marca de água do boundary não carrega o cache da requisição anterior à compactação, de forma consistente com o `CompactCompleted` em estado quente.

## Atualização a quente do provider registry

Depois que a página de configurações altera o `contextWindow` do modelo atual, o provider registry deve aplicar a nova capacidade tanto ao runtime das sessions existentes quanto à projeção da conversation V4. A atualização da projeção substitui apenas `snapshot.usage.contextWindow.maxTokens`, preservando o `usedTokens` já existente; não deve esperar o próximo `ModelComplete` para recalibrar.

Quando o registry limpa o `contextWindow` explícito do modelo atual, o runtime usa `undefined` para expressar capacidade desconhecida, e `ModelSelected.contextWindow` usa `null` para expressar "limpeza explícita". Após receber `null`, a projeção da conversation V4 deve limpar `snapshot.usage.contextWindow` para `null`; a ausência do campo existe apenas para compatibilidade com eventos antigos e não pode ser interpretada como limpeza. Enquanto a capacidade é desconhecida, os `ModelComplete` seguintes continuam acumulando tokens, mas não podem reconstruir o objeto da janela com `maxTokens: 0`; a projeção mantém internamente o uso de context mais recente, para poder republicar quando a capacidade for restaurada.

```text
provider registry(contextWindow changed)
  -> active session runtime.updateConfig
  -> ModelSelected(same model + new contextWindow | null)
  -> ProductProjection.usage.contextWindow.maxTokens | null
  -> desktop-continuous / web-remote-replayable publicam cada um no seu limite de entrega original
```

Trata-se de uma atualização a quente de metadados de capacidade do mesmo modelo: não gera marker de troca de modelo nem recalcula os tokens já usados.