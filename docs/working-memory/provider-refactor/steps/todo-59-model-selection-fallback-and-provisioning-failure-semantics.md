# Todo 59: Correção da Seleção Padrão de Modelo e da Semântica de Falha no Provisioning Remoto

> Status: implementação concluída
>
> Data: 2026-09-01
>
> Pré-requisitos: Todo 55, Todo 56 e Todo 57 concluídos. Este Todo não refaz o Provider Template, a
> sincronização em nível de Environment nem a infraestrutura de E2E; ele apenas corrige as duas derivações
> de implementação confirmadas na revisão.

## 0. Contexto e Objetivo

O Todo 57, para corrigir o E2E de publicação atrasada do Account Registry e de seleção de Start Plan
antigo que deixou de funcionar, adicionou na inicialização do rascunho no Renderer um fallback especial
de "o primeiro modelo do Account Provider atual vem antes do preferredSelection do Host". Essa regra
contorna o Configured Default, faz o Renderer passar a entender Account Family/Plan e perde as reasoning
options carregadas pelo Configured Default.

O primeiro Remote Environment Provisioning do Todo 56 já é uma barreira de sincronização antes da
publicação do Workspace remoto, mas, ao receber hoje `failed`, `rollback_failed` ou `unsupported`, ele
ainda apenas registra um warning e continua publicando a conexão. Isso deixa o remoto rodar com a
configuração antiga ou vazia quando a configuração crítica de modelo não foi sincronizada com sucesso.

Este Todo converge para duas regras únicas:

1. A seleção padrão de um novo rascunho é fornecida uniformemente pelo `preferredSelection` do Host
   alvo; a Account Connection afeta apenas o fato de disponibilidade do Registry e não forma um segundo
   conjunto de prioridade de modelo padrão no Renderer.
2. Quando o primeiro Provisioning não tem sucesso, o Workspace remoto não é publicado; falhas de
   sincronização posteriores, depois de já conectado, não desmontam o Workspace, apenas registram um
   warning estruturado e tentam de novo no próximo disparo formal.

## 1. Prioridade da Seleção de Modelo

### 1.1 Prioridade Única

```text
任务明确继承的 ModelSelection
        |
        | 不存在
        v
当前 workspaceKey 下仍然有效的 Recent Selection
        |
        | 不存在或已失效
        v
目标 Host 返回的 preferredSelection
        |
        +-- 有效 Configured Default
        |
        `-- Registry 中第一个可见 Provider 的第一个模型
```

O Renderer deixa de ler ou derivar o Account Provider atual e não usa mais `provider.models[0]` para
tomar a frente do Configured Default.

### 1.2 Fronteira de Responsabilidades

- A seleção explícita de Task/Draft tem prioridade, porque expressa a intenção do usuário no contexto
  de interação atual;
- Recent só é usado quando ainda é válido na Selection View do Host alvo atual;
- A validade do Configured Default, do fallback do Registry e das options de modelo é resolvida
  atomicamente pelo Host alvo como `preferredSelection`;
- O Account Config restringe apenas entitlement, membros e material de acesso do Account Provider, e
  influencia indiretamente, via Registry, "quais seleções ainda são válidas";
- O Renderer não reconhece Start Plan, Individual nem Team, e não infere modelo padrão a partir de uma
  Family Connection Selection;
- Este Todo vale em conjunto com o contrato de aposentadoria do Option Default do Todo 58: o Host alvo
  completa o reasoning ausente pelo padrão no limite de resolução padrão da Model Selection, usando
  `values.at(-1)` da Enum ordenada; o Renderer consome apenas o `preferredSelection` já completo; e o
  ModelFactory apenas valida e congela a Option concreta, sem mais completar valor a partir do `default`
  do Model Config;
- Draft, Recent, Session Selection e Configured Default recém-escritos precisam carregar um reasoning
  concreto. Seleções esparsas antigas, caso precisem de compatibilidade, só podem ser normalizadas no
  limite de leitura da persistência de seleção do Host; o fallback não pode voltar a ser distribuído
  entre Renderer, Service, Model ou Adapter.

### 1.3 Preservar a Re-hidratação por Registry revision

A publicação atrasada do Account Registry é um problema real de timing, mas não precisa de um fallback
Account-first para ser resolvida.

```text
早期 Selection View 发布
        |
        v
