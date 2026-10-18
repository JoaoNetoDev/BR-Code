# Todo 90: unificação da configuração inteligente e do comportamento de rascunho ao adicionar/editar modelos

> Decisão posterior (2026-09-11): o [Todo130](todo-130-manual-model-config-editable-field-boundary.md) substituiu neste documento as regras de "desabilitar o interruptor enquanto a recomendação não está pronta / congelar e validar integralmente a configuração manual": apenas desabilita durante o salvamento, o manual exige somente os campos editáveis e os campos de sistema continuam sendo resolvidos. **O Todo130 ainda precisa ser executado**; a implementação e a aceitação antigas abaixo são preservadas como histórico e não representam a semântica nova já em vigor.

> Atualização da atribuição de verificação (2026-09-09): a dívida de testes remanescentes, falhas e promoções manuais deste documento foram transferidas de forma unificada para o [Todo102](todo-102-verification-debt-closeout.md), encerrando a escala de verificação independente aqui; as evidências históricas são preservadas, e a transferência não significa que os testes passaram.

> Status: implementado e com aceitação conjunta no Pro, veja a seção 8. O texto do aviso de recomendação foi concluído (`8fba2cb9dc`). 2026-09-08.
>
> Baseline de conferência: `c3e5fb37c2`, `provider-refactor-e2e-recovery`.

## 1. Objetivo e situação atual

A adição de modelos também pode escolher a "configuração inteligente" (antes "seguir a configuração recomendada"). Adicionar e editar compartilham o rascunho de configuração e a interação, e não devem mais apresentar comportamentos diferentes de configuração recomendada por causa de entradas distintas.

Complemento final de 2026-09-08: manter o interruptor, sem substituí-lo por "restaurar padrões"; após desligá-lo, não há mais correspondência de recomendação por ID de modelo, todos os campos de configuração passam a ser obrigatórios e a borda de cobertura pessoal não é exibida. Modo, integridade e salvamento são responsabilidade deste item; o estilo final dos controles está no [Todo92](todo-92-model-smart-config-and-override-feedback.md). Este parágrafo e as atualizações abaixo substituem a proposta anterior de "no modo fixo ainda resolver primeiro pelo novo ID".

Três lacunas estão confirmadas hoje:

1. `ProviderModelMetadataDialog.tsx` só mostra o interruptor quando `mode === "edit" && inheritedConfig`; na adição, mesmo atingindo uma configuração recomendada, ele não aparece.
2. O fluxo de adição só passa a configuração do modelo, sem propagar o salvamento de `useRecommendedConfig`. Não se pode exibir o interruptor sem salvar o modo.
3. Alterar o ID na adição limpa incondicionalmente os campos Contexto e Max Output; na edição não há esse passo. As duas lógicas de atualização de rascunho estão separadas e precisam ser fechadas por uma regra unificada.

Modelos pessoais novos podem ter o ID alterado na edição; apenas modelos herdados são somente leitura. Portanto, "alterar o ID do modelo" não é um cenário exclusivo da adição. A afirmação de que isso é "exclusivo da adição", feita em discussões anteriores, fica sem efeito.

## 2. Regras de produto confirmadas

### 2.1 Manter apenas as diferenças necessárias

| Conteúdo    | Adicionar                                                                 | Editar                                          |
| ----------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| Inicialização | Rascunho do novo modelo, por padrão seguindo a recomendação               | Config pessoal salva, modo e baseline desta edição |
| ID do modelo | Obrigatório, com verificação de duplicidade ao salvar                    | Membro pessoal editável; membro herdado somente leitura |
| Efeito do salvamento | Cria o membro pessoal com sua configuração e modo, preservando a ordenação existente | Atualiza configuração e modo; renomeação atômica ao mudar o ID |

A resolução da configuração recomendada, a troca de modo, a edição de campos, a validação, o cancelamento e a preservação do rascunho em caso de falha são todos compartilhados. Mantém-se a informação de identidade `add/edit` necessária, sem usá-la como condição de bifurcação para o interruptor de recomendação ou para a conversão de configuração.

### 2.2 Interruptor e rascunho

