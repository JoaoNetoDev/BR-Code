# Todo 131: Posição da configuração inteligente na página de configurações de modelos e botão "Restaurar"

> Decisão posterior de 2026-09-12: [Todo134](todo-134-model-editor-basic-advanced-draft.md) devolve a configuração inteligente ao canto inferior esquerdo fixo e transforma a restauração em um botão outline, colocado à esquerda de Salvar. A semântica de restauração e as proteções assíncronas deste documento são mantidas; o layout antigo não se aplica mais.

> Em execução em 2026-09-11: reaproveita a limpeza de campos do Todo130. O pedido de restauração usa a identidade de requisição/geração do Hook de recomendação já existente e acrescenta a validação da intenção de edição do rascunho atual; em caso de sucesso, a recomendação e o rascunho são aplicados de uma só vez, e em caso de falha o rascunho original fica intacto. Fechar, editar novamente e iniciar o salvamento invalidam a intenção de restauração antiga. Não se cria um segundo cache de recomendações; layout validado no mesmo lote do Todo125.

> Status: **implementação de produto, validação parcial e review concluídos; aceitação final do lote inteiro ainda pendente**. O Goal de 2026-09-11 autorizou a implementação.
>
> Nome final: **Restaurar**. Não é "Redefinir", "Restaurar recomendação" nem "Restaurar recomendação e salvar". Modifica apenas o rascunho atual, valendo após o salvamento; também pode ser acionado com ID vazio, sendo desabilitado somente durante o salvamento.
>
> Relacionados: [Todo125 文案 de ajuda e texto final](./todo-125-model-settings-help-copy.md)、[Todo130 Limite de campos de configuração manual](./todo-130-manual-model-config-editable-field-boundary.md)。Este Todo é responsável pelo layout e pela ação de restauração; reaproveita a atribuição de campos e a conversão de modo do Todo130, sem redefinir configuração de sistema/pessoal. Substitui a disposição anterior que colocava a configuração inteligente no rodapé; o texto de ajuda e a interação do ponto de interrogação do Todo125 continuam válidos.

## 1. Contexto e decisão final

O usuário desejava adicionar capacidade de redefinição à página de configuração de modelos. Após a discussão, definiu-se:

- Não salvar diretamente. A página atual tem Salvar/Cancelar; persistir de imediato na restauração causaria a impressão de que nem o Cancelar poderia desfazer, além de misturar modificações de ID de modelo ainda não salvas.
- Mover a configuração inteligente para o contêiner onde fica o ID do modelo; encurtar o campo de ID do modelo e colocar a configuração inteligente à direita, com a ajuda do ponto de interrogação acompanhando o título.
- O canto inferior esquerdo liberado recebe o botão Restaurar; Salvar e Cancelar continuam à direita.
- O usuário nomeou o botão de "Restaurar"; o significado continua sendo restaurar a recomendação inteligente do modelo atual e ativar a configuração inteligente, e não restaurar o valor já salvo no momento em que o diálogo foi aberto.
- O usuário rejeitou explicitamente "desabilitar Restaurar quando o ID estiver vazio". Um ID vazio também limpa as sobrescritas editáveis e ativa a configuração inteligente, mas não dispara requisição de recomendação com ID vazio; depois que o ID for preenchido, a correspondência segue o fluxo original.

Esta rodada apenas registra em disco, sem implementar automaticamente os Todos relacionados e sem modificar arquivos de configuração ou documentos oficiais de fatos.

## 2. Primeira camada: layout da página

Desktop/tela larga:

```text
┌─────────────────────────────────────────┐
│ 模型 ID                  智能配置 ?     │
│ [ GLM-5.3             ]       [开关]    │
└─────────────────────────────────────────┘

……现有模型配置分组……

[恢复]                         [保存] [取消]
```

