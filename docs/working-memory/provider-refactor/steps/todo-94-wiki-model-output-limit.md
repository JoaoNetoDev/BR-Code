# Todo 94: Wiki remove a configuração manual de saída máxima e passa a usar uniformemente o Limit do modelo

> Atualização de atribuição de verificação (2026-09-09): as pendências de teste, falhas e promoções manuais restantes deste documento foram transferidas para [Todo102](todo-102-verification-debt-closeout.md), encerrando o cronograma de verificação independente previsto aqui; as evidências históricas são preservadas, e a transferência não significa que os testes passaram.

> Status: implementação, revisão, verificação local e E2E oficial do Electron no Pro concluídos; 2026-09-08. A reverificação em máquinas reais de celular/Windows continua pendente de liquidação. Evidências de execução em [Registro de execução e revisão 94–97](../research/todo94-97-execution-and-review.md).
> Confirmado pelo usuário: uso unificado do Limit do modelo; remoção do max output manual, do orçamento independente de Catalog/Page, da redução à metade do corpo de texto e da retentativa especial com orçamento ampliado após truncamento. Mantidas a detecção de truncamento e a retentativa de falha comum.
> Complemento de decisão de armazenamento de 2026-09-09: o usuário exigiu manter os campos antigos publicados para rollback prático; o salvamento normal preserva o valor original de maxOutputTokens do Wiki / Draft antigo, mas a nova versão não usa nem gera essa preferência. Ver [Todo104 §6.18](./todo-104-pre-release-schema-review.md) (m2, antigo Todo99). Este item está pendente de correção e nenhum código foi alterado; o registro de implementação original abaixo não indica que este complemento foi concluído.

## 1. Fatos atuais e problema

- `RepoWikiPane.tsx` oferece a escolha de orçamento de saída tanto no cartão ainda não gerado quanto na barra de ferramentas do Wiki existente; as opções são 16,384 / 32,768 / 65,536.
- `repoWikiStore.ts` armazena `maxOutputTokens` e o estado touched; os parâmetros compartilhados de Generate / RegenerateFailedPages e `generationOptions` também carregam esse valor.
- `repoWikiService.ts` usa o orçamento escolhido para o Catalog, e o Page usa metade dele; a atualização automática e a complementação de páginas com falha seguem as configurações antigas de geração.
- `repoWikiLimits.ts` tem outros orçamentos padrão de Catalog 16,384 / Page 8,192 e uma retentativa de resgate que aumenta o orçamento após o truncamento.
- `repoWikiProviderRegistryModelConfig.ts` já obtém `optionSpecs.maxOutputTokens.max` da configuração de modelo do Host de destino. Esse é o teto de `type: limit`, e não outro campo numérico chamado `limit`.
- Portanto, apenas remover os controles não atende à exigência: os valores salvos anteriormente e os orçamentos padrão em segundo plano ainda limitariam a requisição.

## 2. Decisão final

| Item | Decisão / plano |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| Entrada manual de orçamento de saída | Remover; comportamento idêntico nas entradas não gerada e de regeneração, compartilhado entre desktop e Web |
| Estado de orçamento de saída independente do Wiki | Deixará de ser mantido, enviado ou salvo; remover o touched correspondente, tipos, constantes, textos e helpers inúteis |
| Limite real da requisição | Usar o Limit da configuração atualmente vigente do modelo de destino; reaproveitar a validação unificada de Model e o Option Map, sem escrever campos de requisição do fornecedor manualmente |
| Orçamento fixo e metade para Catalog / Page | Remover; catálogo e corpo de texto usam diretamente o Limit do modelo, sem manter orçamento de saída privado do Wiki |
| Retentativa especial com aumento de orçamento após truncamento | Remover; não aumentar mais o orçamento nem conceder uma retentativa extra de resgate por orçamento; quando o Limit completo já foi usado, não há orçamento maior para aumentar |
| Detecção de truncamento da saída | Manter; ao atingir o limite, não salvar saída incompleta como conteúdo bem-sucedido |
| Retentativa de falha comum, timeout | Manter a semântica original, sem refazer o sistema de retentativas por causa deste item |
| Rodadas de ferramentas, orçamento de caracteres do código-fonte, limite de páginas do catálogo | Manter; não são configurações de saída máxima do modelo |

O limite representa o máximo permitido de saída, não exige que o modelo o preencha; um limite maior pode deixar uma resposta individual mais longa, portanto não se pode prometer que tempo e custo permanecerão totalmente iguais.

## 3. Fonte única de verdade e limite dos dados antigos