空白 Draft 被预热
        |
Account Overlay 完成，Selection View revision 更新
        |
        +-- Draft 已有用户显式模型意图 --> 保持不变
        |
        `-- Draft 没有用户显式模型意图 --> 使用最新 View 重新初始化
```

Mantém-se a reconstrução existente do Draft em branco orientada por revision; depois de remover o ramo
Account-first, ela acaba lendo o `preferredSelection` mais recente do Host.

### 1.4 Escopo de Limpeza

- Remover o parâmetro `currentAccountProviderId` e o ramo de primeiro modelo do Account Provider de
  `resolveDraftInitialModelSelection()`;
- Remover de `useDraftConfigControl()` a lógica que, para esse ramo, lia `providerFamilyDomain` e
  `providerFamilyConnectionSelections` e derivava o Provider ID;
- Remover imports, memos, construções de teste e comentários que servem apenas a esse ramo;
- Atualizar o Todo 57, o Selection Design e as explicações de E2E, deixando explícito que o registro de
  implementação "recent → primeiro item da Account → Host preferred" foi substituído pela decisão
  posterior deste Todo;
- Não remover a própria capacidade de produto de Family Connection Selection; este Todo apenas proíbe
  que ela entre na seleção padrão genérica do Draft.

## 2. Semântica de Falha do Provisioning Remoto

### 2.1 A Primeira Conexão é uma Barreira Estrita

Remote transport ready não significa Remote Workspace ready. O primeiro Provisioning precisa terminar
com sucesso antes de publicar o Workspace.

```text
Remote transport ready
        |
        v
Environment 0 -> 1 注册
        |
        v
首次 Provider Provisioning
        |
        +-- applied / already-applied
        |          |
        |          v
        |    发布 Remote Workspace ready
        |
        +-- failed / rollback_failed
        |          |
        |          v
        |    连接失败，展示真实同步错误
        |
        `-- unsupported
                   |
                   v
             连接失败，提示远端版本不支持模型配置同步
```

Requisitos de implementação:

- `ProviderProvisioningExecutionResult` não pode mais fazer `pending.resolve()` incondicionalmente para
  todos os status;
- Status de sucesso resolvem a barreira da primeira conexão; status de falha rejeitam/encerram a
  requisição pelo canal existente de falha de conexão do Remote Workspace;
- O erro de conexão preserva Environment, trigger e status; o texto livre de erro do Target pode vir de
  qualquer implementação remota e não prova desensibilização, portanto não é transcrito para o log do Main
  nem para o erro do Renderer;
- `unsupported` é uma incompatibilidade explícita de versão/capacidade e não é tratado como modo de
  compatibilidade silencioso;
- Não adicionar deadline; se a sincronização não retornar resultado, a conexão permanece pending, para
  expor diretamente travamentos de protocolo ou de IO externo;
- Não usar timeout, sleep nem liberação automática para mascarar problemas de status.

### 2.2 Falha de Sincronização Depois de Conectado Não Desmonta o Workspace

Salvamento de Provider, mudanças de Configured Default, mudanças de status de conta e mudanças de
credencial de allowlist disparam sincronizações posteriores para um Environment já online. Nessa situação,
uma falha de sincronização só prova que a configuração remota de modelo não alcançou o estado desejado,
e não que a conexão SSH, WSL, Docker ou de arquivos do Server deixou de funcionar.

```text
Remote Workspace 已连接
        |
本地模型/账号配置成功持久化
        |
        v
Environment 后续 Provisioning
        |
        +-- success
        |     `─ 保持 Workspace 连接
        |
        `-- failure / unsupported
              ├─ 保持 Workspace 连接
              ├─ 记录 Environment 级结构化 warning
              └─ 等待下一次正式 trigger 再重试
