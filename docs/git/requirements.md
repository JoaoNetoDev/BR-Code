# Requisitos de设计 do Git

## Posicionamento do documento

Este documento descreve a linha de base de requisitos de produto da UI de Git da versão atual, tomando como referência o design existente já confirmado, sem discutir detalhes de implementação de service, RPC ou Git CLI.

## Linha de base do design atual

A capacidade de Git da versão atual está posicionada como um "painel leve de revisão de alterações", com prioridade para resolver o problema de o usuário ver rapidamente, dentro do ZCode, o que mudou no workspace atual.

O foco desta versão é:

- Oferecer no topo uma entrada clara de Git e um indicativo de alterações
- Acrescentar no topo um menu leve de operações Git (commit / push / criar branch)
- Verificar alterações de diferentes origens dentro do pane compartilhado à direita
- Navegar por arquivos e diffs de forma leve, em coluna única e com baixa carga

Esta versão não busca uma experiência completa de workbench do Git.

## Objetivos de produto

- Permitir que o usuário perceba se existem alterações sem sair do workspace atual
- Permitir que o usuário veja rapidamente as alterações de arquivos de diferentes origens no workspace atual
- Fazer a UI de Git compartilhar o pane à direita com o Browser / Code Viewer existentes, evitando introduzir nova complexidade no layout principal
- Manter os rumos de tema duplo, internacionalização e compatibilidade local / remota / multi-sistema operacional

## Não objetivos

- Não fazer um IDE completo de Source Control
- Não fazer um grande painel de resumo do repositório, sem exibir blocos de informações como repo root, branch, ahead / behind
- Não fazer área de commit na parte inferior, área de indicação de identidade, área de operações em lote
- Não fazer stage / unstage / discard, pull / fetch, rebase, stash, editor de merge, grafo de histórico
- Não fazer visualização de colaboração remota do GitHub / GitLab

## Principais cenários de usuário

### Cenário 1: Quero saber se o workspace atual tem alterações

O usuário não precisa abrir o pane de Git antes.

Esperado:

- Aparece uma entrada de Git na barra superior
- Ao detectar estatísticas de alterações `+/-`, a entrada exibe diretamente o ícone do Git e o resumo `+/-`
- O usuário sabe, por essa entrada, que existem alterações no workspace atual

### Cenário 2: Quero navegar rapidamente por um tipo de alteração

Após clicar na entrada de Git do topo, o usuário vê as alterações no pane à direita.

Esperado:

- É possível alternar entre `未暂存`、`已暂存`、`全部分支更改`、`上一轮更改`
- É possível ver os arquivos em uma lista de coluna única
- É possível expandir um arquivo e ver diretamente o diff inline

### Cenário 3: Quero filtrar as alterações por diretório

O usuário clica em "Mostrar árvore de arquivos" no pane de Git.

Esperado:

- Uma barra lateral de diretórios aparece à direita
- A barra lateral exibe apenas os níveis de diretório, não os arquivos
- Após selecionar um diretório, a lista de arquivos da área principal é filtrada sincronamente

## Escopo funcional

## 1. Entrada de Git no topo

### 1.1 Posição da entrada

A entrada de Git fica na barra superior do `WorkspaceHeader`, no mesmo grupo de interação das entradas de Terminal / Browser.

### 1.2 Regras de exibição

- Quando o workspace atual não tem estatísticas de alterações a exibir, a entrada aparece como um botão comum com ícone do Git
- Quando o workspace atual tem estatísticas de alterações `+/-`, a entrada aparece como um botão cápsula integrado "ícone do Git + `+/-`"
- Essa estatística de alterações não depende de o pane de Git já estar aberto

### 1.3 Regras de interação

- Ao clicar, abre a visão de Git no pane compartilhado à direita
- Clicar novamente fecha
- O estado aberto deve ter um estado selecionado claro

### 1.4 Menu de operações Git do topo

- Adiciona uma entrada cápsula "Commit" à esquerda do botão de alternância do Terminal
- Ao clicar, abre um menu suspenso; a versão atual mantém apenas:
  - `提交`
  - `推送`
  - `创建 branch`
- `提交` abre um diálogo independente, coletando as alterações não commitadas no escopo do workspace atual e fazendo stage unificado antes do commit
- `推送` abre um diálogo independente e executa um `git push` real; se o branch atual não tiver upstream, ele é criado automaticamente no primeiro push
- `创建分支` reaproveita o diálogo de criação de branch da cadeia existente de troca de branch; neste menu não é oferecido "trocar para um branch existente"

## 2. Pane de Git

### 2.1 Posicionamento do layout

O pane de Git reaproveita o pane compartilhado à direita existente, ocupando o mesmo slot do Browser / Code Viewer.

### 2.2 Estrutura atual

A versão atual adota um layout leve, dividido em três camadas:

- Barra de título superior
  - Título do Git
  - Marcador de placeholder da UI
  - Botão de fechar
- Barra de ferramentas
  - Dropdown de troca de origem à esquerda
  - Botão "Mostrar árvore de arquivos / Ocultar árvore de arquivos" à direita
- Área de conteúdo principal
  - Exibe por padrão uma lista de arquivos em coluna única
  - Com a árvore de arquivos aberta, exibe a barra lateral de diretórios à direita