- O interruptor continua na mesma linha de ação de salvar/cancelar, reutilizando a chave de i18n existente e o Switch; o nome passa a ser "Configuração inteligente" (`Smart configuration`), sem restaurar o botão "redefinir tudo". A descrição é "Compara automaticamente com a configuração recomendada pelo ID do modelo e permite modificações individuais.", em inglês no Todo92.
- A disponibilidade depende de o ID atual já ter resolvido uma baseline recomendada, e não de ser adição ou edição, nem da marca do Provider.
- Para um modelo novo, ainda sem ID, com a resolução pendente, exibe-se o interruptor ligado por padrão, porém desabilitado; quando se confirma que não há baseline recomendada, o interruptor nem é oferecido. "Ainda não carregado" não pode ser confundido com "com certeza não há recomendação".
- Ao desligar o acompanhamento: preenche integralmente os campos gerenciados pelo editor com a configuração efetiva atual do rascunho, preservando o conteúdo já editado, sem copiar a configuração inteira de Provider/Account.
- Depois de desligado, toda a configuração do modelo precisa estar completa: exibe-se o valor realmente preenchido, e não mais o placeholder da recomendação; valores numéricos e Mapping vazios não são completados via inheritedConfig. `false` é um valor válido, e um `{}` legítimo também é válido. Capacidades ocultas e requisições de configuração já válidas permanecem completas; quando um campo ainda não está pronto, não se fabrica um snapshot completo.
- No modo fixo não se busca nem se atualiza a configuração recomendada por ID de modelo, e mudar o ID não refaz a correspondência. Uma atualização da recomendação não pode afetar campos fixos; da mesma forma, o salvamento no servidor e a resolução em execução não podem completar silenciosamente uma configuração fixa incompleta com valores recomendados.
- Ao religar: limpa as coberturas pessoais dentro do escopo gerenciado pelo editor e restaura a configuração recomendada do ID atual; os campos editados depois disso devem continuar sendo salvos normalmente, sem serem apagados pela ação de "restaurar recomendação".
- Apenas o rascunho é modificado. A persistência ocorre ao clicar em salvar; cancelar não escreve nada, e uma falha preserva o rascunho. Reutilizam-se as regras do Todo 89 para conflito de versão, proibição de envio duplicado/fechamento durante o salvamento etc.
- Ativar/desativar o modelo não faz parte deste interruptor: na edição o `enabled` original é preservado, e na adição vale `enabled=true` da criação; a troca de modo não altera a ativação.

### 2.3 Regra unificada para alterar o ID do modelo

```text
添加 / 编辑个人模型：ID 从 A 改成 B
                     |
          +----------+------------+
          |                       |
       智能配置开启             智能配置关闭
          |                       |
  按 Provider + B 解析推荐     不按名称解析推荐
  未覆盖字段使用 B 的推荐值    保留明确填写的配置
  保留明确的个人覆盖          不自动重新开启智能配置
```

"Trocar o ID" e "reativar conscientemente o acompanhamento" não são a mesma ação: a primeira preserva as coberturas pessoais, a segunda as limpa. Não se deve considerar que uma cobertura pessoal sem override apenas porque ela coincide com o valor recomendado de A; o critério é o rascunho pessoal, e não inferir retroativamente a partir do valor efetivo.

Nenhuma das duas entradas pode limpar incondicionalmente Contexto, Max Output ou outros campos já preenchidos ao mudar o ID. No modo fixo, só é permitido salvar após a configuração completa passar pela validação; é proibido completar às escondidas a "configuração fixa" com os valores recomendados de B.

O tratamento assíncrono reutiliza o `useModelConfigResolution` existente, sem um segundo mecanismo de temporização ou retentativa:

```text
请求 A -> 改为 B -> 请求 B -> B 返回：应用
                               A 迟到：丢弃
关闭弹窗 / 切换 Provider -> 原编辑请求失效
关闭智能配置 -> 在途推荐请求失效；不再发起名称匹配
开启模式保存 -> 等当前 ID 的推荐解析完成并校验 -> 原子提交
关闭模式保存 -> 校验完整个人草稿/身份/版本 -> 原子提交
```

Cobrir os casos A→B→A, retorno ao ID original, mesmo ID com Provider diferente e ligar→desligar→ligar, entre outros. Respostas antigas, recomendações antigas ou o resultado de uma abertura anterior do diálogo não podem participar do salvamento atual; se a resolução no modo ligado falhar, preserva-se a entrada e são permitidos retentativa/cancelamento, sem usar resultado vencido para fingir sucesso. O modo fixo não bloqueia o salvamento de uma configuração pessoal completa por falha do serviço de recomendação, mas as validações de identidade oficial, permissões, membro duplicado e versão permanecem inalteradas.

