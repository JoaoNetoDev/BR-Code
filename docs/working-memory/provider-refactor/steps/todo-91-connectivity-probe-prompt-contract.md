# Todo 91: contrato de Prompt fixo do teste de conectividade

> 2026-09-12: o orçamento de saída foi reajustado pelo Todo144 para 1 Token independente; o registro histórico de orçamento de 5.000 deste documento deixa de valer como requisito atual, e o contrato preciso de Prompt permanece inalterado.

> Atualização de atribuição de verificação (2026-09-09): toda a dívida de teste restante, falha e promoção manual deste documento é transferida para [Todo102](todo-102-verification-debt-closeout.md), encerrando o cronograma de verificação independente aqui; as evidências históricas são preservadas e a transferência não significa que os testes passaram.

> Status: implementado, com revisão direcionada concluída, verificação de requisição offline e verificação em Electron isolado Pro (2026-09-08). A whitelist do servidor não foi modificada e nenhuma conta real foi usada para experimentally.

> Baseline de conferência: `c017752329`, `provider-refactor-e2e-recovery`.

## 1. Decisão confirmada

O teste de conectividade usa uniformemente a seguinte mensagem fixa, preservando o texto exato, o casing, a pontuação, os papéis e a ordem:

```yaml
system: You are ZCode connectivity probe.
user: hi
```

- Mantém a cadeia de execução em streaming do Model oficial atual, consumindo o stream completo e usando o tratamento de erros já existente.
- Não restaura a separação de sondagem de benefícios do Start Plan do staging nem trata "consulta de benefícios bem-sucedida" como conectividade de modelo bem-sucedida.
- Não acrescenta a esse conjunto de mensagens explicações, textos de internacionalização, histórico de conversa, ferramentas ou outro system; nem deixa outros pedidos, como conversa comum, título, Wiki e Subagent, reutilizarem este Prompt.
- O teste de conectividade de API Provider comum e de Account Provider usa o mesmo template. Off-Peak continua oculto, não se cria nova entrada de teste na página de configurações e nenhum Ticket é obtido ou consumido.
- Este item não restaura a antiga HTTP Probe do Host, nem modifica seleção de modelo, conexão de conta, Personal Config, formato de persistência ou migração.

## 2. Contexto e registro de correções

O `testModelConnectivity()` em `core/src/runtime/methods/workspace-generate-text.ts` hoje envia apenas a mensagem de user `Reply briefly to confirm connectivity.`; introduzido em `8ea78019f7`, e o texto foi cristalizado em testes posteriores em `49e1f83710d`.

O helper antigo do Start Plan adicionou o system + hi acima em `2ae01c7584`; mas `3162baa586` em seguida mudou a entrada normal do nível de cima para consultar apenas billing/balance. Tanto o staging fixado `16d999f6a48b` quanto o `origin/staging` local `a311537aa6` mantêm o retorno antecipado. Portanto, "o helper antigo ainda existe" não equivale a "o staging atual envia este Prompt", e muito menos prova que a whitelist do servidor já foi descontinuada.

O usuário explicou que o servidor pode restringir pedidos da conta por whitelist de Prompt. O repositório do cliente não consegue provar o conteúdo ou as regras atuais da whitelist; a decisão desta rodada é adotar um template fixo e explícito, sem alegar que o servidor já foi configurado nem que uma conta real passou na verificação. Antes da confirmação, não se pode usar contas reais para experimentar repetidamente.

## 3. Impacto e atribuição de estado (Impact Brief)

Modo: planning; camada: commit-effect / contrato de conteúdo de requisição. O escopo é apenas o teste de conectividade; a semântica de sessão ou de recuperação não mudou.

| Cenário de UI | Implementação compartilhada e estado de exibição | Origem e validação | Submissão/execução autoritativa | Modo e isolamento |
| --- | --- | --- | --- | --- |
| Teste na linha de modelo do detalhe da Account | Detail → ModelRowInput / useModelProviders; pending na linha e feedback de resultado | Provider/Model já salvos; Registry oficial e validação de Request Auth | Settings Service → protocolo Agent → testModelConnectivity → Model.streamText | Compartilhado por Desktop/Web; preserva o roteamento de Environment alvo existente e não muda a conexão atual |
| Teste na linha de modelo de instância comum/de template | InlineEditableProviderCard → o mesmo controle de linha e o mesmo hook | Faz flush antes do rascunho de Provider; o serviço aguarda as escritas relacionadas e o Worker atualiza o Registry | O mesmo; o formato de API e o mapeamento de opções ficam por conta do Adapter oficial | Não cria Registry temporário nem altera outros modelos ou requisições em andamento |

