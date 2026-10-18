# Todo141: Alinhamento do layout do diálogo de edição de modelo e da experiência de configuração avançada

Status: concluído (implementado e revisado novamente após nova autorização do usuário em 2026-09-12). As decisões abaixo foram reconectadas sobre o editor existente, sem mesclar diretamente o código do branch de produto.

## Origem e Limites

- Comparação entre `origin/feat/model-config-ux` (`20648a44f9`, implementação de produto `7d581b31e6`) e o local `ff9a8463e0`.
- As mudanças visuais e de interação aprovadas foram reconectadas sobre o editor atual, sem sobrescrever o arquivo inteiro. O branch de produto se baseia no editor antigo e ainda contém cartão interno, tipo de saída, MFJS e cores de checkbox/semântica de acessibilidade diferentes; esses não são adotados.
- Após a implementação deste Todo, prevalecem a posição dos campos, a posição do switch inteligente e o layout dos botões inferiores do Todo134; o rascunho, a sobrescrita, a validação manual e a proteção assíncrona do Todo134 continuam válidos.
- Apenas o diálogo de adicionar/editar modelo é ajustado; não se estende nem altera a página de Provider, o menu de seleção de modelo, os tipos de configuração de baixo nível, a requisição de modelo, a sincronização de conta nem a migração de dados.

## Layout Final

| Área                                   | Conteúdo e ordem                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| Linha independente abaixo do título   | Nome da configuração inteligente, ícone de interrogação e switch alinhados à esquerda horizontalmente, com o espaçamento interno compacto do branch de produto |
| Corpo padrão                          | ID do modelo, janela de contexto, token máximo de saída                         |
| Configuração avançada, recolhida por padrão | Tipo de entrada, capacidades do modelo, grupo de configuração de raciocínio |
| Grupo de configuração de raciocínio    | **Nível de raciocínio e mapeamento de parâmetros de raciocínio adjacentes, no mesmo grupo**; sem distribuição espalhada e sem adicionar borda de cartão |
| Inferior esquerdo                     | «重置表单 / Reset form»: botão de texto menor e sublinhado                       |
| Inferior direito                      | Cancelar, Salvar; Salvar é o botão principal                                    |

- O texto da página é unificado como «推理等级», preservando a descrição «从低到高»; o que se edita é a lista ordenada de níveis suportados pelo modelo, e não o nível atual da sessão. Em inglês, mantém-se Reasoning levels.
- A entrada de avançado usa «高级配置 / Advanced settings».
- Mantém-se o layout atual sem cartão interno; não se restauram bordas de grupo, fundo nem padding extra.
- O espaçamento entre campos de cerca de 24px passa a 16px; entre rótulo e campo de entrada cerca de 4px; o espaçamento entre opções dentro do mesmo campo permanece como está. 16px é uma exigência explícita desta rodada e não significa que o código de produto já esteja completamente implementado.
- Mantêm-se o diálogo externo, o título fixo e o rodapé fixo, com apenas o corpo rolável; em telas estreitas é permitido quebrar linha de forma razoável, sem espremer as ações nem gerar overflow horizontal.

## Controles e Interação de Expansão

- Todos os tipos de entrada exibem indicador de checkbox, inclusive texto; o texto fica sempre marcado e não pode ser desmarcado, preservando a nota de bloqueio. Imagem, vídeo e PDF seguem a capacidade de edição atual.
- As capacidades do modelo continuam usando os checkboxes existentes. Reaproveita-se o estilo de indicador atual, sem mudar cor ou semântica de acessibilidade externa conforme o branch de produto e sem aninhar um segundo checkbox interativo.
- A entrada de avançado exibe cor de fundo apenas no hover, fica transparente ao afastar o ponteiro e preserva o foco de teclado visível; a direção da seta muda conforme o estado de expansão.
- Adiciona-se animação de expansão/recolhimento e de fade do conteúdo, reaproveitando primeiro as capacidades dos componentes existentes; a animação não pode deixar invisível o conteúdo, a borda de sobrescrita ou o foco de erro.
- Expandir/recolher apenas muda a apresentação, sem perder rascunho nem estado de edição local do nível de raciocínio, e sem disparar salvamento, reinicialização ou consultas extras de configuração. O commit normal por perda de foco continua seguindo o comportamento existente.
- Ao fechar e reabrir o diálogo, a configuração avançada vem recolhida por padrão.

## Comportamentos Preservados e Conexões Necessárias

1. Adicionar e editar compartilham a mesma visão; mantêm-se as regras existentes de ID somente leitura, foco inicial, tratamento de IME, atributos de input técnico e exclusão de arraste.
2. «重置表单» é apenas uma renomeação e um estilo, e continua chamando a lógica existente de restauração de rascunho: restaura todo o rascunho editável, preservando o ID do modelo e o `enabled` independente, sem salvar imediatamente e sem voltar aos valores do momento em que foi aberto.
3. Básico e avançado pertencem ao mesmo rascunho e ao mesmo salvamento. O recolhimento do avançado não pula validação; tipo de saída e MFJS não voltam para a página, para o rascunho nem para a validação de obrigatório invisível, mantendo o limite atual de schema editável manualmente.
4. O posicionamento dos erros estruturados é ajustado às novas posições: erros de nível de raciocínio e de mapeamento de parâmetros de raciocínio expandem automaticamente e focam o controle correspondente; o erro de saída máxima é localizado no campo básico e não dispara mais a expansão do avançado. Após um recolhimento manual, reenviar o mesmo erro ainda é localizado.
5. O componente de recolhimento por padrão do produto não está integrado ao mecanismo local de expansão automática por erro, portanto não pode ser simplesmente substituído; a animação de expansão e o momento do foco precisam ser coordenados, sem usar atrasos arbitrários como fallback.
6. Durante o salvamento a edição continua bloqueada, e o switch inteligente, que foi para a área do título, também precisa ser desabilitado; preserva-se o feedback de salvamento e o comportamento de cancelar.
7. A borda de sobrescrita pessoal, o placeholder herdado, o texto de ajuda, a edição/ordenação dos níveis de raciocínio, o formato de edição do Map e as proteções de recuperação e de requisição expirada permanecem inalterados.

