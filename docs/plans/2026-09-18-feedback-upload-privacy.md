# Plano de implementação da otimização de privacidade no upload de feedback do usuário e de tickets

> Atualização de valores padrão em 2026-09-29: por pedido do usuário, o log de novo feedback vem marcado por padrão e pode ser desmarcado manualmente; FB-PRIV-01/08 passa a validar o padrão ligado e a possibilidade de desmarcar, enquanto FB-PRIV-02 mantém a escolha no momento do envio e as asserções de restauração em background. Os valores padrão e a matriz de aceitação deste documento foram sincronizados; o comportamento padrão atual segue `docs/feedback-simplified-flow.md`, e as fronteiras de coleta e anonimização de logs não mudam.

> Status: implementação e verificação no cliente concluídas, ainda não publicada. Branch `codex/sensitive-upload-privacy`, baseline `efcec33905`.

**Objetivo:** o ticket carrega apenas a descrição/contato/imagens confirmados pelo usuário e as informações de dispositivo necessárias; o log opcional vem ligado por padrão e pode ser desmarcado, com o escopo de coleta explicitamente limitado, e todas as rotas de arquivamento de feedback passam por uma anonimização unificada.
**Arquitetura:** shared fornece a política de anonimização de texto de feedback sem I/O; o domínio de feedback em services é o único responsável por coleta de arquivamento diagnóstico, filtragem, anonimização, ZIP e limpeza; desktop injeta fontes adicionais de log diagnóstico; a UI apenas exibe o rascunho e as escolhas de envio. Mantêm-se o protocolo atual de ticket/anexo e o owner das tarefas em background.
**Tecnologia:** TypeScript, Node fs/promises, yazl, React, Vitest, Electron E2E.

## Escopo e decisões

O usuário já deixou claro "não mexer aqui, olhar apenas o envio de feedback do usuário/ticket": snapshots de repositório, telemetria automática, requisições a modelos e protocolo de controle remoto não são modificados. As camadas de mudança de código incluem draft-default, validation, commit-effect e presentation. Otimização de engenharia de privacidade não substitui prazo de retenção no servidor, autorização de acesso, mecanismo de exclusão nem confirmação jurídica.

- O log de novo feedback vem ligado por padrão e pode ser desmarcado; todos os pontos de entrada (ajuda, tarefas, erros, conexão remota) são consistentes, e o cancelamento explícito e o `false` restaurado de um rascunho não podem ser sobrescritos. Restaurar o mesmo job em background preserva a escolha do usuário no momento do envio.
- Nenhum screenshot automático ao abrir o feedback. Mantêm-se seleção de arquivo, colar, arrastar, pré-visualizar e excluir; o conteúdo das imagens é conferido pelo usuário e o texto deixa isso explícito.
- O arquivamento de upload aceita apenas logs de texto de hoje em `logs/` do app, `log/` da CLI desktop e CUA `*.exit.log`; exclui banco de dados, configuração, rollout, corpo de sessão, binários e links simbólicos. A implementação alternativa segue a mesma estratégia e omite quando falta a fonte.
- Máximo de 8 MiB por arquivo, máximo de 32 MiB na entrada do pacote completo, máximo de 2 MiB no compact; acima dos limites o item é pulado, sem truncar e vazar meia estrutura. Profundidade/quantidade de travessia são limitadas.
- Logs estruturados removem recursivamente chaves e campos de corpo/mensagem/entrada-saída de ferramentas; o texto reconhece credenciais comuns, chaves privadas, credenciais em URL e diretórios do usuário; codificações não suportadas, binários e ilegíveis são pulados, nunca com cópia do arquivo original como fallback.
- O template automático de troubleshooting é anonimizado primeiro; a lista oculta de configurações de modelo é removida. O corpo do usuário e os campos de contato preservam a intenção do usuário, e o servidor aplica uma proteção extra para credenciais comuns em título/descrição antes do envio, sem alterar contatos fornecidos ativamente pelo usuário.
- A exportação manual local de logs mantém o contrato original; ela deixa de ser a fonte completa para o upload de feedback.

## Briefing de impacto

| Entrada da UI                                         | Owner do rascunho / padrão                                      | Owner do envio / autoridade                                          | Modos e invariantes                                            |
| ---------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| Menu de ajuda, menu de tarefas, erros de chat/assinatura, falha de conexão remota | feedbackStore → FeedbackSubmitForm; log true (desmarcável), imagens vazias | feedbackSubmissionJob → feedbackService → FeedbackHttpClient | desktop usa serviço local; mobile unsupported mantém os limites atuais |
| Novo feedback / sugestão de funcionalidade              | Rascunhos próprios: novo feedback com log ligado por padrão, sugestão de funcionalidade independente sem log | Idem                                                                | O usuário pode editar a descrição e conferir os anexos         |
| Restauração de job em background                        | job.formDraft, snapshot no momento do envio                      | registro de jobs, localizado por jobId                              | Não afeta outros jobs, não recoleta screenshots                |
| Complemento de ticket                                   | Anexos e texto escolhidos manualmente pelo usuário              | feedbackService                                                     | Nenhuma coleta automática nova                                  |
| Exportação local de logs                               | Exportação explícita pelo usuário                              | desktop exportLogs                                                  | Não é afetada pela whitelist de fontes de feedback             |

