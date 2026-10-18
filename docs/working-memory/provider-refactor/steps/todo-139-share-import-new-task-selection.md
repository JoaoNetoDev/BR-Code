# Todo139: reutilização da inicialização de modelo e modo de uma nova tarefa comum na importação de compartilhamento

Status: implementado, com testes unitários locais, interação no browser e review concluídos (2026-09-12); a aceitação conjunta completa do servidor de compartilhamento / primeira RPC nativa ainda não foi concluída.

## Objetivo e causa raiz

A nova tarefa criada pela importação de compartilhamento deve manter o mesmo comportamento de escolha de uma tarefa nova comum no lado do receptor, incluindo Provider, modelo, nível de raciocínio e modo/permissões; não deve herdar as configurações de execução de quem compartilhou.

Baseline da investigação: `9ea22ec1f0` local; `origin/staging` já buscado está em `eb71ba51c2`. O código relevante de inicialização de novas tarefas é idêntico e já contém a correção recente de herança de modo dos commits `baef1544c5` e `18a963c078`. Nenhum staging novo foi mergeado para esta investigação.

Lacuna atual: `ConversationShareService.importShare()` chama `createSession()` sem passar a escolha de modelo/modo; após a importação ele ativa diretamente a Session real. O Composer só lê as preferências de nova tarefa quando `sessionId === null`; quando já existe Session, lê a escolha da sessão e preserva o estado vazio explícito. A primeira importação de compartilhamento, por isso, salta a inicialização de nova tarefa e não recebe automaticamente a escolha de uma nova tarefa comum.

## Regras confirmadas

| Item                     | Ordem de prioridade                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Provider, modelo, nível de raciocínio | Rascunho de nova tarefa já inicializado no workspace de destino → ModelSelection completo da submissão aceita mais recente → escolha pública padrão |
| Modo/permissões               | Rascunho de nova tarefa já inicializado no workspace de destino → modo da submissão aceita mais recente → build padrão do produto |

- Extrair ou reutilizar o ponto de entrada de inicialização de uma nova tarefa comum, com as duas entradas compartilhando a regra, sem duplicar o algoritmo de modelo padrão dentro do serviço de compartilhamento.
- "Rascunho existente tem prioridade" inclui a escolha explicitamente vazia dele; não se pode tratar uma escolha que o usuário limpou ou que ficou inválida como inexistente e trocar automaticamente para o modelo padrão. Reutilizar a resolução e validação de effective selection pública atual, sem criar outro fallback.
- Copiar apenas a configuração de escolha, nunca o corpo, o conteúdo do editor, as menções ou os anexos; não apagar nem mover o rascunho de nova tarefa comum.
- Ler as preferências pelo `workspaceIdentity?.trim() || workspacePath` realmente usado na importação. Quando um workspace remoto recua para o local, usar o workspace local final e não as preferências da origem remota.
- Inicializar apenas a tarefa importada na primeira criação. Importações repetidas reutilizam a Session, e reabrir ou restaurar o histórico não sobrescreve as escolhas e o rascunho já salvos daquela sessão.
- A inicialização prepara apenas o rascunho do Composer desta sessão; a Submission completa posterior continua sendo a fronteira de confirmação da configuração de execução. Importar com sucesso não significa que a mensagem foi submetida, e isso não pode atualizar Recent.
- Quando não há modelo, o Registry ainda não está pronto ou a escolha não é executável, o conteúdo compartilhado ainda pode ser importado e aberto; a inicialização necessária é concluída assim que a leitura pública estiver pronta, e um modelo válido é exigido pelas travas existentes antes do envio. A requisição de modelo não pode se tornar pré-requisito da importação.

## Propriedade e ordem temporal

```text
普通新建 ───────────────────┐
                           ├→ 共用新任务选择初始化
首次分享导入 → 实际工作区 ──┘    → 独立 Session Composer 草稿
                                → 用户发送完整 Submission
                                → 原接纳、执行及持久化链路

重复导入／恢复已有会话 → 保留已有 Session 选择和草稿
```