```text
Wiki 已解析的 ModelSelection + 目标 Host 模型配置
                       |
                       v
             本次请求的模型 Limit
                       |
                       v
           统一 Model 校验 / Option Map
                       |
                       v
                 供应商请求

旧 Wiki / Draft 的手动 maxOutputTokens -- 不再参与新请求
```

- Não gravar preferências do Wiki no Personal Provider Config, nem modificar a configuração de modelos do usuário, nem elevar o limite próprio do modelo.
- Wiki / Draft antigos continuam legíveis; orçamentos manuais históricos são ignorados, e a existência do campo antigo não faz o carregamento inteiro falhar. O salvamento normal deixa de gravar esse campo, não reescreve arquivos históricos em massa e não adiciona migração de versão de dados.
- Cobrem-se a primeira geração, a regeneração, a complementação de páginas com falha e a atualização automática ao final da tarefa; verificar se uma Selection antiga pode carregar essa opção, evitando que valores remanescentes voltem a ser uma sobrescrita por outro caminho.
- Durante a geração não se adiciona troca dinâmica de modelo nem sincronização remota forçada; reaproveitar o congelamento de modelo existente e as fronteiras de Host de destino e workspaceIdentity.
- Na implementação, confirmar primeiro se a entrada unificada de requisição já consegue usar o Limit quando faltam opções, e priorizar o reaproveitamento; é proibido adicionar um novo mecanismo de resolução de valores padrão de modelo apenas para remover a configuração do Wiki.

## 4. Superfície de impacto e ordem de execução

| Camada | Verificações e mudanças |
| --------------- | -------------------------------------------------------------------------------------------------- |
| UI / rascunho | RepoWikiPane, repoWikiStore; remover controles, estado, preenchimento e parâmetros de envio; limpar textos bilíngues e referências a IDs de teste exclusivos |
| Contrato compartilhado / armazenamento | shared/repo-wiki.ts, repoWikiStorage; remover o orçamento manual das novas requisições e novos registros, ignorando com segurança registros antigos |
| Serviço / requisição | repoWikiService, ModelClient, Generator, Catalog/Page Tool Agent, Limits; consolidar os parâmetros de sobrescrita e todos os caminhos de geração |
| Fronteiras preservadas | Seleção de modelo e Reasoning, idioma de geração/gráficos/timeout/repetição comum, isolamento do workspace, semântica de attachment de controle remoto e de fluxo de mensagens permanecem inalteradas |

1. Atualizar o contrato de orçamento em `docs/repo-wiki.md` conforme a decisão confirmada na seção 2, evitando contradição entre a especificação antiga e a nova.
2. Adicionar primeiro testes unitários e E2E de interação e só então remover a implementação; ao tocar em arquivos de teste já modificados, preservar as alterações de outros trabalhadores.
3. Limpar referências, atualizar os fatos correspondentes no diagrama de funcionalidades (se mudarem), revisar todas as entradas de geração e garantir que não reste nenhum teto padrão privado do Wiki.
4. Executar verificação de tipos, Lint, testes unitários relacionados e E2E no MacBook Pro, registrar o que passou e o que não foi verificado, e então fazer o commit.

## 5. Checklist de aceitação

- [x] O cartão ainda não gerado e a barra de ferramentas do Wiki existente não exibem mais a seleção de saída máxima; as outras configurações e ações de geração permanecem inalteradas.
- [x] Os limites reais de saída de Catalog, Page, requisições de ferramenta, fallback estático e compressão do final seguem a decisão final.
- [x] Validados os limites de requisição com diferentes limites de modelo, sem padrão de 16K, sem metade em Page e sem vazamento de orçamento salvo antigo; os campos da requisição à API continuam sendo determinados pelos respectivos Maps.
- [x] Removida a retentativa de resgate com aumento de orçamento e suas constantes, estados e parâmetros exclusivos; o truncamento não dispara chamadas adicionais de upgrade de orçamento.
- [x] Registros antigos com maxOutputTokens ainda podem ser visualizados, regenerados, complementados com páginas com falha e atualizados automaticamente; novos registros não persistem mais essa preferência.
- [x] O truncamento da saída do modelo ainda é julgado como incompleto; a retentativa de falha comum, parada, timeout e os limites de páginas/recursos de ferramentas não regridem.
- [ ] Layouts de desktop e Web mobile, os dois temas e os textos bilíngues não têm entradas residuais; as requisições remotas usam a configuração do Host de destino.
- [x] Registrar o commit de implementação, os comandos de verificação, os resultados dos testes, as conclusões da revisão e quaisquer itens aguardando decisão; o que não foi executado não pode ser marcado como concluído.