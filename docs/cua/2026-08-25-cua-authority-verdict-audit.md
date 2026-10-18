# Auditoria de deduplicação de veredictos de autoridade do CUA

Status: contrato de implementação

## Objetivo

Auditar de forma completa a cadeia de decisão do CUA official, da verificação de
identidade/primeiro plano no producer até a projeção de mídia no consumer, removendo
estados duplicados que sobrepõem um resultado autoritativo com um espelho mais fraco, que
rebaixam um conflito concreto para sucesso, ou que não têm nenhum leitor; preservando ao
mesmo tempo a re-verificação TOCTOU entre fronteiras assíncronas e os invariantes
independentes sustentados por camadas diferentes.

## Princípios de decisão

```text
同一事实、同一时点
  authoritative source 已给出结论
    └─ cache / mirror / weaker source 不得重新否决或放行

跨 await / native dispatch / hook / provider projection
  系统状态可能已经变化
    └─ 新时点复核保留（TOCTOU gate）

不同不变量
  identity / focus / raster bytes / adjacency / budget
    └─ 各自保留；不能因为都“检查失败”就合并
```

O authority map específico desta rodada:

```text
producer direct applicationInfo(pid)
  ├─ exact result ───────────────> PID identity authority
  ├─ absent/error ───────────────> exact listApplications(pid) availability fallback
  └─ concrete conflicting PID ──> fail closed（不得由列表洗白）

producer activateAppFrameSurface
  ├─ LiveFrontmostPid + exact focus ──> activation transaction authority
  └─ later captureApp exact surface ──> later TOCTOU identity/focus check（保留）

consumer official MCP authority
  └─ modelContentProtection=official_cua_frame_v1 ──> 唯一 Host 保护开关

consumer provider projection
  image immediately followed by image_ref ──> one deliverable coordinate pair
  orphan image_ref / unrelated image ───────> whole result unavailable
```

## Casos aceitos e podas

| Case         | Entrada                                                                                | Esperado                                                      | Evidência                   |
| ------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------- |
| CUA-AUTH-01  | a busca direta por PID retorna um PID concreto diferente, enquanto o requested PID existe na listagem                        | rejeitar imediatamente; sem launch, sem activate                          | producer unit              |
| CUA-AUTH-02  | a busca direta por PID está ausente ou lança erro temporário, e há um único requested PID na listagem                      | permitir exact PID fallback                                   | producer unit              |
| CUA-AUTH-03  | a ativação de surface nativa já provou o primeiro plano no WindowServer, mas mas depois o espelho active da app-list está atrasado | não sobrescrever o sucesso nativo                                        | producer unit + macOS real |
| CUA-AUTH-04  | o sucesso nativo tem foreground PID ausente ou incorreto                                                    | fail closed                                               | producer unit              |
| CUA-AUTH-05  | após a ativação, a exact surface é substituída ou perde o foco                                                   | o later TOCTOU gate falha em closed                             | producer unit              |
| CUA-MEDIA-01 | a imagem entregável está diretamente adjacente ao image_ref                                                      | manter o par atômico e a ordem                                          | adapter unit               |
| CUA-MEDIA-02 | há espaço em branco/bloco arbitrário entre a imagem e o image_ref                                                 | erroizar o resultado inteiro, sem expor frame_id                               | adapter unit               |
| CUA-MEDIA-03 | há uma imagem irrelevante entregável no resultado e, além disso, um image_ref órfão                                    | a imagem irrelevante não autoriza o órfão; erroizar o resultado inteiro                    | adapter unit               |
| CUA-HOST-01  | registro do CUA official com autoridade verificada                                                                | definir apenas `modelContentProtection`, sem flag preserve paralelo | core unit + typecheck      |

Conclusão das podas:

- Não há adição de combinações de estado de session de conversa; a alteração não toca em desktop continuous, mobile replayable, owner/lease, queue nem workspace identity.
- A postcondição live da ativação em Windows/Linux é um fato independente por plataforma e não é derivada da autoridade de surface nativa do macOS; nesta rodada rodamos apenas regressão estática/unitária e não declaramos aprovação na plataforma real.
- A atestação final do executor após o hook, a re-verificação de frontmost antes da distribuição de teclado global e entre distribuições por etapas, e a captura da exact surface após a ativação atravessam todos pontos de tempo variáveis e são preservadas explicitamente.
- A integridade de entrada do media bridge e a entregabilidade por provider do adapter pertencem a invariantes diferentes e são preservadas explicitamente; o adapter apenas aperta a regra "cada referência deve estar diretamente adjacente ao seu próprio raster" e não adivinha autoridade pelo nome da ferramenta.

## Aceitação

- Fazer esses casos negativos falharem na implementação antiga primeiro e só então fazer a correção mínima;
- Todos os testes direcionados de producer/consumer verdes;
- Todos os testes de producer, e typecheck, lint e testes unitários afetados de consumer verdes;
- Pelo menos uma cobertura no macOS real com um modelo real: observação, ativação/upload de painel de arquivos e a entrada subsequente;
- O MR permanece como Draft até a auditoria terminar e, depois, tem review/gate reexecutados antes de voltar a Ready.