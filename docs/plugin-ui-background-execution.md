# Retenção de páginas MCP e execução em segundo plano

## Problema e limites

O handshake do protocolo ocorre antes da conclusão da inicialização do editor; a interrupção da sessão também não significa que o plugin não tenha trabalho interno.
O host não pode, a partir desses dois estados, inferir quando um plugin arbitrário pode parar de renderizar, e ainda menos exigir que o plugin acrescente relatórios privados de execução.
Sem âncora, esperar o React montar, colocar o guest em `display:none` ou destruir o guest por prazo de ociosidade
fazem falhar a inicialização em segundo plano ou operações que dependem de `requestAnimationFrame`.

## Ciclo de vida

### Barreira de conexão na primeira abertura e na recuperação de sessão

A recuperação da sessão concluída não significa que o MCP de destino já esteja conectado. `mcp/uiOpenInstance` deve aguardar a conclusão da tarefa de conexão já existente desse server,
para então ler a identidade de conexão e emitir as credenciais da página. A espera é mantida pelo MCP adapter / pool, não espera
outros servers, não reconecta, não acrescenta polling, atraso ou contagem de retentativas automáticas na UI.

```text
recuperação da sessão → abrir App → aguardar o connecting existente do MCP alvo
                            ├─ connected → validar session / lease / identidade de conexão → criar página
                            └─ failed / owner já liberado ou substituído → recusar criação
```

A validação de identidade de sincronização de páginas já existentes não espera nem reconecta. Uma falha de conexão ainda exibe o erro e mantém a entrada de recarregar.
Ao fechar ou substituir a sessão, liberar o lease ou trocar a conexão durante a espera, a requisição antiga não pode emitir credenciais para o novo owner.
Os fallbacks de não suporte de Web / celular / remote e as fronteiras continuous / replayable permanecem inalterados.

Regressão `PLM-UI-CONNECTION-READY`: a página Electron real permanece em preparação enquanto o initialize do MCP é bloqueado por um portão de controle;
após a liberação ela roda sem precisar clicar em recarregar, e apenas uma instância é criada. Testes unitários de adapter / pool / protocolo
cobrem falha, espera concorrente e invalidação do owner. A entrada continua sendo `--managed-only`.

```text
resultado de ferramenta bem-sucedido da execução atual → receptor de nível de janela → admissão do page owner → criar o guest imediatamente
abertura por cartão histórico / painel manual ────────────────────┘       (não espera âncora de exibição)
                           ├─ visível: exibição normal
                           └─ invisível: superfície de fundo com dimensões, não interativa + atividade do guest alvo
exclusão de tarefa / recarregamento explícito / invalidação da origem ou do runtime / fechamento da janela → revogar credenciais e atividade → liberar guest e lease
```

- Todas as páginas MCP seguem as mesmas regras do host, sem alterar o código do plugin, sem adicionar protocolo de plugin e sem distinguir nomes de plugin.
  O page owner inicia imediatamente após a admissão, mesmo que o solicitante já tenha trocado de aba e não tenha âncora vinculada.
- A primeira criação não pode depender da montagem do cartão de ferramenta ou do SessionPane. Após a projeção do resultado de ferramenta bem-sucedido da execução atual,
  o Agent envia a descrição de UI e a entrada original ao host local de origem via `v4/plugin-ui/tool-result`; não é exigida assinatura de conversation.
  O Host valida o schema, a origem do runtime atual e o escopo local; apenas attachments de desktop confiáveis podem assinar; o receptor de janela
  reutiliza a mesma chave lógica e a mesma Promise de admissão. Cartões e receptor concorrentes podem criar apenas uma página.
  Hidratação de histórico, falhas, cancelamentos e MCP isError não geram esta notificação; não se varre o histórico nem se mantém vivo a projeção de todas as sessões.
  Resultados em segundo plano atualizam apenas os dados de ferramenta da página, sem vincular âncora, sem roubar foco e sem alterar o painel lateral atual; ao retornar à sessão o mesmo guest é reutilizado.
  Web/celular/remoto não recebem o efeito colateral de criação e continuam usando o registro comum de ferramenta. A assinatura da página e a limpeza na exclusão continuam sob o owner existente.
- O MCP guest já criado permanece executável durante todo o ciclo de vida válido; handshake concluído, sessão ociosa
  e parada de turno não alteram essa regra. Os leases de workspace/session e o feed de recursos acompanham a retenção da página;
  a projeção de execução da sessão deixa de ser um interruptor para o funcionamento da página.
