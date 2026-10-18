# Todo 92: Configuração inteligente e feedback de override pessoal no editor de modelo

> Decisão posterior sobre o feedback de cor de fundo (2026-09-11): o
> [Todo132](todo-132-model-option-feedback-and-provider-name-edit.md) refuerza localmente a diferença de
> cor de fundo entre opção selecionada/não selecionada de blocos, garantindo que também seja
> discernível no Hover; texto, ícone, tamanho e borda continuam indicando apenas a regra de override
> coberta. Este item está pendente de execução; os antigos critérios de aceitação de estilo abaixo são
> mantidos como histórico.

> Decisão posterior (2026-09-11): o
> [Todo130](todo-130-manual-model-config-editable-field-boundary.md) substituiu neste documento as
> regras de "desabilitar o toggle quando a recomendação não está pronta / congelar e validar
> integralmente a configuração manual": apenas desabilita durante o salvamento, o manual exige apenas
> os campos editáveis e os campos de sistema continuam sendo resolvidos. **O Todo130 está pendente de
> execução**; a implementação e os critérios de aceitação antigos abaixo são mantidos como histórico e
> não representam a semântica nova já implementada.

> Atualização de atribuição de verificação (2026-09-09): toda a dívida de teste restante, falhas e
> promoção manual deste documento foram transferidas unicamente para o
> [Todo102](todo-102-verification-debt-closeout.md), encerrando o agendamento de verificação
> independente neste documento; as evidências históricas são mantidas, e a transferência não significa
> que os testes passaram.

> Status: a solução final foi implementada; a aceitação conjunta Pro de 2026-09-08 está na seção 7.
> A antiga pré-visualização de grupos restaurados do Air não é a implementação final nem evidência de
> aceitação.
> O modo e a linha principal de salvamento estão no
> [Todo90](todo-90-model-add-edit-shared-recommended-draft.md). São duas aceitações conjuntas, sem
> duplicar a lógica de rascunho.

## 1. Decisão final (substitui o esquema intermediário deste ciclo)

| Item                   | Regra final                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Toggle inferior        | Mantido, com o nome alterado para "Configuração inteligente"; em inglês `Smart configuration`. Continua no lado esquerdo da mesma linha de ação salvar/cancelar |
| Descrição              | "Combina automaticamente as configurações recomendadas pelo ID do modelo, permitindo modificações individuais."; em inglês `Automatically match recommended settings by model ID, with individual overrides.` |
| Ligado                 | Combina pelo ID do modelo e herda as configurações recomendadas, permitindo override pessoal; exibe a borda de override pessoal |
| Desligado              | Preenche integralmente com o rascunho efetivo vigente no instante do desligamento; todos os campos de configuração são obrigatórios, sem combinação nem preenchimento por ID do modelo, e sem exibir a borda de override pessoal |
| Religar                | Limpa o override pessoal da configuração do modelo, restaura a recomendação pelo ID atual; novas edições posteriores ainda podem ser mantidas |
| Salvar                 | Troca de modo e edição de campo só alteram o rascunho; só persiste após sucesso do salvamento, cancelar descarta, falha mantém |
| Identidade/on-off      | A troca de modo não altera o ID do modelo, a ordem da lista de modelos nem `enabled`; ao adicionar, vale a regra de ativação da criação |
| Restaurar padrão global| Não adicionar; não substitui o toggle |
| Restauração de grupos  | Não adicionar; todo o texto "Personalizado · Restaurar recomendação", o botão de restauração do grupo e a marca de restauração são revertidos |
| Compatibilidade        | "Não seguir" não foi lançado; não se projeta migração/limpeza automática de dados antigos; campos existentes como `useRecommendedConfig` podem continuar sendo reutilizados e os campos persistidos não são renomeados só por mudança de texto |

"Obrigatório" significa configuração completa, não que todos os recursos estejam ligados. O booleano
`false` é um valor válido explícito e o `{}` válido de Mapping também vale; uma string vazia não pode
usar um valor herdado para completar a validação de configuração congelada.
Campos ocultos não podem ser perdidos: ao desligar, Audio, Tool Call etc. da configuração válida são
mantidos e não são apagados só porque a UI não tem controle de entrada.
Decisão adicional de texto em 2026-09-08: a dica de combinação é uniformizada como "Configuração
inteligente combinada", consistente com o nome do toggle "Configuração inteligente"; "推理参数 Mapping"
passa a "推理参数映射" e o erro de validação passa a usar "推理参数映射 inválido". Apenas o texto
exibido muda; campos de configuração, comportamento de combinação e de interação não mudam.

