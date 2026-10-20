# Esquema de otimização da árvore AX do ZCode CUA

Este documento apresenta o plano completo de otimização da árvore AX do ZCode Computer Use (CUA), cobrindo coleta de dados, normalização multiplataforma, formato visível ao modelo, identidade estável de nós, estados full/delta/no-change, poda de árvores Web complexas, verificação pós-ação, persistência e restauração, migração e aceitação quantitativa. O plano se baseia na análise de trajetórias reais de Calculator, TextEdit, System Settings e Chrome do ZCode CUA.

Conclusão principal: a arquitetura alvo preserva os contratos de segurança de execução e multiplataforma do ZCode, como state_id, window owner, sistemas de coordenadas e verificação de stale, ao mesmo tempo que adota uma representação semântica hierárquica e um patch incremental real, reduzindo o custo de contexto do modelo.

## 1. Linha de base medida

Abaixo estão as medições do estado atual do ZCode CUA em trajetórias de máquina real:

| Cenário | Medido no ZCode CUA |
|---|---|
| Calculator full | cerca de 9.435 caracteres / 58 elementos |
| Calculator com pequena alteração | 9.351–11.684 caracteres (ainda despeja a árvore completa) |
| TextEdit full | 3.636 caracteres / 29 elementos |
| TextEdit no-change | ainda retorna a árvore completa de cerca de 3,6–4 KB |
| Página de navegador complexa | 5.015–8.757 caracteres (não se pode avaliar a qualidade apenas pelo tamanho) |

No ZCode Calculator, 11 resultados com state_id da mesma sessão somam 112.279 caracteres, com média de cerca de 10.207 caracteres por observação. Atualmente o changes do ZCode é apenas um resumo anexado, e não substitui o conjunto completo de elements.

## 2. Diferença entre os dois formatos de modelo

### 2.1 Formato alvo: DSL textual hierárquica

DSL full alvo (especificação completa na seção 8)

```
@state s-4 mode=full app=Calculator window=main
0 window "Calculator"
  1 region "Keypad"
    6 text "Display" value="46"
    14 button "All Clear" [press]
    23 button "7" [press]
```

DSL delta alvo

```
@state s-5 base=s-4 mode=delta
~ 6 value="7"
~ 14 name="Clear"
```

O formato alvo usa a indentação para preservar a relação pai-filho, adota o index contínuo como handle de ação e coloca em uma única linha o role, selected/editable/expanded, Description, Help, ID e Secondary Actions. Pequenas alterações são expressas com `+`, `~` e intervalo de IDs removidos; a ausência de alterações retorna apenas no-change e o foco. Esse formato é voltado ao modelo e não carrega o contrato estruturado entre processos.

### 2.2 Estado atual: snapshot JSON plano

ZCode compact state

```
{
  "state_id": "s-3",
  "focused_element": 18,
  "readable_text": ["Untitled"],
  "elements": [
    {
      "index": 18,
      "kind": "textarea",
      "name": "First Text View",
      "editable": true,
      "focused": true
    }
  ],
  "changes": {
    "added": [],
    "removed": []
  }
}
```

No ZCode, as fronteiras de app, window, state, coordinate space, elements, changes e action outcome são bem definidas; o kind abstrai as diferenças entre macOS AX, Windows UIA e Linux AT-SPI, e state_id + index permite proteger contra snapshots expirados. Porém o array plano perde o contexto pai-filho, as chaves JSON consomem tokens em duplicidade, changes é retornado junto com o conjunto completo de elements e ainda pode vir acompanhado de top_candidates e de longas orientações em linguagem natural.

## 3. Problemas centrais hoje

### 3.1 changes não é incremental

Fluxo de estado atual do ZCode

```
S0: compact elements completo
        │
        ▼
      ação
        │
        ▼
S1: compact elements completo
  + changes.added/removed
  + top_candidates repetindo elementos
  + orientação estática em linguagem natural
```

Mesmo quando added_count e removed_count são ambos 0, a árvore inteira é repetida. O resultado da ação já traz o settled state, o que poderia reduzir uma chamada de get_app_state, mas a devolução do estado completo anula o ganho de contexto.

### 3.2 Identidade de nó e stale fingerprint misturados

O element fingerprint existente contém role, title, value e coarse bounds, e é usado ao mesmo tempo para a identidade de diff e para a verificação de stale/TOCTOU da ação. No TextEdit, um mesmo textarea em que apenas o value muda é expresso por changes como removed + added; isso não é substituição de nó, é atualização de estado. Os dois usos precisam ser separados.

### 3.3 A achatagem perde a cadeia semântica de ancestrais

