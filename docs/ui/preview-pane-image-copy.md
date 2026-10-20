# Ações de pré-visualização de imagem no painel lateral

## Download e adicionar ao chat (2026-10-14)

O usuário confirmou: "Adicionar ao chat" segue o modo de referência de arquivos da árvore de arquivos, adiciona ao campo de entrada atual e não envia automaticamente. Esta rodada cobre rascunho vazio, rascunho existente e isolamento de workspace; as combinações de estado de envio, fila, fork e rewind estão fora do escopo desta extensão.

- O menu de contexto da área da imagem oferece "Adicionar ao chat", "Copiar imagem" e "Baixar imagem". Em telas estreitas, o botão "Ações da imagem" expande o mesmo menu, evitando depender do botão direito e de botões empilhados horizontalmente.
- O download reaproveita o download limitado da pré-visualização de imagem em tela cheia e `IPlatformService.saveFile`; no desktop usa "Salvar como", cancelar não exibe erro, na Web usa o download do navegador. Salva os bytes originais e o formato da imagem (PNG/JPEG/WebP/SVG etc.), sem baixar SVG como captura de tela e sem alterar a semântica existente de copiar PNG.
- Após o salvamento nativo bem-sucedido, exibe-se apenas "Download concluído", sem mostrar o caminho do arquivo; a pré-visualização de imagem em tela cheia usa o mesmo aviso breve. Enquanto o navegador ainda não confirmou a gravação em disco, ainda se exibe "O download da imagem foi iniciado"; cancelar o salvamento não exibe aviso.
- Adicionar ao chat reaproveita `dispatchWorkspaceFileAddToChat`, que faz o Composer em foco anexar o mention de arquivo e recebe foco; preserva o texto e os anexos existentes, sem gerar user message, upload ou requisição ao Agent.
- A referência de arquivo precisa ter um source path real e `workspacePath`. A referência relativa só é gerada quando o caminho da imagem realmente está dentro do workspace de origem; imagens fora do workspace mantêm o caminho absoluto, mesmo que tenham o mesmo nome de um arquivo dentro do workspace. Arquivos locais usados em rascunhos sem vínculo ou de outro workspace local usam referência absoluta. Ao envolver um Host remoto, é obrigatório casar `workspaceIdentity?.trim() || workspacePath`; com identity remota diferente ou sem caminho de origem, a entrada de referência fica desabilitada e o path remoto não é inserido como path local.
- As extensões de download cobrem os formatos suportados pela pré-visualização: PNG/JPEG/APNG/AVIF/BMP/GIF/ICO/SVG/WebP. Quando o MIME é desconhecido, preserva-se a extensão de imagem do nome de arquivo confiável; para MIME conhecido, a prioridade é manter a extensão consistente com o formato.
- O download de SVG com caminho de origem lê, no clique, os bytes originais de forma limitada via o serviço de arquivos do workspace de origem já resolvido, sem usar a data URL recodificada a partir da pré-visualização textual. Somente SVG inline sem arquivo de origem é baixado conforme o conteúdo inline atual.
- O PreviewPane lê o conteúdo respeitando o source scope existente; a referência altera apenas o renderer draft do Composer atual; não altera `remoteSessionId`, shared-host attachment nem as semânticas de recuperação continuous/replayable.
- Enquanto a imagem não carregou ou a operação de imagem em andamento não terminou, copiar/baixar ficam desabilitados; quando não há Composer que possa receber, a adição da referência exibe explicitamente a falha.

```text
Caminho de arquivo SVG → leitura dos bytes originais pelo fileService do workspace de origem ─┐
Outros bytes originais de imagem/SVG inline ─────────────────────────────────────────────┴→ download limitado compartilhado → Desktop saveFile / Web download
Caminho atual da imagem + workspaceKey → casar com o Composer em foco → evento de referência de arquivo existente
                                                   └─ anexado ao rascunho, sem envio
```

Novos critérios de aceite: PIA01 download no formato original e cancelamento; PIA02 referência de arquivo e preservação de anexos em rascunho vazio/existente; PIA03 recusa de reuso entre workspace identity diferente no mesmo path; PIA04 largura de celular, português e inglês, e menu acessível nos dois temas. Candidatos de desktop e capturas de tela permanecem em `conversation-session/manual-review/pending`; cellular real, SSH/WSL/Docker reais e "Salvar como" nativo em Windows/Linux não executados devem ser explicitamente sinalizados.

