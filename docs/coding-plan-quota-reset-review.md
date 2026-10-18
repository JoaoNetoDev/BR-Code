# Revisão de Branch e Registro de Integração do Coding Plan Quota Reset

> Branch: `codex/feat-quota-reset-ui`（base `staging`）
> Data da revisão: 2026-08-12 ｜ Revisor: membro da equipe + agente ZCode
> Status: **registro de revisão de branch**（atualizado conforme o progresso da integração e das correções）

## 0. Escopo e método

- Diff completo: 30+ arquivos, +4798/-58（services / shared / ui / testes / spec）
- Método: leitura minuciosa do diff em camadas + conferência do texto integral dos arquivos-fonte principais + rastreamento de commits históricos（`git log -S`）+ verificação em execução
  （29+52 casos de teste de provider/hook/lib/componentes、`pnpm typecheck`、`pnpm lint`）
- Conclusão da verificação automatizada: todos os testes relacionados a este branch verdes, typecheck passando, lint dos arquivos alterados com 0 avisos e 0 erros

## 1. Retrato da arquitetura（implementação atual）

```text
UI 组件 (packages/ui/components/coding-plan-quota-reset/*)
  └─ useCodingPlanQuotaResetUi (hook, 60s 轮询 + inflight 去重 + 1.5s 缓存)
       ├─ zustand 窗口内共享（codingPlanQuotaResetUiBySource，不广播不持久化）
       ├─ lib/codingPlanQuotaResetUi（状态机纯函数 available/processing/completed）
       └─ IUsageStatsService ── BigModelUsageQuotaProvider
            ├─ Authorization: zcode JWT（credentials["zcodejwttoken"]）
            ├─ X-Bigmodel-Authorization: MaaS 登录态 JWT（credentials["oauth:bigmodel:access_token"]）
            ├─ TEAM scope: Bigmodel-Organization / Bigmodel-Project
            └─ GET /status  POST /opportunity  POST /use  POST /history/read
                   base: /api/v1/coding-plan/reset  （snake_case envelope，Unix 毫秒）
```

## 2. Registro de mudanças de contrato na integração（por linha do tempo）

| Data   | Mudança                                                                                                                        | Commit        | Explicação                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 08-12  | `X-Bigmodel-Authorization` mudou da API key do Coding Plan para o **JWT de login do MaaS**（`oauth:bigmodel:access_token`, enviado direto sem Bearer） | `6a06e7e8dd` | O backend identifica o usuário pelo JWT; o provider agora resolve apenas dois usos: «confirmar que o Coding Plan está configurado + derivar o Team scope»; o Team não copia mais a API key do projeto |
| 08-12  | A error message de erro de negócio do envelope passou a acrescentar ` (x-request-id:xxx)`                                      | `3cc99c4f69` | O log RPC FAIL e o warn da UI podem ser reconciliados com o backend pelo request-id; o contrato do prefixo permanece; sem esse header a message fica como está |

## 3. Observações de runtime na integração（`~/.zcode/v2/logs/2026-08-12.log`）

- Mais de 500 ocorrências de `[coding-plan-reset] status refresh failed` no dia, **sem nenhuma sucesso**.
- Evolução dos erros: `bigmodel_coding_plan_api_key_required`（11-13h，key ainda no lugar）→ 2007（principal）+ mistura de 3101/429/zcode_jwt_required.
- **Após a correção do JWT（bundle 16:07 / processo 16:14）o 2007 continuou**（41 ocorrências, incluindo a mais recente às 16:26:28.680）,
  e com 0 ocorrências de `maas_jwt_required`（a guarda não disparou）⇒ as requisições já saem com o JWT do MaaS; **o 2007 é um problema da cadeia backend → MAAS**, aguardando investigação do backend por request-id.
- 429 ocorreu 11 vezes: sob rate limit dos quatro endpoints, um polling de 60s não deveria disparar; suspeita de replay concorrente por múltiplas entradas/múltiplas tabs, e como a frequência é baixa não bloqueia por enquanto.

## 4. Lista de problemas da revisão estática

### ✅ Corrigidos nesta rodada (1)

1. **Spec desalinhado da implementação** — corrigido
   `docs/coding-plan-quota-reset-ui.md` foi ajustado para os fatos atuais: a UI não mantém `nextTryAt` nem um cooldown local para 429 cru;
   sem oportunidades, a decisão é refeita pelo próximo polling visível de 60 segundos. O Service ainda mantém o mapeamento de `nextTryAt`, como contrato de interface e campo observável na integração.

### 🟡 Correções sugeridas (4)

2. **use aceito mas não confirmado em 2.5s → falso relatório de «falha na redefinição»** — `useCodingPlanQuotaResetUi.ts:653-676`
   O backend já deu baixa e só o timeout de confirmação do status leva ao ramo de falha (toast + volta para available); 60s depois o polling volta a completed.
   Sugere-se distinguir texto/duração no ramo `useAccepted` em relação ao ramo de falha.