### 2.4 Texto do aviso de correspondência da configuração recomendada

- Decisão adicional de texto em 2026-09-08: em chinês, unificar como "已匹配到智能配置", substituindo "已为模型匹配到推荐配置".
- Em inglês, sincronizar para `Smart configuration matched for this model`.
- Reutilizar a chave de i18n existente `settings.modelProvider.modelDefaultsLoaded`; a mudança de texto não adiciona novos estados ou verificações.
- Este subtipo altera apenas o texto do aviso; não muda a resolução da configuração recomendada, o momento de exibição/ocultação do aviso, o modo de acompanhamento nem o comportamento de salvamento.

## 3. Escopo de implementação e atribuição de estado (Impact Brief)

Modo: planning. Camadas alteradas: presentation, draft-default, validation, commit-effect, persistence; não envolve restauração de sessão.

| Entrada                | Implementação compartilhada / dono do rascunho                                    | Origem da recomendação e da validação                            | Commit e persistência                                                                        | Plataforma e isolamento                             |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Adicionar modelo no Provider | ProviderModelsSection → lógica/diálogo comum de edição de configuração; novo rascunho nesta rodada | resolveModelConfig do Host de destino; conversão de rascunho comum e validação do servidor | addPersonalModel propaga o modo de configuração; ConfigService faz uma única atualização do Personal Repository | Desktop/Web compartilhado; escreve no Environment de destino |
| Editar modelo pessoal   | ModelRowInput → mesma lógica/diálogo comum de edição; inicialização a partir da configuração existente | Igual acima; preserva o revision de baseline e a validação de renomeação | savePersonalModelDraft; commit atômico de configuração, modo e renomeação necessária           | Não pode afetar outros Providers / outros modelos   |
| Editar modelo herdado    | Igual acima, com ID somente leitura                                                 | Baseline herdado atual; permissão de membro verificada de forma independente | Mesmo salvamento de configuração do modelo; não altera a identidade do membro herdado       | Respeita a atribuição de membro em Account e herança de template |

### 3.1 Lógica comum e fronteira de salvamento

- Extrair a inicialização de rascunho, a conversão de modo, a projeção da recomendação após mudança de ID e a validação de commit que realmente se repetem; manter entradas finas de criação/atualização, sem criar um CRUD genérico nem um framework de formulários gigantesco.
- O fato da recomendação em execução pertence ao Host de destino; o Renderer mantém apenas a intenção de edição pessoal e o rascunho de exibição, sem criar outro Registry/Overlay de resolução.
- O fluxo de adição propaga o campo de modo opcional desde o callback de UI, passando por hook, Settings Service, Facade e ConfigService; chamadas antigas sem o campo continuam sendo tratadas como acompanhamento.
- Reutilizar os metadados de modo e a validação de integridade já existentes. Criação do membro, ordem, configuração e modo acontecem em uma única transação, e uma falha não pode deixar metade do membro.
- Não alterar o formato de `provider_config.json`, não adicionar migração e não exigir limpeza de configuração. Não colocar o modo dentro de ModelConfig, de parâmetros de requisição ou do estado da conta.
- A functionality ainda não foi publicada, então não se adiciona compatibilidade para "configuração fixa antiga"; campos e lógicas de baixo nível como useRecommendedConfig podem ser mantidos e reutilizados, sem necessidade de renomeá-los por causa do texto de UI.

### 3.2 Simplificação de código é um requisito de entrega

Decisão adicional do usuário: ao unificar o comportamento, limpar o código desnecessário, e não apenas adicionar funcionalidades.

