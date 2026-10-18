# Todo 100: investigação de arquitetura da cadeia Account / Provider / Effective Selection

> Status: investigação concluída; 2026-09-09. O escopo de correções subsequentes foi decidido e entregue pelo Todo99; esta investigação não aguarda mais decisão de implementação. Os fatos abaixo foram preservados no momento da investigação e não representam que todos esses defeitos ainda existam; as pendências de verificação foram transferidas para o Todo102.
> Baseline: `86bbe157c88e8e599694afb53c39f6dac125ac08`, `provider-refactor-e2e-recovery`. O código não commitado do Todo99 é um experimento pausado e não conta como correção concluída; este item não altera nem reverte esse código.

## Objetivo e prioridade

Mapear de forma completa as cadeias de seleção de conta, Provider e modelo efetivo do Host e do Core Worker: quais problemas existem hoje, quanto do mecanismo comum já existe, como cada ponto de entrada consome isso e como deve ser reestruturado no longo prazo.

1. Prioridade: coerência entre os fatos de entrada e o snapshot aplicado; reutilização da Effective Selection comum em todos os pontos de entrada; uso correto do resultado do parse na execução, sem corromper a intenção original.
2. Obrigatório verificar: se a sincronização temporária de Account é completa, desduplicada e se a confirmação de aplicação é real, e se a lifecycle do Worker deixa algo de fora. O mecanismo de sincronização pode ser removido no futuro; por agora busca-se apenas correção e confiabilidade, sem ter como meta principal uma reformulação estética completa.
3. Fora de escopo: implementação de correções, refatoração de todo o repo, evolução funcional da CLI independente, migrações de persistência e deploy. Para a CLI independente apenas registrar as diferenças de arquitetura.

## Limites confirmados

- É permitido que o Host use o B completo e que o Worker use temporariamente o A completo; não é permitido misturar A/B dentro do processo nem afirmar falsamente que o B já foi aplicado.
- A Selection original é a intenção; a seleção efetiva é um resultado temporário; a fixação desta execução não pode ser reinterpretada.
- Consumidores como o Subagent explícito devem reutilizar o parse comum; herança implícita, override de execução interna e Off-Peak Ticket já vinculado mantêm a atribuição de execução original.
- Leitura, refresh e falha não sobrescrevem a intenção original persistida; não forçar a unificação das fronteiras de commit e salvamento de cada negócio.
- Não adicionar uma nova barreira que obrigue a sincronizar com a configuração remota mais recente antes de cada envio; não alterar o isolamento de workspace, o continuous do desktop nem o replayable do celular.

## Método e entregas da investigação

Usar os documentos de fatos atuais e o código como evidência, buscando primeiro o ProviderRegistryService, AccountProviderService, ModelSelectionFacade e os pontos de entrada de execução já mapeados nos diagramas de funcionalidade existentes; quando o codegraph não estiver disponível, declarar explicitamente o uso de leitura dirigida por chamadas, sem afirmar que a varredura do grafo foi concluída. Inspeções somente-leitura e verificações em memória sem conta real podem ser executadas, sem acessar ou modificar o estado real do usuário.

Para cada item registrar: expectativa, cadeia real, localização do código no baseline, força da evidência, impacto no usuário, atribuição sugerida, se o experimento não commitado já cobre o caso e o que falta verificar/decidir. As conclusões distinguem problemas confirmados, riscos condicionais, mecanismos corretos e decisões de design pendentes; não tratar alcançabilidade como bug real.

Relatório de execução: [Resultados da investigação e arquitetura-alvo](../research/todo100-account-provider-selection-investigation.md). O relatório deve conter diagrama de arquitetura, tabela de consumo por ponto de entrada, lista de problemas, arquitetura-alvo, a fronteira entre correção mínima e refatoração de longo prazo, e as lacunas de verificação.

| ID | Item de investigação | Critério de conclusão | Status |
| --- | --- | --- | --- |
| I01 | Montagem de processos e serviços | Distinguir Host, Worker gerenciado, CLI independente e ambiente SSH; listar implementações compartilhadas/divergentes | Concluído: relatório §2 |
| I02 | Produção e publicação dos fatos de Account | Verificar mudanças de configuração/conexão/identidade, serialização do refresh, resultados expirados e last-known-good | Concluído: §3, §7; risco de mistura assíncrona de identidade listado, sem alegar reprodução |
| I03 | Snapshot aplicado do Provider | Verificar casamento da versão de origem, consistência estado/model e consumo de notificações e snapshot | Concluído: §3, P100-01/02 |
| I04 | Correção da sincronização temporária | Triggers inicial/evento/sob demanda, completude dos campos, ack, desduplicação/ordem/falha, lifecycles distintos de Worker | Concluído: §6; manter a fila existente, sem recomendar antes recriar uma plataforma de sincronização |
| I05 | Session / Composer | Intenção original → parse comum → commit → Model final, cache e fronteira de salvamento | Concluído: §3, §5; Hook comum e congelamento de execução já corretos |
| I06 | Automation / Bot / Wiki | Host-alvo de cada um, pontos de parse/ despacho, congelamento e fronteira de salvamento de configuração | Concluído: §5; P100-04/05 registram respectivamente as lacunas de turnos seguintes do Bot e de passagem de anexos |
| I07 | Subagent / Workflow | Explícito/implícito/override/aninhado e requisições reais; não basta checar a página de settings | Cadeia estática concluída: P100-03, §5; verificação de rede com child real ainda não executada |
| I08 | Autenticação da requisição e outras chamadas internas de modelo | Execução precisa, vínculo de conta, modelos auxiliares, herança e exceções de Ticket | Concluído: §5; não trocar autenticação dinâmica por seleção de modelo nem revincular Ticket |
| I09 | Evidências e revisão da tentativa de patch | Verificar problemas determinados; distinguir baseline de experimento pausado; listar o que não foi verificado | Concluído: §10; 52 testes unitários existentes passando, diferença de ACK reproduzida em memória; a tentativa de patch continua pausada |
| I10 | Arquitetura-alvo e ordem sugerida | Fronteira do serviço comum, removibilidade da sincronização temporária, correção mínima e itens pendentes de decisão | Concluído: §8/9; parse puramente comum + applied snapshot + fronteira explícita de novo despacho/execução fixada |

Condição de conclusão: cada item acima tem resultado e evidência, e «precisa continuar conferindo» não pode substituir uma conclusão; verificações com conta real ou em máquina real devem ser listadas explicitamente como não executadas. Concluir a investigação não significa que os problemas de produto foram corrigidos, nem autoriza automaticamente retomar o Todo99.

## Conclusões da execução

- Confirmadas três lacunas de estado/consumo: a sincronização perde states, o ACK não representa um applied snapshot real e o Subagent explícito não reutiliza o parse comum.
- Confirmada também uma lacuna na ramificação de despacho de anexos, que deixa de passar a seleção de modelo/contexto de execução; a criação inicial do Bot já tem o parse conectado, mas mensagens seguintes de tarefas existentes não têm, sendo necessário fechar o escopo por turno novo / entrada já aceita.
- Registry/Facade/Hook já possuem proteção de consistência razoavelmente completa; não se recomenda reescrever tudo. A corrida de escopo na consulta upstream de Account continua sendo um risco pendente de verificação em execução, e não deve ser exagerado como caos global comprovado.
- Este item alterou apenas o Todo de investigação, o índice, a nota de pausa e o relatório de resultado. O patch de produto não foi retomado, commitado nem enviado.