Controles repetidos como "OK", "Edit" e "More" precisam de pai, row, dialog, toolbar ou section para serem diferenciados. O compact do ZCode mantém apenas kind/name planos, e o modelo precisa recorrer a index, top_candidates ou dicas de posição para adivinhar o contexto, sem poder expressar diretamente "a qual região o botão pertence".

### 3.4 O orçamento das árvores Web complexas é tomado pelos contêineres

Na página de resultados de busca do Chrome medida no ZCode, 56 dos 80 elementos são AXGroup, 75 não têm name/value válidos e truncated=true. Contêineres sem informação ocupam primeiro o node cap, e link/text/button reais podem ser truncados; o extremo oposto é manter links duplicados demais e URLs longas de rastreamento, fazendo o volume de uma única página explodir.

### 3.5 A orientação estática entra repetidamente no resultado

No Calculator, a orientação que antecede um único resultado tem cerca de 728 caracteres; na trajetória de falha apenas de menu do TextEdit são 3.741 caracteres, dos quais cerca de 2.453 são orientação de estratégia, ou 66%. Esses conteúdos deveriam pertencer à skill/tool description ou a códigos de diagnóstico estruturados, e não ser repetidos a cada estado.

## 4. Arquitetura alvo

```
Arquitetura alvo do AX
macOS AX / Windows UIA / Linux AT-SPI
                  │
                  ▼
        árvore semântica normalizada
                  │
        ┌─────────┴──────────┐
        ▼                    ▼
 identidade estável de nó  impressão digital material
  alinhamento full/delta    validação stale/TOCTOU
        │                    │
        ▼                    ▼
   poda semântica        verificação de ação
        │
        ▼
   motor de snapshot
  ├─ full
  ├─ delta
  └─ no_change
        │
        ├─ JSON estruturado: processo/armazenamento/replay/testes
        └─ DSL compacto: contexto do modelo
```

O contrato estruturado interno é separado da camada de apresentação ao modelo: o JSON é o protocolo de fatos e de restauração, e o DSL é a visão do modelo otimizada para tokens. Ambos são gerados a partir do mesmo semantic snapshot, sem manter duas lógicas de comportamento.

## 5. Modelo de estado e de nós

### 5.1 Snapshot identity

Somente a observação full gera e expõe ao modelo um novo session state_id. delta/no_change não criam um novo id: o modelo reaproveita o session state_id que mantém desde a última observação full (implementação em `AccessibilitySession.lastStateId()`). Internamente o broker continua mantendo base_state_id para o diff, mas não expõe ao modelo esse id de contador do broker (é um contador independente, que o targeting resolver não consegue resolver). O delta deve declarar base_state_id; o chamador só pode aplicar o patch se tiver o base. Um full é forçado em caso de compaction, reconexão, restauração de processo, navegação entre páginas ou perda do base.

### 5.2 Stable node identity

Passa a existir um node_id opaco, usado para reconhecer o mesmo nó semântico entre snapshots. Prioriza-se o identificador nativo estável do backend; quando ele não pode ser obtido, ele é composto pela identidade da janela, pelo caminho acessível, pelo role/name estáveis e por um discriminador entre irmãos. O node_id não contém value, focus, selected nem bounds temporários.

### 5.3 Material fingerprint

O material fingerprint continua contendo o role, title/value, enabled, bounds e as capabilities necessárias que afetam a segurança da ação, e é usado para reler antes da atuação e julgar o stale. Ele não participa da identidade de delta. O index é mantido como um alias curto dentro do snapshot atual, e as ações ainda enviam state_id + index/node_id.

Contrato de nó

```
{
  nodeId: "ax:window-3642:path-1.2.18",
  index: 18,
  parentNodeId: "ax:window-3642:path-1.2",
  kind: "textarea",
  name: "First Text View",
  value: "hello",
  capabilities: ["edit", "focus"],
  state: { focused: true },
  materialFingerprint: "mfp:..."
}
```

## 6. Full, Delta e No-change

Resposta delta

```
{
  "schema_version": 3,
  "state_id": "s-5",
  "base_state_id": "s-4",
  "mode": "delta",
  "updated": [
    {
      "node_id": "calc:display",
      "index": 6,
      "changes": {"value": "7"}
    }
  ],
  "added": [],
  "removed_node_ids": [],
  "focus": null
}
```

**full.** É retornado um snapshot full podado na primeira observação, quando o base não está disponível, quando a identidade da janela muda, em navegação de página/documento, em reconstrução de uma grande proporção de nós e quando a versão do schema muda.