- O campo de ID do modelo continua ocupando a maior parte da largura; a área da configuração inteligente à direita mantém largura estável, sem tirar o switch desse contêiner.
- IDs longos permitem rolagem horizontal dentro do campo; o valor real não é truncado nem abreviado; não se define um novo limite de comprimento de ID para o layout.
- Em tela estreita de celular, o arranjo dentro do contêiner passa a ser vertical, evitando que o campo seja comprimido; os botões do rodapé podem manter a quebra responsiva em linhas, garantindo usabilidade de textos traduzidos longos e de toque.
- O ID de um modelo herdado é somente leitura, mas a configuração inteligente continua alternável; durante o salvamento mantém-se o bloqueio do corpo e o switch desabilitado.
- O ponto de interrogação acompanha o título "智能配置", reaproveitando o Todo125; não se adiciona um novo ponto de interrogação ao ID do modelo por ele estar dentro do contêiner do ID.
- A restauração usa o botão de estilo fraco existente; Salvar continua sendo o botão principal; a ordem de Salvar/Cancelar é preservada, sem alterar outros agrupamentos de campos, rolagem do diálogo, regras de foco ou hierarquia visual.
- O switch de configuração inteligente permanece sempre visível conforme o Todo130 e só é desabilitado durante saving, sem sobrar um segundo switch no rodapé.

## 3. Segunda camada: ação de restauração

### 3.1 O que é restaurado

- Limpa as sobrescritas pessoais dos campos editáveis do modelo atual, incluindo tanto as sobrescritas já salvas representadas neste rascunho quanto as edições ainda não salvas nesta rodada.
- Ativa a configuração inteligente e restaura a recomendação conforme o ID de modelo atual, o Provider atual e a configuração de integração atual; quando a configuração inteligente já estava ativa, também é possível limpar de uma vez todas as sobrescritas.
- Preserva o ID de modelo atualmente digitado, sem voltar ao ID do momento em que o diálogo foi aberto; preserva o Provider pertencente, a ativação/desativação do modelo, os membros e a ordenação.
- Os campos de sistema continuam sendo resolvidos pelo sistema conforme o Todo130, sem cópia para a configuração pessoal, sem congelar mapeamentos ocultos e sem novo editor de itens ocultos.
- Não restaura outros modelos, não modifica a API Key, a Base URL ou a configuração de conexão do Provider e não chama a redefinição de todo o Provider.
- Não chama a interface de salvamento no clique; também não persiste por oportunidade o renomeado atual.

### 3.2 Relação com Salvar/Cancelar

```text
点击恢复
    |
当前草稿清除可编辑覆盖 + 开启智能配置
    |
    +--> 保存：按现有校验、revision 与原子提交正式生效
    |
    `--> 取消：丢弃本次草稿，保留之前已保存的配置
