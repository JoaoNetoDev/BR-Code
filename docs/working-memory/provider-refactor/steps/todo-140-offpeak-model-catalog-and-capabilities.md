# Todo140: Atualização da Lista de Modelos de Off-Peak e das Capacidades de Visão/Busca

Status: implementado, verificação em lote e review concluídos (2026-09-12); Built-in revision 25, sem publicação de configuração online.

Conexão de implementação de 2026-09-12: foram modificadas apenas as duas tabelas de membros off-peak do Built-in, as regras correspondentes de habilitação exata e o slot de busca do site off-peak, com revision 24→25; o catálogo padrão e as capacidades finais foram validados pelo caminho real Resolver→Registry→View de seleção exclusivo de off-peak, reaproveitando os testes existentes de dispatch/Ticket, sem ampliar as interações de UI.

## Escopo Confirmado

Ajustar simultaneamente `account:zai-offpeak-idle-plan` e `account:bigmodel-offpeak-idle-plan`:

| Item                   | Alvo                                                                              |
| ---------------------- | --------------------------------------------------------------------------------- |
| Lista de modelos internos | Manter apenas `GLM-5.3` e `GLM-5.3-Flash`, ambos habilitados por padrão; remover `GLM-5.2` e `GLM-5-Turbo` |
| Visão do GLM-5.3        | Não suporta entrada de imagem/vídeo, configurado conforme a capacidade real da API comum, sem adotar a declaração de capacidade em ponte do Coding Plan |
| Visão do GLM-5.3-Flash  | Manter as capacidades de imagem/vídeo/PDF já existentes na API comum           |
| Busca interna           | Desativar `supportsNativeWebSearch` nos dois modelos                               |

Trata-se de um ajuste da própria configuração de capacidades, e não da adição de casos especiais de ocultação de selos no frontend.

## Situação Atual e Direção de Implementação

- Atualmente, os dois `builtinModelIds` off-peak são Flash, 5.2 e Turbo, cada um com sua própria regra de enabled, e falta o 5.3. A lista e as regras que a acompanham precisam ser fechadas em conjunto.
- A regra geral do GLM-5.3 já desabilita imagem/vídeo, e a regra específica do Flash habilita imagem/vídeo/PDF; deve-se priorizar o reaproveitamento das regras existentes, sem copiar toda a configuração da API comum e sem adicionar sobreposições de mesmo valor sem sentido.
- O site off-peak `https://zcode.z.ai/api/v1/off-peak/anthropic` atualmente habilita busca e MCS ao mesmo tempo; apenas a busca é desabilitada, e o MCS é mantido.
- A modificação principal ocorre em `config/provider/zcode-builtin.json`, com incremento de revision a partir da baseline mais recente no momento da implementação, evitando sobrescrever atualizações de configuração paralelas. Config specs e testes relacionados são sincronizados.

## Limites que Não Mudam

- O off-peak continua usando `anthropic-messages` e o endpoint existente; mapeamento de parâmetros, MCS, autenticação de conta, vínculo de Ticket, retries e o mecanismo de agendamento permanecem inalterados.
- A discussão sobre "habilitar MCS também na API comum" foi revertida, e este Todo não altera o MCS da API comum.
- Não alterar as listas de modelos ou capacidades da API comum, do Coding Plan pessoal/equipe ou do Start Plan; não remover as regras globais de modelo de 5.2/Turbo, que ainda podem ser usadas por outros Providers.
- Não mapear silenciosamente IDs de modelos antigos para novos números de modelo, e não alterar mensagens de histórico, estatísticas, configurações pessoais do usuário ou tarefas em execução. Na implementação, verificar se o dispatch off-peak contém hardcodes de modelos antigos ou dependências de seleção persistida; se houver casos que não possam ser tratados pelas regras atuais, registrá-los primeiro e não usar a ocasião para adicionar migração de dados.
- Não publicar configuração online nem modificar dados reais de usuários.

## Execução e Aceitação

- [x] Adicionar primeiro testes de resolução reais do Built-in, cobrindo a lista exata de modelos dos dois off-peaks, o estado de habilitação padrão e a permanência/remoção dos modelos antigos e novos, e só então modificar a configuração.
- [x] Validar o resultado final da resolução: 5.3 sem imagem/vídeo; Flash com imagem/vídeo/PDF; ambos sem busca interna e mantendo MCS, mapeamento de parâmetros Anthropic e as regras de contexto/saída/ Thinking level.
- [x] Regressão dos Providers adjacentes: a configuração original da API comum, do Coding Plan e do Start não é afetada, em especial o MCS da API comum e a busca de planos não são modificados junto.
- [x] Verificar as premissas de modelos antigos na cadeia de consumo off-peak e nos testes, confirmando que novas tarefas podem usar a nova lista; manter os limites de Ticket, credenciais e execução já vinculada, e não verificar apenas que o JSON é parseável.
- [x] Executar em lote os testes relacionados de configuração/dispatch, verificação de tipos, lint e verificação de arquitetura; ao final, revisar item a item e registrar o escopo real de verificação, limitações e commit. Se for obrigatório alterar interações de UI, adicionar os casos correspondentes, sem refazer a UI por causa desta alteração de configuração.

## Implementação e Revisão de 2026-09-12

O caminho real Built-in→Resolver→Registry→View de off-peak e os testes de configuração MCS adjacentes passaram, assim como as regressões existentes de dispatch/autenticação/retry; não foi validado online a oferta de novos modelos no serviço off-peak em produção.

As evidências do lote, a classificação de falhas existentes e as limitações por plataforma estão no [registro de review desta rodada](../research/todos-136-139-140-review-20260912.md). Escopos não testados não são escritos como aprovados; nada foi enviado com push automático.