```text
点击测试 -> 等待现有保存边界 -> 正式 Registry 创建 Model
                                      |
                               固定 system + hi
                                      |
                        正式 Adapter / Request Auth
                                      |
                            当前 API 格式的流式请求
```

| Nível | Relação e pontos de conferência |
| --- | --- |
| must-inspect | `testModelConnectivity` constrói as mensagens; o Adapter converte para o corpo final de requisição em Anthropic system/messages, Chat messages, Responses instructions/input |
| should-inspect | O teste atual `workspace-generate-text-streaming.test.ts` cristaliza o texto de user antigo; substituir pelo novo contrato e acrescentar asserções de ausência de histórico e de ausência de ferramentas |
| conditional | O pedido de Account continua depending das credenciais atuais e da cadeia normal de validação de segurança da requisição; não se pode contornar a autenticação em nome de restaurar o Prompt |
| invariant-only | Salvamento/refresh, o nível público mínimo de reasoning, o orçamento de saída, timeout/retry, o feedback de erro e o isolamento de workspace permanecem; não se altera Session/Active Model |
| evidence-only | O helper antigo do staging e o Service de nível superior, assim como o teste antigo de benefícios, servem para explicar a história e não para restaurar o arquivo inteiro |

A ferramenta de grafo de código não estava disponível, e a conferência foi feita rastreando a partir das sementes de `surface.provider-settings` / `service.provider-settings` por chamadas diretas; duas camadas por padrão, e o ponto de execução entre App e Agent foi rastreado até Core/Adapter. Os caminhos relacionados são ModelProviderSection → useModelProviders → Provider Settings Service → zcodeAgentService → workspace-model-runtime → Core testModelConnectivity. O grafo ganha um link de origem deste Todo; por enquanto não se reescreve a semântica de outros grafos históricos.

## 4. Limites de implementação e limpeza

1. Antes de implementar, atualizar no `design/registry/settings.md` vigente a descrição do teste de conectividade, esclarecendo o template fixo e o escopo, e só então escrever o teste que falha.
2. Manter um único template fixo/constante de nome no ponto de construção da mensagem de teste de conectividade, sem espalhar várias cópias de Prompts equivalentes; não é preciso adicionar configuração, entrada de UI ou parâmetro de protocolo.
3. Remover as strings antigas substituídas e as respectivas asserções antigas; não copiar o helper de Start Plan já inalcançável no staging nem introduzir tratamento especial por ID de Provider.
4. O texto preciso é um contrato rígido; a serialização do protocolo reutiliza o Adapter existente. O body final precisa preservar o papel de system e o papel de user, sem colar o system dentro do user. Se o servidor exigir uma estrutura de serialização específica e o Adapter atual não atender, primeiro esclareça a exigência do servidor e só então discuta a adaptação mínima, sem adivinhar e mexer no pedido.
5. O orçamento de saída (atualmente até 5.000 na chamada auxiliar), o streaming, o mínimo de reasoning, o header de origem, a validação de segurança da requisição, o timeout e o retry não mudam com este item. As outras diferenças citadas na auditoria anterior não foram autorizadas a voltar nesta rodada; o risco do header de origem ainda precisa ser discutido à parte, e não se pode alegar que a conclusão deste Todo eliminou todo o risco de rejeição pelo gateway.

## 5. Aceitação e podagem

| Case | Cenário e operação | Asserção/evidência | Estado |
| --- | --- | --- | --- |
| C91-01 | Testar conexão no Core, com Model mock coletando o pedido | Exatamente duas mensagens system + user, com texto e ordem fixos, sem tools/histórico; erro no stream ainda falha | accepted; teste unitário a implementar |
| C91-02 | Os três Adapter oficiais Anthropic / Chat / Responses, com transport offline injetado | Interceptar o body final da requisição e confirmar texto e papéis system/user, stream=true; o model ID da requisição não muda e a liberação não depende de prompt contains | accepted; teste de requisição de protocolo a implementar |
| C91-03 | Account (Start/pessoal/Team) e Provider comum usando fixture de credenciais falsas | O mesmo template; identidade e credenciais não se misturam; Start continua fazendo pedido de modelo e não volta à sondagem de benefícios | accepted; teste de serviço/caminho de execução a implementar |
| C91-04 | Ambiente Electron isolado clicando em testar na linha do modelo | A requisição final cumpre o contrato e o feedback de sucesso/falha funciona; a seleção e a configuração da conversa normal não mudam | accepted; E2E a escrever/revisar/executar |
| Consumidores que não são teste de conectividade | Título, Wiki, conversa comum, Subagent | invariant-only; não alterar o generateWorkspaceText comum nem as opções auxiliares compartilhadas para passar este Prompt | Não expandir para uma mudança global |
| Experimentação de whitelist com conta real | Enviar Prompts diferentes repetidamente | pruned; risco de banimento da conta, não serve como método de verificação automática | Proibido para a verificação desta rodada |
| Todas as marcas × todos os protocolos × todos os temas | Arranjo completo | pruned; o texto fixo não tem ramo por locale/tema, e os três protocolos mais um representante de Account/comum bastam | Cobertura representativa |

