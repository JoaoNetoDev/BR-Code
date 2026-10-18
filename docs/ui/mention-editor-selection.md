# Contrato de seleção do editor de menções e Markdown

## Causa e escopo

Originalmente, o PromptMentionNode inseria img/svg no início do DOM do TextNode, enquanto getTextContent
retornava o Markdown canônico. O Lexical não encontrava o texto real ao longo de firstChild, e o offset da
seleção era inconsistente com o comprimento do texto exibido, fazendo com que, ao selecionar tudo, o ponto
final da seleção às vezes caísse em uma seleção interna ao mention, divergindo da seleção do navegador.

Vale para o LexicalChatInput compartilhado entre o Composer principal e a edição embutida nas mensagens,
cobrindo files, skills, commands, subagents, sessions, whiteboards e plugins.

## Contrato

```text
Lexical state
  +-- __text / DOM text -> 展示、光标、原生选区
  +-- markdown         -> 独立序列化 -> onChange / 发送 / 草稿 / 剪贴板
  +-- 图标             -> CSS 装饰，不增加 DOM 文本节点
```

- Preservar a semântica de edição atômica de token do TextNode; o texto do DOM deve ser idêntico a
  `__text`, e uma falha assíncrona do ícone não substitui o nó de texto.
- getTextContent retorna o texto exibido; a serialização Markdown do documento inteiro e da seleção lê
  explicitamente `mention.markdown`.
- Texto comum é recortado conforme a seleção; um mention que tem interseção real com a seleção emite o
  canônico completo, e cortar remove exatamente o mesmo intervalo atômico. Seleção colapsada e simples
  contato com a borda do token não contam como interseção.
- A saída do documento inteiro preserva a semântica existente de quebra dupla entre parágrafos, quebra
  simples de LineBreak e espaços em branco; a saída da seleção preserva as regras de separação de parágrafos
  do RangeSelection do Lexical. O getText/getMarkdown público e o onChange continuam emitindo Markdown
  canônico.
- Copiar e cortar são registrados na camada comum do editor, sem depender de o painel de candidatos estar
  ativo; quando a escrita na área de transferência lança erro, o evento é consumido e a seleção é
  preservada, evitando cair no CUT padrão que apagaria o conteúdo.
- JSON type/version/markdown/mentionId/data permanecem compatíveis; ao importar o antigo `text`, o texto
  exibido é normalizado e o canônico não é reescrito.
- Não alterar o comportamento de colagem de texto puro, o protocolo de envio, o owner/key de rascunho, o
  workspaceIdentity ou o identificador de sessão remota.
- O desktop desktop-continuous e o celular web-remote-replayable seguem suas cadeias originais; esta
  mudança ocorre apenas na camada do editor, antes do envio.

## Casos aceitos

| ID | Configuração/Ação | Asserções obrigatórias |
| --- | --- | --- |
| MSEL-01 | Texto puro; mention no início/meio/fim/único/adjacente; tecla real de selecionar tudo da plataforma | Seleção do DOM não colapsada e completa; substituir após selecionar tudo não deixa tokens residuais |
| MSEL-02 | Apagar e desfazer após selecionar tudo | Editor esvazia; o desfazer restaura o canônico e o rótulo |
| MSEL-03 | Seleções parciais direta e reversa; copiar e cortar | Texto comum recortado corretamente, mention emitido atomicamente e intervalo de corte consistente com a saída |
| MSEL-04 | JSON antigo, múltiplos parágrafos, Unicode, falha de ícone | Comprimento exibido correto, canônico preservado e atualização do ícone preservando o nó de texto |
| MSEL-05 | Digitação após preenchimento previo e Option+ArrowRight | Rótulo preservado e corpo de texto acrescentado normalmente |

Prefira estender o E2E existente chat-input-mention-navigation. Testes unitários validam a serialização e
os comandos de área de transferência; um navegador real valida a seleção nativa e o efeito das edições, e a
aprovação não pode se basear apenas em dispatchCommand retornando true.

Combinações representativas cobrem desktop macOS com Chromium; Ctrl+A no Windows/Linux, a seleção por
toque longo no celular e o WebKit devem ter o estado de verificação registrado separadamente, sem se
apresentar resultados do Chromium como cobertura multiplataforma completa. Não é necessário expandir
provider, fila de execução ou combinações de falha de rede, porque a correção não altera as fronteiras de
envio e recuperação.

## Registro de verificação de 2026-09-04