## Implementação e Aceitação

- [x] Atualizar primeiro os testes correspondentes de layout/interação e só então implementar conforme as abstrações atuais; não copiar as expectativas dos testes antigos do branch de produto sobre os limites locais.
- [x] Entradas de adicionar/editar: três campos por padrão, grupo avançado, nível de raciocínio em chinês e textos em inglês, switch inteligente no título, ordem inferior e estilo de reset conforme a tabela acima.
- [x] Nível de raciocínio e mapeamento adjacentes; texto marcado e bloqueado, demais opções editáveis; destaque de sobrescrita mantido, sem cartão interno, tipo de saída ou MFJS.
- [x] A animação de expandir/recolher preserva valores de campo e estado de edição local, sem escrever configuração; cancelar não salva e a reabertura vem recolhida por padrão.
- [x] Erros ocultos de nível de raciocínio/Map expandem e focam, erros repetidos continuam válidos; o erro de saída máxima é localizado no campo básico.
- [x] O reset só altera o rascunho, básico/avançado são salvos em conjunto, os limites de validação do modo manual, o bloqueio durante o salvamento e a proteção contra resultado assíncrono expirado não regridem.
- [x] Verificação de mesclagem cobrindo desktop em tela larga/celular em tela estreita, tema claro e escuro, chinês e inglês, operação por teclado e rolagem do corpo; atualização dos testes unitários relacionados e do E2E de interação, registrando explicitamente o que não foi executado de verdade.
- [x] Revisão item a item após a conclusão, com execução das verificações de tipo, lint e arquitetura relacionadas; registrar evidência real antes de marcar como concluído, e não tratar a revisão somente leitura atual como aceitação de implementação.

## Registro de Implementação, Verificação e Revisão

- A mudança de layout ficou restrita ao diálogo compartilhado de edição de modelo, à exibição dos campos e aos textos. `useProviderModelDraft`, a validação de envio, a serialização do Overlay, a configuração de requisição e a sincronização não foram modificados; adicionar e editar compartilham os limites de dados existentes.
- A área avançada usa transição de altura/opacidade em CSS grid com montagem permanente; quando recolhida, `inert` e `aria-hidden` excluem interação e navegação por leitor de tela; o estado local da edição de níveis é preservado. A expansão segue o campo do erro estruturado, o foco é coordenado pelo evento `finished` real da animação, e revalidação e fechamento do diálogo limpam o foco antigo sem adicionar retentativas com atraso.
- No navegador, primeiro vermelho e depois verde; o `provider-settings-batch.test.mjs` completo passou **26/26**, sendo que os quatro casos do Todo141 cobrem adicionar/editar, 390px chinês claro / 1200px inglês escuro, animação normal/reduzida, revalidação, rascunho local, erro básico, salvamento conjunto, reabertura e cancelamento. O reset com condição de corrida, o bloqueio durante o salvamento, a configuração manual e a interação de ajuda do lote original também passaram.
- `providerModelMetadataDialog.test.ts`, `providerModelSmartDraft.test.ts`, `providerModelMaxOutputLookup.test.ts` e `modelConfigHelpCopy.test.ts` passaram **51/51**; o `pnpm typecheck` da raiz passou (incluindo a verificação de tipos do Desktop E2E); `pnpm lint` com 0 errors e 42 warnings já existentes; `pnpm architecture:check --changed` com 0 violations; a verificação de formatação dos arquivos modificados e o `git diff --check` passaram.
- A primeira rodada do gate de push ampliou para 328 arquivos de teste e encontrou quatro expectativas antigas não alinhadas em dois arquivos antigos: os campos avançados precisam ser expandidos primeiro, a saída máxima não pertence mais à área avançada e «推理档位» passou a «推理等级». As expectativas de posicionamento/texto foram corrigidas, preservando as asserções substantivas de que consulta atrasada não sobrescreve a entrada do usuário e de que editar e expandir não disparam consultas extras; foi acrescentada uma verificação do texto de reset; os quatro arquivos foram reprocessados em conjunto e passaram.
- Foram vistas capturas reais do navegador: espaçamento medido de 16px, sem overflow horizontal em tela estreita e, após expandir, o corpo rola enquanto título/rodapé permanecem; capturas e traces do Playwright estão em `/tmp/zcode-provider-settings-batch/todo141-*`.
- A revisão item a item confirmou: nível de raciocínio e mapeamento no mesmo grupo sem borda, saída máxima de volta à área básica; o texto reaproveita o checkbox original e o ícone de cadeado, sem mudar a semântica de acessibilidade das opções nem a cor de sobrescrita; o reset ainda altera apenas o rascunho e preserva ID e enabled; campos de sistema ocultos não entram nas regras de obrigatório manual.
- Limites: a execução real desta rodada foi a UI compartilhada em Chromium no Linux com fixtures de serviço isoladas, sem se passar por validação conjunta em Mac Electron ou em shared-host de celular. O `provider-model-smart-config.test.ts` nativo teve seletores/textos atualizados e passou na verificação de tipos, mas os casos nativos não foram reexecutados nesta rodada; casos pending não foram promovidos sem autorização. O Codegraph estava indisponível, e a revisão foi feita de forma direcionada pelo diálogo compartilhado, pelas duas entradas, pelo hook de rascunho, pela validação e pelos controles.