Na fase de implementação, acrescentar o caso de teste de conectividade de modelo e o registro de cobertura seguindo o ciclo de vida de E2E existente; os casos novos começam como pending para revisão manual; o transport de teste não pode cair para a rede real. A verificação em Electron isolado roda no MacBook Pro; se celular/remoto não tiverem verificação real, isso é listado explicitamente e não é substituído pela aprovação no desktop. Após rodar os testes unitários relacionados, `pnpm typecheck` e `pnpm lint`, faça o commit.

## 6. Passagem de bastão e itens não confirmados

- O Todo 90 continua responsável pelo rascunho compartilhado de adicionar/editar modelo, independente deste item; o estilo MFJS e o realce de cobertura estão em discussão e não entram neste Todo de Prompt.
- Único item externo não confirmado: com quais campos, papéis e forma de serialização a whitelist atual do servidor faz o casamento. Aqui fica registrado o alvo do cliente, sem alegar que o servidor já liberou.
- O registro de implementação está na seção seguinte; a verificação offline não equivale a a whitelist de conta real já ter sido liberada.

## 7. Registro de implementação e revisão (2026-09-08)

| Item | Resultado |
| --- | --- |
| C91-01 | Asserções de mensagens exatas para as quatro identidades no Core ficaram vermelhas primeiro (4 casos) e passaram depois de modificar o único ponto de construção; foram acrescentadas asserções de erro lançado, error event e falha sem finish, preservando os comportamentos existentes de reasoning baixo, orçamento, stream completo e Wiki |
| C91-02/03 | `connectivity-probe-wire.test.ts` usa a resolução de configuração oficial, as runner options e os três Adapter de SDK; o transport offline intercepta o JSON final; seis grupos de identidades comuns/de Account verificam texto e papéis exatos, stream/model, isolamento de credenciais falsas e ausência de tools; todos os pedidos são interceptados e não caem na rede |
| C91-04 | O E2E pending parte da linha de modelo real das configurações, e o servidor loopback local do case devolve SSE de sucesso/falha 400; as duas requisições finais foram o template fixo, e o arquivo Personal, a seleção de conexão e o rascunho do Composer permaneceram iguais |
| Revisão de código | Em produção só mudaram a mensagem de teste de conectividade e a constante de nome; generateWorkspaceText comum, Adapter, Request Auth, protocolo, orçamento, retry e estado de conexão não foram modificados. Asserções do Prompt antigo foram removidas e a separação antiga do staging não foi restaurada |
| Verificação local | 3 arquivos direcionados do CLI com 32 testes passando; typecheck do Core e `pnpm typecheck` da raiz passando; lint da raiz com 0 errors e 40 warnings já existentes |
| Pro | `desktop-e2e-20260908-102455-529`, 1/1 passando, diretório isolado `/Users/dev/zcode-todo93-e2e.88xgST`; o Agent foi reconstruído e a reexecução reutilizou apenas essa nova build |

O E2E da primeira rodada `desktop-e2e-20260908-102321-138` já mostrou a UI de sucesso/falha, mas a asserção de falha esperava erroneamente o texto bruto do gateway; o caminho oficial foi normalizado para `Provider rejected the model request.`. Depois de corrigir a asserção conforme o contrato existente, passou, e o tratamento de erros do produto não foi alterado para agradar o teste.

Arquivo E2E: `packages/desktop/test/e2e/settings/manual-review/pending/provider-connectivity-prompt.test.ts`. A whitelist fixa proíbe acrescentar marcadores de Prompt, e a identificação usa `E2E_C91_MODEL` independente, o array de mensagens completo e o endpoint localhost; respostas synthetic / fast-text são usadas apenas para a sondagem de conectividade. Permanece pending, sem substitutuir a revisão manual do usuário. Celular/remoto e a rede real de Account não foram testados.

Também foi executado o lint de nível de pacote dos pacotes Core do CLI: a execução falhou por vários arquivos sem relação que já ultrapassam 400 linhas; o oxlint direcionado do único arquivo de produção desta rodada passou. Esses arquivos sem relação não foram refatorados às cegas na correção do Prompt, o lint da raiz continua passando e o lint de nível de pacote não é registrado como verde.