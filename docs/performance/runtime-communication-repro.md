# Reprodução de desempenho da comunicação do runtime

## Contexto

O problema de CPU no renderizador em investigação suspeita ocorrer enquanto uma tarefa está comunicando-se ativamente, e não apenas ao abrir um histórico persistido longo. Fixtures estáticos de banco de dados são úteis para baseline de renderização fria e de rolagem, mas não exercitam SSE de provider, fanout do protocolo app-agent, continuação de subagente, atualizações de ferramenta ou atualizações de React durante um turno ativo.

Esta suíte de reprodução mantém a primeira fase focada em construir ambientes repetíveis. O profiling de causa raiz e as correções são uma fase separada.

## Cadeia de comunicação

```text
Provider replay SSE
  -> zcode-cli runtime events
  -> @zcode/protocol stdio NDJSON
  -> host process session services
  -> renderer desktop-continuous subscription
  -> v4 pane projection store
  -> React render / layout / paint
```

Para a reprodução de quatro painéis, a cadeia faz fanout por painel visível:

```text
pane A prompt -> parent Agent tool -> child subagent stream -> parent final stream -> pane A render
pane B prompt -> parent Agent tool -> child subagent stream -> parent final stream -> pane B render
pane C prompt -> parent Agent tool -> child subagent stream -> parent final stream -> pane C render
pane D prompt -> parent Agent tool -> child subagent stream -> parent final stream -> pane D render
```

Todos os casos deste documento usam o `desktop-continuous` do desktop. Eles não devem ser usados para inferir o comportamento de snapshot ou de recuperação de lacunas do `web-remote-replayable` de `/remote` no mobile.

## Conjunto de casos

| ID | Finalidade | Preparação | Ação | Evidência |
| --- | --- | --- | --- | --- |
| PERF01 | Isolar um painel visível sob tráfego de stream de alta frequência. | Um painel v4, uma sessão, fixture sintética de stream gravado com muitos chunks de texto/razonamento/entrada de ferramenta. | Enviar um prompt e manter o stream aberto por tempo suficiente para amostragem de CPU. | Artefato de rede com linha do tempo de chunks, perfil CDP opcional, a UI permanece responsiva. |
| PERF02（2026-10-16 descontinuado） | Reproduzir o fanout de runtime de quatro painéis visíveis com ferramentas e subagentes. Após a descontinuação da entrada de tela dividida, o usuário não pode mais criar um layout de quatro painéis; a spec, a fixture e o helper `openV4SplitFromSidebar` foram removidos; os comandos e as conclusões abaixo servem apenas como registro histórico. | Quatro painéis v4 em um workbench, cada um vinculado a uma sessão diferente. | Enviar quatro prompts que disparem cada um uma ferramenta `Agent`, uma resposta de subagente filho em streaming e, depois, uma resposta final do pai em streaming. | Gravação da janela do Electron, artefato de replay com múltiplos streams `/messages` sobrepostos, todos os painéis alcançam os marcadores finais. |

## Gravação e profiling

A fase 1 registra evidência de reprodução visível ao usuário:

- O WDIO conduz o caminho de quatro painéis.
- O gravador de janela do Electron dentro do app captura um artefato de vídeo.
- O servidor de replay do DeepSeek escreve as linhas do tempo de chunks de requisição e resposta.
- O caminho de gravação exige `ffmpeg` no `PATH`, ou `ZCODE_E2E_FFMPEG_PATH`
  apontando para um binário compatível.

Executar PERF02 com:

```bash
E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-runtime-communication-performance.json \
ZCODE_E2E_MANUAL_REVIEW=1 \
pnpm --filter @zcode/desktop test:e2e -- --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-runtime-communication-performance.test.ts'
```

Executar o mesmo caso sem gravação de vídeo, mas com um perfil de CPU do renderizador:

```bash
E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-runtime-communication-performance.json \
ZCODE_E2E_PROFILE_ONLY=1 \
ZCODE_E2E_PROFILE_STREAMING=1 \
ZCODE_E2E_MANUAL_REVIEW=1 \
pnpm --filter @zcode/desktop test:e2e -- --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-runtime-communication-performance.test.ts'
```

A fase 2 adiciona evidência de profiler depois que PERF02 reproduz CPU alta de forma confiável:

- Iniciar um perfil de desempenho do Electron/Chromium durante os streams sobrepostos de filho/final.
- Comparar o custo de renderização do painel ativo, o fanout do shell oculto, o batching de eventos do protocolo e a frequência de atualizações de ferramenta/subagente.
- Manter os logs de diagnóstico de protocolo ou streaming de alto volume em `debug`; não adicionar logs `info` de produção para rastros por chunk.

## Baseline local de 2026-07-08

PERF02 foi executado com `ZCODE_E2E_PROFILE_ONLY=1` e `ZCODE_E2E_PROFILE_STREAMING=1`.

- Diretório de artefatos: `packages/desktop/.e2e-artifacts/runtime-perf-20260708105637`
- Duração do caso: `99552ms`
- CPU média / pico da aba visível do renderizador: `2.59%` / `3.87%`
- CPU média / p95 / pico total do Electron: `4.19%` / `5.96%` / `6.85%`
- Working set do renderizador visível: `254MB` no início, `424MB` no pico, `391MB` próximo ao fim
- Duração do perfil V8 do renderizador: `97455ms`, com cerca de `82318ms` ocioso, `10320ms` de tempo de programa não atribuído e `399ms` de tempo próprio de GC

Hotspots mapeados de tempo próprio no renderizador:

- `packages/ui/src/components/ai-elements/reasoning.tsx`: auto-follow de rolagem e atualizações de máscara do conteúdo de reasoning, especialmente `scrollToReasoningBottom`
- `packages/ui/src/v4/ConversationTimeline.tsx`: efeito de layout de ancoragem inferior e tratamento de rolagem durante mudanças de altura no streaming
- Trabalho de commit/render do React DOM disparado por atualizações de streaming
- `packages/rpc/src/serialization.ts`: custo de deserialização pequeno, mas visível, para frames de protocolo

Esta baseline não mostra um processo de renderizador com a CPU saturada sob replay determinístico; o formato atual do gargalo é trabalho repetido de commit/layout do React dirigido por streaming, somado ao crescimento de memória do renderizador. Uma reprodução posterior de CPU alta deve ou aumentar a concorrência/frequência de chunks, ou rodar contra o cenário de provider ao vivo, onde o pico original de CPU foi observado.

## Limites

- Apenas `desktop-continuous` local do desktop.
- Sem injeção direta de fixture SQLite para PERF02.
- Nenhum replayable mobile separado ou runtime de host remoto é criado.
- O layout de quatro painéis usa o comportamento existente de split de painel v4 e o limite `MAX_WORKBENCH_PANES = 4`.
- O tráfego de provider é replay sintético; o objetivo é pressão de comunicação determinística, não qualidade de modelo ao vivo.
