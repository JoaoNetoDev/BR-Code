# Todo 98: Restaurar a formatação estrutural do Built-in Option Map

> Status: concluído e revisado; 2026-09-09. Inclui achado de execução real e a pequena correção de isolamento de arraste por teclado aprovada pelo usuário.
> Encerramento: a entrada de desenvolvimento foi fechada; a verificação multicliente restante vai para [Todo102](todo-102-verification-debt-closeout.md) V102-04, e a promoção manual pendente de cases, bem como a lacuna da ferramenta de validação de fixtures de settings, vão para V102-05, sem conta pendente própria neste documento.
> Norma de estilo: [Option Map — estilo de escrita](../design/model/option-map-writing-style.md).

## 1. Problema e objetivo

O Todo66 já exigia que Maps complexos preservassem quebras de linha e indentação. Ao implementar o Todo95, o commit `9b0f11e996` simplificou a lógica, mas comprimiu parte dos Maps aninhados em uma única linha; como a página de configurações exibe a string de origem tal e qual, surgiu a regressão de linhas longas mostrada na captura de tela. O teste de equivalência de requisições anterior não cobria a formatação de exibição das strings Built-in reais.

Objetivo: manter a lógica simplificada atual e restaurar a formatação estruturada dos objetos aninhados; ternários simples continuam na mesma linha. Verificar todos os Built-in Option Map, incluindo os dedicados e os de fallback de API, e não apenas corrigir o modelo da captura de tela.

## 2. Escopo e limites da mudança

- O corpo da alteração modifica apenas a formatação dos Maps que precisam de arrumação em `config/provider/zcode-builtin.json`, atualizando a revision conforme o contrato de publicação já existente; acrescentar os testes e registros de verificação necessários. A única alteração adicional de código de produto é o isolamento de arraste por teclado descrito abaixo, já aprovado.
- Não restaurar ramos redundantes nem mudar a AST das expressões, o resultado da requisição para entradas válidas, a omissão/null de campos, modos, orçamentos ou limites. Esta é a restrição de transformação desta correção, não a definição de estilo de escrita.
- Não alterar nomes/values de níveis, migração de Selection, correspondência de regras, prioridade, Overlay ou o formato/comportamento de salvamento do editor da UI; o Todo95C tem commit próprio e não se mistura às diferenças de formatação deste item.
- Não adicionar Formatter, DSL ou transformação de formatação em runtime; não reordenar o Personal Map e não dar compatibilidade nem migração a configurações antigas não publicadas.

### Decisão adicional de 2026-09-09, execução real: isolamento de arraste por teclado

O F98-03 reproduziu o problema ao digitar um espaço de verdade no Pro: os eventos de teclado do React Portal do diálogo sobem para a linha de modelo de fundo, o KeyboardSensor consome o espaço e dispara uma escrita de ordenação, e em seguida o salvamento falha por mudança de revision. O sensor de ponteiro já tem isolamento de alvo de interação; o de teclado não reaproveitava isso.

O usuário aprovou incluir nesta rodada uma pequena correção: o arraste iniciado por teclado reaproveita as regras de isolamento de controle/diálogo já existentes; digitação e diálogos não iniciam a ordenação de fundo, e a própria linha de modelo continua suportando arraste por teclado. Isso não altera o formato do Map, a validação de versão de salvamento nem as regras de envio da ordenação, nem amplia o escopo para uma refatoração do sistema de arraste. O F98-03 mantém as asserções de digitação real de espaço e de salvamento do texto original; são acrescentados contraexemplos de teclado e Portal no nível de componente e um caso positivo de teclado na linha de modelo.

## 3. Análise de impacto da simplificação (planning / presentation)