**delta.** Com a mesma janela/documento e quando a proporção de nós alterados fica abaixo do limite, retornam-se apenas os patches de added, updated, removed, focus, selection e readable text. O limite inicial sugerido é que os caracteres estimados do patch sejam menos de 40% dos do full; o limite final é determinado pela avaliação de trajetórias, e não por um valor empírico fixo em código.

**no_change.** Quando semantic tree, focus, selection e o readable text essencial não mudaram, retornam-se apenas state_id, base_state_id, mode=no_change, a contagem de observações repetidas e uma next action necessária. O tamanho alvo é de no máximo 200–300 caracteres.

**checkpoint.** Um full checkpoint é enviado quando deltas consecutivos atingem uma quantidade fixa, quando o contexto está prestes a ser compactado, em mobile replay gap, quando o chamador solicita explicitamente ou quando o servidor percebe que o risco do base aumenta. O delta nunca pode depender de um estado renderer-local que o chamador não consiga recuperar.

## 7. Poda semântica e preservação da hierarquia

A ordem de poda muda de "ordem de aparição dos nós" para "valor informacional". Primeiro preserva-se o focused, editable, pressable, selectable, selected/checked e os nós de erro/estado; depois preserva-se text/link/button/menuitem com name/value legível; por fim completam-se as cadeias de ancestrais mais curtas dos nós já preservados. Contêineres puramente de layout são dobrados por padrão em um summary de section/container, e mantidos apenas quando servem para desambiguar.

Tipo de nó

Política padrão

Exceção

focused/editable/actionable

Sempre mantido

value de campo seguro deve ser mascarado

selected/checked/error/status

Estado sempre mantido

Estados duplicados são mesclados

text/link/button

Mantido quando tem name/value

Links duplicados são mesclados

group/container

Dobrado ou omitido

Resumo mantido quando usado para desambiguar o pai

offscreen/invisible

Omitido por padrão

Alvo rolável ou menu mantido sob demanda

disabled

Baixa prioridade

Mantido quando o usuário está tratando do motivo da desabilitação

O orçamento deixa de ser um node count fixo e passa a combinar orçamento de caracteres/tokens com cotas semânticas. A resposta deve conter omitted_counts_by_kind, truncated_reason e as funções chamáveis get_element_subtree(node_id) / get_more_elements(cursor). Não se pode deixar 56 AXGroups vazios tomarem todo o orçamento.

## 8. DSL visível ao modelo

A camada de modelo usa uma DSL textual estável, sem prefixo de plataforma e que preserva a cadeia de ancestrais mais curta. Internamente o JSON completo continua sendo mantido. A DSL é apenas um serializer, e não uma nova fonte de fatos.

DSL full sugerida

```
@state s-4 mode=full app=Calculator window=main
0 window "Calculator"
  1 region "Keypad"
    6 text "Display" value="46"
    14 button "All Clear" [press]
    23 button "7" [press]
@focus none
@omitted container=4 disabled=1
```

DSL delta sugerida

```
@state s-5 base=s-4 mode=delta
~ 6 value="7"
~ 14 name="Clear"
@focus none
```

Na DSL são mantidos index, kind, name/value, estados essenciais e capability; Help e native role são obtidos por busca no subtree; actions já são retornados incondicionalmente no compact, e bounds não são mais expostos ao modelo. URLs longas mantêm por padrão um resumo de origin/path, removendo o tracking query; o valor completo é solicitado apenas quando o usuário está trabalhando explicitamente com a URL.

## 9. Fusão entre resultado da ação e observação

O settled state pós-ação do ZCode atual é a direção correta, mas o conteúdo retornado deve passar a ser action_outcome + delta/no_change. A execução da ação, a verificação e a observação posterior continuam dentro da mesma semântica de transaction/lock, evitando reintroduzir TOCTOU por causa da otimização de tokens.

Resultado da ação

```
{
  "action_outcome": {
    "status": "verified",
    "target_node_id": "calc:equals"
  },
  "state": {
    "state_id": "s-6",
    "base_state_id": "s-5",
    "mode": "delta",
    "updated": [
      {"node_id": "calc:display", "changes": {"value": "46"}}
    ]
  }
}
```

Se return_state=none, retornam-se apenas o outcome e um state_available=false explícito; se a ação não tiver efeito, retornam-se no_change e o motivo no_effect; se a janela tiver sido fechada, houver reversão de permissão ou o base for inválido, retorna-se um recovery code estruturado, sem repetir um longo trecho de orientação de estratégia.

## 10. Estratégia para navegador e árvores grandes

Dentro do mesmo documento, entradas, expansões, seleções e carregamentos parciais podem usar delta; a navegação entre URL/documento tem full por padrão. O critério não é o nome do App, e sim a identidade do documento, a root signature e a taxa de reuso de nós.