```

Não se adiciona diálogo de confirmação nem entrada de salvamento direto. Campos editados após a restauração continuam sendo novas sobrescritas pessoais, e o salvamento final não pode mais limpar incondicionalmente as edições subsequentes com base na marca de "já restaurado".

### 3.3 ID vazio, falha de resolução e concorrência

| Condição                  | Comportamento                                                                  |
| ---------------------- | --------------------------------------------------------------------- |
| ID vazio                | A restauração pode ser clicada; limpa sobrescritas, ativa o inteligente, mantém o ID vazio; não requisita identidade vazia; após preencher o ID a correspondência funciona normalmente |
| Identidade atual já tem recomendação válida | Podem ser reutilizados resultados que ainda se aplicam ao Provider/modelo/ambiente de integração atual, projetando imediatamente no rascunho |
| É preciso resolver novamente | Não desabilitar a restauração por estar resolvendo; aplicar apenas resultados que pertencem à identidade atual e a esta intenção de restauração |
| Falha de resolução       | Manter o rascunho anterior à restauração, sinalizar a falha na área de feedback já existente, sem limpar antes e deixar o usuário arcar com a perda |
| Resolução normal, mas a própria recomendação tem lacunas | Mostrar apenas a recomendação efetivamente obtida, mantendo o feedback real de lacunas e a validação de salvamento, sem inventar uma configuração completa |
| Salvando                 | Restauração desabilitada; o clique não pode alterar o rascunho cuja submissão está em andamento |

Além de saving, não se adiciona condição de desabilitação por ID vazio, por já estar no modo inteligente, por não haver sobrescritas ou por estar em uma requisição de recomendação.

Quando for necessária resolução assíncrona, manter a atomicidade da ação: o rascunho é preservado antes da resolução e, em caso de sucesso com identidade/geração de edição ainda correspondente, tudo é aplicado de uma vez; a falha não destrói a edição atual. Se, durante a espera, o usuário mudar o ID, os campos, o modo, o Provider, fechar o diálogo ou restaurar novamente, resultados/erros antigos não podem sobrescrever a nova intenção; uma restauração não concluída antes do início do salvamento também não pode alterar o rascunho de repente durante o salvamento. Preferir reaproveitar o mecanismo existente de geração de edição/identidade de requisição, sem adicionar atraso fixo, segundo cache de recomendações ou serviço de estado separado.

## 4. Terceira camada: limites de implementação

| Local                                                      | Finalidade da modificação ou verificação                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `ProviderModelMetadataDialog.tsx`                         | Mover a configuração inteligente para a direita do contêiner do ID; alterar o leadingAction do rodapé para restauração; manter responsividade, ID somente leitura e bloqueio durante o salvamento |
| `ProviderModelMetadataDialogActions.tsx`                  | Reaproveitar o Switch e a área de ações existentes, conectando a ação de restauração e a desabilitação por saving; não alterar a ordem comum de ações de outras páginas |
| `useProviderModelDraft.ts` / `ProviderModelDraftState.ts` | Fornecer uma ação de rascunho explícita para a restauração, reaproveitando a limpeza e a projeção de campos usadas ao ativar a configuração inteligente, cobrindo o caso em que o modo atual já é o inteligente |
| `ProviderFormControls.tsx` / `ProviderCardSections.tsx`   | Edição e adição de integração compartilham a mesma entrada de restauração; preservar as permissões de identidade, a exibição de erros, a revision e a transação de salvamento de cada uma |
| i18n e componentes de ajuda já existentes                  | O botão em chinês é literalmente "恢复"; o inglês traduz o mesmo significado; a descrição da configuração inteligente segue o texto final do Todo125 |

Os caminhos são relativos a `packages/ui/src/settings/model-provider-section/`, exceto i18n/componentes comuns. A implementação escolhe as
mudanças necessárias conforme as referências reais; não é exigido modificar cada arquivo e não se deve refatorar todos os
SettingsFormActions por causa disso.

Não se pode considerar a restauração implementada apenas chamando `onChange(true)`: quando o modo atual já está ativo, uma mudança de
modo comum pode não limpar as sobrescritas. É preciso expressar explicitamente a intenção de restauração, sem criar um segundo
conjunto de campos ou schema; o contrato de campos editáveis, a remoção de campos ocultos e o salvamento de modo reaproveitam
uniformemente o Todo130.

Não são adicionados schema, campos persistidos, arquivos, tabelas de dados ou protocolos; as correções de semântica de baixo nível
de que o Todo130 precisa ficam a seu cargo. Este Todo pode ser implementado no mesmo lote do Todo130, mas não pode ser montado sobre
a antiga base de "configuração inteira congelada" para criar um terceiro modo de restauração.

## 5. Verificação e ordem de implementação

Primeiro conferir a interface e os limites de campos do Todo130, acrescentar testes de rascunho/componente e só então conectar layout e
ação;Interações com o APP exigem E2E da página de configurações, registrando os fatos reais de leitura e escrita da configuração
antes e depois do salvamento.

| Case    | Cenário                                                         | Asserção obrigatória                                                                              |
| ------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| R121-01 | Tela larga, tela estreita, ID longo, tradução longa, ID herdado somente leitura | Switch apenas no contêiner do ID, ponto de interrogação na posição certa; restauração no canto inferior esquerdo, Salvar/Cancelar mantidos; sem valores truncados nem controles inacessíveis |
| R121-02 | Sobrescritas em modo inteligente e clique em Restaurar        | Sobrescritas limpas, inteligente continua ativo; sem escrita imediata; não depende do switch ir de false para true |
| R121-03 | Restaurar na configuração manual                            | Editáveis voltam à recomendação e o inteligente ativa; ID/Provider/enabled preservados; campos de sistema não congelados |
| R121-04 | Restaurar com ID vazio e depois preencher o ID               | Botão disponível, limpa sobrescritas e ativa o inteligente, sem enviar requisição de ID vazio; após preencher, corresponde à identidade atual |
| R121-05 | Restaurar→editar→salvar; restaurar→cancelar; falha ao salvar | Novas edições preservadas, cancelar não grava em disco, falha preserva o rascunho; o botão em si não submete |
| R121-06 | A muda para B e restaura, B lento/com falha                  | Não usa a recomendação de A; a falha não limpa o rascunho original; feedback de erro claro |
| R121-07 | Restauração em andamento, continuar editando/trocar modo/Provider/fechar/restaurar de novo/iniciar salvamento | Sucessos e falhas antigos não sobrescrevem a nova geração; sem escrita duplicada nem mutação do rascunho durante o salvamento |
| R121-08 | saving=true / recomendação pending / sem sobrescritas        | Só saving desabilita; o restante permite restaurar, sem limite inválido adicional |

- Rascunho e modo são validados com Hooks reais/funções puras; a interação é validada por cliques em DOM/E2E, não apenas por conferir
  strings de layout estático.
- Para Salvar/Cancelar, verificar pelo menos o número de chamadas e a saída real do Repository; antes e depois da restauração, sem
  salvar, o disco não muda, e o salvamento posterior à restauração preserva a ativação independente.
- Mudanças de UI seguem DESIGN.md, os dois temas e a internacionalização; o comportamento das entradas de configurações existentes é
  consistente entre desktop e celular, preservando shared-host e sem alterar o fluxo de mensagens continuous/replayable.
- Seguir o processo do repositório: escrever testes primeiro, depois implementar, executando arquitetura, typecheck, lint, testes
  unitários relevantes e E2E necessários; novos E2E são gerenciados pelo lifecycle, e sem execução não se escreve que passaram.
- A verificação de baseline desta rodada ainda indica que o staging local está 5 commits atrás do origin/staging; apenas registra-se o
  documento, sem fazer merge automático do remoto. Antes da implementação, realinhar e conferir o código, em especial se o
  Todo125/130 já foi aplicado.

## 6. Entrega atual e trabalho restante

Implementado: a configuração inteligente à direita da linha do ID e em linha própria na tela estreita; a restauração no canto
inferior esquerdo. Adição e edição reaproveitam a mesma ação de rascunho e a limpeza de campos do Todo130; preservam ID, enabled e
configuração oculta, com projeção do conjunto somente após a restauração bem-sucedida. Nenhum campo persistido, protocolo, cache de
recomendação ou entrada de salvamento foi adicionado.

Revisão parcial: a intenção antiga de restauração é invalidada antes do salvamento; o Hook de recomendação original verifica
simultaneamente identidade/geração da requisição, e nem sucessos nem erros antigos podem sobrescrever o novo rascunho. Com ID
vazio apenas o rascunho é limpo, sem requisição; quando já está em modo inteligente, as sobrescritas também são limpas. A falha
preserva a edição original; a entrada de ajuda e a restauração não se acionam mutuamente.

Testes primeiro em vermelho (faltava o botão de restauração); após a implementação, Hook real + navegador do diálogo cobrem a
restauração atômica, a falha, edição/modo/Provider/fechamento/nova restauração/início do salvamento/mudança de ID, incluindo ID
vazio sem requisição, restauração sem escrita e preservação do rascunho em falha de salvamento. 390 em chinês claro e 1200 em
inglês escuro passaram; 60 testes unitários relevantes passaram. typecheck da raiz (incluindo E2E do Electron), lint com 0 errors/41
warnings, arquitetura com 0 violations.

O Electron `provider-model-smart-config` passou a ter asserções reais de Repository para disco inalterado ao cancelar uma
restauração, editar e salvar depois de restaurar e preservar enabled independente, junto com a atualização dos dois casos de
configurações afetados. **Este grupo não foi executado de fato no Electron**; a aceitação real de interação com arquivos fica para a
execução do Goal em lote, sem substituir por rota de navegador isolada; a ida e volta manual/inteligente em arquivo real do Todo130
já passou por outro caminho.