# Chat Long Paste Text Attachment

## Contexto

A caixa de entrada do chat usa Lexical para o corpo da mensagem. Quando o usuário cola um texto muito longo direto na caixa de entrada, a serialização do editor, a sincronização de rascunho e a experiência de digitação no celular ficam pesadas. A cadeia de anexos existente já consegue enviar anexos de arquivo `text/plain`; portanto, a colagem de texto longo deve entrar na semântica de anexo em vez de continuar expandindo o corpo da mensagem.

## Regras de produto

- Apenas o conteúdo de texto puro da área de transferência é tratado.
- Quando o texto puro tem 5120 code units UTF-16 ou mais, a colagem deixa de inserir o conteúdo no corpo da caixa de entrada e passa a gravar no diretório temporário do host, criando um anexo de arquivo local.
- A decisão de disparo não depende do número de linhas: um JSON, log ou base64 de linha única e muito longo também vira anexo; um trecho pequeno de várias linhas, abaixo do limite, mantém o comportamento padrão de colagem do navegador e do Lexical.
- O número de linhas continua sendo calculado de forma compatível com `\n` / `\r\n` / `\r`, mas serve apenas como metainformação de exibição do chip do anexo e não participa da decisão de converter em anexo.
- Se a mesma colagem contiver arquivos, a lógica de anexo de arquivo tem prioridade, evitando que capturas de tela, arquivos de texto arrastados ou outras formas de anexo sejam confundidas com colagem de corpo de mensagem.
- Se a criação do arquivo temporário no host falhar, a colagem permanece bloqueada e exibe o erro de anexo, sem voltar a inserir o texto longo no corpo.
- A conversão em anexo não reescreve o corpo já existente na caixa de entrada; um corpo vazio também permite enviar apenas com anexos.
- A quantidade de anexos continua reaproveitando o limite de anexos do chat: no máximo 8.

## Dados do anexo

Na UI, o anexo de colagem de texto longo é registrado como `sourceKind: "clipboard-text"` e mantém:

- `lineCount`: número de linhas do texto original da área de transferência.
- `charCount`: quantidade de caracteres do texto original da área de transferência.
- `sizeBytes`: quantidade de bytes UTF-8 após o host gravar o arquivo temporário.
- `filename`: nome de arquivo `.txt` rastreável pela máquina, por exemplo `pasted-text-20260627-153012.txt`.
- `localPath`: caminho do arquivo temporário do host.

O conteúdo de texto longo é gravado em `{ZCODE_DATA_BASE_DIR || HOME}/.zcode/tmp/paste-attachments/YYYY-MM-DD/`. O nome do arquivo usa um nome com timestamp mais um sufixo aleatório, evitando expor o conteúdo do corpo ou gerar conflitos. O protocolo de envio reaproveita o `kind: "file"`, `mimeType: "text/plain"` e o caminho `localPath` existentes, carregando a marca `sourceKind: "clipboard-text"` e sem carregar mais `textContent`, evitando que o texto longo entre diretamente no payload do prompt ou no contexto do modelo.

Depois de receber essa marca, o Agent deve tratá-la como um anexo de arquivo local temporário enviado pelo usuário: na requisição ao modelo aparece apenas a referência de anexo por caminho de arquivo, o conteúdo do arquivo não é lido automaticamente e nenhum system reminder `prompt_attachment` é gerado. Só quando o modelo chamar explicitamente uma ferramenta de leitura de arquivo é que o conteúdo do arquivo temporário entra no contexto. Arquivos de texto pequenos enviados normalmente pelo usuário mantêm o comportamento existente e podem continuar sendo projetados como contexto de anexo tipo Read.

O Web comum não tem sistema de arquivos de host e portanto não suporta essa capacidade; o controle remoto Web pelo celular precisa gravar através do shared-host/platform proxy no diretório temporário do host desktop conectado, sem simular um caminho local no navegador do celular.

## Exibição na UI

A área de anexos do Composer mantém um chip em uma linha:

```text
[clipboard-pen-line] Texto colado · 128 linhas [x]
```

- O ícone usa o lucide `ClipboardPenLine`.
- O título usa texto internacionalizado e não exibe diretamente o nome de arquivo da máquina.
- O número de linhas é exibido como metainformação na mesma linha; quando falta espaço, título e metainformação são truncados por inteiro, e o botão de exclusão fica fixo à direita.
- O corpo do chip e o overlay do botão de exclusão usam `background` como cor de fundo, evitando que a máscara à direita e o corpo do anexo apareçam em níveis de surface diferentes.
- O botão de exclusão faz referência ao side pane tab: usa no lado direito do chip uma área de fechamento em overlay exibida em hover/focus, com máscara em gradiente cobrindo o fim do texto, evitando que o texto de linhas e o botão se apertem.
- O estilo visual reaproveita o chip de anexo inline existente, sem novo container em formato de cartão.

## Fronteiras entre plataformas

- Desktop, Web e controle remoto pelo celular passam pela mesma lógica de colagem da UI e pelo mesmo protocolo de anexo de prompt, sem novo runtime e sem alterar a arquitetura de anexos do shared-host.
- Essa funcionalidade afeta apenas a organização da entrada do composer antes do envio, não altera a semântica de task stream do continuous do desktop nem do replayable do web remote.