- Âncoras inline com dimensões de exibição permanecem na árvore de rolagem original. Sem âncora exibível (incluindo tab oculta com forceMount),
  a página migra para uma superfície de fundo de dimensões não nulas e não interativa; restaurar a exibição continua sendo o mesmo guest, sem reconstruir o editor.
- Quando a página está invisível ou o document do owner está oculto / a janela está minimizada, o host mantém para o guest correspondente a atividade de capturador reversível já existente.
  O Main valida por sender, sandboxId, initId; requisições antigas não podem controlar novas instâncias.
  Requisições de atividade recebidas durante o carregamento são retidas até `did-stop-loading` antes de serem habilitadas; o evento de DOM pronto ainda pode estar em estado de carregamento, portanto a primeira requisição não pode ser descartada.
  Não se define `backgroundThrottling:false` em toda a janela, e não se acordam páginas comuns que não pertencem a esse ciclo de vida.
- Páginas MCP recusam `suspend()` automático; troca de aba, cinco minutos fora de tela e pressão de capacidade não podem perder o estado em memória do plugin.
  O `suspend(true)` explícito segue o caminho de revogação de credenciais, cancelamento de chamadas, teardown, fechamento do guest e liberação do lease.
  Eventos tardios não podem recriar uma página excluída.
- Limites de desempenho: criar apenas as páginas efetivamente solicitadas; manter o limite de admissão de trinta tarefas e sessenta e quatro páginas vivas.
  Quando não há página reciclável, novas criações são recusadas, sem despejar páginas MCP existentes. O Main continua usando a sondagem do guest alvo com intervalo existente de pelo menos 200ms,
  sem introduzir nova inferência de ociosidade, coleta temporária ou snapshots de recuperação. Esse intervalo não é um limite de taxa de quadros do plugin.
  A execução genérica em segundo plano e a retenção do estado de edição exigem recursos; não se promete CPU zero em segundo plano nem a liberação da memória ocupada por essas páginas.
- O Gen UI segue a regra de cinco minutos contínuos fora de tela e a coleta por capacidade; o fallback de não suporte do Browser comum, Web/celular/remoto permanece inalterado.
  Não se pré-carrega todas as linhas de ferramentas do histórico, e não se promete recuperação do estado não salvo após saída do app, crash ou recarregamento explícito.

## Contrato de regressão

Validar com Electron real, page owner de produção, Agent e página MCP controlada sem protocolo privado de execução:

| Cenário                     | Deve ser affirms                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Troca de sessão antes da chegada do resultado da ferramenta | Criado pelo resultado do Agent real sem cartão de ferramenta e sem assinatura de conversation; trabalho concluído em segundo plano, retorno reutiliza o guest |
| Cold start sem âncora / tab oculta | Múltiplos quadros de inicialização concluídos após o handshake com a sessão ociosa, dimensão da página diferente de zero                                      |
| Sessão ociosa / turno interrompido | Trabalho interno com rAF ainda consegue concluir, sem novo turno de modelo nem chamada de ferramenta do host                               |
| Janela minimizada               | Operação em segundo plano concluída; após restaurar a exibição a identidade do guest e o estado de edição permanecem iguais                                     |
| Prazo fora de tela / pressão de capacidade | Guest MCP existente e estado em memória preservados, novas criações recusadas quando não há página reciclável                                   |
| Isolamento nativo             | Guests de desvio que não solicitaram atividade não são acordados; owner errado / initId antigo são recusados                             |
| Ocultar e restaurar               | A superfície de fundo não recebe mouse, a rolagem inline não deriva, a exibição volta a funcionar normalmente                                  |
| Exclusão / invalidação do runtime      | Atividade, guest e lease liberados, eventos tardios não ressuscitam                                                |
| Web / remoto             | Nenhum sandbox local criado, nenhuma assinatura adicional                                                        |

Entrada: `node packages/desktop/scripts/mcp-apps-host-e2e.mjs --background-only`;
o ciclo de vida e os fallbacks existentes usam `--managed-only`. A validação com plugin real usa diretamente o PhotoCraft 0.2.2 sem modificações:
`ZCODE_PHOTOCRAFT_SERVER=/path/to/photocraft/dist/server.mjs node packages/desktop/scripts/mcp-apps-host-e2e.mjs --photocraft-background-only`.
Electron no macOS foi validado: o host minimiza primeiro e então cria o plugin pela primeira vez, inicialização e edição em segundo plano, retenção através do prazo fora de tela e screenshot de restauração `photocraft-restored.png`.
O fundo branco do shell de teste não é prova de sucesso do plugin; é preciso combinar o resultado real dos comandos com o screenshot de restauração; esse fixture não cobre o caminho de instalação pela loja.