- Remover as projeções de campos de recomendação, a troca de modo e a conversão de rascunho duplicadas entre adição e edição; depois de chamar a lógica comum, não podem sobrar implementações antigas nem caminhos de compatibilidade paralelos.
- Remover verificações add/edit sem base semântica de produto, incluindo exibir o interruptor apenas na edição e limpar valores ao mudar o ID na adição. Manter as diferenças realmente necessárias: inicialização, permissão de membro e criação/atualização.
- Limpar os estados touched, Effects, refs, callbacks, parâmetros, tipos, exports e fixtures de teste que perderam utilidade. Confirmar item a item que a responsabilidade foi assumida pela lógica comum; não é possível remover registros reais de cobertura pessoal, isolamento de respostas vencidas, validação de versão ou proteção de salvamento só para reduzir linhas.
- Um fato mantém uma única fonte; não manter ao mesmo tempo rascunho, configuração resolvida e cópia local efetiva como três estados graváveis. O resultado da resolução serve apenas de baseline/exibição, e o rascunho pessoal expressa a modificação do usuário.
- A lógica compartilhada deve usar preferencialmente poucas funções de conversão claras; extrair hooks apenas quando o ciclo de vida for realmente compartilhado. Não introduzir CRUD genérico, registro de estratégias, formulários em plugin ou camadas de compatibilidade para bifurcações antigas.
- Na revisão, listar quais lógicas duplicadas foram removidas/mescladas, quais ramos precisam ser mantidos e por quê. O alvo da aceitação é uma regra única e menos repetição, não a contagem líquida de linhas removidas, e sem refatorar todo o módulo de configurações por conta própria.

### 3.3 Impacto gradual, evidências de código e grafo

| Nível            | Relação / ponto de verificação                                               | Motivo e evidência de código                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| must-inspect     | As duas entradas → mesma lógica de edição de configuração                   | ProviderCardSections, ProviderFormControls, ProviderModelMetadataDialog; hoje há bifurcação na exibição do modo e na atualização de ID                          |
| must-inspect     | Rascunho → resolução de recomendação / conversão de commit                   | useModelConfigResolution, ProviderModelMetadata; não é possível unir só a UI e deixar duas conversões de campo                                              |
| must-inspect     | Adição/edição → cadeia de escrita das Settings                               | InlineEditableProviderCard → useModelProviders → providerFacadeServices → ProviderSettingsFacade → ProviderConfigService → Personal Repository                        |
| should-inspect   | Salvamento do modo → configuração efetiva, ordenação, enabled                | Reutiliza a verificação de integridade da configuração fixa existente e a fronteira de escrita do Todo 89, sem copiar membros herdados                           |
| conditional      | UI compartilhada → tela estreita, tema, idioma, Host de destino              | Interruptor quebrando linha de forma razoável na mesma linha; usar o serviço de destino, sem escrever no ambiente errado                                         |
| invariant-only  | Salvamento das Settings → Selection/Session/conta                           | Segue apenas o refresh pós-salvamento; não altera seleção de modelo, troca de conexão, protocolo de execução ou continuous/replayable                                 |
| evidence-only   | Testes unitários e Electron                                                  | Provam as novas regras; não expandir a outras mudanças de negócio só por causa de chamadas de teste                                                                    |

O codegraph não está disponível no momento; a conferência até a fronteira de escrita é feita por busca precisa e cadeia de chamadas direta, examinando cerca de dois níveis de profundidade em componentes/serviços compartilhados, sem expandir domínios de execução irrelevantes. O grafo já tem a relação `surface.provider-settings → service.provider-settings` e a relação de resolução de recomendação, que podem ser reaproveitadas; adicionar o link de origem deste Todo sem criar um segundo surface de configurações. A bifurcação de implementação atual é registrada como bug-candidate, sem usá-la para reescrever as decisões acima.

## 4. Plano de aceitação e podas

Dimensões principais: adicionar/editar, membro pessoal/herdado, acompanhamento/fixo, recomendação pronta/ausente/com falha, mudança de ID, commit com sucesso/falha. Escolher apenas as combinações que alteram o comportamento; não fazer a permutação completa de marcas de Provider, todos os planos e todos os sistemas operacionais.

