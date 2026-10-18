# Implementação da migração de Provider

> Status: manutenção contínua
>
> Última atualização: 2026-09-09

## Entrada de execução atual

- [Todo159: unificação do orçamento de saída do teste de conexão em 512 Token](todo-159-connectivity-512-token-budget.md): a executar, valor-alvo já confirmado. O OpenCode Go Luna da Air rejeita `max_output_tokens=1`; o servidor exige no mínimo 16; apenas a requisição de controle alterada para 16 teve sucesso. Unificar o orçamento do teste de conexão em 512, substituindo a decisão de 1 Token do Todo144, preservando o nível mínimo de raciocínio, o Prompt, o fim do stream e o contrato de erro; este ciclo apenas registra o Todo, os 512 e o aceite do App após a modificação permanecem pendentes.

- [Todo158: acesso total na caixa de diálogo de aprovação de permissão e sincronização de permissões da fila pendente](todo-158-permission-dialog-full-access-and-queued-mode.md): implementado, o aceite ainda não foi totalmente fechado. Apenas a caixa de diálogo de aprovação sincroniza a tarefa atual, o Composer e a fila pendente fixa para yolo, cada Plan mantém o seu; inclui transação, idempotência e recuperação de projeção. As falhas de baseline da verificação necessária, os itens não verificados entre plataformas estão na seção 9 do Todo.

- [Todo157: entrada de pacotes de fabricante, preenchimento de modelos Go e consolidação do Access manual por Key](todo-157-provider-plan-catalog-and-manual-access-cleanup.md): a executar, novos fabricantes permanecem em estado de candidato. Completar as entradas de pacotes existentes e os itens faltantes nos três catálogos Go; remover o Access especial de pacotes manuais, cancelar sua admissão na verificação de segurança de domínios de proxy, e fazer o emblema visual ser identificado pela identidade do template. Este ciclo apenas organiza o Todo e o índice; o código e a configuração do produto não foram modificados.

- [Todo156: correções posteriores do Start com Provider independente e decisões finais de página](todo-156-start-plan-followup-final-decisions.md): **implementado e auto-revisado, o usuário pediu commit e push; o registro de falhas de baseline é preservado**. O Start é permanente e reutiliza os estilos de estado de página originais; limpeza dos gates de conexão redundantes, adição dos parâmetros de acesso de saldo, preservação do fluxo de resgate com o uso de “Ver pacotes”; o dropdown pago casa diretamente com a seleção de conexão e o aviso de sessão anota o tipo de pacote. Completa a primeira recomendação da tela secundária e unifica o saldo compartilhado de recomendação, a atualização sob demanda e a validade de 60 segundos. A governança específica da construção de dados de equipe foi adiada, o cartão de cota de múltiplas instâncias mantém o baseline; substitui o escopo inicial do Todo155, evidências de Pro admin SSH E2E e revisão completa na §14 deste item.

- [Todo155: limpeza de dependências de conexão do Start e identificação de pacote na troca de modelo](todo-155-start-plan-selection-dependency-cleanup.md): lista inicial de problemas, o histórico da investigação é preservado; o escopo final é substituído pelo [Todo156](todo-156-start-plan-followup-final-decisions.md), que deixa de ser a entrada de implementação.

- [Todo154: Start com Provider independente e recomendação de pacotes na experiência de envio](todo-154-start-plan-independent-provider.md): **implementado e revisado, E2E do Pro passou**. O Start dispensa conexão, mantém ID/ícone de marca, `current` próprio e seleção de modelo; não migra dados, e no envio/criação recomenda o mesmo modelo Start com cota e compatível com raciocínio. Subagent com salvamento explícito é incluído, execução imediata, Bot e execução em segundo plano são excluídos; não se sugere mais que valha entre entradas/reinício/ao telefone do mesmo Host. O plano final e a verificação estão na §8 deste item, a investigação anterior à implementação vai para research, e o comportamento estável foi sincronizado para a especificação oficial do Start.

- [Todo153: mapeamento de exibição de níveis de raciocínio e alinhamento da ordem de configuração](todo-153-thought-level-display-mapping.md): implementado; texto de desligamento unificado, `minimal` independente como “Muito baixo / Minimal”, novo “Extremo / Ultra”, `extra-high`/`extra_high` preservados, remoção da forçar classificação de apelidos ambíguos e respeito à ordem de configuração. 192 testes unitários, oito grupos de interação de navegador e verificações de tipo/lint/arquitetura passaram; o nativo completo/controle remoto por celular não foi reexecutado, sem alterar valores originais nem mapeamento de requisição.

- [Todo147: simplificação do Builtin Config e ajuste do baseline padrão](todo-147-builtin-config-simplification-feedback.md): coletando feedback continuamente, ainda não implementado; já confirmados correspondência simples de prefixo/sufixo, regras específicas pospostas, remoção de duas regras especiais de Model, e o limite genérico de context/output ajustado para 1000000 / 128000. Este ciclo apenas registra em disco.

- [Todo143: alinhamento das cores das caixas de seleção de modelo de configuração com os componentes do sistema](todo-143-model-checkbox-system-colors.md): implementado e re-revisado; navegador 6/6, testes unitários 51/51, verificações de tipo/lint/arquitetura passaram. Apenas as cores das caixas de seleção foram corrigidas, preservando o destaque de sobrescrita externo, os gráficos e a interação; o nativo em dispositivo real não foi reexecutado.

- Todo142: exceção de verificação segura de requisição para a versão oficial na requisição de Start/período ocioso (documento mantém apenas a versão oficial): implementado e com verificação local/revisão concluídas; a autenticação JWT/Ticket é preservada, 189 regressões e verificações de tipo/lint/arquitetura passaram; o teste em dispositivo real não foi reexecutado.

- [Todo141: layout do diálogo de edição de modelo e alinhamento da experiência de configuração avançada](todo-141-model-editor-product-ux-alignment.md): **concluído**; implementado após nova autorização em 2026-09-12 e revisado item a item, navegador 26/26, testes unitários relacionados 51/51, verificações de tipo/lint/arquitetura passaram; o nativo em dispositivo real não foi reexecutado, preservando o rascunho e as fronteiras de validação do Todo134.

- [Todo140: atualização da lista de modelos de período ocioso e das capacidades visuais/de busca](todo-140-offpeak-model-catalog-and-capabilities.md): implementado e com verificação local/revisão concluídas; das duas empresas restam apenas GLM-5.3/Flash, ambas sem busca embutida, 5.3 sem visão; revisão 25 não publicada.

- [Todo139: importação de compartilhamento reutilizando a inicialização de modelo e modo de uma nova tarefa comum](todo-139-share-import-new-task-selection.md): implementado, testes unitários locais/navegador e revisão concluídos; o aceite conjunto completo servidor de compartilhamento→primeiro RPC nativo ainda está pendente, sem alegar conclusão de todo o aceite.

- Todo136: ajuste de admissão da verificação segura de requisição da versão oficial (documento mantém apenas a versão oficial): implementado; as falhas de JWT e a admissão incorreta em Start/período ocioso foram corrigidas pelo Todo142.

- [Todo135: restauração dos Headers padrão da requisição de modelo e atribuição do OpenRouter](todo-135-model-default-headers-and-openrouter-attribution.md): implementação e verificação local concluídas; as restrições da verificação real em múltiplas plataformas estão no corpo do texto.

- [Todo138: rascunho de modelo vazio e fallback de nível de raciocínio na camada Model](./todo-138-reasoning-level-ui-and-api-defaults.md): concluído; o rascunho de UI vazio não pré-preenche o nível, o fallback genérico do Model é disabled/enabled, o map genérico das três APIs converte enabled em high; hierarquia e regras dedicadas preservadas. Origem revisão 23, versão mesclada é 24.