## 2. Borda, fundo e layout

### 2.1 Override pessoal

- A borda expressa apenas dois estados: sem override, borda neutra fina; com override, borda fina em
  tom de destaque suave. Espessura, tamanho e layout não mudam.
- O que é marcado é a origem da configuração pessoal, não "não salvo nesta sessão". Após salvar e
  reabrir a marca continua; ao remover o override, a marca é cancelada.
- Precisa ser derivado do rascunho pessoal atual, sem depender do sucesso da validação do formulário
  inteiro e sem introduzir um estado `highlighted` gravável.
- Um override explícito exatamente igual ao valor recomendado ainda é intenção pessoal; não se pode
  afirmar ausência de override apenas porque Effective é igual ao valor recomendado. Isso é coerente com
  a regra do Todo90 de preservar a intenção pessoal ao mudar o ID.
- Com a configuração inteligente desligada, não se exibe o estilo de override pessoal; não se acende
  junto todo o conjunto de campos obrigatórios.

| Controle                    | Escopo do feedback de override                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| Janela de contexto, saída máxima | cada campo de entrada é destacado individualmente, sem acender todo o container de tokens |
| Tipo de entrada, capacidades do modelo, MFJS | o botão de opção correspondente é destacado individualmente; um true recomendado alterado para false também precisa ser marcado |
| Nível de raciocínio         | values é um único item de configuração ordenado; alterar qualquer nome, adicionar, remover ou reordenar marca todos os quadros de nível reais juntos; não se acende apenas um nem o container externo, e o botão de adicionar não é um nível, portanto não é marcado junto |
| Mapping de parâmetros de raciocínio | campo de entrada destacado individualmente; alterar só o Mapping não marca o nível, e vice-versa |
| ID do modelo, itens travados | não fazem parte do feedback de override de configuração recomendada; preservam a semântica de identidade/somente leitura |

### 2.2 Hover e foco

- Hover e foco compartilham a mesma variação leve de fundo; não se distinguem mais pela borda e nenhum
  anel de foco adicional é criado.
- O Hover desaparece quando o mouse sai; o foco persiste até o foco deixar o controle. Quando ambos
  existem, não se soma um terceiro estilo mais forte.
- Os botões de opção continuam expressando ligado/desligado pela cor de fundo. O fundo interativo varia
  sobre a cor de fundo de cada estado, e o Hover no estado desligado não pode parecer ligado.
- Tab por teclado e foco de edição de texto precisam ser claramente discerníveis; remover o ring não
  pode equivaler a remover todo feedback de foco visível.
- Usar os tokens semânticos do DESIGN.md e validar temas claro e escuro. Não implementar com valores
  fixos de cor, alterando o tamanho dos controles ou sobrescrevendo globalmente o estilo de
  Button/Input.
- Escopo limitado aos controles compartilhados do editor de modelo; não espalhar as regras de foco
  deste ciclo para inputs de todo o site, outras configurações ou o Composer do chat.

### 2.3 MFJS e containers

- BooleanModelOption não decide mais um conjunto alternativo de estilo de controle com base em "ter ou
  não ícone".
- Com ícone, mostra ícone + texto; sem ícone, apenas texto; o ramo que desenhava automaticamente uma
  pequena checkbox na ausência de ícone e o CSS/testes correspondentes são removidos por completo.
- MFJS usa botões, seleção e feedback interativo consistentes com os das capacidades do modelo; sem
  ícone e sem checkbox inicial. O que é removido é a checkbox visual, não a semântica de acessibilidade
  como operação por teclado/aria-checked.
- Manter o contorno externo dos agrupamentos existentes; dentro do contorno de raciocínio continuam o
  editor de níveis e o campo de Mapping, removendo o título duplicado "Configurações de raciocínio".
- Configurações avançadas mantêm título e container próprio, hosting o MFJS; todos os containers
  externos mantêm borda neutra.

