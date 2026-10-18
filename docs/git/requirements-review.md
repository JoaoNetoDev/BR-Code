# Revisão de requisitos e checklist de aceitação do Git

Data de atualização: 2026-04-09

## Descrição do documento

Este documento organiza o resultado atual do desenvolvimento da integração do Git.

A linha de base da revisão vem de:

- `docs/git/requirements.md`
- a implementação de código já entregue

Este documento registra apenas dois estados:

- `Estado de implementação`
  - `Concluído`: o código já foi implementado e o fluxo principal da funcionalidade é executável
  - `Não concluído`: a implementação atual diverge do requisito, ou ainda não foi entregue
- `Estado de aceitação`
  - por enquanto, uniformemente registrado como `Não aceito`
  - a aceitação precisa ser feita manualmente pelo usuário
  - após o usuário aceitar com sucesso, atualizar para `Aceito`

## Escopo desta integração

Trabalho central já concluído nesta integração:

- UI do Git conectada ao `IGitService` real
- `Não staged` / `Staged` / `Todas as alterações de branches` migrados para dados reais do repositório
- `Alterações da rodada anterior` mantém a cadeia de snapshot por turno da task do ZCode
- O pane do Git suporta diff real de arquivo único, carregado sob demanda
- A entrada do Git no topo e o pane do Git reutilizam o mesmo estado de Git

Julgamento geral atual:

- O fluxo principal da UI do Git com o service real já está rodando
- A funcionalidade já entrou na fase de "aceitável por inspeção manual"
- Ainda há poucos itens de requisito com desvio do `requirements.md` original, que precisam de confirmação posterior

## Lista de requisitos