- [Todo137: ocultar emblema de visão do GLM-5.3 em pacotes de experiência](./todo-137-start-plan-glm53-vision-badge.md): implementado e aprovado na regressão de exibição; apenas amplia o escopo de exibição compartilhado, preservando a capacidade de imagem e a identificação Flash.

- [Todo117: preservar o domínio da conta, completar a seleção de pacotes e cancelar a desativação de conta](todo-117-preserve-account-domain-on-provider-save.md)/[Todo118: primeira migração preserva a ativação/desativação do Provider manual](todo-118-preserve-legacy-provider-enabled.md): a decisão mais recente foi fechada, a executar. O Provider de conta integrado não permite desativação, valores `false` existentes deixam de ter efeito, desativações antigas de conta não são importadas; instâncias manuais de Key criadas a partir de templates ainda podem ser ativadas/desativadas. Conexão atual, direitos, credenciais e elegibilidade de modelo não são flexibilizados, e não se alteram dados reais de usuários em lote.

- [Todo132: feedback de cor de fundo das opções de modelo e correção da edição do nome do fornecedor](todo-132-model-option-feedback-and-provider-name-edit.md): **a executar, solução já confirmada**. Aumentar apenas a diferença de cor de fundo das opções em bloco, preservando o texto, os ícones e a borda de sobrescrita; o nome passa a salvar com Enter/perda de foco, Esc cancela, isolando o autosave compartilhado, e o momento de endereço/API Key permanece. As duas são validadas em conjunto, este ciclo apenas registra em disco.

- [Todo131: posição da configuração inteligente na página de configurações de modelo e botão “Restaurar”](todo-131-model-settings-smart-config-placement-and-restore.md): **a executar, solução já confirmada**. Encurtar o campo de entrada de ID, mover a configuração inteligente e o ponto de interrogação para a direita do mesmo contêiner; o “Restaurar” no fim limpa as sobrescritas e abre a inteligente, altera apenas o rascunho, ID vazio não desabilita, somente desabilita durante o salvamento. Reutiliza as fronteiras de campos do Todo130, o texto explicativo do Todo125 não muda; este ciclo apenas registra em disco.

- [Todo130: correção da fronteira de campos editáveis entre a configuração inteligente e a manual](todo-130-manual-model-config-editable-field-boundary.md): **a executar, solução já confirmada**. Unificar o contrato de campos editáveis, modificando o schema manual, a composição de campos de sistema, o salvamento do rascunho e as condições do interruptor; excluir o fallback de modelos antigos e não deixar campos ocultos impedirem o salvamento do formulário. Espera-se que não haja lançamento formal, sem pressupor migração complexa; o plano de validação M120 está listado, este ciclo apenas registra em disco.

- [Todo129: adaptação da telemetria de Provider e correção da classificação de pacotes Team](todo-129-provider-telemetry-compatibility-and-team-classification.md): **a executar, direção já confirmada**. O lado de relatórios não muda, a fronteira de saída da telemetria recupera no máximo possível os IDs/metodologias antigas, Team é verificado pelos fatos de cada evento da versão antiga, itens determináveis avançam diretamente e os poucos que não podem ser restaurados mantêm o ID real com evidências. Inclui o reconhecimento de Team das duas empresas, o bloqueio incorreto na página inicial no período ocioso e a correção da classificação BigModel; não altera requisições reais, armazenamento ou o parser antigo, nem se mistura com a correção de temporização do Todo128.

- [Todo128: contrato de inicialização do Provider e correção da atualização de elegibilidade no período ocioso](todo-128-provider-start-contract-and-offpeak-eligibility.md): **a executar, solução já confirmada**. Os quatro `start()` e seus wrappers passam a retornar `void` uniformemente, a negócio lê explicitamente o snapshot atual; completar a verificação de elegibilidade após a atualização do Registry/refresh manual, unificando concorrência e proteção contra resultados expirados. Regras de pacotes preservadas, sem alterar Composer, schema de persistência ou fronteira de composição do Runtime. Este ciclo apenas registra em disco.

- [Todo127: publicação on-line do Built-in e correção da cadeia de atualização](todo-127-builtin-online-release.md): **a executar, solução detalhada já confirmada**. URL de CDN versionado; download em duas fases somando 20 segundos, corpo de 10 MB; verificação a cada minuto, download normal a cada hora; reconstrução serial da Account e recuperação de não-alinhamento reusam a mesma entrada de verificação. Ordem de implementação e aceite listados, este ciclo apenas registra em disco, sem adicionar novo gate de integridade de negócio no cliente.

- [Todo113: atualização do catálogo de modelos recentes e da configuração inteligente](todo-113-new-model-catalog-refresh.md): **segunda rodada a executar**. Completar a configuração inteligente de GPT-5.4 base/Pro/Mini/Nano, agregar DeepSeek V4.1 Flash, Qwen Omni/3.7/3.6, Kimi versão rápida, verificar e remover membros integrados desativados; todos os modelos novos devem checar o suporte do agregador, e mesmo os itens já determinados exigem pesquisa aprofundada. A primeira rodada está concluída com evidências preservadas, este ciclo apenas registra em disco.

- [Todo126: emblema de visão do GLM, Flash PDF e padrão Turbo do Coding Plan API](todo-126-glm-flash-pdf-and-coding-plan-turbo-defaults.md): solução confirmada, a implementar. Mover Flash PDF para as regras genéricas de modelo, Turbo desativado por padrão nos templates de API dos dois pacotes; ocultar o emblema de visão do Coding Plan GLM-5.3 na página de configurações e no menu de seleção de modelo, sem alterar a capacidade de imagem via bridge, mantendo o emblema de visão no Flash. A ativação/desativação padrão da Account e as sobrescritas explícitas do usuário não mudam, desta vez apenas registrando em disco.

- [Todo125: texto explicativo do ponto de interrogação e texto final na página de configurações de modelo](todo-125-model-settings-help-copy.md): decisão confirmada, a implementar. Desta vez apenas registrar em disco; depois executar estritamente conforme o texto literal e os requisitos de interação, sem alterar layout, comportamento de configuração ou ampliar o escopo por conta própria.

- Todo95C, Todo97, Todo98 foram concluídos conforme seu escopo final; a verificação residual entre plataformas vai para o Todo102, não repetida como todo de desenvolvimento.
- [Todo102: fechamento unificado da verificação residual](todo-102-verification-debt-closeout.md) é a única entrada de agendamento para testes faltantes, falhas existentes e promoções manuais pendentes; os todos antigos de verificação 52/57/64/78 são fechados e transferidos, evidências históricas de aprovação/falha não são apagadas nem reescritas como aprovação.
- A lacuna explícita de Subagent do Todo96 foi completada pelo Todo99; os textos de adiamento relacionados em Todo87/88 são apenas decisões históricas. A implementação do Todo99 nesta rodada foi fechada, a investigação do Todo100 foi concluída, e o adiamento entre plataformas continua registrado no Todo102.
- Temas antigos como Todo11/22/45/80/86 continuam adiados, o Todo101 ainda é um futuro Draft; não reabrir Todo15/19 já descontinuados. Após o merge do Schema do m2 no Todo99, o número passa a ser Todo104, sem renomear os Todo99/100 existentes.

- [Todo104: levantamento e refinamento do Schema de persistência antes do lançamento](todo-104-pre-release-schema-review.md): o usuário autorizou a implementação em 2026-09-10. Vale a decisão final, com verificação agrupada; o “apenas discutido/não autorizado” do texto original é um estado histórico. O ramo de implementação independente não altera a conclusão de aceite do candidato staging do Todo103.