## 3. Estado e limites de commit

```text
添加 / 编辑初始化 -> 同一份个人草稿 + 智能配置模式
                         |
          +--------------+----------------+
          | 开启                          | 关闭
          v                               v
当前 Provider / ID 推荐解析         完整个人配置，不按 ID 匹配
推荐只用于继承/placeholder           改 ID 只改身份，字段不重填
个人覆盖 -> 各控件边框               不展示个人覆盖边框
          +---------------+---------------+
                          v
                    当前草稿展示
                保存 -> 验证并原子写入
                取消 -> 不写入
```

Antes de desligar, ainda é possível materializar o rascunho atual com os valores recomendados; após
desligar, qualquer campo vazio precisa gerar um problema de validação específico, sem preenchimento
silencioso por valor recomendado.
Desligar o modo invalida as respostas de recomendação em trânsito e não permite que resultados
atrasados sobrescrevam o rascunho congelado; religar só aceita respostas do Provider/ID/geração de
edição atuais.
O modo desligado não precisa esperar a requisição de nome recomendado ter sucesso para salvar, mas as
validações de identidade, permissão de membro, ID duplicado, versão e completude não podem ser omitidas.
Manter a resolução de membros, credenciais, permissões e protocolo de requisição de Provider/Account:
o que se proíbe é a combinação significar recomendação de configuração de modelo e não o contorno
desses limites de execução.

## 4. Impact Brief e divisão de responsabilidades

| Entrada                | Componente/owner de rascunho compartilhado                                             | Recomendação e validação                          | Commit/autoridade                                                                                 | Cliente e isolamento                                    |
| ---------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Adicionar modelo       | ProviderModelsSection → ProviderModelMetadataDialog, lógica de rascunho comum do Todo90 | modo inteligente pela recomendação do Host, validação de completude no modo fixo | addPersonalModel → Settings Facade/ConfigService → Personal Config | mesmo componente em Desktop/Web, alvo Environment |
| Editar modelo pessoal  | ModelRowInput → mesmo diálogo/regras de rascunho                                       | o mesmo, permitindo mudar o ID, com proteção de conflito de versão | savePersonalModelDraft, atualização/renomeação atômica           | não modifica outros modelos                            |
| Editar modelo herdado  | mesmo diálogo, ID somente leitura                                                      | o mesmo, preservando permissão de membro de Account/Modelo | mesma entrada de atualização de configuração                | não altera os direitos da conta nem o modo de conexão                       |

| Nível de relação      | Checkpoint e evidência                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| must-inspect          | combinações de default/hover/focus/override de Dialog, MetadataFields, ModalityOptions, ReasoningLevelEditor, SettingsGroups |
| must-inspect          | ProviderModelMetadata, ProviderFormControls, ProviderCardSections, useModelConfigResolution; fechamento de rascunho, modo e resposta atrasada do Todo90 |
| should-inspect        | validação de serviço e resolução final no modo fixo, sem a UI mostrar fixo e o salvamento/execução ainda completarem por recomendação |
| invariant-only        | enabled, capacidades ocultas, Provider/Account/Selection/Session, Desktop continuous / Web replayable inalterados                    |
| evidence-only         | testes unitários de componentes, conversão de rascunho, validação do Host e isolamento do Electron, sem requisições reais de modelo |

O codegraph não fornece ferramenta chamável; a profundidade 2 foi verificada pelos imports/callers
diretos a partir dos seeds existentes de surface.provider-settings.
Sem novo owner de surface/persistência, o grafo apenas atualiza o documento de origem. Sem novo graph
drift; as dangling edges já existentes em todo o grafo não estão no escopo deste item.
O Todo90 é a linha principal única de comportamento de modo/salvamento/simplificação de código, e
este item é a linha principal única de interação e estilo. Primeiro implementar o rascunho unificado do
Todo90, depois aplicar os estilos derivados deste item e, por último, fazer a aceitação conjunta.

## 5. Plano de aceitação

Todos os cases antigos de restauração de grupo do G92 são anulados e suas asserções de produto não
são portadas; os F92 abaixo são os novos identificadores estáveis.

