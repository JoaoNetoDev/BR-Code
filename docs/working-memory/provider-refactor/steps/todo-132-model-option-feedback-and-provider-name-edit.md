# Todo132: feedback de cor de fundo nas opções de modelo e correção da edição do nome do fornecedor

> Estado: **implementado em 2026-09-11, revisão parcial e verificação aprovadas; aceitação final do lote inteiro ainda pendente**.
>
> Duas decisões finais: ① reforçar apenas a cor de fundo de seleção das opções em bloco de modelo, mantendo texto/ícone como estão, e a borda continua expressando apenas a cobertura pessoal. ② a edição do nome do fornecedor custom não salva em tempo real; confirma com Enter/perda de foco e Esc descarta esta edição; o mecanismo de salvamento automático de endereço/API Key permanece.
>
> Relacionados: [Todo92 cobertura de controles e feedback de interação](./todo-92-model-smart-config-and-override-feedback.md), [Todo130 limites da configuração manual](./todo-130-manual-model-config-editable-field-boundary.md), [Todo131 layout e botão de restauração](./todo-131-model-settings-smart-config-placement-and-restore.md). Este Todo não embute a implementação de outros itens.

## 1. Primeiro item: feedback de clique pouco perceptível nas opções em bloco de modelo

### 1.1 Problema atual

O escopo são as opções em bloco de imagem/vídeo/PDF, capacidades do modelo, MFJS etc. no editor de modelo; não se expande para uma reformulação de Switch em todo o produto nem se ajusta a cor dos toggles deslizantes da configuração inteligente.

`modelEditorControlStyle()` hoje representa o estado de ligado/desligado principalmente pela cor de fundo. No tema claro da Zai, `--color-selected` e `--color-hover` são ambos `rgba(13,13,13,0.05)`; com o mouse sobre o botão, o hover não selecionado e o hover selecionado têm a mesma cor de fundo. No tema escuro os equivalentes são 10% e 5% de branco, e o hover selecionado ainda faz mistura, reduzindo ainda mais a diferença.

Exemplo de composição com os valores atuais sobre painel branco puro/escuro: no tema claro, antes e depois do clique ficam em torno de `#f3f3f3`; no escuro, o hover não selecionado fica em torno de `#2b2b2b` e o hover selecionado em torno de `#313131`. Esses são indícios de cálculo de estilo, não aceitação de captura de tela no navegador; os pixels concretos variam conforme o fundo subjacente real.

O usuário rejeitou a sugestão de reforçar simultaneamente texto/ícone e a retirou explicitamente. Não se pode implementar mudança de cor do texto, negrito ou ênfase no ícone da proposta inicial.

### 1.2 Estilo alvo

| Dimensão de estado   | Regra final                                                                    |
| -------------------- | ------------------------------------------------------------------------------ |
| Ligado/desligado     | expresso apenas por uma diferença de cor de fundo mais explícita; no claro a seleção escurece, no escuro a seleção clareia |
| Hover / foco de teclado | leve mudança de cor de fundo na interação, mantendo ligado e desligado bem distintos; o hover de desligado não pode parecer ligado |
| Cobertura pessoal     | a borda continua expressando apenas a origem da cobertura; a borda não representa o switch, e não há aumento de espessura nem anel de foco |
| Texto/ícone          | cor, peso, padrão e tamanho originais são mantidos, sem ênfase adicional por estar selecionado |
| Layout/controles     | manter dimensões, espaçamentos, ícones e agrupamento atuais, sem adicionar checkbox, marca de visto ou texto "ligado/desligado" |

Corrigir o estilo das opções localmente no editor de modelo, sem mexer em `--color-selected` / `--color-hover` globais e sem alterar botões ou campos de outras páginas. `modelEditorControlStyle` também é reutilizado pelo editor de entrada de texto/mapeamento, então só o ramo de opções cujo selected é booleano pode ser ajustado; os campos de texto não podem ser escurecidos junto.