A árvore de diretórios e a ordem de implementação abaixo preservam o processo histórico; os princípios que não foram substituídos por decisões novas continuam válidos, e o status mais recente deve ser lido por esta seção, pelo topo de cada Todo e pelas evidências de implementação posteriores.

Concluído: [Todo 85: restauração funcional após o revert de staging e o tratamento de conflitos manuais](./todo-85-staging-revert-behavior-restoration.md), incluindo a implementação substitutiva já decidida do Todo87. O processo, as decisões, os commits e a verificação estão registrados de forma unificada na [tabela de auditoria de restauração](../plan/staging-conflict-restoration-audit.md), e o novo E2E permanece pendente aguardando promoção manual.

Este diretório registra como a arquitetura de Provider entra no código em fases. A estrutura-alvo unificada está em
[`../design-v2/design.md`](../design-v2/design.md), e o arbitramento das contradições históricas está em
[`../design-v2/evidence-and-contradictions.md`](../design-v2/evidence-and-contradictions.md). Este diretório responde apenas às questões de implementação:
o que esta fase deve mudar, como dividir, o que de fato foi entregue, quais desvios apareceram durante a implementação e quais problemas restam.

```text
steps/
├─ steps.md
│  └─ Responsabilidades e regras de manutenção do documento de implementação
├─ migration-roadmap.md
│  └─ Ordem geral de migração de M0 a M6 e temas posteriores independentes
├─ 01-model-and-request.md
│  └─ Objetivos de implementação, resultados e itens pendentes de M1
├─ 01-model-and-request-implementation-log.md
│  └─ Decisões autônomas da M1 fora do plano original e evidências preservadas
├─ 01-model-and-request-review.md
│  └─ Revisão completa após o merge da M1
├─ 02-provider-config-and-registry.md
│  └─ Objetivos de implementação, fatias, status atual e fronteiras de aposentadoria restantes da M2
├─ 02-provider-config-and-registry-human-in-the-loop.md
│  └─ Decisões de arquitetura, produto e contrato público da M2 delegadas a uma pessoa
├─ 02-provider-config-and-registry-impact.md
│  └─ Superfície de impacto histórica e contratos de teste quando a M2 iniciou sua primeira fatia puramente de domínio
├─ 02-provider-config-and-registry-cleanup.md
│  └─ Auditoria de aposentadoria da M2, cadeias residuais e portão final de conclusão
├─ 02-provider-config-and-registry-review.md
│  └─ Revisão da escala de código novo da M2, fronteiras de transição e condições de saída futura
├─ 02-provider-config-and-registry-mr-review.md
│  └─ Problemas ainda indecisos e direções iniciais na revisão estática do Merge Request da M2
├─ 02-provider-config-and-registry-implementation-log.md
│  └─ Decisões autônomas e evidências de auditoria da M2 salvas em ordem cronológica
├─ 03-provider-architecture-cutover.md
│  └─ Plano de implementação da integração M3 do grande Merge Request atual, portões de exclusão e matriz de aceite
├─ 03-provider-architecture-cutover-implementation-log.md
│  └─ Decisões autônomas de engenharia, baseline atual e trilha de verificação da M3
├─ 03-staging-integration.md
│  └─ Plano de portabilidade da semântica de staging da M3.0 e portões de Rebase pendentes de decisão
├─ 04-model-execution-cutover.md
│  └─ Design por fases e resultados da implementação da M4 para tarefas ociosas, Subagent e cadeia unificada de criação de Model
├─ todo-01-core-model-adapter-boundary-cleanup.md
│  └─ Limpeza concluída do Core até a cadeia única ModelFactory/Model
├─ todo-02-ai-sdk-execution-registry-retirement.md
│  └─ Aposentadoria concluída do antigo Registry de execução AI SDK dentro do Adapter
├─ todo-03-provider-model-ownership-and-property-totality.md
│  └─ Implementação histórica de posse de membros de modelo e completude de Properties; ativação/desativação, membros duplicados e interação de configurações foram substituídos pelo Todo 21
├─ todo-04-core-model-connection-port-retirement.md
│  └─ Limpeza concluída da aposentadoria do Core Model Connection Port
├─ todo-05-model-ref-retirement.md
│  └─ Aposentadoria concluída do ModelRef por semântica de consumidor
├─ todo-06-config-storage-envelope-repository-privatization.md
│  └─ Envelope de armazenamento do Config e migration devolvidos à implementação privada do Repository
├─ todo-07-account-connection-selection-and-access-context-cutover.md
│  └─ Seleção estruturada de conexão de conta, Provider Account Access e fechamento da autenticação de requisição
├─ todo-08-legacy-model-catalog-retirement.md
│  └─ Aposentadoria do Legacy Model Catalog, override e Reasoning State
├─ todo-09-off-peak-model-selection-legacy-projection-retirement.md
│  └─ Aposentadoria da projeção antiga de modelos do Off-Peak e unificação do scoped Selection View
├─ todo-10-zcode-builtin-provider-config-naming-cutover.md
│  └─ Troca única do nome `official` do Provider Config para ZCode Built-in
├─ todo-11-provider-runtime-composition-boundary-cleanup.md
│  └─ Rascunho pendente de decisão sobre a limpeza da fronteira de composição do Provider Runtime, do owner de recursos e da raiz de composição de processo
├─ todo-11a-provider-runtime-disposal-functional-fix.md
│  └─ Correção funcional independente da liberação completa do Provider Runtime
├─ todo-12-model-selection-validation-boundary-cutover.md
│  └─ Exclusão da validação de execução da Facade do usuário e retorno da validação autoritativa ao ModelFactory
├─ todo-13-target-host-model-selection-authority.md
│  └─ Autoridade de seleção de modelo do Host alvo e aposentadoria da antiga cadeia de preparação
├─ todo-14-post-refactor-mechanical-zero.md
│  └─ Primeira rodada mecânica de zeragem concluída do Provider Refactor
├─ todo-16-unplanned-model-abstraction-residue-cleanup.md
│  └─ Zeragem de resíduos de abstração de Model não planejados
├─ todo-17-provider-registry-settings-authority-boundary-closure.md
│  └─ Fechamento das fronteiras de autoridade de Resolver, Registry e Settings
├─ todo-18-zcode-builtin-client-config-sync-and-lkg.md
│  └─ Sincronização remota, Environment Active Cache e debounce de atualização do ZCode Built-in Release
├─ todo-20-account-overlay-atomicity-and-review-closeout.md
│  └─ Publicação atômica do Account Overlay e isolamento do Endpoint Active; a semântica antiga de enabled foi substituída pelo Todo 50
├─ todo-21-zcode-builtin-config-ownership-and-model-activation-order.md
│  └─ Responsabilidades do Built-in Config, ativação do Model Config, ordem Provider/Model, página de configurações e retorno do ZCode V4 Access
├─ todo-22-additional-builtin-providers-and-cloud-access.md
│  └─ Rascunho de integração independente de OpenRouter, OpenCode Zen, Azure, Volcano Ark e AWS Bedrock
├─ todo-23-provider-refactor-decision-gap-closure.md
│  └─ Fechamento das lacunas de Account Access, ModelSelection e transação de Settings descobertas na revisão reversa após a conclusão
├─ todo-24（o documento mantém apenas a versão oficial）
│  └─ Substitui a fatia Access do Todo 23, fechando a autenticação dinâmica da conta, o Access Type e a única fonte de verdade da verificação segura de requisição
├─ todo-25-zapi-product-entry-retirement.md
│  └─ Exclusão da entrada de produto ZAPI, do Gate de rede interna exclusivo, da migração de configuração antiga e dos resíduos de identidade atual
├─ todo-26-zhipu-access-mode-contract-cutover.md
│  └─ Substituição dos campos de protocolopseudo-generalistas por duas camadas Access Type/Mode; a antiga fatia Account API foi substituída pelo Todo 49
├─ todo-27-provider-settings-dogfood-closeout.md
│  └─ Fechamento da interação de Overlay de modelo, do feedback de sucesso em nível de janela, da máquina de estados de Team e da divergência do Schema de Runtime Headers
├─ todo-28-model-rule-precedence-and-order-canonicalization.md
│  └─ Fechamento da precedência exata da Personal Rule e da consistência de leitura/escrita da ordem de Provider/Model em três segmentos
├─ todo-29-model-config-resolution-and-idle-trigger-closure.md
│  └─ Fechamento da nomenclatura de resolução da configuração padrão do modelo, do feedback de carregamento e do gatilho de Provider/Model no período ocioso
├─ todo-30-provider-settings-scroll-affordance.md
│  └─ Adição de dicas de limite condicionais às áreas de rolagem independentes esquerda e direita das configurações de Provider
├─ todo-31-model-metadata-editor-input-consistency.md
│  └─ Fechamento dos campos JSON de modelo, dos atributos técnicos de entrada e do comportamento do Enter com o método de entrada em chinês
├─ todo-32-team-plan-settings-effective-provider-boundary.md
│  └─ Separação do cartão de status de pacote Team da projeção de configurações de Effective Provider, proibindo que o status do pacote oculte a configuração de modelo
├─ todo-33-personal-provider-config-file-cutover.md
│  └─ Migração do Personal Provider/Model Config para provider_config.json, aposentadoria da Store antiga e da migração antiga de Coding Plan Key
├─ todo-34-model-selection-async-state-and-repo-wiki-draft.md
│  └─ Explicitação do estado assíncrono de Model Selection e fechamento de Repo Wiki Draft, Fallback e admissão de envio com ModelSelection
├─ todo-43-models-api-evidence-and-minimax-m3-correction.md
│  └─ Posicionamento da Models API como evidência de publicação e correção dos membros, capacidades e estado de ativação padrão oficiais do MiniMax M3
├─ todo-45-models-api-publisher-evidence-tool.md
│  └─ A executar: coletar o catálogo em tempo real da Models API com material de acesso em tempo de execução e gerar um relatório de divergências do Built-in; a correção completa em tempo real está bloqueada por credenciais de fabricante
├─ todo-46-model-reorder-visual-continuity.md
│  └─ Fechamento da continuidade visual pendente na reordenação de Model e da borda de camada única da lista
├─ todo-47-provider-connectivity-save-and-result-cleanup.md
│  └─ O teste de conexão reutiliza o Model oficial, aguarda o salvamento do rascunho do Provider e exclui a classificação duplicada de erros e a projeção antiga de resultados
├─ todo-48-account-api-and-manual-api-key-boundary-cleanup.md
│  └─ Registro de investigação da alucinação de Account API; a decisão final e a implementação foram substituídas pelo Todo 49
├─ todo-49-manual-api-key-and-coding-plan-credential-boundary-cutover.md
│  └─ Exclusão da pseudo Account API e devolução das APIs de pagamento da Z.ai/BigModel aos verdadeiros API Key Providers
├─ todo-50-provider-enabled-and-account-entitlement-separation.md
│  └─ Separação entre o interruptor de participação da configuração do Provider e o fato de direito do Account Access
├─ todo-51-provider-access-consumer-and-offpeak-auth-closeout.md
│  └─ Fechamento da semântica de consumo do Provider Access, do Welcome API Key Overlay e da fonte de autenticação do Off-Peak
├─ todo-52-provider-e2e-regression-closeout.md
│  └─ Concluído: exclusão de Family Case obsoletos, migração do Fixture de entrada oficial e fechamento da barreira de polling do Registry
├─ todo-55-provider-template-inheritance-cutover.md
│  └─ Concluído: APIs de pagamento e fornecedores comuns migrados para Template, Family Z.ai/BigModel restrito a Account-only
├─ todo-56-remote-provider-provisioning-environment-sync.md
│  └─ Concluído: unificação da baseline de Provisioning remoto e fechamento da sincronização automática com um Environment Coordinator de nível Application
├─ todo-57-provider-e2e-runtime-verification-closeout.md
│  └─ Implementado: 45 casos de Provider E2E em macOS passaram; 1 caso SSH Remote real não foi executado por falta de credenciais
├─ todo-69-provider-refactor-practical-rollback-compatibility.md
│  └─ Sem escrita dupla contínua entre domínios; apenas isolar arquivos do Bot v3, manter os arquivos antigos e verificar a fronteira real de leitura do staging
├─ todo-70-session-model-selection-migration-and-unbound-recovery.md
│  └─ Restringir a migração de Sessions antigas à fronteira de armazenamento; seleções inválidas ficam vazias, sem aviso e sem bloquear o histórico
├─ todo-71-persistent-composer-draft-and-submission-state.md
│  └─ Persistir mode/ModelSelection do Composer; inválido fica vazio e sem aviso, fechando a semântica de envio e congelamento de Queue
├─ todo-72-legacy-builtin-provider-and-model-selection-migration.md
│  └─ Corrigir a classificação de configurações integradas antigas, migrar apenas Built-in API Key e converter a antiga seleção de Coding Plan pela conexão pessoal/Team vigente na migração
├─ bugfix-01-builtin-provider-overlay-recreation.md
│  └─ Correção do ciclo de vida em que, após excluir um Built-in Personal Overlay comum, não era possível adicionar novamente no mesmo Host
├─ bugfix-02-provider-reorder-drop-flicker.md
│  └─ Correção da ordenação otimista em que, ao soltar o arraste de Provider, ele voltava primeiro à posição antiga e depois saltava para a posição alvo
├─ bugfix-03-provider-review-boundary-closeout.md
│  └─ Fechamento dos problemas de fronteira de configurações e semântica de configuração de modelo encontrados na Provider Review
├─ bugfix-04-model-json-editor-fixed-height.md
│  └─ Editor de Model JSON com altura fixa e rolagem dentro do controle
├─ bugfix-05-personal-config-worker-refresh.md
│  └─ Exclusão do fs.watch do Personal Config, corrigindo o Registry obsoleto do Worker por polling de revisão de conteúdo e atualização ativa pelo teste de conexão
└─ bugfix-06-readonly-provider-field-affordance.md
   └─ Unificação da semântica de exibição congelada do Endpoint e do API Schema somente leitura do Built-in Provider
```