Regressão de review: PIA01 passa a incluir comparação de extensão e bytes originais para APNG/BMP/ICO, além de SVG não UTF-8 com declaração ISO-8859-1; PIA03 passa a incluir imagens de mesmo nome dentro e fora do workspace, verificando se o mention canônico preserva o caminho absoluto de imagens externas após o consumo do evento de referência de arquivo. O PIA02 de desktop existente continua verificando a preservação do rascunho no Composer real e o zero envio. Reaproveita as semânticas de rascunho/download já confirmadas, sem adicionar combinações de envio ou de estado de sessão.

## Comportamento

- Imagens comuns e o resultado renderizado de SVG na pré-visualização do painel lateral oferecem o menu de contexto "Copiar imagem".
- No desktop, a área de pré-visualização focável usa o menu de teclado; em telas estreitas, exibe-se um botão de menu "Ações da imagem" com rótulo de texto, evitando depender do botão direito do mouse.
- A cópia grava na área de transferência do sistema do cliente atual, no formato PNG, preservando as dimensões naturais e a transparência da imagem; SVG, JPEG etc. são rasterizados primeiro, e o que é copiado é a imagem, não o caminho, o código-fonte ou uma captura de tela com fundo xadrez.
- A entrada fica desabilitada antes de a imagem carregar e durante a execução da cópia. Concluída a cópia, exibe-se um aviso de sucesso; em falha de decodificação, de permissão da área de transferência ou de API indisponível, a falha é exibida explicitamente, sem sucesso indevido.
- Reaproveita os menus, botões, toasts, tokens de tema e traduções já existentes; não altera o layout da pré-visualização, as regras de exibição em Retina nem a alternância do código-fonte do SVG.

## Limites e ordenação

```text
Imagem atual em pré-visualização → botão direito/botão do usuário → submete imediatamente ClipboardItem(Promise<PNG>)
                                  └─ pixels naturais do img atual → canvas → PNG
Escrita concluída na área de transferência do sistema → aviso de sucesso; qualquer etapa rejeitada → aviso de falha
```

A conversão para PNG deve ser criada e submetida imediatamente dentro da ação do usuário, evitando que a conversão assíncrona consuma antes a ativação de usuário do Safari. O componente possui apenas o estado pending desta cópia, sem adicionar estado de negócio na camada de serviço ou no processo principal.

Arquivos remotos seguem a cadeia existente de leitura de arquivo e dados de pré-visualização; a cópia acontece no cliente que está exibindo a imagem; não introduz requisições ao Agent nem modifica os limites de recuperação de workspaceIdentity, desktop continuous ou web remote replayable. Não é estendido para a galeria de imagens de sessão em tela cheia.

## Casos de verificação

| Número | Precondição e ação                   | Asserção                                     |
| ------ | ----------------------------------- | -------------------------------------------- |
| PIC-01 | Copiar com botão direito após PNG   | Área de transferência nativa é a imagem, com dimensões de pixel iguais às da original |
| PIC-02 | Copiar com botão direito após SVG   | Área de transferência nativa é PNG, colável como imagem após a cópia |
| PIC-03 | Abrir ações da imagem em tela estreita e escolher copiar | Idêntico ao caminho do botão direito, sem estouro horizontal |
| PIC-04 | Em carregamento, falha de decodificação ou rejeição da área de transferência | Entrada desabilitada ou falha explícita, sem exibir sucesso |
| PIC-05 | Temas claro/escuro, português e inglês, menu de teclado | Texto visível, menu operável, layout da pré-visualização inalterado |

Candidato de E2E: `packages/desktop/test/e2e/manual-review/pending/preview-pane-image-copy.test.ts`. Este caso passa apenas pela árvore de arquivos e pela pré-visualização de imagem, sem alterar o estado da sessão; permanece com status pending até a revisão manual.

## Registro de verificação (2026-10-14)

### Verificação das correções do review