### 2.3 Conteúdo explicitamente fora do design atual

A versão atual não inclui as seguintes áreas:

- Cabeçalho de resumo do repositório
- Árvore de estado por grupos à esquerda
- Grande painel de diff independente à direita
- Área de commit na parte inferior
- Área de indicação de identidade de commit
- Área de botões de operações em lote

## 3. Troca de origem das alterações

### 3.1 Origens suportadas

A versão atual suporta as seguintes origens:

- `未暂存`
- `已暂存`
- `全部分支更改`
- `上一轮更改`

### 3.2 Requisitos de interação

- A troca de origem é feita por seleção em dropdown
- Após a troca, a lista de arquivos, o filtro de diretórios e o conteúdo do diff mudam sincronamente para o conjunto de dados correspondente
- A origem selecionada também afeta a origem das estatísticas usadas pela entrada de Git no topo

### 3.3 Restrição somente leitura

A versão atual é projetada, no geral, como "navegação de alterações":

- `上一轮更改` é uma visão somente leitura
- As demais origens também têm hoje apenas a responsabilidade de visualização, sem promessa de operações de escrita reais do Git

## 4. Lista de arquivos e diff

### 4.1 Lista de arquivos

A versão atual adota por padrão uma lista plana de coluna única, em vez de uma área de arquivos em árvore por padrão.

Requisitos dos itens da lista:

- Exibir diretamente o caminho completo relativo ao workspace
- Exibir as estatísticas `+/-` daquele arquivo
- Itens que não sejam `未暂存` podem exibir um badge de status, por exemplo `未跟踪`、`冲突`、`已暂存`
- Suportar expandir / recolher

### 4.2 Estado expandido

Após o arquivo ser expandido:

- Não repete mais o caminho completo nem as estatísticas `+/-`
- Entra diretamente no conteúdo do diff

### 4.3 diff

A versão atual suporta:

- diff de `未暂存`
- diff de `已暂存`
- diff de `全部分支更改`
- diff de `上一轮更改`

Requisitos de degradação:

- Arquivos binários exibem um aviso de impossibilidade de pré-visualização
- Diffs muito grandes exibem um aviso de truncamento
- Quando não for possível gerar patch, exibe um aviso de indisponibilidade

## 5. Barra lateral da árvore de arquivos

### 5.1 Forma de acionamento

Após clicar no botão "Mostrar árvore de arquivos" da barra de ferramentas, a barra lateral de diretórios é expandida à direita do pane de Git.

### 5.2 Regras de exibição

- A barra lateral exibe apenas os níveis de diretório
- Não exibe arquivos na barra lateral
- Suporta recolher / expandir diretórios
- Suporta uma entrada "Todos os diretórios"

### 5.3 Regras de filtro

- Após selecionar um diretório, a área principal exibe apenas as alterações de arquivos daquele diretório
- Ao voltar para "Todos os diretórios", a lista completa de arquivos é restaurada

## 6. Requisitos de origem dos dados

### 6.1 Origens permitidas na versão atual

A versão atual permite misturar dados mock com dados de sessão já existentes:

- `未暂存` / `已暂存` / `全部分支更改`: permitido usar mock no frontend primeiro
- `上一轮更改`: preferencialmente reaproveitar o snapshot de arquivos por turno da task atual e seu resumo

### 6.2 O que a versão atual não exige

A versão atual não exige ainda:

- `git status` real
- comparação real de branches
- serviço real de árvore de arquivos
- leitura real da identidade de commit

## 7. Escopo das operações de escrita

A versão atual abre apenas 3 operações de escrita leves no menu do topo:

- `commit`
- `push`
- `create branch`

Esta versão ainda não exige:

- stage de arquivo individual
- stage de múltiplos arquivos selecionados
- unstage
- discard
- criação de PR no GitHub / GitLab

Ou seja, o limite de escrita desta versão é "ação pontual no topo", e não um painel completo de Source Control.

## 8. Estados vazios e de erro

A versão atual precisa tratar pelo menos:

- A origem atual não tem nenhuma alteração
- Não há arquivos no diretório selecionado
- O diff não pode ser pré-visualizado

Os estados de erro mais completos a seguir podem ser complementados na etapa de integração do service real:

- Git não instalado
- O workspace atual não está dentro de um repositório Git
- Repositório Git corrompido
- Comando Git expirou ou falhou na execução
- Conexão remota interrompida

## 9. Requisitos de logging

Como o pane de Git é uma área de alta interação, a camada de UI da versão atual precisa manter logs.

Registrar no mínimo:

- abrir / fechar o pane de Git
- trocar a origem das alterações
- expandir / recolher arquivos
- abrir / fechar a árvore de arquivos
- selecionar diretório

## 10. Direções de expansão futura

Sem alterar a linha de base de UI atual,posteriormente pode-se expandir por etapas:

1. Integrar o `IGitService` real
2. Fazer `未暂存` / `已暂存` / `全部分支更改` passarem aos dados do repositório real
3. Em seguida, reavaliar se a área de commit, a área de indicação de identidade e a área de operações em lote devem ser restauradas
4. Só por último expandir de fato as capacidades de stage / unstage / discard / commit