3. **O tempo de permanência da cobertura otimista em 100% depende de `onEntitlementRefresh`** — `codingPlanQuotaResetUi.ts:272-284`
   `quotaOverridePending` só vira false quando o refresh tem sucesso; quando o chamador não passa callback ou a cadeia de refresh falha,
   a quota fica presa em completed e continua sendo sobrescrita como 100% restante (dados falsos). É preciso conferir a fiação de todos os pontos de montagem.
4. **«completed atrasado» de histórico antigo não lido** — item de confirmação de semântica de produto
   `has_unread_history` não distingue poucos segundos de uma noite inteira; na primeira montagem de uma manhã seguinte ainda se entra em completed (aviso + cobertura breve de 100%),
   e o bugfix existente da lib protege apenas o histórico puramente antigo com `has_unread_history=false`.
5. **O fallback de cooldown para 429 cru foi removido por completo no cliente**（`a80ef94c6d`）—— é preciso confirmar por escrito com o backend:
   o comportamento do cliente de tentar /opportunity a cada 60s com uma nova chave de idempotência é aceito pelo backend (o risco de concessão duplicada por timeout fica a cargo do backend).

### 🔵 Otimizações opcionais

6. `buildTypeController` recria o objeto a cada render（`useCodingPlanQuotaResetUi.ts:686-705`）—— hoje o consumidor apenas desestrutura campos, o que é inofensivo; sugere-se useMemo ou uma convenção em comentário.
7. `zIndex:"100"` hardcoded no confetti（`codingPlanQuotaResetConfetti.ts:30`）—— não foi tokenizado segundo a hierarquia do DESIGN.md.
8. `locale === "zh-CN"` hardcoded em `formatCountdown`（`CodingPlanQuotaResetOpportunity.tsx:16`）.
9. hook de 700 linhas + `eslint-disable max-lines`; sugere-se adicionar 1 teste de regressão para «após 429/3301 o polling não é interrompido e o estado final está correto».
10. Na janela de 60s entre o instante em que o cupom expira e o filtro de status do próximo round, clicar em use é rejeitado pelo MAAS (toast 2007).

### Itens aprovados na verificação

- Testes/typecheck/lint todos verdes; chaves i18n en-US/zh-CN totalmente alinhadas; conformidade no padrão de logs (UI→`@/logger.js`, services→`createServiceLogger`);
  conformidade com os tokens do DESIGN.md, confetti em dois temas + defesa por `prefers-reduced-motion`;
  dependências/limpeza de effects completas, cache WeakMap sem vazamento, degradação em três níveis do UUID correta;
  lógica de atribuição de `ownsUnread` para os dois tipos FIVE_HOUR/WEEK correta; sem violações dos limites de camada; commits conformes ao Conventional Commits.

## 5. Simulação de riscos residuais com a interface funcionando normalmente (análise de 2026-08-12）

O fluxo principal fecha; abaixo estão problemas que ainda podem aparecer mesmo com todas as interfaces normais, já incluídos na seção 4; aqui listamos apenas a prioridade dos casos de integração:

| Prioridade | Caso                                        | Ponto de verificação esperado                                                                             |
| ---------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| P0         | Clicar em «重置»→ enviar mensagem na hora   | Se a nova quota é consumível imediatamente após a baixa pelo MAAS (consistência entre o otimismo de 100% da UI e o rate limit real) |
| P0         | use bem-sucedido mas confirmação de status lenta | Se reproduz o retorno contraditório «toast de falha primeiro, depois completed»                       |
| P1         | Primeira montagem com histórico não lido da noite anterior | Se o julgamento de completed e a inversão de cobertura de 100% atendem à expectativa do produto    |
| P1         | Duas janelas clicando «重置» ao mesmo tempo (cenário de 2 cupons) | Se a baixa mais antecipada pelo MAAS causa o consumo dos dois cupons; confirmação de semântica de produto |
| P2         | Clicar quando o status está próximo da expiração do cupom | Experiência do toast quando o use é rejeitado pelo MAAS no instante do vencimento             |

## 6. Pendências de alinhamento com o backend

1. Origem da baixa manual/auto: a interface de status não consegue distinguir (a query do MAAS não traz a origem, e o status do ZCODE não lê o fluxo do MySQL).
   Se o produto exigir exibir a distinção de origem, a solução é «consultar o último registro de use do scope + casamento exato por equality com used_at + fallback para null»;
   o backend diz que «é difícil distinguir»; aguarda-se continuar a investigação conforme a lista de dificuldade real/nao real (ver registro de conversa) ou degradar para derivação local no frontend.
2. Localização do 2007: aguardando o backend consultar o log do gateway por 16:26:28.680 / `GET /status` / personal scope;
   após o novo commit `3cc99c4f69` já é possível reconciliar diretamente pelo x-request-id dos logs.