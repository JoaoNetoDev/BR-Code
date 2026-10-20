# Layout do diálogo de criação de projeto

Status: implementado, 2026-10-15. O layout foi confirmado por protótipo (escolhida a variante B, protótipo guardado na branch `prototype/project-editor-dialog`, não integrada).

## 1. Escopo

| Item             | Conteúdo                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Componente       | `ProjectEditor` (formulário de criação / edição de projeto), página embutida em `RemoteProjectList` (adicionar projeto existente)                |
| Camada de mudança | Só muda a apresentação; o fluxo de conexão, a cadeia de salvamento, a máquina de estados, o contrato de props, a confirmação de confiança de diretório e o navegador de diretórios permanecem iguais |
| Entradas cobertas | Botão de adicionar projeto na barra lateral, «在此设备创建项目» no chat; Desktop, Web e celular compartilham o mesmo componente, sem layout separado para celular |
| Origem do estado  | O ponto de estado do dispositivo vem apenas de `resolveRemoteConnectionPresentation`; o componente não escolhe cores por conta própria |
| Specs relacionadas | [Confirmar a confiança na pasta antes de criar o projeto](project-creation-folder-confirmation.md), [Apresentação do estado do dispositivo remoto](../architecture/remote-device-connection-ux-spec.md) |

## 2. Layout do formulário

Os campos, de cima para baixo: **nome do projeto → dispositivo → pasta de origem** (ajuste de 2026-10-16). A seleção de dispositivo e a entrada de projeto existente logo abaixo formam um grupo, colocada depois do nome e antes da pasta de origem; a ordem do foco de teclado acompanha a ordem dos campos.

```
┌ Criar projeto ─────────────────────────┐
│ Nome do projeto                          │
│ [ Novo projeto                        ]  │
│ Dispositivo                              │
│ [🖥/🗄 Nome                 ● Estado  ▾]  │
│ Já existem projetos neste dispositivo? Adicionar à barra lateral >  │  ← Só aparece com um dispositivo remoto selecionado
│ Pasta de origem                          │
│ ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐  │
│ ┆   (📁+)  Escolher pasta / subtexto    ┆  │  ← Estado vazio tracejado quando não há diretórios
│ └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘  │
│                       [Cancelar] [Criar] │
└─────────────────────────────────────────┘
```

- Os rótulos dos três campos usam uniformemente `text-ui-sm font-medium`. O nome é um Input padrão, sem ícone de prefixo; o placeholder é o nome padrão usado ao salvar, «Novo projeto».
- Quando o chat já confirmou o diretório (`fixedFolder`), a seleção de dispositivo não aparece; o nome do dispositivo fica como texto somente leitura abaixo do nome, e a linha do diretório continua mostrando o caminho completo.

## 3. Seleção de dispositivo

- Segue usando o dropdown Select. O gatilho e cada opção são «ícone + nome + estado»: neste computador usa `Monitor`, dispositivo remoto usa `Server`. Não se distingue SSH / WSL / Docker.
- O estado aparece à direita, com o ponto desenhado pelo `dot` de `resolveRemoteConnectionPresentation({ state })`; durante a conexão, um ícone de carregamento substitui o ponto.
- Online mostra apenas o ponto, e o texto serve somente para leitores de tela; os outros 4 estados mostram ponto e texto curto (`project.deviceStatus.*`).
- Quando o nome é longo demais, ele é truncado, mantendo o estado e o visto de seleção visíveis.
- «Adicionar dispositivo remoto…» fica no final, precedido do ícone `Plus`, e separado da lista de dispositivos por uma linha divisória.

## 4. Entrada de projeto existente

- Posição: logo abaixo do campo de seleção de dispositivo; só aparece com um dispositivo remoto selecionado e quando `onBrowseExisting` é fornecido.
- Forma: uma linha de explicação em `text-ui-sm`, «Já existem projetos neste dispositivo?», seguida de um botão de link com sublinhado e `text-brand`, «Adicionar à barra lateral >». A pergunta explica o propósito e o link é a única área clicável.
- O comportamento não muda: o clique passa por `onBrowseExisting`; quando o dispositivo está offline, ele é conectado primeiro e só então a lista é aberta; o estado do dispositivo não desabilita esta entrada.
- Ao voltar, o foco retorna a este link.

## 5. Pasta de origem

- Zero diretórios: cartão com borda tracejada, ícone `FolderPlus` de fundo arredondado, texto principal «Escolher pasta», subtexto «O ZCode pode ler e editar estas pastas».
- Dispositivo remoto offline: o texto principal passa a «Conectar e escolher pasta», e o subtexto mostra «O dispositivo está atualmente {estado}; clique para conectar primeiro».
- Com diretórios: mantém-se uma lista com borda; para projeto local, a última linha é «Adicionar pasta». O «Definir como principal» dos diretórios não principais é um botão pequeno do tipo ghost, exibido também no celular de forma permanente, sem depender de hover.

## 6. Página de lista de projetos existentes (embutida)

- O botão de voltar fica à esquerda do título: botão de ícone `ArrowLeft`, com aria-label «Voltar para novo projeto» e `data-testid="remote-project-back"` inalterado.
- O botão «Voltar para novo projeto», que ficava no fim da lista, é removido.
- A forma de diálogo independente (não embutida) permanece igual.

## 7. Verificação

- Teste unitário de UI: `packages/ui/test/projectEditorLayout.test.ts` cobre a ordem dos campos, o ponto e o texto dos 5 estados, a linha de aviso de projeto existente, os textos do estado vazio, a posição do botão de voltar e o foco.
- E2E: os seletores afetados em `project-device-selection`, `existing-remote-project`, `virtual-project-mobile` e `background-connection` foram atualizados em sincronia. Em 2026-10-15, 3 casos de desktop passaram localmente no contêiner SSH; os casos de celular não foram executados.
- Visual: temas claro e escuro, português e inglês, larguras de janela 1440 / 480, a partir dos screenshots do E2E de desktop.
- 2026-10-16, troca dos campos: o teste unitário de layout passou 6/6; o `ProjectEditor` real montado no navegador passou em 390 / 1200px, Zai Light / Dark, português e inglês, 8 combinações no total, verificando o layout local e o remoto, a entrada de projeto existente movendo-se com o dispositivo, a ordem de Tab e a preservação do nome. Screenshots e dados geométricos estão em `packages/desktop/.e2e-artifacts/project-editor-order/`; as asserções do E2E de SSH no desktop e do controle remoto no celular foram sincronizadas, sem reexecutar a cadeia completa nesta rodada.
