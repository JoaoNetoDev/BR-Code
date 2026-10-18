# Registro de verificação local ZCT-2096089929570893824

> Origem histórica: staging `35ba050592` (2026-09-07). Abaixo preserva os fatos de verificação do autor original na época;
> não se trata da verificação atual da versão integrada do Todo103, nem amplia o escopo de correções desta rodada com base neles.
> A reconexão do Bot desta rodada e as novas evidências estão na seção 20 de `../working-memory/provider-refactor/research/todo103-staging-integration-ledger.md`.

Data: 2026-09-07. Ambiente: macOS arm64, ZCode Dev com configuração de produção local, conversa privada no Feishu com Ryan Bob,
BigModel Coding Plan / GLM-5.3-Flash. As operações foram feitas por Computer Use, sem enviar mensagens de teste ao grupo.

## Escopo das correções

- `65ad97769b`: tarefas ativas de bot já excluídas não são mais reutilizadas.
- `3c53fe008f`: o código de negócio e o log ID do erro de envio do Feishu são preservados, exibindo falha de entrega fora do estado de conexão e limpando após um envio bem-sucedido.
- `8e7fe75d0f`: o schema estrito do protocolo aceita o `scheduled.assistantMessageId` opcional que já existia no CLI.

O envio em conversa privada mantém o open_id e não troca para chat_id em caso de falha; chats de grupo continuam sem suporte. Cards existentes são atualizados via message_id.

## Resultados em máquina real

| Verificação                  | Resultado                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Tarefa longa CUA60ROUND     | 60 chamadas de ferramenta seriais, com 20 segundos de espera cada e cálculo de valor de verificação; 60 marcadores de início e conclusão completos |
| Tempo real da tarefa longa   | Trilha do modelo de 04:35:21.232Z a 05:02:31.568Z, 27 minutos e 10 segundos; a estimativa do modelo no card não serve como base de tempo |
| Estado final da tarefa no Feishu | Após o desbloqueio, o Computer Use confirmou que o resultado da 60ª rodada, CUA60ROUNDDONE e Completed estão visíveis  |
| Regressão do build mais recente | Saída normal do processo antigo, rebuild e inicialização da versão de desenvolvimento contendo 8e7fe75d0f; as seis rodadas de cálculo do CUAFIX1405 foram concluídas e o desktop exibiu Worked for 1m 14s |
| Protocolo e runtime           | O log do CLI confirmou o envio de 6 eventos scheduled com assistantMessageId, e no log do novo processo houve 0 alertas de descarte de session event inválido |
| Mensagem seguinte           | Feishu e desktop exibiram CUAFIXFOLLOWUPOK, com Completed no Feishu                                     |
| Estado da conexão            | Bots → Ryan Bob exibe Feishu WebSocket is running / Connected, sem indicação de erro de entrega                  |

Session da tarefa longa: `sess_59ef620c-a6c3-4503-a777-ab8395e780aa`.
Session da regressão pós-correção: `sess_f5109c02-ffb1-41df-bf0f-b208f9e1c9ef`.

As capturas de tela locais estão em `/tmp/zct-closure-evidence/`, com o estado final da tarefa longa, os resultados pós-correção no desktop/no Feishu e o estado de conexão do bot.
O log pós-correção é `/tmp/zct-closure-runtime-final.log`. Essas são evidências temporárias da máquina local e não servem como fixtures de teste portáveis do repositório.

## Evidências de automação e limites

- Antes da correção do protocolo, as quatro novas combinações falhavam por não reconhecer o assistantMessageId; após a correção, 74 testes de protocolo/stdio passaram e 1 foi pulado por condição de plataforma.
- A verificação de tipos passou; Lint com 0 erros e 43 avisos preexistentes.
- O BOT-E2E-DF-01 existente usa uma rejeição de negócio sintética do Feishu para validar o diagnóstico, a limpeza após sucesso, o envio por open_id e o fato de que chats de grupo não criam tarefas; não pode ser visto como uma reprodução de rejeição real por um tenant.
- Nesta rodada não foi observado o `Sending messages to users is temporarily unavailable` do Feishu. A correção do cliente e a verificação da cadeia normal local foram concluídas, e isso não autoriza afirmar que a causa raiz da rejeição no lado do Feishu foi eliminada.
- Nada foi publicado ou mesclado; Windows/Linux, aparelho real do celular e o tenant do usuário original estão fora do escopo desta verificação. Os testes de protocolo cobrem a validação de campos dos dois deliveryKind, o que não equivale a um teste completo de recuperação entre plataformas.