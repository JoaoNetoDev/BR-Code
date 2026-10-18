# Superfície de Impacto e Limites de Aceitação do Todo128

## Resumo da Funcionalidade

| Campo | Valor |
| --- | --- |
| Intenção / capacidade | A inicialização significa apenas prontidão; em tempo ocioso a elegibilidade é lida do Registry atual e atualizada serialmente |
| Camada de mudança / modo | validation, option-source; planning |
| Sementes | ProviderRuntime, NodeProviderConfigRuntime, NodeProviderRegistryRuntime, ProviderRegistryService, offPeakTaskStore |
| Docs existentes | Todo128, docs/off-peak-task/spec.md |
| Fora de escopo | Composer, refatoração de persistência, refatoração de sincronização de conta, suporte remoto em tempo ocioso, regras efetivas de retirada de número |

## Matriz de Superfície de UI

| Cenário / entrada | Implementação compartilhada | Exibição/rascunho | Padrão | Guarda | Commit / autoridade | Modo / isolamento |
| --- | --- | --- | --- | --- | --- | --- |
| Entrada de criação em Automations | Store + notificação de conclusão das Provider Settings | Elegibilidade no Store; rascunho de formulário independente | Padrão sem elegibilidade | Conexão atual suportada e quota ready | getCodingPlanSupport → getTakeNumberAvailability; Registry do Host/servidor | Apenas o escopo local desktop já existente; não afeta tarefas agendadas |
| OffPeakNewTaskEntry | O mesmo Store/hook de atualização | Banner e rascunho de navegação | Template existente | A navegação usa qualquer plano; não substitui a validação de criação | Apenas navegação, sem retirar número | Atualmente não montado; não reabrir a entrada por causa da correção |

## Comportamento Compartilhado e Divergente

| Aspecto | Compartilhado | Divergente / motivo |
| --- | --- | --- |
| UI / origem das opções | Fato mais recente concluído de Provider | Não ajusta o layout; a home e o portão de criação diferem |
| Padrão / validação | Não liberar sem confirmação; elegibilidade e quota da mesma geração | Navegação da home não equivale a retirar número |
| Commit / persistência | Sem novo cache, sem modificação no banco | A retirada de número efetiva ainda é validada pelo servidor do Host; não muda o vínculo de Ticket |

## Relacionamentos da Funcionalidade

| Rank | Aresta | Por quê / evidência |
| --- | --- | --- |
| must-inspect | start → resolução de credenciais ociosas | node.ts hoje consome o snapshot antigo da primeira Promise |
| must-inspect | Registry → ProviderSettings.onDidChange → reconsulta ociosa | A notificação de View do Facade é baseada no snapshot já publicado |
| must-inspect | inicialização da página/mudança de conexão/atualização manual → Store | Hoje os três pontos são concorrentes e podem combinar elegibilidade e quota |
| should-inspect | Início do Node → log de inicialização do Protocol | Após a mudança do retorno para void, ler o snapshot explicitamente uma vez |
| invariant-only | criação/envio/autenticação | O mesmo closure de resolução de credenciais; não afrouxar a elegibilidade |
| invariant-only | Host compartilhado Web / identidade de workspace | Não adicionar Host, não alterar continuous/replayable |

## Donos de Estado e Destinos de Commit

| Fato | Dono | Espelho / destino |
| --- | --- | --- |
| Elegibilidade do modelo atual | Registry | O Store guarda apenas o resultado de suporte mascarado |
| Quota de retirada de número | Servidor | Resultado da mesma geração no Store; não persistente |
| Prontidão da inicialização | Promise<void> do ciclo de vida do Runtime | Não serve como cache de dados |
| Seleção de conexão | Settings | A UI apenas compara, sem escrever de volta nem reverter a conexão |

## Invariantes que Precisam Ser Preservados

Deduplicação na inicialização, nova tentativa após falha, dispose e atualização em segundo plano permanecem inalterados. A elegibilidade de API Key e de modelos de conta não é afrouxada. Elegibilidade/quota só podem ser publicadas juntas na geração mais recente; sucesso antigo, falha e finally não abrem a porta. Estado desconhecido impede entrada. Envio e sincronização não passam a depender de nova espera.

## Evidência do Codegraph

Este ambiente não possui a ferramenta Codegraph; a varredura do Codegraph não foi executada; foram usados, como alternativa, o relatório de referências de `ProviderRegistryService` da dep:refs (`/tmp/provider128-refs.log`) e verificações precisas com chamadas de rg. Profundidade 2: Runtime→closure consumidor→serviço ocioso; Store→duas entradas→portão de criação. Não é permitido registrar um acerto estático como verificação em execução.

