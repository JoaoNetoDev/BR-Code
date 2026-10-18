# Todo155：Limpeza das dependências de conexão do Start e identificação do plano na troca de modelo

> Status: lista inicial de problemas, substituída por [Todo156](todo-156-start-plan-followup-final-decisions.md). O histórico da investigação de 2026-09-16 é preservado e não representa o escopo de implementação atual; as decisões permanentes, o adiamento da governança de equipe e a verificação final seguem o Todo156.
> Origem: feedback do Air após a entrega do [Todo154](todo-154-start-plan-independent-provider.md), revisão específica das dependências de conexão e capturas de tela das dicas de troca de modelo.
> Baseline da revisão: `f2b40bda8c`, branch `start-plan-independent-provider`. Os caminhos, funções e condições de reprodução abaixo são evidência rastreável e persistente; relatórios temporários não servem como base única.

## 1. Objetivo e atribuição de estado

O Start já é um Provider independente e não deve continuar exigindo que o "método de conexão" global selecione o Start. Escolher a
origem do estado pelo owner do fato exibido, sem mudar mecanicamente todos os cenários para a leitura do campo de entrada.

| Cenário                              | Origem correta                                         |
| ------------------------------------ | ----------------------------------------------------- |
| Cota do campo de entrada, recomendação de plano do mesmo modelo no envio | Provider e modelo efetivos do campo de entrada / formulário atual |
| Saldo da sessão / lembretes de erro    | Provider, modelo e fatos de erro realmente executados pela sessão |
| Dica de separação na troca histórica de modelo | fromProvider/fromModel e toProvider/toModel do registro |
| Disponibilidade do Start, direitos na página de configurações | Conta conectada no momento, direitos da conta e configuração de modelos do Start |
| Conexões pessoal/equipe na página de configurações, scope de uso da equipe | Conexão paga global e identidade completa da equipe |

```text
登录账号 → Account Source → Start 权益 / Registry
                                  ↓
输入框有效 Provider + model → 对应额度展示 / 提交推荐
会话执行 Provider + model  → 会话余额 / 业务错误提醒
历史切换记录的前后身份     → 历史套餐名称展示

全局个人 / 团队选择 → 付费访问上下文与团队 scope
                   不作为 Start 可用或展示的门禁
```

Nenhum novo owner de estado mutável; mantém-se o contrato original de envio, cache e restauração, preservando a fronteira entre
continuous no desktop e replayable no celular.

## 2. Problemas e lista de implementação

### T155-01：O saldo do Start no campo de entrada ainda exige a conexão global do Start

- [ ] Corrigir o `resolveV4ContextPlanConnection` em `packages/ui/src/v4/composer/V4ComposerToolbar.tsx`: o Start é determinado pelo Provider efetivo atual, sem exigir que a seleção exista ou que o kind seja start-plan.
- [ ] Preservar a dependência legítima das cotas pessoal/equipe em relação ao scope pago real.
- [ ] Verificar a visibilidade final de `contextUsage.tsx`, o saldo flutuante do Start e a entrada de atualização.

Situação atual: quando o campo de entrada das duas marcas seleciona o Start, tudo retorna none se o global for pessoal, equipe ou
não definido; apenas o antigo start-plan retorna Start. O anel de nova sessão sem uso de contexto desaparece; sessões com uso
podem exibir o anel, mas o saldo do Start continua ausente. Como o anel também carrega o uso de contexto, não se pode tratar a
presença do anel como o próprio estado do Start.

### T155-02：Falha no preenchimento de dados de equipe legados arrasta o Start junto

- [ ] Corrigir o curto-circuito por marca inteira em `unresolvedFamilies` em `packages/services/src/model-provider/accountProviderConnectionResolver.ts`; o Start consulta os direitos da conta de forma independente.
- [ ] Preservar a restrição de consulta à equipe paga quando não é possível confirmar a identidade da equipe, sem adivinhar organização/projeto e sem nova migration.

Cadeia: `settingService.prepareLegacyAccountConnections` → readAccountProviderSettings do `node.ts` → resolver. Quando a equipe
legada não tem organizationId e o preenchimento falha, hoje o Start da mesma marca é marcado como unknown; na inicialização a
frio, sem snapshot bem-sucedido, isso pode tornar o Start não selecionável. Essa condição ainda não foi reproduzida em um
aparelho Air real e não pode ser usada como explicação para o problema anterior de expiração de plano no Air.

### T155-03：Consulta de saldo da sessão e de identidade de plano sem accountAccess

