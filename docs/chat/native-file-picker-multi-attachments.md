# Especificação de Múltiplos Anexos no Seletor de Arquivos Nativo

## Contexto

O modelo de anexos da caixa de entrada do chat já suporta múltiplos anexos, e tanto a entrada de arquivos da Web quanto o ponto de entrada de drag and drop conseguem adicionar vários arquivos de uma vez; mas o seletor de arquivos nativo do desktop retornava apenas um único caminho local por meio de `selectFile()`, fazendo com que cada clique no botão de anexo adicionasse somente um arquivo.

## Objetivos

- O seletor de arquivos nativo da caixa de entrada do chat do desktop suporta selecionar vários arquivos de uma vez.
- Continuar usando o limite de anexos existente `MAX_CHAT_ATTACHMENTS = 8`; ao ultrapassar as vagas restantes, manter o comportamento atual de truncamento e de mensagem.
- Preservar a semântica de arquivo único de `selectFile()`, para que continue sendo usada em cenários de seleção de arquivo único, como chave privada SSH.
- O comportamento da Web, do controle remoto do celular e do ponto de entrada de anexos por drag and drop permanece inalterado.

## Solução

- A camada de plataforma ganha `selectFiles(): Promise<string[]>`, expressando apenas "selecionar vários caminhos absolutos locais acessíveis pelo agent".
- O processo main do Desktop ganha o handler IPC correspondente; o `showOpenDialog` do Electron usa `["openFile", "multiSelections"]`, retornando um array vazio ao cancelar.
- O preload / platform do renderer do Desktop expõe `selectFiles()`.
- A caixa de entrada do chat prioriza chamar `selectFiles()` quando `canSelectFilePath` for true; se o host antigo não tiver esse método, faz fallback para `selectFile()`.
- Cada caminho retornado reutiliza o `createChatComposerPathAttachment` e o `addPreparedAttachments` existentes, evitando um novo modelo de anexo.

## Não objetivos

- Não alterar pickers de arquivo/diretório único como o formulário de conexão remota, a seleção de chave privada e a seleção de diretório.
- Não alterar o `<input type="file" multiple>` da Web nem a lógica de análise de anexos por drag and drop.
- Não aumentar o limite de quantidade de anexos.