| Número | Precondição e operação                                                                                                          | O que deve ser verificado                                                                                                                                                                                                                            | Status / camada de evidência                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| M90-01 | Adicionar com ID informado, resolvendo a configuração recomendada                                                             | O interruptor aparece na linha de salvar/cancelar; por padrão acompanha, e antes de estar pronto não pode ser desligado para fixo                                                                                                              | accepted; DOM + Pro Electron                       |
| M90-02 | Adicionar desligando o acompanhamento, editar campos, salvar e reabrir                                                      | Configuração completa e modo false; mudanças posteriores na recomendação não alteram campos fixos; membro e ordenação são escritos uma única vez                                                                                          | accepted; testes de serviço/configuração + Electron em disco |
| M90-03 | Adicionar/editar: voltar de fixo para acompanhamento, editar um campo e salvar                                            | Cobertura antiga é limpa e a nova edição é preservada; cancelar não salva; o `enabled` original não é modificado pelo modo                                                                                                               | accepted; testes unitários parametrizados + Electron representativo |
| M90-04 | Adicionar e editar modelo pessoal, mudando de A para B no estado de acompanhamento                                        | Campos não cobertos acompanham B; coberturas explícitas são preservadas, inclusive as que coincidem exatamente com o valor recomendado de A                                                                                            | accepted; lógica comum + DOM                        |
| M90-05 | O mesmo, no estado fixo mudando de A para B, ou limpando campos obrigatórios                                               | Configuração e modo se mantêm; não há chamada de recomendação por nome, nem placeholder/estilo de cobertura; a configuração fixa incompleta é recusada explicitamente na UI e no Host, sem preenchimento implícito por B; false e `{}` legítimo funcionam    | accepted; lógica comum + testes de serviço         |
| M90-06 | Adiar a resposta de A e trocar para B; cobrir A→B→A, desligar/religar, trocar de Provider, desligar e religar             | Só são aceitos resultados da geração atual de edição/identidade/modo; o rascunho fixo não é sobrescrito por recomendações atrasadas; o salvamento não usa resolução antiga                                                                     | accepted; Promises/hooks/DOM controláveis, sem depender de sleep |
| M90-07 | Sem recomendação, falha de resolução, ID duplicado, conflito de versão ou falha de escrita                                   | Sem baseline, não se fabrica configuração fixa; o erro preserva o rascunho; não há gravação parcial; o ID herdado continua somente leitura                                                                                                  | accepted; DOM + testes de falha de serviço          |
| M90-08 | Cancelar o salvamento nos dois modos, tela estreita / PT e EN / temas claro e escuro                                        | O mesmo componente de interação funciona; escreve no Host de destino e os demais ambientes não são afetados                                                                                                                            | accepted; Electron representativo + teste de isolamento de serviço |

Podas:

- Renomear modelo herdado: podado, pois o ID existente já é somente leitura e o servidor protege o membro; verificar que a proteção não regrediu, sem desenhar novas permissões.
- Combinação completa de planos de Account e Providers comuns: podada, pois a escrita de membro e as regras de rascunho são compartilhadas; escolher a adição em Account e a edição de modelo pessoal como representativas.
- API/fatura reais e troca automática de Selection: ignoradas, pois este item não muda esses comportamentos, e o E2E não envia requisições reais de modelo.
- Nova enumeração global de estados formalizados: podada, pois isto é uma transação de formulário local, e testes parametrizados com assincronismo controlado são suficientes.
- Escopo indefinido que exigiria decisão do usuário: atualmente nenhum; se for obrigatório mudar o formato, permissões de conta ou adicionar salvamento automático, parar e discutir.

## 5. Execução e passagem de bastão

1. Sincronizar as regras confirmadas no `design/registry/settings.md` vigente; reproduzir primeiro as bifurcações acima com testes.
2. Compartilhar o rascunho de configuração e o interruptor de recomendação; adicionar o salvamento de modo na adição, mantendo as diferenças de permissão de membro e escrita atômica entre as duas entradas. Remover ao mesmo tempo a lógica duplicada substituída e o código morto, não apenas conectar código novo sem limpar o antigo.
3. Revisar de forma concentrada a mudança de ID, a troca de modo, o cancelamento, a falha de commit e as respostas atrasadas, e só então executar a verificação final, evitando descobrir bifurcações durante o envio.
4. Atualizar os cenários M90 em `docs/testing/ui-polish-e2e-coverage-matrix.md`; escrever/expandir os casos seguindo o ciclo de vida de E2E existente, e só promover após revisão manual pendente. A tabela atual é um plano de aceitação, não um registro de aprovação.
5. Verificar no MacBook Pro, com configuração isolada, adicionar → trocar de modo → salvar → reabrir e editar mudando o ID; usar fixtures de recomendação A/B com diferenças claras, sem dados reais de conta. Após a verificação de tipos, o lint e os testes unitários afetados passarem, fazer o commit registrando comandos, resultados, commit e o que ficou sem verificação.

