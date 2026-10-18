# Relatório de implementação do Todo 64: correção da execução real do E2E de Provider

> Status: concluído
>
> Data de início: 2026-09-02

## 1. Baseline da implementação

- SHA de início: `64d48f6eee`
- Workspace local: worktree independente
- Diretório de execução no MacBook Pro: `/private/tmp/zcode-todo64-run.SWhC6y`
- Evidência inicial: das 55 Cases com condições locais de ambiente, 43 passaram e 12 falharam; 1 de Remote SSH foi bloqueada por condição de ambiente.
- Evidência atual: a lista afetada atual tem 52 casos, com 51 passando; 1 de Remote SSH foi pulada por condição de ambiente. A diferença entre o número inicial e o atual vem da divisão, fusão e remoção de Cases antigas, e não se disfarça número histórico como lista atual.

Este relatório registra apenas evidências de execução real e as correções já executadas. O plano e os limites de decisão estão em
`todo-64-provider-e2e-real-run-repair-closeout.md`.

## 2. Registro item a item

| Case               | Estado inicial | Primeiro ponto de falha                                                               | Classificação da causa raiz | Tratamento                                                              | Resultado direcionado | Resultado do grupo                 |
| ------------------ | --------------- | ------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------- | --------------------- | --------------------------------- |
| MP-UI-01           | falhou          | O teste confundiu o botão de edição de nome com a identidade da página de detalhes     | test                        | Passou a afirmar a identidade de navegação do Provider selecionado        | passou               | Settings UI 7 passou, 1 pulado por ambiente |
| MP-UI-06           | falhou          | A asserção antiga tratava placeholder como value                                       | test                        | Overlay vazio afirma value vazio; `{}` explícito afirma o canonical value  | passou               | Settings UI 7 passou, 1 pulado por ambiente |
| I08                | falhou          | O Helper lia `maxOutputTokens.default` errado, e a GUI salva o campo oficial `.max`    | helper                      | Corrigido o Helper de readiness de Personal Rule                        | passou               | spec correspondente passou        |
| Repo Wiki settings | falhou          | O Case carregava uma asserção de ausência de Provider fora do escopo de responsabilidade | test                        | Asserção de E2E removida; a Empty Ready View segue coberta por teste unitário | passou           | spec do Repo Wiki passou          |
| Repo Wiki produces | falhou          | A nova seleção de modelo só mantinha a identidade e perdia o reasoning                | production                  | Chamada unificada a `completeNewModelSelection()` formando a Selection completa | passou            | spec do Repo Wiki passou          |
| OTB08-OTB10        | falhou          | A expectativa antiga descontava de novo um assistant já coberto pelo usage anchor       | fixture/test                | cap corrigido para 41.671, com replay Fixture e documentação sincronizados | passou            | spec do Preflight passou          |
| I20                | falhou          | O Helper compartilhado afirmava o `budget_tokens` já removido; e no cold start descobriu-se que a Selection completa inicial não era persistida em um evento estável | helper/production | Afirmação de campo antigo removida; a Selection completa inicial é persistida imediatamente após criar a Session | passou     | spec do I20 passou                 |
| I26                | falhou          | O Seed não tinha as premissas completas de reasoning/readiness                         | fixture/helper              | Seed com Selection completa e espera pelo Registry pronto                 | passou               | Restart Recovery 4/4 passou       |
| I27                | falhou          | A expectativa antiga dependia do Account-first removido; o roteamento do Configured Default válido faltava replay | fixture/test        | Passou a afirmar o fallback para o Configured Default válido e a adicionar replay do DeepSeek | passou | Restart Recovery 4/4 passou       |
| I28                | falhou          | Igual ao I27                                                                             | fixture/test                | Igual ao I27                                                            | passou               | Restart Recovery 4/4 passou       |
| I31                | falhou          | Reselecionar a option nativa atual não garante disparar o evento; e havia um transition state sem consumidor | test/residual state | Passou a usar ida e volta pela página de configurações; estado residual e falsa reconciliação removidos | passou | Settings Transition 3/3 passou |
| QR-E2E-09          | falhou          | A falha inicial não pôde ser reproduzida de forma estável; tanto o isolamento quanto a spec completa passaram | isolation           | Nenhuma alteração na semântica de produção                              | passou               | Coding Plan/Quota 18/18 passou    |

## 3. Revisão por fase

### Fase A: infraestrutura comum

Os Helpers comuns foram consolidados nos campos atuais e na Selection completa; não foi adicionado nenhum Registry exclusivo de E2E, seed da antiga Account API ou inferência de nome de modelo fixo. A propagação de configuração usa a espera de estado limitado já existente; após a criação por Template, mantém-se a janela final de polling de 2 segundos que o usuário já aprovou.

### Fase B: Cases de Selection

Repo Wiki, I26–I28 e I31 foram concluídos conforme o design de Selection atual. A revisão confirmou que não há branch de Account-first restaurado no Renderer; o Configured Default válido continua sendo resolvido de forma unificada pelo `preferredSelection` do Host.