| Item de requisito                                                                                 | Estado de implementação | Estado de aceitação | Observação                                                          |
| ------------------------------------------------------------------------------------------------ | ------------------------ | ------------------- | ------------------------------------------------------------------- |
| A entrada do Git fica em `WorkspaceHeader`, com suporte a abrir/fechar o pane do Git à direita      | Concluído               | Aceito             | Entrada superior e lógica de alternância já conectadas                      |
| Exibir no topo a cápsula de estatística `Git + +/-` quando há alterações                            | Concluído               | Aceito             | Visível mesmo com o pane do Git fechado                             |
| O pane do Git reaproveita o pane compartilhado à direita, no mesmo slot de Browser / Code Viewer   | Concluído               | Aceito             | Integrado ao layout principal existente                            |
| O pane do Git mantém estrutura leve: barra de título, troca de origem e área de conteúdo principal | Concluído               | Aceito             | Ainda é um layout leve somente leitura                                |
| Suportar quatro origens: `Não staged` / `Staged` / `Todas as alterações de branches` / `Alterações da rodada anterior` | Concluído | Aceito   | As quatro origens podem ser trocadas                                 |
| Após trocar a origem, lista de arquivos, filtro de diretório e conteúdo do diff trocam em conjunto    | Concluído               | Aceito             | As estatísticas do topo seguem o mesmo conjunto de dados            |
| `Não staged` / `Staged` / `Todas as alterações de branches` conectados a dados reais do repositório | Concluído               | Aceito             | Já conectado ao `IGitService` real                                   |
| `Alterações da rodada anterior` reutiliza de preferência o snapshot de arquivos por turno e o resumo da task atual | Concluído | Aceito   | Mantém a visão somente leitura                                      |
| A lista de arquivos exibe o caminho completo relativo ao workspace                                  | Concluído               | Aceito             | Exibido por item da lista                                            |
| A lista de arquivos exibe estatísticas `+/-`                                                       | Concluído               | Aceito             | Exibe a variação de linhas                                           |
| Itens diferentes de `Não staged` podem exibir badge de status                                      | Concluído               | Aceito             | Inclui `Staged` / `Não rastreado` / `Conflito` / `Comparação de branches` |
| Itens de arquivo suportam expandir / recolher                                                      | Concluído               | Aceito             | Suporta diff inline ao expandir                                      |
| Suportar quatro tipos de diff: `Não staged` / `Staged` / `Todas as alterações de branches` / `Alterações da rodada anterior` | Concluído | Aceito | Diff carregado sob demanda                                           |
| Aviso de impossibilidade de pré-visualização para arquivos binários                               | Concluído               | Aceito             | Já existe texto de degradação                                        |
| Aviso de truncamento para diffs muito grandes                                                      | Concluído               | Não aceito         | Já existe texto de degradação                                        |
| Aviso de indisponibilidade quando não é possível gerar o patch                                     | Concluído               | Não aceito         | Já existe texto de degradação                                        |
| Ao abrir a árvore de arquivos no pane do Git, a barra lateral de diretórios abre à direita          | Concluído               | Aceito             | Já é possível expandir a árvore à direita                           |
| A árvore de arquivos suporta recolher / expandir diretórios                                        | Concluído               | Aceito             | Já suportado                                                         |
| O topo da árvore de arquivos suporta filtrar arquivos dentro da árvore do diretório atual           | Concluído               | Aceito             | A entrada "Todos os diretórios" foi substituída por campo de busca, com filtro instantâneo |
| Após selecionar um diretório, a área principal mostra apenas as alterações de arquivos desse diretório | Concluído             | Aceito             | Filtro por diretório já suportado                                    |
| A versão atual não inclui o cabeçalho de resumo do repositório                                      | Concluído               | Aceito             | Não exibe blocos de informação como repo root, branch, ahead/behind |
| A versão atual não inclui a área inferior de commit                                                | Concluído               | Aceito             | Área de commit não restaurada                                        |
| A versão atual não inclui a área de dica de identidade do commit                                   | Concluído               | Aceito             | A UI não exibe a área de identidade                                   |
| A versão atual não inclui a área de botões de ações em lote                                        | Concluído               | Aceito             | A UI não exibe a área de ações em lote                              |
| A versão atual trata pelo menos o estado vazio "a origem atual não tem nenhuma alteração"          | Concluído               | Não aceito         | Suportado                                                            |
| A versão atual trata pelo menos o estado vazio "diff não pode ser pré-visualizado"                  | Concluído               | Não aceito         | Suportado                                                            |
| A camada de UI precisa manter o log do pane do Git                                                 | Concluído               | Aceito             | Registra troca de origem, expansão de arquivo, abertura da árvore, seleção de diretório etc. |
| Abrir / fechar o pane do Git precisa registrar log                                                  | Concluído               | Aceito             | Registrado por `useAppPanels`                                         |
| Manter compatibilidade de internacionalização                                                       | Concluído               | Aceito             | Textos em chinês e inglês complementados                             |
| Manter a direção de compatibilidade com os dois temas                                              | Concluído               | Aceito             | A implementação atual não introduziu divergência destrutiva de tema |
| Manter a direção de compatibilidade local / remota / multi-SO                                      | Concluído               | Não aceito         | Conectado pela cadeia unificada `IGitService`                        |

## Conclusão atual

A conclusão é:

1. A integração principal da UI do Git com o service real está concluída.
2. O fluxo principal da funcionalidade já funciona e já tem condição de aceitação manual.
3. Atualmente, todos os itens de requisito estão uniformemente em `Não aceito` no `Estado de aceitação`, aguardando confirmação manual do usuário.
4. Após o usuário aceitar item a item, os estados deste arquivo serão atualizados conforme o resultado da aceitação.

## Regras de atualização após a aceitação

Depois, atualiza-se da seguinte forma:

- Se o usuário confirmar aprovação: alterar o `Estado de aceitação` do item correspondente para `Aceito`
- Se o usuário confirmar reprovação: manter `Não aceito` e complementar o problema nas observações
- Se o usuário solicitar ajuste de implementação: primeiro alterar o código e depois atualizar o `Estado de implementação` e as observações do item correspondente