| Entrada | Implementação compartilhada e estado de exibição | Origem, validação e limite de salvamento |
| --- | --- | --- |
| Adicionar modelo | Rascunho de edição de modelo → ProviderModelSettingsGroups → JsonSlotEditor | Valor herdado Built-in como placeholder; rascunho explícito como value; mantém a validação e o salvamento originais, sem fixar o valor recomendado apenas por visualizá-lo |
| Editar modelo | Mesmo conjunto de controles; exibição diferente entre Personal/configuração fixa e herdado | Settings Facade/ConfigService continua responsável por salvar o Personal Overlay; cancelar não escreve em disco |
| Desktop / Web / celular em settings | Compartilham a UI acima | Configuração da mesma versão deve preservar as mesmas quebras de linha; quebra automática em tela estreita não substitui a indentação da string de origem; não envolve publicar a Web nem modificar attachments |

O que é compartilhado é a exibição da string, e não a unificação ou alteração da semântica de rascunho e envio entre adicionar/editar e herdar/fixo.

Graduação: must-inspect é a string de origem dos Maps Built-in; should-inspect são `ProviderModelSettingsGroups.tsx` e `ProviderModelMetadataFields.tsx` no value/placeholder; invariant-only são a gravação de Personal e o executor de Model; evidence-only são o Provider Node, o Map, os testes de exibição da UI e de settings E2E.

Evidência de código: `JsonSlotEditor` usa diretamente `value={value}` e `placeholder={effectiveValue}`, sem etapa de formatação. O codegraph não está disponível neste ambiente; foram usadas diferenças de configuração direcionadas e leitura direta das chamadas, sem alegar uma varredura de índice de profundidade 2. Não foi encontrado nenhum surface/owner de negócio novo a criar; o grafo recebe apenas referências à norma e a este Todo, sem mudança de relação de produto.

## 4. Decisões confirmadas e cases

Decisão do usuário: expandir objetos, indentação de dois espaços, ternários simples na mesma linha; estilo separado das restrições de transformação. Não há perguntas pendentes.

As dimensões mantidas são apenas: ramo aninhado/simples/complexo × origem dedicada/fallback × placeholder/entrada pessoal. Não são expandidas todas as combinações de conta, plano ou tema/idioma/dispositivo; elas não alteram o formato do texto de origem desta rodada, e desktop e tela estreita mantêm cada uma suas evidências de exibição.

| Case | Setup / Ação | Asserções obrigatórias | Evidência planejada |
| --- | --- | --- | --- |
| F98-01 | Ler Map aninhado representativo Built-in real, ramo complexo e Map simples | Quebras de linha por nível de objeto, indentação de dois espaços, ternário simples na mesma linha; Map simples de maxOutput não é expandido mecanicamente | Teste de regressão em nível de configuração, sem usar apenas fixture multiline manual |
| F98-02 | Compilar os Maps antes/depois da correção e conferir as diferenças de configuração | Estrutura da expressão inalterada; nenhuma mudança de configuração além da formatação do Map e da revision; os testes de requisição existentes passam | Reaproveitar os testes existentes de compilação/equivalência; sem novo snapshot completo persistido da configuração antiga nem grande framework de prova |
| F98-03 | Adicionar/editar na página de configurações exibindo Map herdado; digitar formatação pessoal e cancelar/salvar normalmente | Quebras de linha herdadas preservadas; entrada pessoal não é reformatada; visualizar/cancelar não gera sobrescrita; o salvamento normal mantém os limites originais | Teste de UI compartilhado + E2E Electron representativo/capturas de tela, cobrindo layouts de desktop e tela estreita |

O catálogo/coverage atual é registrado nesta tabela; na implementação reaproveitar os cases mais recentes de `providerModelMetadataDialog.test.ts` e do E2E de settings existente, acrescentando os cases/manifests correspondentes conforme e2e-case-lifecycle, sem copiar a matriz inteira nem promover automaticamente os pendentes. Testes primeiro, usando configuração isolada, sem exigir conta real/requisição de modelo e sem usar sleep para determinar a prontidão; phone/Web reais não executados devem ser registrados explicitamente.

## 5. Ordem de execução e aceitação