- [ ] Completar a descrição de acesso da consulta do Start em `packages/ui/src/v4/useV4SessionQuotaBanner.ts`, com origem no Provider de execução da sessão.
- [ ] Verificar e completar a descrição de acesso das consultas de Start/pago em `packages/ui/src/hooks/usePlanIdentitySnapshot.ts`, preservando o significado original das estatísticas de identidade de plano.
- [ ] Cobrir cache frio, atualização e cache já existente, evitando que o preenchimento do cache por outras entradas mascare a falta de parâmetro.

Situação atual: useUsageEntitlement repassa os parâmetros como são, e BigModelUsageQuotaProvider não completa accountAccess apenas
com base no preferredProviderId; a consulta do Start sem o parâmetro retorna not_configured, provider=null, quota=null. As dicas
de saldo baixo/esgotado baseadas em saldo são afetadas; as dicas dirigidas por erro do servidor têm um ramo independente, e não
se pode afirmar que todas as dicas de erro falharam.

### T155-04：Start sem direitos é exibido como não conectado / configuração ausente

- [ ] Corrigir de forma conjunta a projeção de estado em `providerFamilyConnectionVisibility.ts`, `Detail.tsx` e `StatusCards.tsx`.
- [ ] Distinguir não conectado à conta, sem direitos claramente/expirado, pendente, falha de consulta e configuração realmente ausente; não sugerir mais conectar/desconectar o Start.
- [ ] Exibir as entradas de resgate, compra e gerenciamento de modelos conforme as condições reais, sem usar disconnected para controlar a visibilidade das entradas.

Situação atual: o Start fica fora do ramo explícito de "sem plano" e volta para disconnected; os detalhes só entram no ramo
exclusivo quando available/purchased e, nos demais casos, exibem accountProviderConfigMissing apenas porque a settings view existe,
sem verificar se a configuração está realmente ausente. Ao corrigir o texto, é obrigatório conferir também o portão do cartão de
resgate para evitar que a entrada desapareça.

### T155-05：O dropdown de conexão de equipe lê o current do Provider pessoal por engano

- [ ] Verificar os três ramos de construção do item de navegação de equipe, evitando que, ao expandir o template pessoal, apenas o presetId seja trocado e o provider pessoal herdado permaneça.
- [ ] `ProviderFamilyModeHeader.tsx` decide se está selecionado com base no Provider de equipe real e na identidade da equipe; quando for realmente necessária uma seleção vazia, fornecer corretamente o placeholder.

Situação atual: com pessoal current=false e equipe real current=true, o dropdown pode definir incorretamente value como vazio; o
SelectValue não tem placeholder, resultando em uma caixa vazia apenas com a seta. Este controle responde pela conexão paga global e
não pode passar a seguir a seleção de Start do campo de entrada.

### T155-06：A dica de troca de modelo indica o tipo de plano

- [ ] Confirmado pelo usuário: a dica de troca de modelo de sessão nas capturas usa `GLM-5.3(个人套餐)`、`GLM-5.3(体验套餐)`、`GLM-5.3(团队套餐)`; os demais modelos seguem o mesmo formato.
- [ ] Os dois lados são rotulados separadamente conforme o Provider ID registrado, permitindo ainda distinguir o mesmo modelo em planos diferentes; tanto BigModel quanto Z.ai são cobertos.
- [ ] Não depender da conexão global atual, do rascunho do campo de entrada ou da disponibilidade do diretório; não reescrever o histórico; provedores personalizados comuns mantêm as regras de exibição existentes.
- [ ] Suportar internacionalização, desktop/celular e temas claro e escuro, permitindo quebra de linha normal para nomes longos.
- [ ] Na implementação unificada, verificar se as dicas de primeiro uso adjacentes e o toast de troca compartilham as mesmas regras; antes da pausa, o rascunho já cobria os dois pontos, como candidato ao escopo de implementação em revisão. Não foi solicitado renomear todo o menu de modelos, os rótulos do campo de entrada ou os rótulos de Subagent.

Exemplo: `模型已切换 GLM-5.3(团队套餐) → GLM-5.3(体验套餐)`.

### T155-07：Limpar fluxos obsoletos, mantendo a leitura compatível

- [ ] Revisar `manualClaimPlanModelGuideStore` e o antigo guia de resgate da Toolbar: hoje não foi encontrado nenhum solicitante em produção, mas o consumer ainda exige start-plan e seleciona o modelo automaticamente; limpar conforme o processo de aposentadoria, sem restaurar a troca automática de modelo após o resgate.
- [ ] Revisar filtros antigos de navegação do Start como `filterStartPlanItemsByEntitlement`: as chamadas de produção já excluem o Start antes; distinguir ramos inalcançáveis de caminhos de compatibilidade válidos.
- [ ] Preservar a capacidade de leitura do antigo kind:start-plan; não reescrever em massa sessões, tarefas, automações ou dados de Subagent por causa da limpeza.
- [ ] Alinhar o spec oficial e o feature graph, que ainda descrevem o Start como opção de conexão e o fallback automático para a conexão pessoal quando inválido; a nova especificação segue a decisão de Provider independente do Todo154.

