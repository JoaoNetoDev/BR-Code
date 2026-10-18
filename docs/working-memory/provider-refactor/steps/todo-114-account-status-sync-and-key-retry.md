# Todo114: sincronização do motivo de conta indisponível e fechamento da falha de obtenção de Key do plano pessoal

> Nota sobre a numeração: o número original upstream era Todo105; em 2026-09-10, ao ser integrado a este branch, passou a Todo114 para evitar conflito com o Todo105 já existente de «simplificação da lista de modelos pessoal/equipe». Os IDs de caso T105 e os caminhos de evidência temporária abaixo foram mantidos como estão, para facilitar o rastreamento.

> Status: implementado; testes unitários/direcionados, testes de integração e verificação de componente no navegador aprovados; em 2026-09-10 o usuário autorizou primeiro mesclar e registrar o ToDo, e só então implementar. A cadeia completa de Electron/controle remoto do celular não foi medida e não conta como evidência de aprovação desta rodada.
> Base: `fix-account-status-sync` criado a partir de staging, com o merge de `origin/fix/coding-plan-not-purchased-status` (`da708b7d4a`), sem conflitos.

> Atualização de comportamento em 2026-09-16: a retentativa ativa da falha de credencial do plano pessoal passa a ser o clique do usuário em «entrar novamente»; o contrato concreto está em [spec do estado de falha](../../../ui/coding-plan-entitlement-failure-state.md). Abaixo está o histórico da implementação original e as asserções de interação de «callback de login igual a zero» não são mais adotadas.

## 1. Contexto e decisões

O branch original corrigiu «está logado, o servidor diz explicitamente que não há plano pessoal, mas aparece como não conectado»: o Host passa `unavailableReason` junto do Account State, e a UI distingue não contratado de falha na obtenção. Isso está de acordo com a fonte única de verdade do refactor de Provider e não restaura a segunda sondagem de entitlement da UI.

A revisão encontrou dois pontos a completar: o Host envia o novo campo, mas o schema de sincronização estrito usado pela CLI não o aceita e rejeita o snapshot inteiro da Account; e, quando a obtenção da Key do Coding Plan pessoal falha, o Z.ai classifica conforme a informação de login local, enquanto o BigModel reporta固定的「não conectado».

O usuário confirmou:

- o schema de sincronização aceita um campo de motivo opcional, mantendo a validação estrita; não se reestrutura o estado inteiro nem se exige que o motivo e a availability usem uma união discriminada;
- a classificação de falha na obtenção da Key do plano pessoal é alinhada entre os dois family. Domínio de interface, Authorization e adaptação do secretKey permanecem como estão.
- **Logado mas sem Key deve informar «falha na obtenção», com possibility de retentativa; não se pode forçar novo login só pela ausência da Key.** A informação de usuário local prova apenas que já houve login, não que o Token ainda é válido.
- Só evidência clara de credencial de login inválida justifica exigir novo login. O serviço atual de obtenção de Key normaliza todo tipo de falha em null; desta vez não se amplia o protocolo de falhas nem se trata automaticamente null ou 401/403 da API Key de modelo como invalidação de OAuth.
- Sem login continua pelo caminho de conexão existente; uma consulta bem-sucedida que diga explicitamente que não há plano continua mostrando «não contratado», com entrada de assinatura. Start, Team e Off-Peak não têm ajuste adicional.
- Mantém-se a nomenclatura de motivos do branch original; `credential-failed` significa nesta rodada falha na obtenção/validação de credenciais, sem afirmar que o OAuth já expirou.

## 2. Estrutura e fronteiras após a modificação

### Membros do estado de sincronização

```ts
unavailableReason?:
  | "not-authenticated"
  | "not-connected"
  | "credential-failed"
  | "not-entitled";
```

A enumeração de motivos é definida uma única vez no schema shared, o tipo é derivado do schema e o Provider reutiliza por meio da dependência shared já existente. A sincronização continua usando `zcodeProviderUpdateAccountConfigParamsSchema`, sem criar comando novo, sem reduzir o strict e sem criar outro owner de estado.

### Cadeia de estado e retentativa

```text
Host obtém a Key do plano pessoal
  ├─ sem Key + sem informação de login local → não logado/entrada de conexão
  ├─ sem Key + com informação de login local → falha na obtenção
  └─ com Key → consulta de assinatura → disponível / explicitamente não contratado / estado desconhecido já existente
                  |
                  v
       Account State (único owner do Host)
            ├─ schema de sincronização shared → CLI recebe o snapshot completo
            └─ Settings View → cartão de falha na obtenção
                                 |
                               clique em retentativa
                                 |
                       refresh settings-manual já existente
                                 |
                         Host reobtém e publica
```

A retentativa do cartão reaproveita o refresh existente e suas guardas de concorrência/versão; não limpa OAuth, não inicia login, não adiciona temporizador, cache ou desvio de sincronização de estado. Desktop e celular usam o componente de configurações e o serviço compartilhados, e o caminho de sincronização de Host/Agent não muda; não se modifica continuous/replayable, owner/lease nem remote attachment.

