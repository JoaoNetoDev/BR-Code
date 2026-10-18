# Abertura de sessão: desacoplamento do spawn CUA e reavaliação da leitura de catálogo

## Linha de base e escopo

Em 2026-09-10, com base no staging `279907140bd7`, reaplicou-se somente o retorno antecipado da tupla de reserva de segurança do CUA.
Não se restaurou o catálogo pós-leitura, nem a antiga implementação de Provider.
As alterações antigas e a reprodução completa da corrida de configuração CCR01/CCR02 estão preservadas no stash `38d1e293`; esses testes mirar o contrato de `readWorkspaceState`/cache de configuração que já foi removido, portanto não são portados diretamente nesta rodada, nem se afirma que o novo staging passou pela reprodução antiga.

No novo staging, `workspace/readPresentation` retorna apenas mode/slash commands, sem criar um App temporário.
Os candidatos de modelo são fornecidos pelo Host ModelSelectionView, e o Composer draft intent e a configuração de execução da sessão mantêm seus owners originais.
Portanto, a conclusão antiga de que o "catálogo em pós-leitura economiza cerca de 700ms de App temporário" não se aplica mais.
O slash discovery restante, a preparação do client do Host e o enfileiramento do protocolo não podem ser atribuídos em conjunto ao cálculo do catálogo; nesta rodada a temporização da UI não é ajustada por causa disso.

## Temporização e invariantes

```text
CUA：start + 原 startup tracker
       ├─ Windows waitForTransport -> 原 transport_ready/deadline
       ├─ 安全 reservedTransport 已存在且无 unavailable marker -> 立即返回 tuple
       └─ 无预留 -> 原有界等待、超时检查及 fail-closed
```

- A leitura de catálogo da UI, a inicialização do Composer e a temporização de submissão permanecem exatamente como no staging.
- O CUA mantém warm health, admission marker, backoff de falha e o startup tracker em background.
  O retorno antecipado não significa que o Helper já esteja disponível; uma falha completa de startup continua restringindo apenas os spawns seguintes, sem reciclar Agents já existentes.
- Não se adiciona timer, camada de agendamento, protocolo, state owner, persistência ou interface entre módulos.
- Os limites de delivery, gap e owner de desktop continuous e mobile replayable permanecem inalterados.
  A admissão de transport do Host remoto e do Windows não é substituída pelo atalho local de reserva do macOS.

## Verificação

1. Teste primeiro: fake timer do CUA prova que, quando já há reserva, não é preciso avançar 1s; cobre reserva atrasada, transport_ready do Windows, falha de warm health e o ciclo de vida original de admissão/falha.
2. Build de produção após `pnpm bootstrap` completo; o WDIO inicia um Electron independente e, com o App pronto e o catálogo do workspace padrão pronto, clica em uma sessão real.
   A métrica principal é o clique real até a primeira conversation row visível no viewport; as fases do protocolo são registradas separadamente.
3. Duas sessões reais, 5 medições cada; reportar todas as amostras e a mediana, interval/cumulative, sem somar medianas independentes de fases e chamar isso de mediana total.

## Registro das execuções atuais

- Apenas staging, já medido: a6 (Agent já iniciado) 657/669/986/1857/796ms, mediana 796ms;
  6951 (Agent iniciado após o clique) 2919/2211/2704/2452/2705ms, mediana 2704ms.
- Build de produção isolado, manifest, screenshot da primeira row visível pelo WDIO, logs e dados de fase: `/tmp/zcode-session-staging-ab.KWbOnL`.
- A primeira rodada do pacote isolado não tinha o novo caminho de configuração de Provider, o que causou startup error; após completar o build/caminho de configuração explícito, a execução foi refeita.
  Os smoke/control1 com falha de startup não contam para a linha de base; control2 é a pré-verificação de aquecimento e round1–5 são as amostras oficiais.
- Após a otimização: a6 = 721/766/862/628/819ms; 6951 = 1483/1390/2361/1272/1476ms.
  Nas 10 execuções a row da sessão alvo ficou visível, e o snapshot row count ficou estavelmente em 295 / 25 antes e depois.
- Os dois grupos rodaram em série, cada grupo alternando a ordem das sessões; não é um A/B interleaved aleatório nem um SLA de estabilidade.
  Os hashes dos dois arquivos de entrada da UI e do bundle da CLI são iguais antes e depois; a única alteração de código de produção é o atalho de env do CUA em services.

### Comparação de medianas (ms)