## 3. Fronteiras que se mantêm

- Não iniciar a coexistência completa do Todo101 entre pessoa e múltiplas equipes, nem mesclar os Provider IDs das duas marcas.
- As requisições do Start continuam usando o JWT da conta conectada no momento; sem direitos, não se consome silenciosamente cota paga.
- O menu de modelos, a resolução precisa do Start, a autenticação de requisição e a recomendação de plano no envio permanecem como
  fluxos principais independentes, com regressão após a correção.
- Não adicionar barreiras complexas de corrida de conta, reenvio automático, segunda cota/estado de conexão ou migração extra
  de dados.
- Gatilhos de tarefa, execução em segundo plano, execução imediata e Bot não recebem nova recomendação de envio.
- Na troca de plano do mesmo modelo, mantém-se a validação de compatibilidade das opções de raciocínio; o tipo de plano é apenas
  exibição e não altera as opções de modelo.

## 4. Matriz de aceitação

| Número | Cenário e resultado esperado                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------- |
| SC-01 | Duas marcas × global pessoal/equipe/sem seleção/Start histórico: com o campo de entrada no Start, a cota é exibida conforme os direitos |
| SC-02 | Nova sessão sem contexto e sessão com uso: anel/hover corretos; ao voltar ao pago, a cota segue o Provider real |
| SC-03 | Falha no preenchimento da organização da equipe legada: a equipe permanece restrita e o Start, logado e com direitos, fica disponível de forma independente; sem nova migração |
| SC-04 | Start com saldo baixo, esgotado, falha de consulta, cache frio e atualização: parâmetros de acesso corretos; as dicas de erro originais não regridem |
| SC-05 | Start não logado, sem plano/expirado, pending, unknown e configuração realmente ausente são exibidos separadamente; as entradas de resgate e gerenciamento de modelos não têm texto de conexão enganoso |
| SC-06 | Equipe current=true, pessoal current=false: o dropdown mostra a equipe real; usuários antigos do Start ainda podem selecionar ativamente o único plano pago |
| SC-07 | Duas marcas, três tipos de plano, troca com modelos de mesmo nome/nome diferente: sufixos corretos dos dois lados; mudar a conexão atual, diretório ausente ou replay histórico não alteram o tipo de plano |
| SC-08 | Provedores personalizados comuns mantêm os rótulos originais; chinês/inglês, desktop/celular em tela estreita, temas claro e escuro sem truncamento ou overflow |
| SC-09 | Resgatar/navegar no Start não modifica o modelo nem a conexão paga global; as configurações históricas continuam legíveis e o Start indisponível não tem fallback pago |

Antes da implementação, acrescentar testes falhos com o resultado esperado real e só então corrigir a implementação. As
verificações necessárias incluem typecheck da raiz, lint, architecture:check --changed e os testes afetados; os E2E interativos
são executados via SSH Pro admin conforme pedido do usuário. Tela estreita do desktop não pode se passar por um E2E completo de
celular em host compartilhado, e itens não cobertos devem ser registrados explicitamente; ao final, fazer uma revisão completa.

## 5. Evidências atuais e cenário da pausa

- A revisão específica passa em 5 arquivos e 118 testes, mas os testes do anel ainda exigem Start global e o teste de
  preenchimento da equipe legada ainda afirma Start como unknown; essas aprovações não provam que a semântica independente
  está correta.
- Executando oito grupos de validação de entrada sobre as funções do código-fonte do baseline, nas duas marcas só a antiga
  conexão start-plan retorna o contexto de cota do Start; as sondas de métodos de serviço sem accountAccess retornam
  not_configured com snapshot vazio.
- Antes da pausa, apenas T155-06 tinha rascunho não commitado: `modelTriggerDisplay.ts`, `ConversationRowView.tsx`,
  `SessionPane.tsx`, `v4ConversationRowViewTimelineMarker.test.ts`, além de um acréscimo a uma seção do spec oficial do Start. O
  workspace foi preservado e não é considerado uma entrega concluída.
- Esse rascunho de etiqueta validou primeiro 7 falhas esperadas e, após as alterações, 2 arquivos com 28 testes passaram; o
  typecheck completo, o lint, a validação visual/de dispositivo e a revisão final ainda não foram concluídos, e não há commit
  nem push.
- T155-01 a 05 e 07 ainda não foram implementados. Conforme a solicitação mais recente do usuário, esta rodada apenas registra o
  novo TODO e os links de entrada, sem continuar modificando o código do produto.