## Candidatos a Deriva do Grafo

No grafo, "Provider sem enabled" e a lista antiga de modelos de plano estão desatualizados; ficam por conta dos Todo correspondentes, sem ampliar a modificação nesta rodada. Apenas completar as relações confirmadas de inicialização/atualização ociosa.

## Delta do Grafo

confirmado: os nós de Provider Registry e do Store ocioso recebem a restrição de ciclo de vida/elegibilidade da mesma geração, além da aresta de notificação de conclusão; com base na decisão já confirmada no Todo128.

## Questões em Aberto

Nenhuma decisão nova de produto. A disponibilidade real da Air é apenas pré-requisito de verificação, não bloqueia o desenvolvimento independente, e não deve ser considerada aprovada sem medição.

## Passagem para Planning

A especificação segue o Todo128 §2–5 e esta página; abaixo estão o catálogo de casos consolidado, a matriz de cobertura e a tabela de decisões. Os casos de UI entram na regressão pending, compartilhando Store/hook reais, com o servidor controlado; a verificação real em máquina é registrada separadamente.

## Log de Esclarecimentos / Decisões de Limite

O usuário já confirmou: os quatro start retornam void; atualização unificada de elegibilidade ociosa; não mexer em Composer/sincronização/regras de elegibilidade. Portanto não há perguntas a repetir.

## Escopo de Domínio / Riscos Cruzados Entre Produtos

Dois domínios: ciclo de vida de Provider e validation ociosa. Foco: primeira inicialização não pronta × conta chegando depois; troca de conexão × elegibilidade/quota/erro antigo chegando tarde; dupla entrada × mesma notificação. Exclui o produto cartesiano completo de todos os clientes e todas as contas.

## Mapa de Conceitos / Donos de Estado / Dimensões

start significa prontidão, não o dado de negócio mais recente; o Registry é o fato; o Store é a exibição. Eixo de estado: não inicializado/verificando/ready/error; eixo de eventos: inicialização/notificação de conclusão/mudança de conexão/atualização manual; requisições antigas podem terminar na fase de elegibilidade ou na de quota. Donos na tabela acima.

## Combinações Candidatas / Casos Aceitos

| ID | Configuração → ação | Asserções | Evidência / E2E |
| --- | --- | --- | --- |
| S1 | Início concorrente dos quatro Runtime; modify Personal e start de novo | void; lê o mais recente da interface; recursos não duplicados | Teste unitário |
| S2 | Falha na inicialização/liberação | Mantém os limites originais de nova tentativa/liberação | Testes existentes + tipos |
| Q1 | Inicialização a frio sem plano → notificação de prontidão de Registry Team | Sem precisar reabrir a página; suporte e quota atualizados de uma vez | Store + UI pending |
| Q2 | support/quota antigo em trânsito → mudança de conexão | Reconsulta combinada serialmente; sucesso/erro antigo não sobrescreve; sem ready intermediário | Store |
| Q3 | Dupla entrada inicializando/recebendo a mesma revision ao mesmo tempo | Verificação compartilhada, sem consulta concorrente repetida de retirada de número | Store + UI pending |
| Q4 | Atualização manual, elegibilidade de false→true / true→false | Primeiro elegibilidade, depois quota; falha não abre a criação | Store + UI pending |
| Q5 | Sem rollout gradual/sem elegibilidade/erro de quota | Mantém a entrada bloqueada; notificações posteriores ainda podem recuperar | Store |

## Decisões de Poda / Perguntas para o Usuário

Não executar retirada real de número, cancelamento de Ticket nem alteração de configurações reais de conta; o usuário não pediu ampliação dessa permissão. A criação ociosa no celular e o envio pelo Composer são itens excluídos. Sem perguntas pendentes.

## Notas de Preenchimento da Matriz / Passagem para E2E

Esta página mantém a matriz S1–Q5; os testes unitários do Store reutilizam Promises com atraso, sem depender de sleep; o browser pending reutiliza o Hook/Store compartilhados e eventos de servidor controlados. Os arquivos usam diretório temporário, e a rede de Provider não participa da simulação. Não é preciso fixture de replay de provider (este grupo não envia requisições de modelo). Se a Air não estiver acessível, registrar honestamente a limitação de verificação; não tratar como evidência de sucesso da implementação.