Os subdocumentos são organizados por ordem de implementação:

- [`migration-roadmap.md`](./migration-roadmap.md) dá a ordem geral de migração de M0 a M6, as restrições entre fases e os temas posteriores independentes que não pertencem a este refactor.
- [`01-model-and-request.md`](./01-model-and-request.md) resume os objetivos de implementação da M1, o que foi realmente entregue e os itens pendentes.
- [`01-model-and-request-implementation-log.md`](./01-model-and-request-implementation-log.md) guarda as decisões autônomas da implementação da M1 que extrapolaram o plano original, com as evidências de verificação da época.
- [`01-model-and-request-review.md`](./01-model-and-request-review.md) guarda a revisão de integridade e a classificação de riscos após o merge da M1.
- [`02-provider-config-and-registry.md`](./02-provider-config-and-registry.md) registra os objetivos de implementação da M2, as fatias, o status atual e as fronteiras de aposentadoria restantes.
- [`02-provider-config-and-registry-human-in-the-loop.md`](./02-provider-config-and-registry-human-in-the-loop.md) registra as decisões de arquitetura, produto e contrato público da M2 que devem ser confirmadas por uma pessoa, e explica seu impacto na implementação atual.
- [`02-provider-config-and-registry-impact.md`](./02-provider-config-and-registry-impact.md) guarda a superfície de impacto, os invariantes e a passagem de testes quando a M2 iniciou sua primeira fatia puramente de domínio; seu escopo e itens em aberto são evidência histórica de implementação.
- [`02-provider-config-and-registry-cleanup.md`](./02-provider-config-and-registry-cleanup.md) registra os resultados da limpeza de aposentadoria da M2, as fronteiras estreitas de compatibilidade ainda mantidas e as evidências de verificação de lançamento.
- [`02-provider-config-and-registry-review.md`](./02-provider-config-and-registry-review.md) quantifica o código novo da M2 e distingue a implementação-alvo, a migração única e as fronteiras de transição ainda em execução.
- [`02-provider-config-and-registry-mr-review.md`](./02-provider-config-and-registry-mr-review.md) registra os problemas encontrados na revisão estática completa do Merge Request da M2 que ainda não têm decisão final; ele não reescreve o Design nem o status de conclusão da fase.
- [`02-provider-config-and-registry-implementation-log.md`](./02-provider-config-and-registry-implementation-log.md) guarda em ordem cronológica as decisões autônomas e as evidências de auditoria da M2; as conclusões atuais seguem o Design, o documento principal da M2 e o Human in the Loop.
- [`03-provider-architecture-cutover.md`](./03-provider-architecture-cutover.md) define o Merge Request atual como a troca de arquitetura da M3: sobre a base de Config/Registry concluída, completa de uma vez o Submission atômico, o estado de seleção de modelo, a página de configurações e a aposentadoria das cadeias antigas.
- [`03-provider-architecture-cutover-implementation-log.md`](./03-provider-architecture-cutover-implementation-log.md) guarda a baseline de implementação atual da M3, as decisões autônomas fora do plano e a trilha de verificação.
- [`03-staging-integration.md`](./03-staging-integration.md) registra como o primeiro passo da M3 absorve o Video Input do staging, as configurações de modalidade e o raciocínio ox-alpha, distinguindo a semântica de produto a preservar da implementação temporária de Provider a derrubar.
- [`04-model-execution-cutover.md`](./04-model-execution-cutover.md) registra como a M4 usa visibilidade genérica de Provider, Access em tempo de requisição, Registry/ModelFactory padrão e Active Model para fechar tarefas ociosas e Subagent, excluindo o antigo Runtime Overlay.
- [`todo-01-core-model-adapter-boundary-cleanup.md`](./todo-01-core-model-adapter-boundary-cleanup.md) registra o trabalho concluído de exclusão do desvio Adapter no Core e do uso unificado de ModelFactory/Model.
- [`todo-02-ai-sdk-execution-registry-retirement.md`](./todo-02-ai-sdk-execution-registry-retirement.md) registra a aposentadoria concluída do antigo Registry de execução AI SDK dentro do Adapter.
- [`todo-03-provider-model-ownership-and-property-totality.md`](./todo-03-provider-model-ownership-and-property-totality.md) registra a fronteira de tipos completa e concluída entre `builtinModelIds`/`modelIds` e Effective Properties; a visibilidade de Model, os DTOs de conflito e a antiga interação de configurações são fatos históricos de implementação, substituídos pelo Todo 21.
- [`todo-04-core-model-connection-port-retirement.md`](./todo-04-core-model-connection-port-retirement.md) registra o plano de aposentadoria ainda a executar do Core Model Connection Port.
- [`todo-05-model-ref-retirement.md`](./todo-05-model-ref-retirement.md) registra o plano de aposentadoria ainda a executar do ModelRef por semântica real de consumidor.
- [`todo-06-config-storage-envelope-repository-privatization.md`](./todo-06-config-storage-envelope-repository-privatization.md) devolve o Config Document, o envelope de versão e a migration à implementação privada do Repository.
- [`todo-07-account-connection-selection-and-access-context-cutover.md`](./todo-07-account-connection-selection-and-access-context-cutover.md) registra o fechamento unificado da seleção estruturada de conexão de conta, do Account Built-in Provider Access, do Request Auth, do Off-Peak e do Official MCP.
- [`todo-08-legacy-model-catalog-retirement.md`](./todo-08-legacy-model-catalog-retirement.md) exclui o Legacy Model Catalog, o override e o Reasoning State, mantendo a projeção de requisição preservada e orientada por Config.
- [`todo-09-off-peak-model-selection-legacy-projection-retirement.md`](./todo-09-off-peak-model-selection-legacy-projection-retirement.md) exclui a projeção antiga de DTO de modelo do Off-Peak e unifica o uso do scoped Registry Selection View.
- [`todo-10-zcode-builtin-provider-config-naming-cutover.md`](./todo-10-zcode-builtin-provider-config-naming-cutover.md) troca de uma só vez o domínio, o código e a nomenclatura física `official` do Provider Config para ZCode Built-in, sem manter entrada de compatibilidade.
- [`todo-11-provider-runtime-composition-boundary-cleanup.md`](./todo-11-provider-runtime-composition-boundary-cleanup.md) guarda as evidências do estado atual e as soluções candidatas para as múltiplas camadas de encapsulamento do Provider Runtime, a fronteira de recursos do Node Config e as duas raízes de composição Host/Agent; continua sendo um rascunho pendente de decisão que não deve ser implementado.
- [`todo-11a-provider-runtime-disposal-functional-fix.md`](./todo-11a-provider-runtime-disposal-functional-fix.md) corrige de forma independente o problema de a liberação do Provider Runtime não atravessar o ciclo de vida do Protocol Agent, sem esperar a decisão de arquitetura do Todo 11.
- [`todo-12-model-selection-validation-boundary-cutover.md`](./todo-12-model-selection-validation-boundary-cutover.md) exclui a entrada interna de validação de execução da Facade de Model Selection do usuário, retorna a validação autoritativa ao Registry/ModelFactory e preserva a verificação antecipada estreita do Off-Peak.
- [`todo-13-target-host-model-selection-authority.md`](./todo-13-target-host-model-selection-authority.md) unifica a posse de candidatos de modelo, valores padrão e validação de execução no Environment Host alvo.
- [`todo-14-post-refactor-mechanical-zero.md`](./todo-14-post-refactor-mechanical-zero.md) registra a primeira rodada concluída de zeragem mecânica de Factory, MCS, DTO legado e código morto.
- O Todo 15 foi marcado como descontinuado e deixa de ser um Todo de verificação de lançamento independente; a verificação de lançamento posterior é fechada à parte pelo Release Checklist final.
- [`todo-16-unplanned-model-abstraction-residue-cleanup.md`](./todo-16-unplanned-model-abstraction-residue-cleanup.md) exclui resíduos de abstração de Runtime, Protocol, Config legado e documentação que ainda existiam fora do primeiro planejamento.
- [`todo-17-provider-registry-settings-authority-boundary-closure.md`](./todo-17-provider-registry-settings-authority-boundary-closure.md) fecha os tipos completos do Resolver, as três camadas de View das Settings, o salvamento granular, a temporização de escrita e a connectivity; as decisões antigas sobre ciclo de vida, origem e ordenação de Provider/Model foram substituídas pelo Todo 21.
- [`todo-18-zcode-builtin-client-config-sync-and-lkg.md`](./todo-18-zcode-builtin-client-config-sync-and-lkg.md) registra o Release de duas camadas concluído, a seleção Bundled/Active/LKG, o owner de Environment, a sincronização remota e o lease de gravação.
- O Todo 19 foi marcado como descontinuado e deixa de ser um Todo de portão de lançamento independente; se um portão de lançamento for realmente necessário no futuro, cria-se uma tarefa nova baseada no processo de publicação vigente.
- [`todo-20-account-overlay-atomicity-and-review-closeout.md`](./todo-20-account-overlay-atomicity-and-review-closeout.md) registra a publicação atômica do Account Overlay, a barreira de revision de origem do Built-in, o isolamento de Endpoint Active/LKG e o fechamento de CLI, dependências e ZIPs órfãos; nele, a semântica antiga de `enabled` da Account foi substituída pelo Todo 50.
- [`todo-21-zcode-builtin-config-ownership-and-model-activation-order.md`](./todo-21-zcode-builtin-config-ownership-and-model-activation-order.md) concluiu o fechamento das responsabilidades de configuração do Built-in Provider/Model: o Provider gerencia membros e ordem de modelos, o `enabled` do Model Config gerencia o gate de execução do modelo, a Rule exclusiva do Personal carrega a sobrescrita de modelo único da página de configurações, Registry/Selection unificam a semântica executable/selectable e, ao mesmo tempo, a configuração da verificação segura de requisição da versão oficial foi devolvida do Model Config para o Provider Access.
- [`todo-22-additional-builtin-providers-and-cloud-access.md`](./todo-22-additional-builtin-providers-and-cloud-access.md) dimensiona de forma independente os templates Built-in, o Access e a verificação de requisição real de OpenRouter, OpenCode Zen, Azure, Volcano Ark e AWS Bedrock; não bloqueia o Todo 21.
- [`todo-23-provider-refactor-decision-gap-closure.md`](./todo-23-provider-refactor-decision-gap-closure.md) fechou o ModelRef de mesma forma, a Selection em string e a transação atômica das Settings; sua fatia Access foi substituída pelo Todo 24.
- O Todo 24（o documento mantém apenas a versão oficial）substitui a fatia Access do Todo 23: exclui a vinculação na criação da conta, restringe o Account Overlay, faz a troca estrita do Access Type e fecha o único fato estático de admissão da verificação segura de requisição da versão oficial.
- [`todo-25-zapi-product-entry-retirement.md`](./todo-25-zapi-product-entry-retirement.md) exclui a identidade de Provider ZAPI que já saiu do produto, a entrada nas configurações, o gate de rede interna exclusivo e o caso especial de migração Legacy, preservando a sonda genérica de rede interna e a capacidade de baixar dependências.
- [`todo-26-zhipu-access-mode-contract-cutover.md`](./todo-26-zhipu-access-mode-contract-cutover.md) substitui a estrutura de Access do Todo 24: mantém apenas `api-key` comum e `zhipu-account`, usa o Built-in `family + mode` para dirigir Start, Individual, Team, Off-Peak, a verificação segura da versão oficial e a autenticação em tempo de requisição, e exclui os campos de protocolo pseudo-generalistas; nele, a pseudo Account API foi excluída pelo Todo 49.
- [`todo-27-provider-settings-dogfood-closeout.md`](./todo-27-provider-settings-dogfood-closeout.md) fecha os problemas restantes após a experiência em dispositivo real: unifica o estilo de Overlay booleano do modelo e o restabelecimento do padrão no nível do modelo, ancora o feedback de sucesso na parte inferior da janela, distingue Team desconhecido/falha/indisponível de forma explícita e faz o Runtime Headers reutilizar estritamente o Schema oficial de Registry Access.
- [`todo-28-model-rule-precedence-and-order-canonicalization.md`](./todo-28-model-rule-precedence-and-order-canonicalization.md) corrige as duas desvios mecânicos remanescentes após a conclusão dos Todo 21/23: unifica a prioridade das Rules `Built-in + Personal Match + Personal provider-model` e faz o Resolver e todas as fronteiras de escrita reutilizarem a mesma normalização de ordem de Provider/Model em três segmentos.
- [`todo-33-personal-provider-config-file-cutover.md`](./todo-33-personal-provider-config-file-cutover.md) separa o Personal Provider/Model Config para `provider_config.json`, importa apenas de forma unidirecional do antigo `config.json` já publicado e exclui `model-providers.json`, a antiga Coding Plan Key e a cadeia de backup de migração.
- [`todo-34-model-selection-async-state-and-repo-wiki-draft.md`](./todo-34-model-selection-async-state-and-repo-wiki-draft.md) explicita loading, unavailable, error e ready do Model Selection, substitui o estado em string do controle Repo Wiki por `ModelSelection` e exclui o segundo fallback do Renderer.
- [`todo-45-models-api-publisher-evidence-tool.md`](./todo-45-models-api-publisher-evidence-tool.md) planeja a ferramenta de evidência de catálogo em tempo real da Models API para o publicador do Built-in; a implementação da ferramenta pode avançar usando Fixture, mas a correção em tempo real de todos os fabricantes está bloqueada pelo material de acesso correspondente, e ela não reescreve automaticamente a configuração de publicação.
- [`todo-47-provider-connectivity-save-and-result-cleanup.md`](./todo-47-provider-connectivity-save-and-result-cleanup.md) faz o teste de conexão reutilizar a temporização única de envio do rascunho do Provider, exclui a antiga entrada de escrita do Model Config, a classificação duplicada de erros e os resíduos de UI de múltiplos Endpoints.
- [`todo-48-account-api-and-manual-api-key-boundary-cleanup.md`](./todo-48-account-api-and-manual-api-key-boundary-cleanup.md) é um registro de pesquisa/decisão sobre o comportamento do staging, a origem das credenciais e a alucinação de Account API, e deixa de ser um Todo de implementação independente.
- [`todo-49-manual-api-key-and-coding-plan-credential-boundary-cutover.md`](./todo-49-manual-api-key-and-coding-plan-credential-boundary-cutover.md) registra a troca por fases concluída: exclui os dois Account API Providers duplicados e `zhipu-account/api-key` e restringe estritamente a Key automática do projeto à autenticação de requisições do Coding Plan; nele, a conclusão de que `zai-api`/`bigmodel-api` ocupam permanentemente a vaga Family “按用量 API” é substituída pelo Provider Template no Todo 55.
- [`todo-50-provider-enabled-and-account-entitlement-separation.md`](./todo-50-provider-enabled-and-account-entitlement-separation.md) mantém o `enabled` do Provider como único fato de “incluir na configuração atual” e restringe a elegibilidade de pacote de conta a `zhipu-account access.entitled`, excluindo o reaproveitamento do `enabled` de topo pelo Account Overlay.
- [`todo-51-provider-access-consumer-and-offpeak-auth-closeout.md`](./todo-51-provider-access-consumer-and-offpeak-auth-closeout.md) fecha a deriva da camada de consumo após os Todo 47/49/50: separa completamente `enabled`, `entitled` e `executable`, unifica o material de conta do Off-Peak e a autenticação por requisição em uma única fonte privada do Host e exclui o antigo Family mode, a nomenclatura incorreta de interface e os resíduos de documentação; nele, a conclusão por fases de que o Welcome salva um overlay de Family API Provider fixo foi alterada pelo Todo 55 para criar uma instância de Provider Template.
- [`todo-52-provider-e2e-regression-closeout.md`](./todo-52-provider-e2e-regression-closeout.md) registra o fechamento concluído da regressão E2E de Provider: unifica o Fixture de entrada oficial, o Bot Selection, a structured selection de Subagent e a barreira de polling do Personal Config; exclui os Family Case que perderam objeto de produto e restaura as provas de comportamento de Account, Runtime, recuperação e Upgrade que ainda eram válidas.
- [`todo-55-provider-template-inheritance-cutover.md`](./todo-55-provider-template-inheritance-cutover.md) substitui todos os Concrete Providers Built-in não-Account por um Provider Template que reutiliza a estrutura de valores de configuração existente; as APIs Z.ai API / BigModel API passam a suportar múltiplas instâncias como os demais templates, o Family exclui a vaga de API de pagamento e é restringido a Account-only; ao mesmo tempo, adiciona `template-model` e o Built-in Release atômico, e aposenta o enabled de posicionamento de Provider e o ciclo de vida de Built-in adicionável.
- [`todo-56-remote-provider-provisioning-environment-sync.md`](./todo-56-remote-provider-provisioning-environment-sync.md) absorve primeiro a baseline remota de Provisioning Source/Target/transação e depois exclui as semânticas manual e only-if-missing; o Desktop Main faz agendamento single-flight de nível application por Remote Environment e cobre de forma completa a imagem de execução remota após eventos de configuração, modelo padrão, conta, credenciais e lançamento.
- [`todo-57-provider-e2e-runtime-verification-closeout.md`](./todo-57-provider-e2e-runtime-verification-closeout.md) realmente inicia Electron/WDIO após a estabilidade do Todo 56, reproduz grupo a grupo as regressões de Provider do Todo 52 e os novos casos de Remote Provisioning, distinguindo estritamente as verificações estáticas prévias das evidências reais de E2E aprovado.
- [`todo-60-required-reasoning-option-and-mapping-editor.md`](./todo-60-required-reasoning-option-and-mapping-editor.md) fecha a Reasoning Option como um fato obrigatório de cada Effective Model Config, aposenta o thinking budget fixo e abre a edição de níveis ordenados e de placeholder de Mapping.
- [`todo-65-provider-settings-dogfood-and-template-ux-closeout.md`](./todo-65-provider-settings-dogfood-and-template-ux-closeout.md) fecha a Reasoning ausente no teste de conexão de conta, a regressão visual de Provider Template, o travessão em grupo vazio e o controle desgovernado do feedback de erro encontrados no MacBook Air, tomando o aceite no dispositivo real com o HEAD atual da Air como condição de conclusão.
- [`todo-66-option-map-variable-naming-and-display-formatting.md`](./todo-66-option-map-variable-naming-and-display-formatting.md) muda a variável genérica `value` do Option Map para o nome da Option à qual pertence e organiza as quebras de linha e a indentação dos Maps Built-in com o objetivo de legibilidade na página de configurações.
- [`todo-67-complete-model-selection-before-formal-model-creation.md`](./todo-67-complete-model-selection-before-formal-model-creation.md) corrige o erro de temporização em que o teste de conexão entrava no ModelFactory estrito antes da vinculação do nível mínimo de raciocínio e audita se todas as entradas oficiais de criação de modelo passam a Selection completa.
- [`todo-68-active-model-context-single-source.md`](./todo-68-active-model-context-single-source.md) corrige o Context atrasado em um passo após a troca de modelo e faz o Turn comum, o Guide, o Off-Peak e o Subagent lerem Context, ferramentas e requisição do mesmo Active Model.
- [`todo-69-provider-refactor-practical-rollback-compatibility.md`](./todo-69-provider-refactor-practical-rollback-compatibility.md) arbitra o rollback prático pela faixa real de falhas do Reader congelado do staging: Provider, Session, período ocioso, automação, Settings, Subagent e Wiki não têm escrita dupla contínua; apenas o Bot Config/State com conflito estrito no mesmo arquivo recebe isolamento de arquivo v3, e os arquivos antigos permanecem como estavam antes da atualização.
- [`todo-70-session-model-selection-migration-and-unbound-recovery.md`](./todo-70-session-model-selection-migration-and-unbound-recovery.md) restringe a conversão das Sessions realmente antigas ao único Decoder de armazenamento e faz Reasoning, Provider ou Model ausente/inválido abrir o histórico com Selection não vinculada, com o usuário reselecionando para continuar a execução.
- [`todo-71-persistent-composer-draft-and-submission-state.md`](./todo-71-persistent-composer-draft-and-submission-state.md) move o mode e o ModelSelection do Composer para o Draft persistente existente, exclui a leitura contínua do Agent Session Snapshot pelo Renderer e fecha o congelamento de Submission, a limpeza de sucesso, a invalidação do Registry e as fronteiras de Queue.
- [`todo-72-legacy-builtin-provider-and-model-selection-migration.md`](./todo-72-legacy-builtin-provider-and-model-selection-migration.md) identifica os Providers integrados antigos marcados erroneamente como custom, migra apenas a Built-in API Key; converte a antiga seleção de Coding Plan pela conexão pessoal/Team vigente no momento da migração e verifica item a item as entradas de persistência, sem restaurar a escrita dupla contínua.
- [`todo-76-builtin-provider-config-layering-and-site-rules.md`](./todo-76-builtin-provider-config-layering-and-site-rules.md) concluído: sem alterar o overlay de ordem, organiza as responsabilidades do Built-in Config de Model, API Schema, Provider Site/Base URL, Template e Provider Instance.
- [`todo-74-model-capability-layer-and-media-output-contract.md`](./todo-74-model-capability-layer-and-media-output-contract.md) concluído (o streaming JSON Schema continua sendo tratado separadamente pelo Todo 80): fecha o PDF Anthropic-only do GLM-5.3-Flash, a capacidade de chamada de ferramenta embutida e a semântica dos campos do JSON Schema.
- [`todo-79-openrouter-opencode-provider-integration-boundary.md`](./todo-79-openrouter-opencode-provider-integration-boundary.md) conclui a primeira rodada de integração de templates Built-in: assume a fronteira de integração, a semântica de Model ID e a base de attribution/runtime existentes do OpenRouter/OpenCode Zen do Todo 22.
- [`todo-80-streaming-json-schema-output.md`](./todo-80-streaming-json-schema-output.md) rascunho: estuda isoladamente o contrato Runtime/Adapter para passar JSON Schema em requisições de streaming, sem alterar o comportamento não-streaming atual.
- [`todo-81-selection-migration-notice-scope-cleanup.md`](./todo-81-selection-migration-notice-scope-cleanup.md) concluído: a seleção inválida do Composer em sessões comuns não exibe aviso; tarefas ociosas já encerradas não mostram erro de correção; tarefas ociosas e tarefas agendadas que ainda podem executar mantêm o aviso e a proteção.
- [`todo-82-model-config-follow-recommended-draft.md`](./todo-82-model-config-follow-recommended-draft.md) concluído: exclui a entrada de ativação duplicada no diálogo de edição de modelo, substitui “restaurar tudo para o padrão” pelo interruptor Draft-only “seguir configuração recomendada” e materializa atomicamente ou limpa o Personal Model Config Overlay ao salvar.
- [`todo-83-account-provider-availability-and-claim-flow.md`](./todo-83-account-provider-availability-and-claim-flow.md) implementado (fechamento da primeira rodada): unifica o status de direito do Account Provider, a eficácia/redirect após o resgate do Start Plan e a executabilidade do modelo, mantendo as fronteiras existentes de seleção de Family e de configuração do Provider.