```

Fronteiras:

- Não fechar ativamente o Workspace, o terminal ou as operações de arquivo existentes por causa de uma
  falha de sincronização em background;
- Este Provisioning automático é uma capacidade de transição temporária até o lançamento do
  gerenciamento independente de configuração remota; nesta rodada, falhas posteriores entram apenas no
  log, sem novo estado de erro de Environment, protocolo, Banner, entrada na página de configurações ou
  segunda autoridade de configuração;
- O warning inclui Environment, trigger, status e duração, para confirmar a partir de logs de produção
  que o remoto não alcançou o estado; não transcreve texto livre do Target e não adiciona estado de UI;
- Quando a rodada atual falha e não há nova generation, não há retry automático infinito; o próximo
  disparo formal relê o snapshot completo mais recente;
- Quando o usuário desconecta e reconecta, a barreira estrita de primeira sincronização é reentrada.

## 3. Relação com os Desenhos Existentes

- A deduplicação de Environment, o single-flight, o refresh trailing, a cobertura por snapshot completo e
  a fronteira em que o Main apenas agenda, todos do Todo 56, são preservados;
- A seção 5 do Todo 56, "não bloquear a conexão quando falhar ou não for suportado", é substituída por
  este Todo;
- As evidências reais de execução de E2E do Todo 57 são preservadas, mas a conclusão de implementação
  sobre o fallback Account-first é substituída por este Todo;
- O Provisioning Source lendo diretamente o arquivo físico do Credential Store continua sendo um
  acoplamento temporário v0 aceito; esta rodada não abstrai uma interface de exportação de Credential;
- A lane vazia de Environment do Coordinator não afeta a corretude e não é tratada nesta rodada;
- Não muda a semântica de Desktop `continuous`, Mobile `replayable`, owner/lease, CommandInbox nem de
  recuperação de tarefa.

## 4. Testes Primeiro

### 4.1 Testes Unitários de Model Selection

- Recent válido tem prioridade sobre o preferred do Host;
- Recent inválido volta direto ao preferred do Host, sem ler o Account Provider atual;
- As reasoning options do Configured Default dentro do preferred do Host são integralmente preservadas;
- Sem Configured Default, continua sendo usado o fallback de Registry do Host;
- A mudança da Account Selection em si não altera o fallback genérico do Renderer;
- Quando a revision da Selection View é atualizada, o Draft em branco sem intenção explícita é
  re-hidratado; Drafts com seleção explícita existente não são afetados.

### 4.2 E2E de Conversation

- Corrigir I27/MP-R03 e I28/MP-R04: depois que o modelo antigo da Account fica inválido, voltar ao
  Configured Default atualmente válido;
- Preservar o cenário de publicação atrasada do Account Registry, provando que depois da atualização de
  revision o Draft usa o preferred mais recente do Host;
- Asserir que Provider, Model e reasoning options são consistentes, sem checar apenas o texto da
  toolbar;
- Não restaurar a lógica de compatibilidade de selected-key/mode já removida.

### 4.3 Testes Unitários e de Integração de Provisioning

- Primeiro `applied` ou `already-applied` publica o Workspace ready;
- Primeiro `failed`, `rollback_failed` ou `unsupported` não publica o Workspace ready e retorna o erro pelo
  resultado formal de falha de conexão;
- Com a primeira sincronização pending, a conexão permanece pending, sem liberação por temporizador;
- Falha depois de conectado não cancela o registro do Environment nem fecha o Workspace;
- Falha depois de conectado escreve um warning estruturado de nível Environment, sem produzir UI nem
  estado persistente;
- O próximo disparo formal tenta de novo e, em caso de sucesso, registra pelo log de sucesso existente;
- Ao receber uma nova generation durante a sincronização, continua obedecendo single-flight + trailing
  refresh;
- Logs e payloads de erro não contêm API Key, OAuth Token nem o valor completo de Credential.

## 5. Documentação e Grafo

- Atualizar `docs/working-memory/provider-refactor/design/interaction/selection-state.md`, removendo a
  seleção padrão Account-first e alinhando com a semântica completa de Selection do Todo 58;
- Atualizar `docs/remote/provider-provisioning.md`, registrando a primeira barreira estrita e o estado
  degradado depois de conectado;
- Acrescentar nos registros de implementação do Todo 56/57 o ponteiro "substituído posteriormente pelo
  Todo 59", sem reescrever o fato histórico da execução;
- Atualizar as expectativas de I27/I28 na análise/matriz de cobertura de E2E do Provider Refactor;
- O Feature Graph já contém os nós de Provider Template e Remote Provisioning; como esta rodada não
  adiciona UI de estado de falha, nenhum novo surface ou owner de estado é criado.

## 6. Ordem de Implementação

1. Escrever primeiro os testes de falha de Model Selection e da semântica de falha de Provisioning;
2. Remover o fallback Account-first do Renderer e os resíduos relacionados;
3. Corrigir as fixtures/asserções de I27/I28 e executá-las de forma direcionada;
4. Ligar o resultado não-successo do primeiro Provisioning ao canal de falha de conexão do Remote
   Workspace;
5. Convergir o warning de falha do Environment já conectado e a semântica de retry no próximo trigger
   real;
6. Atualizar o Design, a relação de substituição entre Todos, o Feature Graph e a matriz de cobertura;
7. Rodar os testes unitários direcionados, os E2E de Desktop relacionados, `pnpm typecheck`,
   `pnpm lint` e `git diff --check`;
8. Revisar amplamente a propriedade de estado, o ciclo de vida dos erros, a deduplicação de Environment
   entre janelas e a fronteira de segredos;
9. Fazer o commit no formato Conventional Commit.

## 7. Portões de Conclusão

- Não existe mais especialização de seleção padrão de Account Provider no Renderer;
- O Configured Default volta a ser o único fato de produto padrão depois que Recent fica inválido;
- Uma atualização de revision do Registry não sobrescreve um Draft em que o usuário já escolheu
  explicitamente;
- O Remote Workspace não é publicado quando o primeiro Provisioning não tem sucesso;
- Uma falha de sincronização depois de conectado não desmonta o Workspace e deixa um warning estruturado
  sem Segredos;
- Nenhum novo estado de erro ou UI de nível Environment/Workspace, e o próximo trigger real tenta de
  novo;
- Não há segunda autoridade para modelo padrão, Registry Snapshot, Provider Config ou Credential;
- Os testes direcionados e os portões obrigatórios do repositório passam, e os E2E relevantes têm
  evidência real de execução.

## 8. Não Objetivos

- Reestruturação de produto do Provider Family;
- Edição bidirecional do Remote Provisioning v1 ou UI de gerenciamento remoto;
- Refatoração do Credential Store/Keychain;
- Adicionar modo de compatibilidade silenciosa para remotos antigos;
- Recuperação de lane vazia do Coordinator;
- Mascara falhas de sincronização por timeout, tempestade de retries ou desligamento do Workspace já
  conectado inteiro.

## 9. Registro de Implementação de 2026-09-01

Nesta rodada foi concluído:

- Remoção da seleção padrão Account-first do Renderer e da derivação de Family/Plan; um Recent inválido
  volta uniformemente ao `preferredSelection` do Host alvo;
- Preservação da re-hidratação do Draft em branco orientada pela revision da Selection View, sem
  sobrescrever a escolha explícita do usuário;
- `failed`, `rollback_failed` e `unsupported` no primeiro Remote Environment Provisioning agora recusam a
  conexão e não publicam a service port do Renderer;
- Falha de sincronização posterior em Environment já conectado mantém o Workspace online e registra
  apenas um warning estruturado com Environment, trigger, status e duração, aguardando o próximo trigger
  real para retry;
- Falhas posteriores não adicionam Banner, estado de protocolo nem objeto de erro persistente. O texto
  livre do Target não entra no log do Main, evitando que a cadeia de transição temporária introduza uma
  superfície de vazamento de credenciais.

Evidências de verificação:

- Os testes direcionados de Model Selection, Provisioning Coordinator e Remote Session passaram;
- A unit suite completa, o typecheck da raiz, o lint, o typecheck de E2E de Desktop e a verificação
  mecânica dos arquivos modificados passaram junto da verificação da mesma rodada do Todo 58;
- As evidências de execução já existentes dos E2E formais de Provider/Remote são preservadas; a
  execução real do novo caso de interação gráfica da página de configurações nesta rodada está bloqueada
  pelo ambiente de display Linux atual, e o que não foi executado não é escrito como aprovado.