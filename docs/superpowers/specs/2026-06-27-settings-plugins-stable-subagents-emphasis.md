# Status Estável de Plugins nas Configurações e Ênfase no Escopo de Subagents

## Objetivo

O recurso de gerenciamento de Plugins encerrou a fase beta e a página de configurações não exibe mais o selo beta; ao mesmo tempo, continua-se destacando a limitação de escopo de que o painel Subagents atualmente não oferece criação ou edição em nível de workspace.

## Escopo

- O título principal da página de configurações de Plugins exibe apenas o título, sem o selo `Beta` / `测试`.
- O texto explicativo da página de configurações de Subagents mantém a explicação básica; o aviso de limitação de escopo é movido para o lado esquerdo do botão salvar do novo formulário de subagent.
- O aviso de limitação de escopo ganha um ícone de informação à frente e usa `text-foreground`, mantendo o i18n em chinês e inglês.

## Requisitos de UI

- Nem a área de conteúdo das configurações de Plugins nem a barra de navegação de configurações à esquerda exibem o status beta.
- O texto de limitação de escopo de Subagents é exibido no footer do formulário de novo subagent, à esquerda do botão salvar, com um ícone de informação à frente, usando `text-foreground`, sem hardcode de strings em chinês.
- Em layouts móveis e estreitos, o título mantém o layout normal, sem reservar espaço para o selo.

## Fora de escopo

- Não alterar o protocolo de plugin, a lógica de instalação ou os dados do marketplace.
- Não adicionar capacidade de criação ou edição de Subagents em nível de workspace.