A poda Web precisa de regras adicionais: mesclar o image link e o title link do mesmo card; manter nos groups vazios apenas a cadeia de ancestrais necessária; remover o tracking query das URLs; dividir textos agregados longos em text nodes por origem; priorizar viewport, focused, interactive e selected; e, ao ultrapassar o orçamento, paginar por section. Para páginas canvas/AX sparse, retornar explicitamente state_quality=visual_required, evitando simular a usabilidade de uma árvore vazia.

## 11. Cooperação entre captura de tela e AX

O include_screenshot=false padrão do AX-first é mantido, pois é superior a capturar uma imagem a cada observação. A captura ocorre apenas em leitura visual, state_image coordinate, AX sparse ou captura explícita pelo usuário. As imagens são transmitidas por media block/artifact e não entram no JSON de AX nem nos logs.

Quando uma screenshot é retornada, o snapshot registra window, display provenance, device pixel ratio, image region e media ref. O delta de AX e o dirty crop da imagem usam o mesmo state_id/base_state_id, mas a ausência de um dos dois não pode tornar o outro indecifrável. O desktop continuous e o mobile replayable compartilham o mesmo fato de snapshot persistido.

## 12. Multiplataforma e restauração

Os campos normalized kind, capability e state são consistentes entre macOS AX, Windows UIA e Linux AT-SPI; native role, native action e backend handle existem apenas no adapter/private state. O node_id pode conter o namespace do backend, mas o chamador o trata como opaco.

snapshot/delta precisam ser persistíveis e passar por validação de schema em tempo de execução. Um full checkpoint é solicitado ou enviado em caso de mobile replay gap, reinício de processo, evicção por LRU no servidor, fork de sessão ou inexistência de base_state_id. O desktop continuous não concatena as mensagens de recuperação exclusivas do mobile replayable.

## 13. Plano de migração

Fase

Conteúdo

Política de compatibilidade

P0 Linha de base

Fixar caracteres, tokens, taxa de sucesso, taxa de retenção de nós e latência de Calculator, TextEdit, Settings e Chrome.

Não altera a saída atual.

P1 Identity

Introduzir node_id; separar stable identity de material fingerprint; adicionar o diff updated.

O par antigo state_id+index continua funcionando.

P2 Snapshot

Adicionar schema_version, base_state_id, mode e full/delta/no_change.

Negociação de capacidades; clientes antigos continuam recebendo full.

P3 Pruning

Orçamento semântico, cadeia de ancestrais, dobra de contêineres, remoção de ruído Web e subtree/cursor.

subtree/cursor preserva a entrada de diagnóstico.

P4 DSL

Contexto do modelo passa para a DSL compacta; o JSON é usado em eventos, armazenamento e depuração.

Período de comparação com dois serializers, com o comportamento vindo do mesmo snapshot.

P5 Rollout

Ativação gradual de delta; monitorar action success, stale, reobserve, tokens e erros de restauração.

Queda automática para full em caso de anomalia em base/diff.

## 14. Superfície de impacto no código

src/zcode_cua/accessibility/models.py: adicionar node_id, parent_node_id e state/capability semântico.

src/zcode_cua/accessibility/state.py: separar identity/material fingerprint e implementar updated/full/delta/no-change.

src/zcode_cua/accessibility/filtering.py: pontuação semântica, cadeia de ancestrais e orçamento de caracteres.

src/zcode_cua/platforms/macos_ax.py, Windows UIA, Linux AT-SPI: fornecer candidatos de backend stable identity.

src/zcode_cua/observation/presentation.py: o resultado da ação retorna delta/no-change e as orientações repetidas são removidas.

src/zcode_cua/tools/observation_tools.py: negociação de capacidades, snapshot mode e contrato das ferramentas subtree/cursor.

Protocolo/evento/projeção do ZCode: persistir snapshot/delta e a dependência de base, com suporte a replay/cold recovery.

## 15. Plano de testes

Testes unitários de Identity. Mudanças de value, focus e selected não alteram o node_id; mudanças de janela/documento/caminho semântico trocam o id corretamente; nós irmãos repetidos são desambiguados de forma estável; o material fingerprint é sensível às mudanças que afetam a segurança da ação.

Testes unitários de Diff. updated/added/removed/no-change, nós duplicados, focus, mudança de pai, base mismatch, queda para full ao ultrapassar o limite e equivalência total entre o patch aplicado e o novo full.