Reutilizar as cores semânticas atuais do tema e, por meio de estilo local, entregar níveis de seleção e hover suficientemente distinguíveis. Os valores concretos são fechados com prévia real nos dois temas, sem gravar um novo conjunto de cores por suposição. As opções fixas de entrada/saída de texto mantêm a semântica de bloqueio e não se tornam editáveis só porque o contraste aumentou.

### 1.3 Foco da aceitação

**Com o mouse parado sobre o local, clicar várias vezes no mesmo botão; cada ligar/desligar deve ser claramente visível.** Verificar também o estado com o mouse afastado, com foco de teclado e após toque no celular, sem depender do hover para distinguir a seleção.

## 2. Segundo item: salvamento automático do nome do fornecedor faz o Esc falhar

### 2.1 Problema atual e reprodução

A percepção do usuário é de salvamento em cerca de 1,8 segundo; o código atual tem `MODEL_PROVIDER_TEXT_IDLE_TRIGGER_MS = 1200`, e tanto a digitação do nome quanto o fim de composition do IME agendam o salvamento automático compartilhado.

`handleNameKeyDown()` usa `getProviderFormLabel(provider)` no Esc, que é o nome já salvo/projetado, e não o valor de início da edição.

```text
原名 A → 输入 B → 停顿后自动提交 B → Provider View 更新为 B
                                             |
                                            Esc
                                             |
                                恢复当前 View 名称 B，无法取消为 A
```

Foi executada uma verificação de componente isolada com o estado real e a lógica de salvamento do `InlineEditableProviderCard` (com um Header simplificado recebendo os eventos e o componente pai simulando o retorno da View após o salvamento): antes do salvamento automático, o Esc restaura o nome original sem chamada de salvamento; após avançar 1200 ms e concluir o salvamento automático, o Esc mantém o novo nome. As duas asserções de comportamento do problema passaram; não se trata do E2E após a correção.

Outro ponto relacionado: `commitPendingDraft()` salva o rascunho completo do Provider, e entradas de endereço, API Key, teste de conexão e cleanup também podem carregar o nome. Remover apenas o timer do próprio nome não basta para garantir que o Esc funcione.

### 2.2 Interação final

| Ação                              | Comportamento                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| Entrar na edição do nome          | cria o rascunho desta edição de nome e a identidade de edição, exibindo o nome atual                  |
| Digitar/parar de digitar/fim de composition | altera apenas o rascunho do nome, sem salvamento temporizado e sem sair da edição automaticamente |
| Enter (não confirmação de candidato do IME) | confirma o nome, salva e encerra esta edição, reutilizando o commit por perda de foco, sem escrita duplicada |
| Perda de foco                    | confirma e salva, saindo da edição; nome em branco/sem alteração segue as regras existentes de validação e de não submissão |
| Esc (não em estado de composição do IME) | descarta esta edição do nome, restaura a exibição do nome original desta edição e sai; não envia salvamento nem requisição de rollback compensatória |
| Confirmação de candidato do IME   | mantém a proteção existente de composition, não tratando o Enter de candidato como confirmação de salvamento |

O significado de Esc é cancelar o **rascunho de nome local ainda não confirmado**, e não reescrever o valor antigo sobre mudanças remadas ou de outras janelas que já ocorreram. Depois de sair, a exibição continua vindo do Provider View autoritativo, sem reescrever o Provider inteiro antigo só por causa de um "restaurar".

### 2.3 Isolamento em relação a outras entradas de salvamento

```text
名称编辑草稿 ──Enter / 真正失焦确认──> 名称保存
       |
       `────Esc──────────────────> 丢弃名称草稿（不写入）

地址 / API Key 草稿 ──原 idle / blur / cleanup──> 原保存机制
                           |
                  不夹带未确认的名称草稿