Execução conjunta dos Todo 68–72: 68 encerramento → 72 base de conversão de identidade → 69 isolamento de arquivos do Bot e primeira importação correta →
70 Session → 71 Composer → 72 demais entradas de persistência e verificação conjunta. A divisão detalhada está no Todo 72.
Decisão unificada: quando o modelo/reasoning existente estiver ausente ou inválido, deixa-se vazio, não se troca automaticamente para o modelo padrão e não se exibe aviso de campo vazio;
uma tarefa realmente nova ainda é inicializada pelas regras definidas. Configurações de Provider migradas incorretamente são corrigidas apenas manualmente, sem adicionar código de autocorreção.

- [`bugfix-01-builtin-provider-overlay-recreation.md`](./bugfix-01-builtin-provider-overlay-recreation.md) corrige o Built-in Provider comum que, após excluir o Personal Overlay, ficava permanentemente bloqueado para nova adição pelo gate de aposentadoria dentro do processo antigo.
- [`bugfix-02-provider-reorder-drop-flicker.md`](./bugfix-02-provider-reorder-drop-flicker.md) corrige o quique de retorno e o salto secundário no Provider, causados por o deslocamento temporário do arraste ser limpo primeiro e a View oficial de Settings chegar depois; o Model mantém a ordenação otimista de formulário já existente.
- [`bugfix-03-provider-review-boundary-closeout.md`](./bugfix-03-provider-review-boundary-closeout.md) fecha os problemas de salvamento de configurações, de vaga de configuração de modelo e de fronteira encontrados na Provider Review.
- [`bugfix-04-model-json-editor-fixed-height.md`](./bugfix-04-model-json-editor-fixed-height.md) mantém a entrada Model JSON como uma caixa de texto de altura fixa, com value longo ou placeholder Effective rolando apenas dentro do controle.
- [`bugfix-05-personal-config-worker-refresh.md`](./bugfix-05-personal-config-worker-refresh.md) exclui o `fs.watch` do Personal Config como única cadeia de notificação, passa a usar polling assíncrono de revisão de conteúdo e faz o teste de conexão atualizar ativamente o Worker Registry antes de procurar o modelo.

