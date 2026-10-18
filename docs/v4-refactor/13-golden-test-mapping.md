# Case Catalog → Mapeamento dos testes de ouro (material do M0)

Organiza em camadas, por **meio de prova**, os cases de produto do [conversation-session-case-catalog.md](../conversation-session-case-catalog.md), servindo de base para escolher os temas do conjunto de testes de ouro do M2. A origem semântica de produto não muda (continua sendo catalog / product-protocol); o que muda é apenas o tipo de evidência: a maioria dos cases desce de "é obrigatório abrir a GUI e afirmar" para testes de reducer de função pura, com sequência de eventos entrando e asserção de projeção saindo.

## Critério de estratificação

| Camada | Critério | Forma |
| --- | --- | --- |
| **Testes de ouro de reducer L1** (nova, principal) | o objeto de asserção do case é o conteúdo projetado: phase, queue, availability, estrutura de rows, marker, inputRouting | construir sequência de eventos/commands → rodar o reducer ProductProjection → afirmar a projeção; sem GUI, sem rede, em milissegundos e totalmente enumerável |
| **L2 testes de protocolo/transporte** | o objeto de asserção é a semântica de entrega: consistência de snapshot, coalesce, profile, recuperação | função pura + assinantes simulados |
| **L3 WDIO E2E** (mantida, estreitada) | o objeto de asserção precisa conter interação real de UI ou enlace entre processos: clique de botão, diálogo, rolagem, replay de rede | reconstruir conforme o ritmo de disposição de E2E do [11-deletion-plan](./11-deletion-plan.md), com testid contract v2 |

Princípio: **cada case do catalog tem ao menos uma camada de evidência; a semântica que a L1 consegue provar não consome orçamento da L3 em duplicidade**, e a L3 completa apenas "a superfície de interação que a L1 não consegue provar". Ao reconstruir o coverage matrix, a coluna de evidência indica a camada (`L1`/`L3` ou ambas).

## Mapeamento dos grupos do catalog

| Grupo | Conteúdo | Camada principal de evidência | Observações |
| --- | --- | --- | --- |
| A Entrada no lançamento e em execução | a trípartição de inputRouting (startNow/enqueue/guide), running fork | **L1** | tudo é "estado × entrada → decisão", o núcleo da enumeração do formal-proof; a L3 fica só com 1-2 casos de fumaça de interação do composer |
| B Stop e retenção da fila | phase/queue/autoDrain após stop | **L1** | stop command → asserção de projeção; a L3 acrescenta um caso do estado do botão de stop |
| C Completed estado de sucesso | ações disponíveis após a conclusão | **L1** | asserção de availability |
| D Edit User Query | reexecução do edit, truncamento por row.removed, editKeepsQueue | **L1** + L3 | semântica de truncamento na L1; linha de interação do edit na L3 |
| E Fork | julgamento de estabilidade, child não copia queue/background, E10 merged assistant | **L1** + L3 | cálculo de canFork por linha e conteúdo projetado do child na L1; integridade de conteúdo entre sessões do tipo E10 com replay na L3 |
| F Compact manual | F01–F09 (incluindo o F09 já decidido) | **L1** + L3 | máquina de estados do marker e retenção da fila na L1; clique no ponto de entrada de retry do F09 na L3 |
| G Compact automático | G01–G12 (incluindo G11/G12 já decididos) | **L1** como principal | destino de retry/circuit breaker/pendingAction é toda semântica de runtime; sequências de evento da L1 podem construir com precisão cenários como "três falhas seguidas" que a L3 dificilmente reproduz de forma estável — **este é o grupo com maior ganho na migração para baixo** |
| H Goal | máquina de estados do goal, verifier, articulação com a fila | **L1** + L3 | máquina de estados na L1; linha de entrada de `/goal` na L3 |
| I Modelo e profundidade de raciocínio | escopo de config, cruzamentos N01–N07 | **L1** | switchModelConfig CAS + consumo de snapshot de config (incluindo o N06 já decidido) |
| J Concorrência de múltiplas sessões | isolamento entre sessões | **L1** + L2 | duas instâncias do reducer sem influência mútua na L1; isolamento de assinatura na L2 |
| K Poda crítica | 9 regras de reject | **L1** | todas são asserções de guard, cobertas diretamente pelo formal-proof |
| M Turn Steer | dois modos queue/guide, steerState | **L1** | asserção de projeção de QueueItem.steerState |
| N Cruzamentos de troca de modelo | N01–N07 | **L1** | igual a I |
| O Produto cartesiano de ferramentas | cada ferramenta × compact/fork/goal | L1 + **L3** | semântica de estados do produto cartesiano na L1; complexidade de exibição das ferramentas na UI (resumo/estado de falha/expansão) é o terreno principal da L3 |
| P Posição e dobra na Timeline | placement, grupos de dobra | **L1** + L3 | no v4, placement é produto direto da ordem total de rows mais turnHeader, e a L1 já afirma a estrutura de rows; a interação de dobra é da L3 |
| Q Visibilidade de AskUserQuestion | ciclo de vida de pendingInteractions | **L1** + L3 | aparecer/desaparecer/primeiro a chegar na L1; interação de diálogo na L3 |
| R Escopo do rascunho do Composer | retenção/troca do draft | **L3** | estado puramente local do cliente (escopo por sessionKey), sem relação com a projeção; único grupo com evidência principal na L3 |
| Catalog de falhas de ambiente (grupos N/S/D/L/W/X) | 37 decisões pendentes | estratificação após a decisão | os pontos de injeção de falha estão em provider/rede/fs, e a maioria pode simular eventos de erro no nível do reducer (L1) + fixture de falha de replay (L3); as asserções de isolamento do grupo X entram na L1 (ver [12-fault-catalog](./12-fault-catalog.md) §3.4) |