```

- Um nome não confirmado não pode se misturar aos commits por idle, teste de conexão, operações de modelo e cleanup de outros campos. Reutilizar a propriedade de campo existente e as fronteiras de commit existentes, sem criar um segundo serviço de Provider ou protocolo de persistência.
- O composition start/end do nome não deve mais iniciar timer para o nome; ao isolar, não se pode cancelar nem descartar nem descarte a intenção de salvamento pendente do próprio endereço/API Key.
- O Esc precisa invalidar primeiro a intenção de submissão do nome e só depois sair da edição; um blur, unload ou cleanup posterior não pode ressubmeter usando o nome capturado no closure antigo.
- Um Enter que provoque blur só pode submeter uma vez; nome inalterado não submete. Só a perda de foco real confirma, e eventos posteriores ao encerramento da edição por Esc não podem ser contados como confirmação.
- Na troca de Provider/unload, conferir o vínculo com o alvo antigo: a confirmação por perda de foco real submete pelo alvo antigo; o cleanup não salva silenciosamente um nome não confirmado nem aplica resultado antigo ao novo Provider.
- Manter os avisos/tentativas de retentativa atuais de falha de salvamento e as proteções de atualização do Provider, sem mostrar sucesso falso; não implementar rollback com corrida do tipo "salva B automaticamente e depois envia A" para desfazer o nome.
- Não alterar o momento de salvamento existente de endereço, API Key e formato de API, nem ajustar o atraso idle compartilhado, nem mudar o schema, as permissões ou as regras de revision/escrita atômica no servidor do campo de nome.

## 3. Pontos de entrada e ordem de implementação

| Item              | Local principal (relativo a `packages/ui/src/settings/model-provider-section/`)                              | Limite                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Feedback do bloco | `modelEditorControlStyle.ts`, conferindo `ProviderModelMetadataFields.tsx`, `ProviderModelModalityOptions.tsx` | cor de fundo local de selected/hover; texto, ícone e borda de cobertura preservados |
| Interação do nome | `InlineEditableProviderCard.tsx`, Header em `ProviderCardSections.tsx`                                        | rascunho do nome nesta edição, Enter/blur/Esc, eventos de IME                    |
| Isolamento de commit | `ProviderDraftSave.ts` e os pontos de chamada de `commitPendingDraft` no cartão                            | ajuste da extração de campos só quando necessário; os demais campos salvam normalmente e não carregam nome não confirmado |
| Agendamento compartilhado | `useIdleTrigger.ts`                                                                                        | apenas conferir os pontos de consumo, sem alterar o comportamento do timer global nem as constantes de atraso |

Primeiro conferir a linha de base de estilo e interação da página conforme DESIGN.md, depois acrescentar os testes de regressão do nome, implementar as duas alterações locais e, por fim, fazer a verificação em lote. Se Todo130/131 já tiverem sido aplicados, integrar conforme o layout mais recente, sem restaurar o layout antigo.

Este Todo trata apenas desses dois problemas, sem refatorar o cartão de Provider inteiro nem adicionar modos, modais de confirmação, atalhos ou outros botões.

## 4. Checklist de verificação

| Case    | Cenário/ação                                                   | Asserção obrigatória                                                                |
| ------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| S122-01 | temas claro e escuro, mouse parado no lugar, alternando repetidamente imagem/capacidade/MFJS | cor de fundo de selecionado/não selecionado claramente diferente; texto, ícone e tamanho inalterados |
| S122-02 | sem cobertura/cobertura pessoal × ligado/desligado × hover/foco de teclado; toque no celular | a borda indica apenas cobertura, o hover de desligado não parece ligado, sem ring/checkbox novo; o estado após o toque é distinguível |
| S122-03 | campo numérico/caixa de mapeamento da mesma página de edição e controles de outras páginas de config | não foram atingidos pela mudança de estilo das opções; as opções fixas com bloqueio continuam não alternáveis |
| N122-01 | mudar A para B, ficar em edição além do tempo idle original e então pressionar Esc | sem salvamento por tempo, Esc restaura o nome original/sai; avançar o timer ou disparar cleanup depois também não grava B |
| N122-02 | mudar A para B, pressionar Enter / clicar fora perdendo o foco                   | salva o nome correto e exatamente uma vez; sem alteração/em branco segue as regras originais |
| N122-03 | enquanto o nome não está confirmado existem salvamento automático de endereço/API Key, teste de conexão e outros commits | os outros campos salvam pelo mecanismo original, sem carregar o nome não confirmado; o Esc não limpa a intenção dos outros campos |
| N122-04 | blur/cleanup após Esc; troca de Provider; resposta de salvamento atrasada | não resubmete o nome cancelado, não sobrescreve o novo Provider nem o estado de geração mais recente |
| N122-05 | digitação em IME chinês/Enter de candidato/fim de composition           | não confirma nem salva o nome no meio; Enter/Esc formais continuam funcionando       |
| N122-06 | salvamento do nome com sucesso/falha, entrando novamente na edição           | sucesso exibe o novo nome autoritativo; falha tem retorno e caminho de retentativa, sem sucesso falso nem compensação automática do nome antigo |

- O nome deve ser testado com eventos do componente real e tempo/Promise controlados; não basta testar Escape mapeado para cancel, é preciso verificar a chamada/resultado real de salvamento.
- Complementar com E2E de interação no APP, verificando início de edição, pausa, Esc, Enter e perda de foco; observar a escrita por meio de um Service/Repository isolado de teste, sem modificar a configuração real da conta.
- Estilo precisa ser avaliado pelo computed style real do navegador e por capturas de tela de interação, não apenas por nome de classe. Verificação representativa nos dois temas e em desktop/celular, sem tratar o exemplo de cálculo de estilo como aceitação de execução.
- Registrar os logs de UI/evidências de salvamento de teste necessários na reprodução e na correção, sem imprimir API Key; os comentários devem explicar o conflito de cor de fundo e a razão da propriedade de submissão do nome.
- A implementação de código segue a arquitetura de execução do repositório, typecheck, lint, testes unitários relacionados e E2E; registrar com honestidade o que não puder ser executado, sem ampliar o escopo por defeitos não relacionados.

## 5. Estado atual

Implementado em 2026-09-11 em um branch de estabilização independente; o freshness de início já passou e nenhum dado real de Provider foi alterado.

Ao concluir, acrescentar as mudanças reais, as evidências de captura/escrita, os testes e os registros de commit, sem escrever que a reprodução antiga passando equivale a correção de produto aprovada.

### Implementação e evidências desta rodada

- O nome não chama idle schedule/cancel; Enter/blur entram explicitamente no salvamento via nameConfirmed, e as demais entradas de salvamento excluem o nome por padrão; o Esc cancela primeiro a identidade de edição e só depois sai, sem escrita compensatória. A troca de Provider limpa a identidade de edição antiga e descarta a revision de feedback antiga. O momento original do rascunho de conexão não muda.
- Os testes primeiro reproduzem a gravação indevida por idle e o nome sendo carregado pelo salvamento da Key. Após a correção, 109 testes unitários passaram rodando junto com Todo115, incluindo IME, confirmação única, blur/cleanup após Esc, preservação da Key, retentativa de falha de salvamento e troca de alvo. Não foi introduzido outro serviço/schema de salvamento.
- As opções booleanas de modelo usam localmente cor de fundo de 15% do foreground e 20% em hover/focus; o estado desligado e os ramos de campo de texto/Map permanecem inalterados. Cliques repetidos na mesma posição no navegador real para imagem/capacidade/MFJS provaram que há diferença de cor de fundo, enquanto cor e tamanho de texto/ícone e borda de cobertura seguem iguais; o texto fixo continua bloqueado.
- 6 casos de componente no navegador passaram; os valores computados e as capturas nos dois temas e em larguras representativas estão em `/tmp/zcode-provider-settings-batch/header-options-*.json`, `selected-*.png`. As capturas foram realmente inspecionadas, e não apenas nomes de classe; falta fonte de caracteres chineses nesta máquina, então os glifos chineses visuais não contam como aprovados.
- typecheck/lint da raiz passaram; o helper de criação de fornecedor no Electron foi alterado para entrar por mais menu, com confirmação por perda de foco, e ainda não se afirma aprovação da cadeia completa Electron/celular real. A aceitação final do lote continua em cobertura.