- Antes da alteração: no E2E de Cmd+A nativo do desktop, os quatro casos leading/trailing/only/adjacent
  falhavam, enquanto texto puro e middle passavam; o teste unitário do nó mostrava claramente que
  getTextContent retornava o link em vez do label.
- Após a alteração: 7 arquivos focados, 53 casos aprovados no total (nó, serialização, área de
  transferência, preenchimento de teste, histórico, gatilhos, slash payload); entre eles, o teste unitário
  que preserva texto e seleção nativa diante de falha assíncrona do ícone passou novamente de forma
  independente.
- Desktop macOS / Chromium 146: todos os 10 casos de chat-input-mention-navigation aprovados. artifact:
  `desktop-e2e-20260904072116235-p84305-52c75b5dcb36d31a`. O reteste final reconstruiu o desktop e reutilizou
  o artefato do Agent já compilado com sucesso nesta tarefa e cujo código-fonte não foi modificado.
- Captura de tela: `packages/desktop/.e2e-artifacts/mention-selection/native-select-all.png`; a revisão da
  captura confirma que o ícone de arquivo e o destaque de seleção total estão normais.
- `pnpm typecheck`, `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm lint` e a auditoria de cobertura de
  conversation passaram; o lint tem os 42 warnings / 0 errors já existentes no repositório, e os arquivos
  modificados não geraram novos avisos.
- Registro do ambiente de teste: o typecheck emite para out/host e não pode rodar em paralelo à construção
  do bundle do Desktop, sob pena de sobrescrever o bundle do Host e causar falha de inicialização. A
  verificação final foi executada em sequência. O setup inicial de texto puro usava focus assíncrono e
  acabava selecionando a página inteira; foi trocado por um clique real com asserção de foco no campo de
  entrada, sem afrouxar as asserções de seleção.
- Evidências de plataforma ainda pendentes: Ctrl+A no Windows/Linux, toque longo na Web do celular, WebKit,
  tema claro e E2E independente de edição embutida na mensagem. A implementação compartilhada e o
  protocolo permanecem compatíveis, mas esta evidência de macOS no campo principal não é apresentada como
  medição desses cenários.

## Ciclo de vida do E2E (local, sem Docker)

Por autorização do usuário em 2026-09-04, o agente executou a revisão: migrar as 8 regressões de interação
nativa existentes de MSEL-01/02/03 para um `conversation-session-mention-selection` independente, sem
adicionar comportamento de produto. O spec de nível superior mantém o caso de navegação adjacente MSEL-05,
para evitar execução duplicada.

- Pending: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-mention-selection.test.ts`.
- Canonical target: `packages/desktop/test/e2e/conversation-session/conversation-session-mention-selection.test.ts`.
- Contrato de provider: `providerRequestPolicy: none`, com fixture case-local e requests vazios; após cada
  caso, assere-se que a contagem de requisições ao provider não aumentou.
- Ordem de verificação: replay explícito do pending + revisão de captura → verificação de fixture → dry
  run/apply da promoção → replay explícito formal de common+case → replay default.
- Nesta rodada não há verificação nem admission via Docker; itens ainda não medidos em multiplataforma
  permanecem pendentes.

### Resultado do ciclo de vida

- O usuário autorizou o agente a revisar estes casos; na verificação das capturas do pending, o ícone de
  arquivo, o texto e o destaque nativo de seleção total estão normais.
- Replay explícito de pending common+case: 8/8 aprovados, artifact
  `desktop-e2e-20260904073617029-p6123-ff5d77593b0c1dc3`; os records de captura provider/runtime foram 0.
- Verificação de fixture, dry run e apply da promoção e auditoria de cobertura transacional passaram. Spec
  formal: `packages/desktop/test/e2e/conversation-session/conversation-session-mention-selection.test.ts`.
- Replay formal explícito common+case: 8/8 aprovados, artifact `desktop-e2e-20260904-073716-750`,
  comprovando que não há dependência de fixture de provider legado.
- Replay default: os dois specs somam 10/10 aprovados, artifact `desktop-e2e-20260904-073755-068`,
  incluindo as 8 migrações e as 2 regressões de navegação mantidas no nível superior.
- Esta rodada apenas moveu a atribuição dos testes e adicionou asserções duras de ausência de requisições ao
  provider; nenhum código de produto foi modificado. O Docker não foi executado e nenhuma admission via
  Docker foi feita; as conclusões anteriores de cobertura multiplataforma não foram ampliadas.
- Verificação de fechamento do ciclo: E2E typecheck, typecheck da raiz, lint (42 warnings / 0 errors já
  existentes) e auditoria de cobertura de conversation passaram integralmente.