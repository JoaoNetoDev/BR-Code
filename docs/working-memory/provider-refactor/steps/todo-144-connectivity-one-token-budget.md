# Todo144: teste de conexão usando de forma independente o orçamento de saída de 1 Token

Status: implementação e verificação concluídas; em 2026-09-15 foram complementados E2E no Pro desktop, testes unitários direcionados e re-revisão. Em 2026-09-12 o usuário já havia confirmado e autorizado a implementação.

Decisão posterior (2026-09-17): no Air, o OpenCode Go Luna recusou de forma mensurável 1 Token e exigiu no mínimo 16; o usuário confirmou ajustar uniformemente o orçamento do teste de conexão para 512, com o ponto de entrada da implementação em [Todo159](todo-159-connectivity-512-token-budget.md). Abaixo preserva-se o histórico original de implementação e verificação; os 512 ainda aguardam implementação.

## Decisões e Fronteiras

- O teste de conexão não é geração de conteúdo e portanto não reutiliza mais o orçamento de 5.000 Tokens de `auxiliaryModelOptions()`; no Core, `testModelConnectivity()` vincula de forma independente `maxOutputTokens: 1`, ainda tomando o primeiro item do nível de raciocínio público e ordenado do modelo.
- O system fixo `You are ZCode connectivity probe.` e o user `hi` são mantidos como são, sem alterar prompt, papéis, configuração de modelo ou a escolha salva pelo usuário.
- Consome o fluxo Model oficial completo. Um finish normal (inclusive atingindo o limite de saída length) é sucesso, e é permitido não haver corpo, apenas reasoning; apenas começar a responder mas faltar finish, event de error, rejeição de autenticação/parâmetros, timeout, etc. continuam sendo falha. Não se engole o erro nem se aumenta o orçamento e tenta de novo automaticamente.
- O orçamento de outras chamadas auxiliares, como Git e títulos, permanece inalterado. Sem nova configuração, protocolo, persistência ou migração, e sem caso especial por Provider.
- Alguns upstreams podem recusar 1 Token ou ter restrições de thinking budget; relatar conforme a fronteira oficial de erros; não afirmar suporte a todos os fornecedores nem prometer reduzir o tempo de fila/de primeira resposta.
- Reutiliza-se a retentativa de resposta vazia do Adapter oficial: um final não-stop sem corpo, sem raciocínio e sem usage pode ser retentado uma vez, com o orçamento sempre em 1; esta tarefa não altera a política geral de retentativas. O cenário de sucesso de corpo vazio no E2E retorna explicitamente completion_tokens=1, diferenciando-se da resposta vazia de uso zero.

```text
设置页点击 -> 既有 Service/目标 Worker -> Core 创建本次 Model
  -> 最低档位 + 1 Token -> 原有鉴权/签名/Adapter -> 消费完整流
                                                     |- 正常 finish -> 成功（允许无正文）
                                                     `- 报错/无 finish -> 失败