## 3. Ordem de implementação

1. Primeiro acrescentar testes de falha para o round-trip do protocolo, para a classificação de Key ausente nos dois provedores e para o cenário de retentativa do cartão.
2. O shared ganha o schema de motivo e o Provider reutiliza o tipo derivado, completando o membro de estados da sincronização.
3. Services unifica o 판단 de Key ausente dos dois provedores no helper existente, sem alterar a adaptação de rede nem o cache da obtenção de Key.
4. A UI oferece retentativa quando a obtenção do plano pessoal falha, reaproveitando a entrada de refresh existente; as operações de login existentes dos outros planos e do fluxo de upgrade são preservadas. Reaproveita-se a tradução, os componentes e os estados de carregamento já existentes.
5. Verificar, re-revisar, reescrever as evidências reais e fazer commit; desta vez não foi autorizado push nem criação de MR.

## 4. Verificação e compatibilidade

- Protocolo: os quatro motivos fazem round-trip sem perdas; ausência de motivo continua aceita; motivo errado e campo desconhecido são rejeitados; um snapshot com Providers disponíveis e indisponíveis misturados é aceito por inteiro.
- Serviço: Z.ai/BigModel cobrem cada um o estado de Key ausente com e sem informação de login, sem enviar requisição de subscription; os casos já existentes de sucesso com e sem assinatura e dos outros planos dão regressão.
- Interação: na falha de obtenção, clicar em retentativa dispara refresh e não login; se a retentativa falhar, é possível operar de novo, e o sucesso restaura o estado atual. O cenário real da página de configurações é validado com E2E, distinguindo a janela estreita do desktop da evidência de teste em celular real.
- O runtime é validado com o schema real e com as funções produtoras/consumidoras de estado; asserções por string do código-fonte não substituem a regressão do protocolo.
- Executar testes direcionados, typecheck, lint e architecture:check; para o E2E, complementar com typecheck:e2e. Bloqueios de ambiente registram o resultado real, não se faz de conta que passou e não se reconstrói toda a infraestrutura de E2E por causa disso.
- Apenas se acrescenta um campo opcional de runtime; não há novo arquivo de armazenamento, tabela de banco ou migração. App e CLI precisam sair juntos; a CLI antiga em modo strict não aceita o campo novo, e não se alega compatibilidade de uso misto entre versões.

## 5. Entrega real e questões restantes

### Complemento do gate de push (2026-09-10)

O usuário pediu que a correção fosse devolvida ao branch `fix/coding-plan-not-purchased-status` do MR original !2594. No primeiro pre-push, os testes afetados tiveram 14.484 aprovados e 2 falhas; ambas as falhas vêm da verificação de estabilidade de referência React de um componente de compartilhamento já existente: o SessionPane passa um callback inline ao Dock confirmado por memo, e o Selection Dock cria um objeto novo a cada preflight no modo default ocioso.

Para passar no gate de push normal, fez-se apenas a estabilização de referências: no primeiro caso um useCallback com dependências de `sessionId` e `updateShareDockState` mantém o vínculo com a sessão atual; no segundo, o valor default somente-leitura do estado ocioso foi elevado a constante de módulo. O corpo original das funções, a posse do estado, a exibição e a interação são preservados, sem mudar o protocolo de compartilhamento ou a decisão de permissão. Os testes já falhando entram como regressão; é um commit separado, para facilitar a identificação desta correção de apoio do gate.

Após a correção, a estabilidade de referências e os quatro arquivos de teste de compartilhamento passaram 45/45, e o typecheck, o lint (41 warning / 0 error), a verificação de arquitetura e a verificação de formatação dos dois arquivos passaram. Esta rodada é só de estabilização de referências, sem nova interação de compartilhamento, portanto o E2E de compartilhamento não foi reexecutado; o gate de push completo foi reexecutado em seguida.

### Caso de interação no navegador aceito (fixado antes da implementação)

T105-UI01: renderizar separadamente os cartões «falha na obtenção» do plano pessoal de Z.ai e de BigModel; clicar em retentativa; o botão não pode ser submetido novamente enquanto o refresh controlado não terminar; se o primeiro refresh ainda falhar, é possível retentativar de novo, e na segunda, ao voltar ao estado explicitamente não contratado, a assinatura é exibida. O callback de login é zero ao longo de todo o fluxo. Cobre 390px em chinês claro e 1200px em inglês escuro, salvando erros do navegador, capturas de tela e a contagem de refreshes.

O caso entra em `packages/ui/test/browser/manual-review/pending/account-provider-key-retry.*`, reaproveitando o workflow existente de navegador de componentes com Vite + Playwright. Ele prova a interação real do cartão; o parsing real do Host e o protocolo são validados separadamente pelos testes de integração; o fixture de componente não é apresentado como um E2E completo de Electron ou de shared-host do celular.