### Fase C: causas raiz em aberto

MP-UI-01/I08, OTB08–10 e QR-E2E-09 obtiveram evidência reproduzível ou conclusão de isolamento. O único novo bug de produção descoberto é que uma Session em cold start não persistia de forma estável a Selection completa inicial; isso foi fixado e corrigido com um teste unitário falhando. Não resta nenhuma falha que exija decisão de produto.

## 4. Revisão final

- Abstrações de Provider/Selection: revisadas; o congelamento do Active Model e o fallback único do Host `preferredSelection` foram mantidos, sem novo Account-first nem especialização de model ID.
- Campos antigos e lógica de especialização: a asserção forçada de `budget_tokens` exposta nesta rodada, o transition state sem consumidor e o Helper de campo antigo foram removidos; o resultado da busca mecânica final está na verificação pré-commit.
- Testes unitários direcionados: Core `runtime-persistence.test.ts` 65/65, Bootstrap `transcript-hydration.test.ts` 61/61.
- Typecheck do Desktop E2E: passou.
- Desktop E2E: as 51 casos da lista afetada atual passaram; os artifacts de cada grupo estão na seção abaixo.
- Remote SSH: 1 caso pulado por falta de credenciais do alvo configuradas; a condição para nova execução é fornecer um ambiente real de E2E por SSH, e isso não conta como aprovação de produto.
- `typecheck` da raiz: passou.
- `lint` da raiz: passou, mantendo as 35 warnings já existentes do repositório, sem error.
- Unit completo: 1533 arquivos de teste passaram, 1 pulado; 13089 testes passaram, 25 pulados.
- Validação de fixtures: os fixtures case-local de Output Token Preflight, Restart Recovery, I08 e I20 passaram na verificação oficial; Settings UI está fora do escopo suportado pelo conversation fixture checker.
- Formatação dos arquivos modificados e `git diff --check`: passaram.
- Conversation coverage audit: bloqueado pela ordem do ledger de fixtures de Hooks lifecycle já existente e por documentação de geração defasada; sem sobreposição com os arquivos modificados nesta rodada, e nenhuma baseline não relacionada foi alterada no fechamento de Provider.
- `fmt:check` de todo o repositório: bloqueado por HTML inválido em documentação de vendor/electron já existente e pelo binário `gb2312.js`; todos os arquivos modificados nesta rodada passaram em `oxfmt --check`.
- Riscos residuais e itens aguardando decisão: não há item de semântica de produto de Provider em aberto; Remote SSH continua sendo uma lacuna de cobertura de ambiente. Essas duas falhas de baseline de nível de repositório foram fielmente preservadas e não se fazem passar por aprovação desta rodada.

## 5. Evidências de execução real no MacBook Pro

Modo de execução:

```bash
export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:$PATH"
export ZCODE_E2E_SKIP_BUILD=1
pnpm --filter @zcode/desktop test:e2e:serial -- --spec <spec>
```

Principais artifacts:

- I20: `.e2e-artifacts/desktop-e2e-20260902-173941-528/summary.md`
- Restart Recovery: `.e2e-artifacts/desktop-e2e-20260902-174156-345/summary.md`
- Settings UI: `.e2e-artifacts/desktop-e2e-20260902-174305-616/summary.md`
- Repo Wiki: `.e2e-artifacts/desktop-e2e-20260902-174423-848/summary.md`
- Output Token Preflight: `.e2e-artifacts/desktop-e2e-20260902-174448-752/summary.md`
- Settings Transition: `.e2e-artifacts/desktop-e2e-20260902-174518-093/summary.md`
- Coding Plan/Quota: `.e2e-artifacts/desktop-e2e-20260902-174556-904/summary.md`
- I08: `.e2e-artifacts/desktop-e2e-20260902-175316-125/summary.md`
- Bot Automation: `.e2e-artifacts/desktop-e2e-20260902-175427-109/summary.md`
- Feishu Interactions: `.e2e-artifacts/desktop-e2e-20260902-175452-547/summary.md`
- Feishu Streaming: `.e2e-artifacts/desktop-e2e-20260902-175517-896/summary.md`
- Upgrade WebView: `.e2e-artifacts/desktop-e2e-20260902-175542-933/summary.md`
- Context Cold Resume: `.e2e-artifacts/desktop-e2e-20260902-175610-538/summary.md`
- Output Token Budget: `.e2e-artifacts/desktop-e2e-20260902-175644-701/summary.md`
- Turbo Recovery: `.e2e-artifacts/desktop-e2e-20260902-175717-490/summary.md`
- Turbo Switch: `.e2e-artifacts/desktop-e2e-20260902-175755-973/summary.md`

Todos esses caminhos são relativos ao diretório de execução no MacBook Pro. O commit final é o commit final onde este relatório está, conforme `git log`.