- CR-01/02/03 do primeiro review já foram corrigidos: imagens externas mantêm referência absoluta, os formatos suportados pela pré-visualização conservam a extensão correta e o download de SVG de arquivo obtém os bytes originais pelo serviço de arquivos de origem.
- As novas regressões reproduziram primeiro a falha: os testes unitários de path fora do workspace e da lista de extensões por formato falharam; no desktop real, o nome de salvamento padrão de APNG estava incorreto. Após a correção, 135 arquivos de teste unitário afetados, 2303 casos passaram.
- O candidato estendido de macOS Electron passou 2/2 (`desktop-e2e-20261014073357957-p93626-1fd083e49fa01cc4`): bytes salvos e nome de arquivo padrão de PNG/APNG/BMP/ICO e de SVG UTF-8/ISO-8859-1, cancelamento, preservação de rascunho/anexos e zero envio.
- O navegador passou 9/9: as 8 combinações originais de desktop/largura de celular, temas claro/escuro, português e inglês, mais a cadeia de eventos de referência absoluta para imagens de mesmo nome fora do workspace.
- typecheck da raiz, typecheck:e2e do desktop, lint, architecture e a verificação de fixtures candidatos passaram; o lint ainda apresenta 210 warnings preexistentes. As limitações de verificação por plataforma são as mesmas da seção seguinte.

### Verificação da simplificação do aviso de sucesso

- Após o "Salvar como" nativo, exibe-se apenas "Download concluído"/"Download complete", e o aviso não contém mais o caminho. Uma janela Electron independente realmente baixou o arquivo e conferiu o aviso breve e os bytes do arquivo.
- Regressão final: 501 arquivos de teste unitário afetados, 5417 casos passaram; candidatos de desktop 2/2 (`desktop-e2e-20261014080901855-p14519-20731221317b237a`), navegador 9/9 passaram; typecheck, lint e architecture passaram.

### Verificação do download e do acréscimo de referência de arquivo

- Desktop macOS: `conversation-session-preview-image-actions` terminou com 2/2, run `desktop-e2e-20261014070220038-p64953-d881563a059ec2b4`. Verificados o salvamento dos bytes originais de PNG/SVG, o cancelamento, rascunhos vazio/não vazio, o foco, a preservação dos anexos originais e zero requisições ao modelo.
- Navegador: `node --test packages/ui/test/browser/manual-review/pending/preview-image-actions.test.mjs`, 390/1100px × Light/Dark × português e inglês, 8/8 no total; cada combinação executou de fato cópia, download e adição de referência.
- A referência de workspace e os eventos de componente, assim como o download no formato original, foram verificados por testes unitários focados; as 41 regressões do fixture de inicialização do E2E passaram. O candidato ainda aguarda promoção manual e não se declara apto para Docker.
- A regressão final afetada passou em 504 arquivos e 5447 casos; typecheck da raiz, typecheck:e2e do desktop, lint, a verificação de architecture e a validação de fixtures candidatos passaram. O grafo de funcionalidades já tinha 4 arestas pendentes; esta adição contribuiu com 0 novas, e a validação de code seeds passou.
- A funcionalidade acrescentada não foi verificada no "Salvar como" nativo de Windows/Linux, no Safari real de celular nem em um Host remoto real.

### Verificação da primeira versão da cópia

- Electron em macOS: a partir da árvore de arquivos de um workspace real, abriu-se SVG/PNG, copiou-se com o botão direito e leu-se o tamanho na área de transferência nativa, verificando o menu de teclado com Shift+F10; 1 caso de E2E passou.
- Chrome: em viewport de toque de 390×844, a cópia com botões nos temas claro/escuro e em português e inglês passou; SVG de 720×440 gerou PNG do mesmo tamanho; PNG em Retina preservou os 64×48 pixels originais e a região transparente; quando a área de transferência rejeitou, só houve aviso de falha.
- `pnpm test:unit:affected --base <linha de base da mudança>`: 499 arquivos e 5387 casos passaram; incluindo 7 testes unitários desta funcionalidade.
- `pnpm typecheck`, `typecheck:e2e` do desktop, `pnpm lint` e `pnpm architecture:check --changed` passaram. O lint apresenta os warnings já existentes no repositório.
- A área de transferência nativa de Windows e Linux e o Safari real de celular não foram executados; a verificação por toque usa viewport simulado no navegador e não representa a aceitação em aparelho real nem em host remoto.

O candidato de E2E inicia o ambiente com o fixture público de replay, sem gerar requisições ao modelo:

```sh
ZCODE_E2E_MANUAL_REVIEW=1 \
E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json \
pnpm --filter @zcode/desktop test:e2e -- \
  --spec './test/e2e/manual-review/pending/preview-pane-image-copy.test.ts'
```