Relações obrigatórias: UI default/screenshot automático → job.includeLogs → prepareCompactLogArchive → injeção do desktop / fallback de services → ZIP → uploadFile; contexto automático → create/comment HTTP. Os owners de estado mantêm a separação em camadas existente, sem nova fila. O token de login/deviceMid são usados para autenticação de identidade existente e não são escritos no arquivo de logs.

A ferramenta Codegraph está atualmente indisponível; as duas camadas de chamada acima foram verificadas cruzadamente com pontos de chamada de código precisos e rg (profundidade 2), sem tratar todos os itens estaticamente alcançáveis como impacto de negócio. O grafo funcional não tem um nó dedicado para o upload de feedback, registrado como graph-drift-candidate; `.agents` está somente leitura, recomenda-se registrar essa fronteira de upload depois, sem bloquear o conserto por causa da manutenção do grafo.

## Passos de implementação

1. **Especificação e casos (este arquivo e a spec de feedback já existente)**: atualizar valores padrão/escopo de arquivamento/screenshot/contexto automático; listar dados permitidos e proibidos, fronteiras de compatibilidade e casos. Só depois mudar o código.
2. **Regressão primeiro**: adicionar casos de anonimização de texto de feedback em shared; em services `compactLogArchive.test.ts` adicionar JSON aninhado, banco de dados/rollout, binário/link, arquivos expirados/grandes demais e verificação do conteúdo de bytes do ZIP; em desktop `exportLogs.test.ts` atualizar as asserções de feedback e preservar as de exportação manual; na UI cobrir padrão ligado, envio após desmarcar e cada entrada, além da restauração em background. Executar primeiro e registrar as falhas esperadas.
3. **Unificar o arquivamento de feedback**: adicionar services `feedbackLogArchive.ts` e shared `feedbackPrivacy.ts`; o fallback compact/full e a injeção de feedback do desktop chamam o mesmo builder; leitura assíncrona limitada, anonimização e escrita do ZIP, limpeza em caso de exceção. O export manual original permanece independente.
4. **Formulário e ticket**: unificar a entrada de feedback de problema com padrão ligado, desmarcável e sem screenshot automático; atualizar os avisos de privacidade em chinês e inglês; remover a lista oculta de modelos, higienizar o template automático e a saída de texto do servidor, e limpar a parte de caminho dos nomes de arquivo de anexos.
5. **Verificação de integração e revisão**: marcadores sensíveis sintéticos para checar todo o conteúdo após extração; requisições de ticket com mock, sem enviar feedback real. Executar os Vitest afetados, typecheck, lint, architecture:check --changed; a interação de formulário compartilhado desktop/mobile é verificada conforme a capacidade de E2E. Bloqueios de ambiente devem ser registrados claramente, sem alegar cobertura.
6. **Entrega**: revisar diff e referências, confirmar que não houve mudança de snapshot/telemetria; só fazer Conventional Commit local se todas as verificações necessárias passarem; sem push, sem criação de MR.

## Matriz de aceitação e handoff de E2E

| Case ID    | Estado/ação                                       | Asserções                                                                        | Evidência                      |
| ---------- | ------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------ |
| FB-PRIV-01 | Novo feedback, cada entrada                       | Log ligado por padrão e desmarcável, sem chamada automática de capture              | Teste de UI + E2E              |
| FB-PRIV-02 | Envio padrão / envio após desmarcar / restauração de job em background | Só envia os anexos selecionados nesta vez; restauração mantém a escolha original | Testes de job/UI + E2E com serviço mock |
| FB-PRIV-03 | Arquivo full/compact/desktop                     | SQLite, configuração, rollout, symlink, binário e arquivos expirados/grandes demais não aparecem | Diretório temporário + extração do ZIP |
| FB-PRIV-04 | JSON aninhado/string escapada/chave privada multilinha/Authorization/URL | Segredo sintético não aparece em nenhuma entrada do ZIP | shared + regressão de ZIP       |
| FB-PRIV-05 | Diagnóstico com prompt/messages/dados de ferramenta | O corpo é removido; tipo de evento/código de erro/contagens continuam utilizáveis | Teste de anonimização de texto  |
| FB-PRIV-06 | Criação e complemento de ticket                  | Credenciais comuns em title/description higienizadas; contact do usuário e intenção explícita do corpo preservados; sem lista de modelos | HTTP mock de service/UI         |
| FB-PRIV-07 | Exportação local/cancelamento/falha               | Exportação manual compatível; limpeza em falha de arquivamento; cancelamento na criação não dispara anexos | Regressão existente             |
| FB-PRIV-08 | Desktop/mobile, chinês/inglês                    | O significado do switch e os avisos são consistentes e acessíveis em tela estreita; mobile unsupported inalterado | UI compartilhada + E2E         |