## Relações entre documentos

- [`todo-98-builtin-option-map-formatting-regression.md`](./todo-98-builtin-option-map-formatting-regression.md) a implementar: restaura as quebras de linha e a indentação da estrutura de objeto do Built-in Map, com o ternário simples na mesma linha; corrige apenas a formatação, preservando a lógica atual e independentemente da renomeação de níveis do Todo95C.
- [`todo-99-worker-account-selection-repair.md`](./todo-99-worker-account-selection-repair.md) o escopo de decisão desta rodada foi concluído: states completos, reenvio de confirmação/falha, Subagent explícito, anexos, autoridade do Bot Session, duas corrida parciais parciais e o fechamento da revisão por entrada; requisições do Pro, recuperação a frio e sucesso/recuperação de atraso de sincronização passaram, e a falha de módulo que só registrava log sem estado terminal foi corrigida. O W99-E05 (celular/SSH conjunto em dispositivo real) foi explicitamente adiado pelo usuário e não foi apresentado como aprovado em todas as plataformas. Sem refatoração de ciclo de vida, sem nova barreira de envio, sem migração e sem alteração do Todo101; consulte o razão de re-revisão e o registro de testes.
- [`todo-100-account-provider-selection-architecture-investigation.md`](./todo-100-account-provider-selection-architecture-investigation.md) investigação puramente concluída: registra a perda de states, o ACK aplicado falso, o Subagent explícito, os turnos posteriores do Bot e as lacunas de despacho de anexos. O plano de implementação posterior foi fechado no Todo99; a conclusão da investigação não significa que o produto foi corrigido.
- [`todo-101-concurrent-account-providers-draft.md`](./todo-101-concurrent-account-providers-draft.md) Draft / implementação adiada: Providers concretos pessoal e de múltiplos Teams coexistindo, página de configurações apenas de navegação, cancelamento da correspondência automática entre Providers; identidade de instância, migração e gaveta ainda pendentes de decisão. Continua-se com o login de apenas uma conta, sendo a conta logada que define o domínio do período ocioso, e o Ticket não é revinculado. Desta vez se lança com a arquitetura existente, sem alterar antecipadamente o código ou o formato de persistência.