O timing do E2E deve usar condições normais de UI para espera; desordem de resolução é provada por testes unitários com Promises controláveis, sem novos atrasos fixos. Quando celular/remoto não forem testados na prática, registrar isso claramente, sem substituir a validação do controle remoto por um viewport estreito de desktop.

## 6. Relação com os Todos existentes

- [Todo 82](todo-82-model-config-follow-recommended-draft.md): mantém o campo de modo existente e a semântica de salvamento do rascunho; este item completa a entrada de adição e endurece, com a decisão final, o modo fixo de "não corresponder por nome / não completar via herança".
- [Todo 88](todo-88-provider-audit-regression-repair.md): mantém a correção do modo de acompanhamento, a integridade da configuração e o layout inferior, sem bifurcar as correções novamente.
- [Todo 89](todo-89-provider-settings-write-boundary-cleanup.md): segue a escrita esparsa de membros, a operação estreita de enabled, a transação de rascunho e a recuperação de falha; não refaz cadeias já verificadas.
- [Todo 92](todo-92-model-smart-config-and-override-feedback.md): responsável pela borda final de cobertura, Hover/foco, MFJS e layout; não implementa um segundo conjunto de regras de modo ou salvamento.

## 7. Registro de implementação

| Subtipo                                                     | Status       | Commit e verificação                                                                                                                                                                              |
| ----------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Texto do aviso de correspondência da configuração recomendada (2.4) | Concluído    | `8fba2cb9dc`: textos em PT/EN, spec de Settings válido, testes relacionados e comentários de E2E sincronizados. `pnpm exec vitest run packages/ui/test/providerModelMaxOutputLookup.test.ts` 12/12 aprovado; `pnpm typecheck` e `pnpm lint` aprovados |
| Rascunho compartilhado entre adicionar/editar, configuração inteligente, salvamento de modo na adição e limpeza de código | Implementado | A seção 8 registra a entrada comum real, a montagem da escrita, as evidências de regressão e os limites de poda                                                                             |

O subtipo de texto foi validado primeiro com testes reproduzindo o texto antigo fora do requisito, só então a implementação foi modificada e verificada; o E2E de Electron não foi reexecutado, e não se afirma que a interação de desktop ou celular já passou pela aceitação integral deste item. Este registro adicional altera apenas o Todo, sem modificar novamente o código de produto.

## 8. Execução principal, revisão e aceitação em 2026-09-08

### Cadeia única efetivamente implantada

```text
添加 / 编辑（仅初始化、权限和创建/更新不同）
       -> useProviderModelDraft
            -> Host 推荐基线 + 个人原始输入/来源标记
            -> projectModelDraft / updateModelDraft
            -> resolveProviderModelDraftCommit
       -> Settings Service -> Facade -> Runtime 装配 -> ConfigService 单次事务
```

- O modo inteligente só solicita a baseline do Provider/ID atual; entradas numéricas e a origem explícita não são removidas por coincidirem com a recomendação. Controles não cobertos acompanham a mudança de ID, e valores já cobertos são preservados.
- O modo fixo materializa o rascunho do momento, preservando fatos ocultos como Audio, Tool Call e o Mapping de saída máxima; interrompe as requisições de recomendação por nome. Valores numéricos e Maps vazios são recusados na UI, e o Host usa a mesma verificação de integridade para recusar configurações incompletas na adição e na edição; a resolução em execução do modelo não preenche mais lacunas a partir do Built-in. O `enabled` é independente e não é reescrito pelo interruptor de modo.
- Ao ligar, as coberturas antigas do modelo são limpas (incluindo o Mapping de saída máxima oculto); edições posteriores são preservadas. O modo atravessa todo o repasse ao criar o membro, e configuração/membro/modo são salvos atomicamente. Não há mudança de formato de arquivo nem de migração.
- Usa-se a entrada existente de idle/flush, com identidade de geração de edição e verificação da geração da requisição; cobrindo A→B→A, desligar/religar, trocar de Provider e desligar e religar. Respostas antigas não escrevem no rascunho atual; o salvamento de uma configuração fixa completa não depende do sucesso da interface de recomendação. Durante o salvamento, o corpo fica inert e o envio no rodapé é bloqueado.

### Lista de remoções e preservações