- O Renderer detém o rascunho e o Recent; o Host fornece os valores padrão públicos e a View de escolha válida; o serviço de importação continua responsável pela importação atômica de conteúdo/produtos/Session e não acessa diretamente o armazenamento do Renderer.
- A inicialização acontece apenas uma vez; respostas do Registry, retries de importação e resultados atrasados não podem sobrescrever um rascunho já editado pelo usuário nem vazar para um workspace/Session trocado depois. Reutilizar os mecanismos atuais de scope e inicialização, sem patches de timeout nem um segundo estado de sincronização.
- Importação e inicialização podem ser separadas; o adiamento da inicialização não pode ficar permanentemente bloqueado pela chegada antecipada de um snapshot de Session vazia. O接线 específico deve ser escrito antes da implementação, e não se pode decidir "é a primeira importação" apenas com base em "a Session não tem modelo".
- Não alterar shared-host, desktop continuous/mobile replayable, CommandInbox, sincronização de conta nem vínculo de modelo em execução; não fazer migração de dados históricos nem preencher em massa sessões importadas antigas.

## Principais pontos de localização

- `packages/services/src/conversation-share/conversationShareService.ts`: importação e criação de Session.
- `packages/ui/src/root/useRootPlatformEffects.ts`: ativação de workspace/Session após a conclusão da importação.
- `packages/ui/src/v4/composer/useDraftConfigControl.ts`: branches de inicialização para nova tarefa comum e Session existente.
- `packages/ui/src/lib/composerRecent.ts`, `packages/ui/src/v4/composer/composerDraftStore.ts`: preferências da submissão aceita mais recente, armazenamento de rascunho e isolamento.
- [Especificação da functionality de compartilhamento](../../../conversation-share-v1.md), [Todo71](todo-71-persistent-composer-draft-and-submission-state.md): sincronizar antes da implementação a fronteira da primeira importação de compartilhamento, sem derrubar a proteção existente contra o estado vazio do histórico.

## Execução e aceitação

- [x] Atualizar as specs relevantes, definindo o ponto de entrada comum de inicialização, a identificação de primeira importação e a ordem de ativação; testar antes de implementar.
- [x] No mesmo workspace, comparar tarefa nova comum / importação de compartilhamento: nos três casos de rascunho existente, apenas Recent e apenas padrão público, a identidade do modelo, o nível de raciocínio e o modo são iguais; a intenção de rascunho vazio não é preenchida pelo padrão.
- [x] Cobrir ausência de modelo disponível, Registry com prontidão atrasada, escolha inválida e usuário que edita antes da resposta; o conteúdo abre e a inicialização não sobrescreve a intenção do usuário.
- [x] Cobrir o workspace de destino real, o recuo de remoto para local e o mesmo caminho com identity diferente; o corpo e a configuração do rascunho comum original são preservados.
- [x] Cobrir importação repetida e reabertura: preservar o rascunho da Session e as escolhas salvas, não resetar tarefas já continuadas e não atualizar Recent na importação.
- [ ] Casos de interação verificam na barra de ferramentas, após abrir a importação, o modelo/nível/modo, além do modelSelection/mode completos da primeira submissão e dos context_refs do compartilhamento, e não apenas o texto dos menus; manter as regras existentes de E2E pending/promoção.
- [x] Executar em lote os testes unitários relevantes, browser ou E2E executável, tipos, lint e verificação de arquitetura; revisar todos os requisitos e as regressões de nova tarefa comum/restauração de histórico, registrar as limitações de validação multi-cliente e então fazer commit.

Na investigação, 27 dos testes existentes do serviço de importação e da inicialização do Composer passaram; eles comprovam as fronteiras relevantes do estado atual e não significam que este Todo está implementado nem que o novo comportamento foi aceito.

## Implementação e review de 2026-09-12

10 grupos com hooks reais e browser passaram, validando Root/Recent/padrão, escolha explicitamente vazia, atraso e usuário que muda a escolha antes, identity real e o fato de a importação repetida não sobrescrever. O modelSelection/mode da primeira mensagem foi validado com a função real congelada; a preservação de context_refs foi conferida por revisão de código e pelos testes unitários existentes; o caminho completo servidor de compartilhamento → RPC nativa não foi executado de fato, então esse item de aceitação continua em aberto.

As evidências do lote, a classificação das falhas existentes e as limitações multi-cliente estão no [registro de review desta rodada](../research/todos-136-139-140-review-20260912.md). Não se descreve como aprovado o que não foi testado; não houve push automático.