- [`todo-87-selection-view-unified-resolution.md`](./todo-87-selection-view-unified-resolution.md) implementado: após a atualização da conta e do Personal/Built-in, resolve unicamente a intenção original, cobrindo Composer, tarefas agendadas em segundo plano, Bot e Wiki; o período ocioso tem somente proteção de leitura, sem troca de bilhete entre contas. O Subagent explícito mantém nesta rodada a validação original por decisão. Assume o D02 do Todo85; sem sincronização antes do envio e sem migração de armazenamento, separado das responsabilidades de atualização upstream do Todo86.

```text
design-v2/
└─ Como o sistema final funciona e como os materiais históricos são arbitrados
        |
        v
steps/
└─ Como migrar do código atual para esse design
        |
        v
research/
└─ Evidências do estado atual que sustentam as decisões de design e implementação
```

Research não é o design-alvo. Ao encontrar novos fatos durante a implementação, registre primeiro a evidência e só então avalie se ela afeta o design-v2 ou o step atual.

## Regras de manutenção

Todo pendente atualizado: [Todo113: atualização do catálogo de modelos recentes e da configuração inteligente](./todo-113-new-model-catalog-refresh.md). O primeiro lote está concluído; a segunda rodada de preenchimento de lacunas do catálogo, pesquisa profunda da configuração inteligente, verificação do suporte do agregador e limpeza de desativações está a executar, e o escopo atual segue a seção 0 desse documento, sem alterar as escolhas históricas do usuário nem a arquitetura de contas.