| Item                                                                                  | Tratamento e motivo                                                                 |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| ref touched exclusivo da adição, Effect de projeção de campos de recomendação, limpeza de valores ao mudar o ID, createProviderModelAddDraft | Removidos; substituídos pelo rascunho comum e pelo registro de origem, verificados por referência e mantendo os testes reais de DOM da adição |
| resolveCurrentDraft exclusivo da edição, troca de modo, retroação de coberturas após validar a tabela inteira | Removidos; as duas entradas consomem o mesmo hook e a mesma conversão de commit   |
| Ramos de criação e atualização em adicionar/editar                                    | Preservados; permissão de membro, renomeação e validação de revision não são lógica duplicada |
| useModelConfigResolution, agendamento idle, validação de integridade do serviço       | Reutilizados; nenhum segundo mecanismo de retentativa ou Registry local foi introduzido |
| Parâmetro de API format não mais usado e ramos redundantes de igualdade com valor padrão | Removidos; o casamento real de formato continua a cargo do Host                     |
| Encapsulamento BooleanSwitchField e ramo visual de checkbox sem ícone                 | Removidos (Todo92); o MFJS usa diretamente o mesmo BooleanModelOption               |

### Lacunas encontradas e corrigidas durante a execução

1. O teste no Pro revelou que a montagem em Runtime ainda só repassava os quatro parâmetros antigos, perdendo o novo modo. Passou a ser vinculada a assinatura completa do método, com testes parametrizados de undefined/true/false usando o caminho real ProviderRuntime → arquivo → Registry; a cadeia inteira não é comprovada por mock de Facade.
2. A pré-visualização da recomendação não pode herdar a marcação antiga do modo fixo; a pré-visualização inteligente do Facade de Settings sobrescreve esse modo explicitamente, e o armazenamento oficial permanece inalterado.
3. Apenas focar e depois sair do nível sem alteração não pode criar uma cobertura pessoal; foi adicionado teste de regressão e evitado um onChange sem mudança.
4. Na primeira rodada de testes no Pro, o clear do WebDriver não disparou o evento de input do React; foi trocado por remoção real via teclado e depois se verificou que a entrada vazia de fato impede o salvamento. A validação de produção não foi afrouxada para fazer o teste passar.
5. A captura de tela em tela estreita do Todo92 revelou o título cortado após o foco; o diagnóstico e a correção estão naquele Todo.

### Evidências e limites de aceitação

- Testes unitários afetados, 24 arquivos, **317/317**: pacote completo de Provider, rascunho/edição/recomendação/estilos e os serviços reais de Runtime/Settings. Cobrem os principais ramos de M90-01 a 07, e não apenas callbacks de UI.
- `pnpm typecheck` aprovado; `pnpm lint` com 0 erros e 40 warnings já existentes; `git diff --check` aprovado. O knip do repositório ainda tem itens históricos de limpeza; toda a implementação comum nova tem chamada em produção; nenhuma limpeza de código alheio foi feita de passagem.
- Pro `desktop-e2e-20260908-105813-546`: SC90-01 e MP-UI-06 aprovados. O caso novo verifica de fato a adição de configuração fixa, rascunho inválido, cancelamento sem gravação, salvar e reabrir, editar após religar e preservar `enabled=false`; o caso antigo continua verificando edição, ordenação e o consumo de Model Selection.
- Pro `desktop-e2e-20260908-110410-575`: MP-UI-06 aprovado após adicionar as asserções de foco/título em tela estreita; as capturas nos dois temas e em PT/EN foram lidas, e pré-visualizações de tentativas anteriores não foram usadas como evidência.
- Os casos novos estão em `settings/manual-review/pending/provider-model-smart-config.test.ts` e não foram promovidos por conta própria. Membros de Account são cobertos pela fronteira de escrita compartilhada e pelos testes do pacote completo de Provider, com Electron escolhendo um Provider pessoal como representativo; não se faz a permutação de todas as marcas de conta.
- 390px é o viewport estreito do Electron e não se passa por validação real de controle remoto em celular; não foi executada UI real do Windows nem a interface de contas. Não foram alterados o roteamento do Host de destino, continuous/replayable, sessão ou seleção automática de conta, nem dados reais de usuário.
- Regressão ampliada final `desktop-e2e-20260908-110541-867`: 3 specs, **9/9** (SC90-01, UP-01, MPUI-01 a 06, entrada de correção de escrita do Todo89). Inclui a limpeza final de componente comum e a correção de tela estreita desta rodada; a evidência final de estilo/visual está no Todo92 §7.