| ID     | Pré-condição/operação                                          | Asserções obrigatórias                                                                  | Evidência/status                                     |
| ------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| F92-01 | configuração inteligente ligada, alterando valor/capacidade/tipo de entrada/MFJS | só a borda de override do controle correspondente muda; capacidade desligada também tem feedback de override; tamanho inalterado | accepted; componente/rascunho + Electron pendente |
| F92-02 | alterar nome, quantidade e ordem dos níveis; testar também alterar só o Mapping | todos os quadros de nível reais são marcados juntos; Mapping independente; contorno externo neutro | accepted; teste unitário parametrizado + Electron pendente |
| F92-03 | entrar/sair do Hover, foco por Tab, mouse sai mas o foco permanece | mesma cor de fundo interativa, sem novo ring/salto de borda; diferença de fundo do toggle preservada | accepted; DOM/estilo real + revisão manual |
| F92-04 | MFJS sem ícone e opções de capacidade com ícone                 | estilo de botão compartilhado, sem checkbox inicial; teclado e estado aria utilizáveis     | accepted; componente + Electron                      |
| F92-05 | desligar configuração inteligente, esvaziar um campo obrigatório/mudar o ID | todos os campos explicitamente preenchidos e sem marca de override; campo vazio impede salvar, sem preenchimento por combinação; false/{} válido permitido | accepted; validação conjunta com M90-02/05 |
| F92-06 | desligar e religar, depois editar e salvar; ou cancelar         | ligar limpa overrides antigos mas preserva novas edições posteriores; cancelar não escreve; enabled/ID/ordem inalterados | accepted; validação conjunta com M90-03 |
| F92-07 | salvar e reabrir com o inteligente ligado; entrada temporariamente inválida | a origem do override continua visível; valor/Mapping inválido não pode apagar outras marcas de modificação | accepted; componente + E2E de leitura em disco |
| F92-08 | chinês/inglês, temas claro/escuro, 390px                        | o toggle quebra linha no mesmo footer, rótulo/interação não estouram, foco discernível   | accepted; visual do Air + Electron isolado           |

A cobertura segue combinações de alto risco e cases representativos, sem enumerar todas as marcas de
Provider ou protocolos de requisição. Sem requisições de modelo e sem arquivos de conta reais;
validação de salvamento em Electron isolado no Mac, e a visão estreita do celular não se faz passar
por validação do enlace de controle remoto.
Novos E2E vão para settings/manual-review/pending depois que a semântica for implementada e são
promovidos após confirmação manual; os testes da antiga pré-visualização não contam como aprovados.

## 6. Registro de limpeza dos experimentos anteriores (histórico; não representa a implementação final abaixo)

- Revertida a UI de restauração de grupo não commitada neste ciclo, o helper `resetGroupsValue`/de
  conversão de grupos, os testes unitários direcionados e o E2E pending, e o texto experimental
  Custom/Restore de recomendação.
- Revertido também o ajuste experimental de MFJS/container, para não manter metade do design final; a
  remoção final de checkbox/título continua listada como pendente de implementação, sem perder o
  requisito.
- Mantidos os campos/lógica subjacentes de configuração inteligente já commitados; sem reverter o
  Todo89 nem o commit do texto de dica de recomendação.
- Pré-visualizações antigas local/Air removidas da posição de trabalho e o processo de pré-visualização
  independente foi encerrado; apenas caminhos exatos deste ciclo foram tratados, sem modificar a versão
  instalada, dados de conta ou alterações de outras tarefas.
- Aqui são apenas registrados texto, limpeza e linha de base de verificação; é proibido marcar o
  Todo90/Todo92 como implementação concluída.

Verificação após a limpeza: `packages/ui` e o escopo de E2E desktop desta rodada sem diferenças em
relação ao HEAD; 43 casos aprovados somados aos dois arquivos de teste unitário relacionados já
existentes, `pnpm typecheck` aprovado, `pnpm lint` com 0 errors / 40 warnings já existentes. YAML do
grafo, IDs únicos, documento de origem da página de configurações e verificação dos caminhos de seed de
código aprovados, com edges inalterados; não foi reexecutado o E2E desktop completo nem se afirma que a
nova solução passou.
Locais preservados das pré-visualizações antigas: local `/tmp/zcode-retired-group-preview.6IUa9h`;
Air `/Users/dev/.Trash/zcode-model-group-preview.oRYZZn`. Ambos não estão mais em posições de trabalho
ativas e podem ser restaurados; não servem como entrada de inicialização da nova versão.