| Métrica | staging | Após otimização CUA | Diferença (depois – antes) |
| --- | ---: | ---: | ---: |
| a6 click → primeira row visível (Agent reused) | 796 | 766 | -30 |
| 6951 click → primeira row visível (Agent spawned) | 2704 | 1476 | -1228 |
| 6951 command resolved → spawn preflight (subfase do Host) | 1051 | 60 | -991 |
| 6951 Host prepare | 1775 | 770 | -1005 |
| 6951 CLI request → ACK | 566 | 541 | -25 |
| 6951 session restore (subfase request → ACK) | 343 | 330 | -13 |
| 6951 ACK → row visível (resíduo, inclui gaps de instrumentação) | 225 | 115 | -110 |

Cada linha tem a mediana tirada de forma independente e há relações pai/filho, portanto não podem ser somadas. A redução end-to-end é de cerca de 45%; o que é claramente atribuível é a eliminação da espera fixa de cerca de 1s do Host; não se pode contabilizar toda a diferença restante de cerca de 0.2s como ganho do CUA. a6 já tinha Agent, e a diferença de 30ms não é tratada como ganho confirmado. Na amostra lenta de 2361ms do 6951, o preflight foi apenas 60ms e o Host prepare foi 1429ms; a longa espera ocorre depois do preflight, então não se pode concluir que o atalho falhou.

### Comparação interval / cumulative da mesma rodada (ms)

Foram escolhidas as execuções em que a primeira row visível fica exatamente na mediana de cada grupo: baseline 6951 round3, optimized 6951 round5.
O cumulative é a soma aritmética das fases já medidas da mesma rodada, com o tempo não coberto entre instrumentações listado à parte; a row visível usa um endpoint DOM independente e não se faz passar o endpoint interactive pelo endpoint de visibilidade.

| Fase | staging interval | staging cumulative | optimized interval | optimized cumulative |
| --- | ---: | ---: | ---: | ---: |
| click → acquire | 55 | 55 | 52 | 52 |
| Renderer prepare | 0 | 55 | 0 | 52 |
| Host prepare | 1775 | 1830 | 770 | 822 |
| CLI request → ACK | 644 | 2474 | 526 | 1348 |
| initial frame transport + snapshot apply | 5 | 2479 | 2 | 1350 |
| React render | 92 | 2571 | 56 | 1406 |
| paint → interactive | 134 | 2705 | 35 | 1441 |
| gap de instrumentação não atribuído (completado por click → interactive independente) | 11 | 2716 | 41 | 1482 |

Os endpoints DOM de visibilidade independentes foram 2704 / 1476ms. Os interval/cumulative das outras rodadas ficam em seus respectivos
`runs/<variant>-<session>-roundN/profile.md`; as amostras brutas e o resumo estão em `results.json`.

### Espaço restante com a leitura em pós-leitura

A workspace presentation do a6 já está aquecida, então a janela de clique não tem requisição de catálogo. O 6951 ainda tem leitura de catálogo antes do resume, mas o resíduo mediano de `CLI request → ACK` descontando o restore é apenas 223 → 211ms; isso ainda inclui o enfileiramento da requisição e outros tratamentos de subscribe, não é tempo puro de catálogo, portanto não se pode prometer que a pós-leitura economize tudo. O tempo completo do `readWorkspacePresentation` do Host inclui a inicialização do Agent, e em especial não se pode contabilizar novamente a preparação de cerca de 1s do Host como custo de catálogo.
Por enquanto mantém-se a ordem de leitura de catálogo do staging, e a pós-leitura só é reavaliada se evidência independente provar que o ganho compensa.

### Verificação e limitações

- O novo teste unitário sem avanço de tempo falha no código original e passa após a otimização; CUA env, producer resolver, Helper Host, Windows Host e service dispose somam 144 testes unitários passando.
- `pnpm typecheck`, `typecheck:e2e` do Desktop, `pnpm architecture:check --changed` e a verificação de formatação dos TS alterados passaram.
  `pnpm lint` resulted em 0 error / 43 warnings em arquivos não alterados; `git diff --check` passou.
- `check-workspace-freshness` falhou por estar 1 commit atrás do experimento antigo `origin/feat/session_opt`; nesta rodada a base é o `origin/staging` já trazido / HEAD `279907140bd7`, conforme especificado pelo usuário, sem misturar commits do experimento antigo.
- O WDIO desta rodada é um benchmark real de abertura de sessão local, não um E2E completo de permissões do CUA / chamadas reais de ferramentas.
  Máquina Windows real, controle remoto de celular e chamadas reais de CUA não foram reexecutados, e não se afirma risco zero end-to-end em todas as plataformas.
- O atalho só se aplica a transports já reserva dos com segurança; no primeiro start, antes de a reserva ser publicada, ainda pode haver a espera limitada original por warm health e transport_ready do Windows; não há nova sondagem, cache ou admissão mais ampla.
- Esta rodada não faz commit nem push; o stash antigo é mantido.