```

A única propriedade da estratégia pertence à entrada de teste de conexão do Core; o desktop local, o Worker remoto e o shared-host do celular reutilizam a cadeia de chamadas já existente, sem alterar continuous/replayable, owner, identidade do workspace ou o Model em execução.

## Aceitação

- Core: verificar primeiro vermelho e depois verde para 1 Token fixo, nível mínimo de raciocínio, sucesso com stop/length sem corpo, falha com fluxo em erro/sem finish, prompt inalterado; manter as asserções de orçamento auxiliar do Git.
- Adapter: o campo de orçamento de saída final dos três protocolos é 1, e as asserções existentes de prompt/identidade fixos são mantidas.
- E2E: estender o `provider-connectivity-prompt.test.ts` pendente; clicar na linha de modelo real, loopback retorna length sem corpo e a UI mostra sucesso; 400 continua mostrando falha; o orçamento final no wire é 1, e a seleção Personal/sessão não muda. Apenas teste isolado, sem alterar dados do Air ou disparar requisições a contas reais.
- Executar em lote os testes relacionados, typecheck, lint e a checagem de arquitetura, e então revisar e commitar; registrar com honestidade a compatibilidade com upstreams que não foram testados.

## Registro de Implementação e Re-revisão

- Branch `connectivity-one-token`. Na produção apenas a entrada de teste de conexão do Core foi modificada, com constante nomeada igual a 1 e o nível mínimo mantido; não se alterou `auxiliaryModelOptions()`, o Prompt, a lógica de fim/erro do fluxo, a configuração ou o protocolo.
- TDD: 3 asserções de orçamento da implementação antiga falharam; após a alteração, Core + Adapter passaram 26/26. Foram acrescentadas asserções de regressão para sucesso sem corpo em stop/length e para o Git continuar em 5.000; as asserções existentes de fluxo com exceção, event de error e falha sem finish continuam passando.
- Verificação dos campos finais dos três formatos: Anthropic `max_tokens=1`, Chat `max_completion_tokens=1`, Responses `max_output_tokens=1`; não se trata o nome do parâmetro do SDK como campo universal de todos os protocolos. A antiga asserção de 5.000 no E2E de reasoning-fallback foi atualizada em conjunto.
- `pnpm typecheck`, typecheck do Core, `typecheck:e2e` do Desktop, checagem de formatação e `git diff --check` passaram; lint da raiz com 0 errors / 42 warnings já existentes; arquitetura com 0 violations.
- O E2E de desktop usou um novo build; a primeira rodada `desktop-e2e-20260912-175609-167` saiu ao criar a WebDriver session e os testes nem chegaram a rodar. A inicialização local de compatibilidade com X11/GPU desativado e o diagnóstico por logs continuam falhando; iniciar o mesmo Electron diretamente no diretório isolado reproduz SIGTRAP (exit code 133), ainda sem atribuição — isso não é tratado como falha funcional desta tarefa e não se declara o E2E aprovado. Após a autenticação SSH no Pro, o comando saiu com código 1 sem saída, e não foi possível complementar a execução.
- Seguindo a exigência do repositório de só commitar depois de um E2E interativo aprovado, nada foi commitado; o encerramento fica pendente até que o caso pendente atualizado rode em um ambiente de desktop funcional. A configuração do Air não foi modificada e nenhuma sondagem foi feita a contas reais; a compatibilidade dos fornecedores reais com 1 Token continua não testada.

## Complemento de Aceitação de 2026-09-15

- O bloqueio de ambiente de desktop descrito acima foi resolvido: o repositório isolado no Pro reconstruiu Electron e CLI, e os dois specs pendentes passaram em conjunto (2/2), run: `desktop-e2e-20260915073727784-p67110-e4267aabc5aa16a0`. Os artefatos estão no diretório de run correspondente em `/Users/dev/Desktop/projects/Z.AI/todo151-pro.hGJ5yI/repo/packages/desktop/.e2e-artifacts/` no Pro.
- C91-04 verificou o clique na linha de modelo real, o sucesso length sem corpo e com usage 1, a falha 400, o Prompt fixo e o orçamento no wire, e a configuração/seleção inalteradas. O Todo95 verificou que, após adicionar na UI apenas o nível high, a requisição oficial usa high com orçamento 1.
- Todas as falhas da primeira rodada foram localizadas: a fixture sem usage disparou a retentativa já existente para resposta vazia; o caso antigo do Todo95 ainda dependia do interruptor/nível estar na área básica, e modelos desconhecidos tinham apenas o default antigo desabilitado. Corrigiram-se apenas a fixture e as operações reais na UI, sem modificar a política geral de retentativas, o layout do produto ou as regras de default de modelo.
- Core + Adapter 26/26, Service + UI com rotas alvo 8/8; typecheck da raiz, typecheck do Core e Desktop typecheck:e2e passaram; lint com 0 errors / 42 warnings já existentes, arquitetura com 0 violations, formatação e checagem de diff passaram.
- Re-revisão: a mudança de produto continua sendo apenas a vinculação do orçamento de probe no Core; os orçamentos auxiliares como Git permanecem inalterados, e Prompt, autenticação, assinatura, semântica de erro do fluxo, configuração e persistência seguem iguais. Celular/remoto não foram testados em máquina real; as restrições reais de upstream com 1 Token não foram medidas e não se afirma compatibilidade de todos os fornecedores por causa disso.