## 7. Implementação final e aceitação conjunta de 2026-09-08

| Escopo                      | Implementação e evidência                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Origem do override F92-01/07 | derivada da intenção pessoal do rascunho comum; valores e Map leem cada entrada bruta, booleanos e modalidades preservam a fonte explícita e não dependem da validação da tabela inteira; campo inválido não limpa as outras marcas. Funções puras/testes unitários de componentes e leitura em disco do SC90-01 aprovados |
| F92-02 Nível/Mapping         | todos os chips reais marcados simultaneamente, Mapping marcado à parte, contorno externo neutro; o botão de adicionar não acompanha. Apenas visualizar os níveis não cria override. Ordenação por teclado, edição, adição/remoção e arrastar cobertos por teste unitário; MP-UI-06 cobre reordenação por teclado e reabertura após salvar |
| F92-03 Hover/foco            | modelEditorControlStyle serve apenas a este diálogo; a borda reflete somente o override e hover/focus-visible usam o mesmo fundo, preservando a base de selecionado/não selecionado. O Pro validou em MFJS a consistência de fundo ao entrar/sair de fato e ao sair com o mouse após foco por teclado, sem salto de borda; aprovação nos dois temas |
| F92-04 MFJS                 | remoção do ramo de checkbox automático sem ícone e do wrapper BooleanSwitchField; reaproveitamento direto do BooleanModelOption, preservando role/aria-checked, sem ícone/checkbox inicial |
| F92-05/06 Modo              | compartilhado com o Todo90 o modo, a completude e o fluxo cancelar/salvar; o toggle de configuração inteligente fica no footer e o estado fixo oculta todo o feedback de override; nenhum novo agrupamento ou reset global foi adicionado |
| F92-08 Layout               | removido o título duplicado de raciocínio, mantidos o título de configurações avançadas e os dois agrupamentos; Pro validou 390px nos dois temas e nos dois idiomas, os limites dos controles, o foco, o título e o footer. Electron com visão estreita não equivale a celular real por controle remoto |

Problemas reais encontrados na revisão por screenshot: em tela estreita, após trocar de chinês para
inglês, o `overflow-hidden` original do Dialog permitia que o foco rolasse o contorno externo,
observando-se scrollTop=29.5 e o topo do título cortado; trocar o elemento do corpo não resolveu. Por
fim, o contorno externo passou a usar `overflow-clip`, que apenas recorta, e o corpo continuou sendo a
única área de rolagem. O problema não foi mascarado com reset de scrollTop, timeout ou estado de foco
adicional. Foram adicionadas asserções reais de DOM de visibilidade do título e de ausência de
rolagem do contorno; `desktop-e2e-20260908-110410-575` aprovado e os screenshots dos dois temas foram
lidos.

Regressão final conjunta: Pro `desktop-e2e-20260908-110541-867`, 3 specs **9/9**:

- Novo pending `provider-model-smart-config.test.ts`: SC90-01.
- Existente `settings-ui-polish.test.ts`: UP-01, MP-UI-01～06 (7 itens, excluindo os itens de remote
  que exigem explicitamente SSH).
- Existente pending `provider-settings-write-recovery.test.ts`: entrada de recuperação e preservação do
  rascunho quando a adição falha.

Artefatos: Pro `/Users/dev/zcode-todo93-e2e.88xgST/packages/desktop/.e2e-artifacts/`, o summary das
execuções acima; `todo90-92/model-editor-{dark,light}-390.png` como evidência visual final. 317 testes
unitários relacionados e typecheck/lint da raiz aprovados (lint com 40 warnings já existentes). Não
foram alterados o estilo global dos componentes Button/Input compartilhados, a configuração real do
usuário, o protocolo de conta/Selection/sessão/remote; não se afirma que Windows, o enlace de celular
real ou o arranjo de contas de todas as marcas foram testados. Os novos E2E permanecem pending, sem
substituir a promoção manual do usuário.