## Novos testes de ouro estruturais do v4 (não mapeados do catalog, vindos do design-review E-03)

Esses provam **o mecanismo de protocolo em si**, ortogonal aos cases de produto, todos em L1/L2:

1. **Atomicidade de snapshot**: em execução, tomar um snapshot em qualquer marca d'água W e continuar o fluxo ≡ replay completo (R-03).
2. **Estado terminal tardio não ressuscita**: estados terminais de assistant/tool/verifier que chegam após o stop são rejeitados (cenário de P1-5/P5-7).
3. **Formatação de fora de ordem do provider**: tool_use antes da cauda do texto, pacote de thought tardio.
4. **Equivalência de profile**: rodar a mesma sequência de eventos nas duas faixas continuous/replayable, com estados terminais idênticos byte a byte.
5. **Fechamento por filtragem**: eventos filtrados pelo profile precisam ser fechados por eventos não filtráveis (incluindo summaryText de subagent).
6. **Descarta silencioso de quadros duplicados/tardios**, com ressubscribe substituindo a assinatura antiga (R-01).
7. **Guard e projeção da mesma origem**: não existe janela de "transmissão antes da liberação de estado" (P5-3).
8. **Enumeração completa do formal-proof ↔ consistência com actionAvailability** (já listado em 02-projection).
9. **Completude do transcript**: `reduce(transcript) ≡ reduce(events)` (aceitação de persistência da opção B, design-review §9.2).
10. **Isolamento de falhas**: injetando qualquer falha na sessão A, a projeção da sessão B não muda (12 §3.4).

## Forma de implementação sugerida

- Os testes L1 ficam no mesmo pacote do reducer (`apps/zcode-cli`), com fixture sendo uma **sequência de eventos JSON** — extraível das trilhas de replay e2e existentes ou escrita à mão no formato mínimo; o id de cada case do catalog aparece no nome do teste, para o script de auditoria do coverage matrix fazer a conciliação.
- A enumeração completa do formal-proof roda em uma entrada de teste independente (volume combinatório grande, cronometrada à parte dos testes caso a caso).
- O momento de reconstrução da L3 é depois do corte vertical do M3 (quando o testid contract v2 estiver pronto), com a escolha dos temas orientada pela coluna L3 desta tabela, sem transposição em massa dos 52 specs antigos.