Dimensões principais: origem desktop/fallback, log default-on/off/restored, arquivo texto/binário/link/expirado/acima do limite, criação autorizada/restauração em background, idioma/viewport. Podas: snapshot de repositório e telemetria excluídos por指示 do usuário; não se faz o produto cartesiano completo de providers de modelo, porque a política de privacidade de upload é independente do provider; reconhecimento automático de pixels de screenshot está fora do escopo, sendo restringido por seleção ativa e aviso de pré-visualização. O E2E usa serviço mock local e diretório temporário de logs, sem tocar em contas/tickets reais; os casos novos ficam como manual-review/pending e não são promovidos automaticamente.

Complemento de FB-PRIV-02: em uma janela Chromium isolada, montar o `FeedbackSubmitForm` real, o helper de envio e o job de background, substituindo apenas o `IFeedbackService` por um mock em memória. O envio padrão precisa chamar o arquivamento e o upload de log; o envio após desmarcar precisa ter zero arquivamento/upload; após falha real na criação do job, desmontar e restaurar pelo jobId, mantendo o true/false original no novo envio. Confirmar as zero chamadas pelo estado terminal do job, não apenas esperando um timeout curto. Esse caso valida a fronteira Renderer→serviço, sem alegar cobertura de HTTP/OSS reais nem de controle remoto mobile.

## Aguardando confirmação externa

Retenção, exclusão, auditoria de acesso e armazenamento em múltiplas regiões de tickets/OSS no servidor estão fora do escopo verificável deste repositório de cliente. O cliente é implementado conforme o comportamento confirmado de padrão ligado e desmarcável; isso não substitui a conclusão do servidor nem da aprovação de privacidade.

### Pontos de queda dos casos E2E

`packages/desktop/test/e2e/feedback/manual-review/pending/feedback-upload-privacy.test.ts` valida FB-PRIV-01/02/08: FB-PRIV-01/08 abrem o formulário pelo menu de ajuda real, checam o log ligado por padrão, que o usuário pode desmarcar, que não há imagem automática, e repetem em janelas largas e estreitas em chinês e inglês; FB-PRIV-02 usa formulário/helper/job reais em Chromium isolado e mock em memória de `IFeedbackService`, validando envio padrão, envio desmarcado e a escolha de log e as chamadas de serviço ao retomar por jobId, sem cobrir HTTP/OSS reais. Reutiliza o fixture local de help client/config; não cria tickets reais nem requisições a modelos. O serviço de controle remoto mobile continua unsupported, e o viewport estreito conta apenas como evidência de responsividade da UI compartilhada, sem alegar cobertura de upload ponta a ponta no remoto.

## Registro de verificação da primeira implementação (2026-09-18)

- Concluídos o arquivamento unificado, a anonimização de texto de feedback, os valores padrão autorizados por entrada, o comportamento de screenshot, a minimização da lista de modelos e o isolamento do caminho temporário de anexos; sem mudanças em snapshot de repositório e telemetria automática.
- A regressão registrou primeiro as falhas esperadas e só então a implementação foi completada. Dados sintéticos cobrem JSON/JSONL, UTF-16, chaves aninhadas, corpo, whitelist de arquivos, capacidade e fronteira de links; requisições verificadas com mock, sem enviar dados reais de usuário.
- `pnpm typecheck`, `pnpm lint` e `pnpm architecture:check --changed` passaram; o lint tem 55 avisos preexistentes, sem erros. `git diff --check` passou.
- 25 arquivos de teste unitário afetados, 140 casos, todos passaram; os 2 casos do E2E de feedback do desktop passaram, cobrindo 1280px em inglês, 430px em chinês e os respectivos temas claro e escuro, com screenshots conferidos. O novo E2E permanece manual-review/pending, não promovido.
- As dependências locais e o lock file ficaram inconsistentes em certo momento; após reinstalar conforme o lock file congelado a build passou; nem as declarações de dependência nem o lock file foram modificados. O upload de ticket do controle remoto mobile continua unsupported, sem alegar verificação de upload real em mobile.
- Permissões, retenção e exclusão no servidor ainda não foram verificadas; a anonimização automática ainda não identifica qualquer segredo de negócio, e quando o usuário escolhe ativamente uma imagem ele deve conferi-la por conta própria.