### Entrega

- O protocolo de sincronização ganha um campo de motivo opcional e continua strict; o subpath público `shared/account-provider-state` fornece o schema único de motivo e o tipo derivado, e o Provider mantém o nome de export original. O subpath leve evita que a build do Provider introduza definições de ambiente Node pelo entrypoint geral do shared; nenhuma dependência de pacote ou comando de sincronização foi alterada.
- Z.ai/BigModel unificam o tratamento da Key ausente do plano pessoal conforme a informação de usuário local do family correspondente. As saídas antecipadas já existentes na camada superior por falta de identidade de conta, os outros planos, o cache e a adaptação de rede ficam inalterados.
- O cartão `credential-failed` do plano pessoal obtém a ação de retentativa pelo Detail; chama o `useModelProviders.refresh()` existente → `settings-manual`, reutilizando seu loading, sua guarda de versão e o log de erros. O botão não dispara login OAuth; Start/Team e o fluxo de upgrade mantêm as operações já existentes.
- Os novos módulos de schema e arquivos de teste no código-fonte são organização de código, não novos arquivos de armazenamento no diretório do usuário.

### Evidências de verificação (2026-09-10)

- Primeiro foram acrescentados os testes, obtendo 8 falhas esperadas: 4 de motivo de protocolo, 2 de classificação BigModel e 2 de botão de retentativa; depois da implementação, todas foram corrigidas.
- Os 7 arquivos de teste direcionados finais passaram 280/280: round-trip/rejeição estrita do protocolo, fechamento de construção do model config, disponibilidade de plano, Connection Resolver da conta, projeção do Account State, detalhe do cartão e projeção de navegação. `/tmp/todo105-final-unit.log`.
- Os testes de integração de serviço usam o caminho real Family Availability → Connection Resolver → Account Config Resolver → schema de sincronização: nos dois provedores a Key ausente publica `credential-failed` e o Start Plan disponível do mesmo snapshot não é bloqueado. Não se usou busca em código-fonte no lugar da verificação de protocolo em runtime.
- O caso de navegador T105-UI01 passou nas quatro combinações: dois provedores × (390px chinês claro / 1200px inglês escuro). Cliques reais verificam a contagem de requisições de retentativa, o bloqueio durante o refresh, o novo clique após a falha, o botão de assinatura após a recuperação, zero chamadas de login e nenhuma exceção de JS na página. Log `/tmp/todo105-browser.log`; capturas e logs do navegador em `/tmp/zcode-todo105-browser/`. Na primeira execução o ambiente não tinha Chromium / libatk; o navegador foi instalado e as bibliotecas dinâmicas temporárias existentes foram reaproveitadas. A primeira asserção em inglês estava escrita como `Failed to fetch` e foi corrigida para seguir a tradução já existente do produto, `Fetch failed`, sem mudar o texto do produto.
- `pnpm typecheck` passou (incluindo o `tsconfig.e2e.json` do desktop); `pnpm lint` ficou com 0 error / 41 warning, e os warnings não estão no código de produção modificado nesta rodada; `pnpm architecture:check --changed` ficou com 0 violation / 0 baseline / 0 new. A formatação e o `git diff --check` passaram.
- Os módulos modificados (shared, provider, services, ui) são todos módulos unmanaged na policy atual, e o contexto não declara um CONTRACT próprio; desta vez não houve novo IO entre camadas nem novo owner de estado mutável.

### Fronteiras e verificações restantes

- A obtenção de Key que hoje retorna null ainda não distingue falha de rede, de criação de Key ou de OAuth; não há nova detecção nem nova enumeração de motivo de «OAuth explicitamente inválido». A Key ausente não dispara novo login obrigatório.
- O fixture de navegador prova apenas a interação real do componente; não foram executados o Electron completo, a API de conta real nem shared-host/SSH reais em celular. O primeiro mantém as lacunas de ambiente/fixture já registradas no branch original; as verificações restantes de cadeia de produto são registradas de forma unificada no Todo102, sem alegar cobertura ponta a ponta completa.
- No Linux atual o navegador não tem fontes chinesas, e as capturas em chinês aparecem com quadrados no lugar dos caracteres ausentes; os textos em DOM e as asserções de clique em chinês passaram, mas as capturas não servem como evidência de aceitação de glifos/tipografia em chinês.
- O requisito de publicação pareada App/CLI permanece o mesmo; um App novo com a CLI antiga continua incompatível com o campo novo. Não foi escrita configuração de usuário, não foi adicionada migração de armazenamento, não houve push remoto nem criação de MR.

O documento histórico do branch original é `docs/coding-plan/connection-status-semantics.md`; nele, «falha na obtenção → novo login» e os candidatos não decididos da §7.2 foram substituídos pelas decisões do usuário registradas neste Todo.