Novo todo: [Todo112: unificação de maiúsculas/minúsculas do Model ID GLM oficial](./todo-112-official-glm-model-id-normalization.md). A lista de templates oficiais/regras precisas e a lista dinâmica de modelos do Start recebem nomenclatura unificada; as seleções existentes recebem, na migração, a normalização de maiúsculas/minúsculas do GLM oficial, em coordenação com o Todo111, sem envolver terceiros, cartões de cota ou estatísticas históricas e sem estender a migração de sobrescritas pessoais. Todos os itens pendentes de confirmação foram fechados; a aceitação do tamanho de caixa alvo pelo endpoint oficial foi confirmada pelo usuário, aguardando implementação.

- [Todo114](./todo-114-account-status-sync-and-key-retry.md): o Todo105 original do upstream, renumerado na mesclagem para evitar colisão de número com a redução da lista de modelos deste ramo. Implementou a complementação do protocolo de motivo de plano pessoal, a unificação da classificação de Key ausente das duas empresas e a interação de retry; os 280 testes direcionados do upstream e quatro grupos de componentes no navegador passaram, e a verificação restante do App completo/cadeia móvel vai para o Todo102.

Um documento de fase deve permitir ao leitor confirmar pelo menos quatro coisas: o objetivo da fase, o status atual, o que foi realmente entregue e os problemas restantes. A estrutura concreta é determinada pelo conteúdo da fase, sem exigir um template uniforme.

Antes do início da fase, o objetivo e as fronteiras de compatibilidade são explicitados. Durante a implementação, decisões autônomas tomadas fora do plano, mas necessárias para continuar o avanço, entram no implementation log; questões que alteram a abstração-alvo, a semântica de produto ou o contrato público entram no Human in the Loop e, após a decisão humana, são reescritas no design. Listas normais de commit e saídas de comando não precisam ser registradas item a item. Problemas sistemáticos descobertos após o merge entram na review.

Uma fatia pode ser mergeada de forma independente, mas na conclusão da fase não podem coexistir duas semânticas de negócio de longo prazo. A lógica de compatibilidade do período de migração precisa ter uma posição explícita e uma condição de saída.