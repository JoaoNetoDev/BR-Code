# Menu de Seleção de Modelo do Chat

> **Estado atual**: o lado do chat já foi migrado para o composer V4.

## Objetivo

A caixa de entrada do chat reutiliza `ModelConfigSelect`; a interação de seleção de modelo é hospedada por um menu simples, reduzindo o custo de operação de listas de Command do tipo busca nas trocas de modelo de escopo pequeno.

## Implementação atual

- `packages/ui/src/ModelConfigSelect.tsx`
  - Usa o componente `DropdownMenu` existente para renderizar o menu de modelos, mantendo `bg-menu`, altura de linha compacta e semântica de menu por teclado.
  - Com múltiplos providers, o menu de primeiro nível exibe os providers; ao passar o mouse ou expandir por teclado o submenu de segundo nível, são exibidos os models daquele provider.
  - A família Z.ai / BigModel exibe no título do grupo um badge curto com o modo de conexão atual, por exemplo `Start`, `Individual`, `Team`,
    `API`; o badge de modo de conexão usa um pill circular de superfície fraca, sem borda, e o item de model em si não repete o badge. O modo de conexão só é trocado na página de configurações; o menu da caixa de entrada apenas consome a selection atual.
  - Com apenas um provider, o menu de primeiro nível exibe diretamente a lista de models, sem uma camada extra de provider.
  - O model selecionado usa `DropdownMenuRadioItem` para preservar o estado de seleção única; models restritos pela tarefa em execução usam semântica de item desabilitado e dica de bloqueio, sem disparar a troca.
  - Quando o tipo de entrada da configuração do model inclui qualquer valor não textual, o nome do model é seguido de imediato por um badge compacto e localizado de "Visão / Vision". O badge usa um pill circular leve: borda fina, fundo de superfície fraca, `text-ui-xs` com peso de fonte médio; o badge pertence ao conteúdo do model à esquerda, e a posição do marcador de seleção no final da linha permanece a mesma. Ele apenas descreve os tipos de entrada já declarados no registry do provider e não promete que o adapter atual consiga enviar o anexo correspondente.
  - `Ctrl+M` apenas invoca o menu de models e não alterna models em sequência; a troca de model precisa ser uma escolha explícita do usuário no menu.
  - Na troca de texto do trigger, reusa a animação de rolling label do toolbar, mantendo consistência com os controles de mode / thought level; quando o sistema tem reduced motion ligado, faz a substituição estática direta.
  - A identidade de exibição de um provider customizado é resolvida por `providerName.trim() || providerId`, de forma consistente com o menu; quando o nome está ausente, é vazio ou tem apenas espaços em branco, o trigger ainda gera o prefixo `providerId/` e o title completo. A visibilidade do prefixo continua sendo decidida pela compressão em sete níveis. Planos de contas embutidos mantêm a regra de exibir apenas o nome do model.
  - O trigger do composer executa uma compressão cumulativa em sete níveis conforme o espaço real restante: quadrado de Computer Use → quadrado de mode → quadrado de Plan → ícone de think + pequena barra verde → ocultar o provider-text → quadrado de think (com a pequena barra verde oculta) → quadrado de model. Cada nível para assim que for suficiente, e a restauração acontece na ordem inversa quando há espaço. Quando o nome do model é exibido, mantém a linha única completa e a seta do dropdown; no último nível, troca diretamente por um botão de ícone Lucide `Package` de 28px e oculta a seta, sem omitir o texto do model por limiar de largura. As regras detalhadas estão em [contrato de layout do composer CUA](../superpowers/specs/2026-08-18-cua-composer-entry-design.md). O prefixo do provider e o nome do model devem permanecer como nós estruturados, sem cortar o texto final por `/`; o title do botão e a chave da animação rolling continuam usando o texto de identidade completo. Movimento comum e reduced motion compartilham a mesma estrutura de container de linha única, evitando que provider e model sejam separados em duas linhas pelos estilos de truncamento. Tela dividida do desktop, Web comum e Web mobile seguem esta regra.
  - O item de model também trata o ID do model como string opaca; `openrouter/ox-alpha` ou mais níveis de `/` não participam da verificação de capacidade nem da divisão de nome, e o valor selecionado continua usando o ID completo.
  - Enquanto a troca de model está pendente, o loading spinner fica depois do texto, evitando salto visual causado pela mudança de largura à esquerda do nome do model.
  - A entrada "Gerenciar modelos" continua sendo controlada pelo chamador; apenas o componente hospedeiro muda, sem alterar a cadeia de navegação das configurações.
- `packages/ui/src/v4/composer/V4ComposerToolbar.tsx`
  - Responsável apenas por passar ao `ModelConfigSelect` o grupo de models, o estado de bloqueio e o callback de troca do toolbar do chat.
- `packages/ui/src/v4/ConversationComposer.tsx`
  - Os três pickers de configuração (mode, model e profundidade de pensamento) compartilham o estado de aberto local do composer; no máximo um picker fica expandido por vez. Ao clicar em outro trigger, o picker antigo deve sair primeiro do estado visível e o picker clicado depois permanece aberto.
  - O callback tardio de fechamento do picker antigo só pode limpar a si mesmo e não pode fechar junto o picker irmão que já assumiu.
  - O owner do picker só é válido dentro do `workspaceKey + sessionId/draft scope` atual; na troca de scope ele deve ser limpo sincronamente. A instância React de `ConversationComposer` pode ser reutilizada entre task/draft, mas o estado de aberto não pode persistir entre scopes nem abrir automaticamente.

## Limites de compatibilidade

- Desktop e Web compartilham o mesmo componente React, e a interação do menu não introduz lógica específica de plataforma.
- A exclusividade mútua entre pickers pertence apenas a uma instância de composer, não entra em store global e não é sincronizada através de pane, window ou dos limites desktop continuous / web-remote replayable.
- O Web mobile continua evitando forçar a restauração do foco da caixa de entrada após fechar o menu, para impedir que o teclado do sistema em dispositivos de toque cubra o menu; o trigger de model não mantém lógica de largura fixa, truncamento de texto ou recorte de provider exclusiva de mobile, dependendo unicamente da decisão de espaço disponível do composer.
- O menu de models por provider do ZCode Agent é filtrado pelo formato de endpoint de runtime; o diretório atual pode conter models Anthropic-compatible, OpenAI-compatible Chat Completions e OpenAI Responses; a entrada `/model` do Bot reutiliza o mesmo limite de capacidade de provider.
- A seleção em uma session existente é escrita na CLI pelo `switchModelConfig` da V4; a seleção de rascunho é escrita por `useDraftConfigControl` em `draftConfigRef`, no default do workspace e na session de pré-aquecimento. A recuperação remota deve preservar workspaceIdentity / remoteSessionId e não passa pela gravação legacy de model de task.