1. Primeiro acrescentar o teste vermelho de formatação de configuração real do F98-01 e as asserções de exibição necessárias do F98-03.
2. Arrumar os Maps afetados, atualizar a revision de publicação e conferir se só houve mudança de formatação, sem nenhuma simplificação de lógica ou renomeação misturada.
3. Rodar os testes unitários existentes de Map/configuração de Provider e de UI/E2E relacionados; executar `pnpm typecheck`, `pnpm lint` e `git diff --check`.
4. Revisar item a item contra a norma de estilo, salvar capturas da exibição estrutural, os resultados de teste e o escopo não verificado, e então enviar e atualizar o status.

A conclusão exige simultaneamente evidências da string de origem/exibição e evidências de comportamento inalterado; a aprovação dos testes de requisição do Todo95 não substitui a aceitação deste item.

## 6. Implementação, verificação e revisão item a item

- F98-01: asserções de formatação escritas primeiro para o Built-in real, com confirmação de vermelho; arrumação de 51 dos 65 Maps, revision 12 → 13. Objetos aninhados expandidos, indentação de dois espaços, ternários simples na mesma linha, e o Map simples de limite de saída mantido compacto.
- F98-02: usando `9cd1ae31dd`, imediatamente anterior a este item, como base, todas as 65 Maps foram analisadas item a item e, removida a posição de origem, a AST é idêntica; os resultados de avaliação de 505 conjuntos são iguais. Depois de restaurar a string dos Maps e a revision, a comparação profunda de toda a configuração é idêntica. Não houve mistura de modificações em values, ordem de correspondência, Provider ou capacidade de modelo; nem scripts temporários de formatação nem novo formatter de runtime foram mantidos.
- F98-03: SSR valida a exibição do placeholder herdado e do value pessoal exatamente como são. Na cópia isolada do Pro, execução real `desktop-e2e-20260909-125010-082`, SC90-01 / F98-03 **2/2 aprovados**. Editar valor herdado não fixa; espaços consecutivos ao digitar um Map pessoal no teclado são preservados; cancelar não escreve em disco; salvar e reler devolve exatamente o que foi salvo; cancelar ao adicionar não escreve em disco. Capturas reais em 1200px / 390px confirmam que os controles não transbordam e que as quebras estruturais são preservadas, com ternários longos em tela estreita quebrando de forma natural pelo textarea existente.
- Bug adicional: antes da correção, no Pro, o log de `desktop-e2e-20260909-124116-723` mostrou `reorderPersonalModels` bem-sucedido durante a digitação e depois o salvamento com `expected 1 / current 2`; `desktop-e2e-20260909-124340-109` capturou diretamente por asserção a perda dos dois espaços. Depois que os testes de componente acusaram vermelho em 7 tipos de controle/Portal, o isolamento do início por teclado reaproveitou a determinação de alvo de interação já existente, e os 7 contraexemplos e o caso positivo de início por teclado na linha de modelo passaram; não houve contorno da validação de versão, simulação de colagem nem reescrita do Map do usuário para mascarar o problema.
- Localmente, os Provider / Provider Node / Option Map / UI relacionados somaram **29 arquivos, 422 testes aprovados**; o `pnpm typecheck` da raiz, o `pnpm lint` (39 avisos preexistentes / 0 erros) e a verificação de diff passaram. Testes e código de produto foram atualizados em conjunto.
- Revisão de abstração: a UI apenas exibe a string de origem e gerencia o rascunho, continuando a enviar o Personal Overlay pela via original de Settings; os limites públicos de compilação, execução, Selection e persistência do Map permanecem inalterados. Nenhum estado, assinatura, retry ou mecanismo de sincronização adicional foi introduzido; a modificação em React apenas filtra a entrada original do evento.
- Limites de verificação: 390px é uma simulação de layout do Electron e não representa verificação de shared-host de celular / Web real em produção. Os cases continuam pendentes e não são promovidos automaticamente. O verificador de fixtures existente não suporta o domínio de specs de settings; o manifest foi completado no formato já existente e os cases reais passaram, sem estender a correção da ferramenta de validação; a dívida de verificação existente continua sob o Todo102 e não avançou nesta rodada.