Testes unitários de Pruning. actionable, focused e readable text não são perdidos; groups vazios não ocupam todo o orçamento; a cadeia de ancestrais é a mais curta possível e suficiente para desambiguar; campos secure nunca emitem value; URLs longas perdem o tracking.

Contrato multiplataforma. O mesmo fixture produz kind/capability/state consistentes em AX/UIA/AT-SPI; native role não vaza para a DSL compacta; os metadados de coordenadas de Windows DPI, macOS Retina e Linux X11 mantêm a semântica de segurança atual.

E2E de trajetórias. Cálculos contínuos no Calculator, digitação e painel de gravação no TextEdit, troca de páginas no System Settings, interação na mesma página e navegação entre páginas no Chrome, AX sparse/canvas, reversão de permissão, fechamento de janela, mobile replay gap e restauração a frio de sessão.

## 16. Métricas e metas

Métrica

Meta sugerida

Descrição

Calculator warm full

Não superior a 4–5 KB

Atualmente cerca de 9,4 KB; a meta reduz pela metade

delta de App nativo com pequena alteração

Não superior a 20% do full

em Calculator/TextEdit a meta pode chegar a 5–10%

no-change

Não superior a 300 caracteres

apenas cadeia de estado e diagnóstico necessário

full de Web complexo

Conforme o token budget do modelo

prioriza-se garantir os nós semânticos, sem buscar apenas o mínimo de tamanho

retained semantic ratio

Em elevação contínua

proporção de actionable/readable/stateful entre os nós preservados

Erros de restauração de base/delta

Próximos de 0

checkpoint full automático em caso de erro

action success/stale false positive

Não pior que a linha de base atual

a otimização de tokens não pode sacrificar a correção das ações

Número de observações repetidas

Redução significativa

no-change e action outcome devem interromper o ciclo de observações

A latência de execução precisa de um benchmark separado: startup/settle e serialização não podem ser misturados em um único indicador. O ZCode deve separar backend capture, normalize, prune, diff, serialize, image capture e transport duration, e definir uma meta para cada um.

## 17. Critérios de aceitação

O state schema distingue claramente full, delta e no_change, e traz schema_version.

O delta sempre declara base_state_id, e a perda do base permite a queda automática para full.

stable node_id e material fingerprint são separados.

Uma mudança de value no TextEdit é expressa como updated, e não como removed + added.

Uma pequena alteração no Calculator não repete mais a árvore completa de 58 elementos nem o top_candidates.

Árvores Web complexas não têm o orçamento tomado por groups sem nome.

A DSL do modelo preserva a cadeia de ancestrais necessária, e o JSON interno permite replay completo.

O action result retorna outcome + delta/no-change, sem aumentar o número de rodadas de observação.

secure field, área de transferência, chaves e values sensíveis não entram no modelo nem nos logs.

As cadeias de restauração de macOS, Windows, Linux e desktop/mobile passam nos testes.

O custo de contexto cai de forma significativa sem regressão em action success e na proteção contra stale.

## 18. Riscos e trade-offs

O delta depende do base. Se o contexto do modelo for compactado ou se o mobile replay perder o base, o patch fica ilegível. O checkpoint precisa ser gerenciado pelo snapshot engine, e não repassado ao renderer ou ao prompt.

A identidade estável de nó não pode ser perfeita em todos os Apps. Nós dinâmicos de Web/Canvas sem identificador nativo só podem usar caminhos heurísticos. Quando a confiança de identidade é baixa ou a proporção de reconstrução da árvore é alta, o caminho é full direto, sem forçar correspondências apenas para turbinar a taxa de delta.

A poda pode esconder informação necessária. Por isso se mantêm subtree/cursor e o omitted summary; a aceitação se baseia na taxa de sucesso da tarefa e na taxa de retenção semântica, e não no menor número de caracteres como objetivo único.

Risco de manter dois formatos. JSON e DSL precisam ser gerados pelo mesmo pipeline de serializer de snapshot; são proibidos dois filtros e duas lógicas de diff independentes, sob pena de o modelo ver algo diferente do state de execução.

## 19. Referências de trajetória e implementação

ZCode Calculator: ~/.zcode/cli/debug/model-io-sess_4c0dec29-abc9-45db-b92a-85b734cfa5eb.jsonl

ZCode TextEdit: ~/.zcode/cli/debug/model-io-sess_9ce83024-e3ca-4a27-8bb7-352186b9c06e.jsonl

ZCode Chrome: ~/.zcode/cli/debug/model-io-sess_d7748be0-9015-464e-b6e1-7e35b3c8563c.jsonl

Implementação principal: src/zcode_cua/accessibility/state.py, models.py, filtering.py, observation/presentation.py.
