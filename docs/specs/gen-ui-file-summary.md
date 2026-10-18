# Exibição de sessões para arquivos-fonte do Visualize

## Comportamento

O HTML de uma referência visualize válida é o arquivo-fonte da visualização inline. O
final do turno da sessão deixa de exibir um cartão de site HTML para o mesmo arquivo, e
também deixa de contá-lo no número de arquivos, linhas adicionadas, linhas removidas e na
lista expandida do resumo de alterações de arquivos.
Quando, após o filtro, não restam arquivos comuns, o bloco inteiro do resumo de alterações
(inclusive o botão de desfazer) não é exibido; em modificações mistas, os arquivos comuns
são mantidos.

O reconhecimento reutiliza o parser de referências Gen UI e dá suporte às três formas:
Unicode, `key=value` e JSON. Apenas casa caminhos absolutos completos e aprovados pelo
schema no corpo do turno atual; exemplos de código, referências inválidas ou não
fechadas não têm efeito.
Uma referência completa já serve para desduplicação, sem montar a visualização em streaming
antecipadamente. Os caminhos são comparados por caminho completo, compatíveis com
separadores do Windows, e não são ocultados em lote por basename, extensão ou por diretórios
chamados `visualizations`.
HTML comum, Markdown, Office/PDF e cartões de site em localhost mantêm o comportamento
original.

## Dados e temporização

```text
corpo assistant do turno atual → parser Gen UI existente → caminho do arquivo-fonte HTML
                                              ├→ filtra o cartão de prévia do final do turno
CLI fileChanges → leitura e cache de detalhes existentes → filtro da UI ─┴→ recalcula o resumo visível
CLI rewind preview / apply ─────────────────────→ desfazer do turno inteiro original
```

O resumo contém apenas valores agregados; não é possível saber pelo header quais são os
arquivos-fonte. Quando há referência válida, o estado colapsado também lê os detalhes de
`fileChanges` já existentes; enquanto a leitura não termina, o resumo não é exibido, para
evitar mostrar e depois remover estatísticas que incluam o arquivo-fonte.
Ao trocar de turno, ao passar de em execução para estado final, ao mudar a contagem do
resumo ou após um desfazer, apenas são usados os detalhes da requisição atual.
Se a requisição falhar, o resumo original e a entrada de re-tentativa de leitura são
mantidos, para evitar ocultar indevidamente arquivos comuns; erros seguem para o logger da UI.

O rastro bruto de alterações da CLI, os dados persistidos, a pré-verificação de desfazer e o
apply não são modificados. O desfazer de modificações mistas continua sendo o desfazer do
turno inteiro, e o diálogo de pré-verificação mostra o escopo completo da operação. Não
alteram-se a autorização de leitura de arquivos, a montagem de Gen UI nem o ciclo de vida do
sandbox.

Desktop e Web mobile compartilham as regras de filtro; o mobile continua respeitando as
limitações existentes de prévia de HTML e não ganha um novo ambiente de execução de Gen
UI. desktop-continuous e web-remote-replayable mantêm inalterados transporte, recuperação,
owner e fila. Caminhos remotos são comparados e lidos no mesmo contexto de
`workspaceIdentity` / `remoteSessionId`.

## Verificação

| Cenário                                                   | Asserção                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| Apenas visualize HTML                                    | A visualização permanece; o cartão HTML e todo o resumo somem       |
| visualize misturado com HTML/código-fonte comum            | Cartões comuns permanecem; estatísticas e lista expandida só com arquivos comuns |
| Três formas de referência, exemplos de código, referências inválidas/incompletas, mesmo nome em diretórios diferentes | Só se exclui o caminho completo da referência válida                |
| Detalhes assíncronos, requisição antiga chegando tarde, mudança de estado final/desfazer, falha de leitura | Não há flash de volta das estatísticas do arquivo-fonte, não se usam detalhes antigos; em caso de falha a entrada original permanece |
| 390px / desktop, temas claro e escuro, modo compact do mobile | Semântica de filtro consistente; arquivos comuns ainda expandíveis |

Testes unitários cobrem os candidatos a cartão, a projeção assíncrona do resumo e a
ligação no final do turno; o existente
`node packages/desktop/scripts/gen-ui-e2e.mjs` usa Electron real, sandbox de Gen UI e o
componente de resumo de arquivos para validar a exibição e a expansão. Fixtures não
representam validação real de recuperação por SSH ou pela rede do mobile.