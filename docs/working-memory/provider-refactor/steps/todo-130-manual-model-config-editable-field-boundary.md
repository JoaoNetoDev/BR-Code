# Todo130: Correção do Switch de Configuração Inteligente e da Fronteira de Campos Editáveis da Configuração Manual

> Decisão posterior de 2026-09-12: o [Todo134](todo-134-model-editor-basic-advanced-draft.md) oculta
> MFJS / tipo de saída, e o MFJS sai do schema editável manualmente; o mecanismo geral deste documento
> de "fixar apenas os campos editáveis" é mantido. A linha de MFJS da tabela histórica de campos abaixo
> não é mais válida.

> Resultado da execução em 2026-09-11: **implementação local e revisão parcial concluídas; a aceitação
> final do lote inteiro ainda está pendente**. O schema de domínio define as folhas editáveis, e extração
> e limpeza reutilizam a estrutura do schema; a regra manual mantém a linha de base do sistema da
> identidade atual, e a admissão completa de execução não é afrouxada. O codec de arquivo apenas
> normaliza regras manuais antigas completas e estritamente válidas, e salvamentos subsequentes escrevem
> o novo formato; formas desconhecidas/corrompidas continuam sendo rejeitadas. Os layouts e a ajuda do
> Todo131/125 são integrados à parte e não fazem parte da declaração de implementado deste item.

### Evidências de Implementação e Revisão desta Rodada

- Primeiro foram escritas duas falhas de teste de domínio, com o schema antigo rejeitando o novo
  formato manual; depois foram escritos testes de falha de codec/rascunho, que detectaram o problema de
  campos ocultos ainda sendo materializados. Após a implementação, 42 arquivos e 498 casos passaram em
  Provider, Provider Node e componentes/rascunhos de UI relacionados. Em seguida foi adicionado um teste
  real com Repository temporário de gravação/reabertura/ativação, e esse arquivo teve 8 casos aprovados;
  por fim, os 37 casos direcionados de rascunho passaram (contagem não acumulativa).
- `manual-model-config.ts` deriva o novo schema a partir dos pick de folhas estritas compartilhadas, com
  o tipo inferido por z.infer. Por padrão o novo campo não entra no contrato manual; `enabled` opcional/
  null mantém seu significado original, e false é um valor manual válido. A síntese primeiro limpa a
  linha de base editável e só então sobrepõe os valores manuais, e uma regra incompleta construída
  diretamente também não é completada por herança para se tornar executável.
- A fronteira estrita de arquivo expôs que `ModelPropertiesConfig.toJSON()` não chamava recursivamente o
  toJSON dos formatos de input/output, fazendo com que chaves de sistema undefined da instância de classe
  se misturassem à validação; foi corrigida a serialização aninhada, em vez de afrouxar o schema ou
  aceitar silenciosamente campos ocultos. O formato manual antigo completo e válido é extraído
  localmente pelo codec, enquanto a escrita pela nova API continua rejeitando campos de sistema. A
  seleção padrão de arquivos reais, a ordenação e a ativação independente são preservadas, e os testes
  protetores contra arquivos antigos corrompidos continuam passando.
- A UI removeu a responsabilidade de rascunho sobre o mapeamento oculto e o tool-call, e áudio/texto
  fixo deixam de ser materializados pelo editor; ao fechar, salva-se apenas o conteúdo editável. De A
  para B sem resolução não há fallback para a configuração de A; voltar ao inteligente limpa apenas as
  sobrescritas editáveis, sem apagar folhas de sistema existentes nem a ativação. O switch aparece
  sempre, desabilitado somente durante o salvamento.
- Duas verificações reais no browser com Hook + pop-up em 390/zh/light e 1200/en/dark passaram: ID vazio
  não faz requisição, o switch é operável, e após fechar durante o parsing um sucesso/falha antigo não
  sobrescreve o rascunho, sem erro de salvamento nem de página. Os novos testes continuam sendo validação
  de componente em browser isolado; não se afirma execução real em Pro/Electron/celular shared-host.
- O typecheck da raiz passou, o lint da raiz teve 0 errors / 41 warnings já existentes, e a arquitetura
  teve 0 violations. O schema completo de execução não foi afrouxado, API de requisição/Selection/Model
  em trânsito não foram alterados, e não houve protocolo, número de versão ou migrador global novo. Não
  há evidência externa adicional de publicação do formato antigo; conforme o escopo estabelecido,
  oferece-se a normalização de leitura local do formato completo antigo estritamente válido, sem
  afirmar que se verificou "nunca publicado".

> Decisão de interação posterior (2026-09-11): o
> [Todo131](todo-131-model-settings-smart-config-placement-and-restore.md) é responsável por mover a
> configuração inteligente para o lado direito do ID do modelo e pelo botão "restaurar" no rodapé,
> substituindo a restrição local deste documento de não mudar o layout; a atribuição de campos, o schema
> manual e a síntese de salvamento continuam sendo regidos por este Todo, e ambos estão pendentes.

> Status: **pendente de execução,solução já confirmada**. Em 2026-09-11 o usuário confirmou que "desligar
> a configuração inteligente fixa apenas os campos editáveis da página" e exigiu que o planejamento
> completo fosse registrado em disco; esta rodada escreve apenas o Todo e não autoriza implementar
> imediatamente o código de produto a partir dele.
>
> Decisão central: o switch aparece sempre e só é desabilitado durante o salvamento; a configuração
> manual salva apenas o conjunto completo de campos editáveis, e os campos de sistema continuam sendo
> resolvidos e atualizados junto com o modelo atual e a configuração de integração. Não se adiciona
> nenhuma entrada de edição para campos ocultos.
>
> Escopo de compatibilidade: ao comentário do usuário de que "o formato manual completo atual pode já
> ter sido oficialmente publicado", a resposta foi "isso provavelmente não existe, não é um problema
> grande". O planejamento parte da premissa de **provavelmente ainda não publicado oficialmente**,
> sem pressupor migração complexa, arquivo novo ou upgrade de versão; esse é o juízo atual e não é
> escrito como fato de publicação verificado.
>
> Relacionados: [Todo90 rascunho compartilhado de adicionar/editar](./todo-90-model-add-edit-shared-recommended-draft.md),
> [Todo92 feedback de override](./todo-92-model-smart-config-and-override-feedback.md),
> [Todo104 ajuste fino do schema](./todo-104-pre-release-schema-review.md). Este Todo substitui as regras antigas
> de "desabilitar o switch quando a recomendação não está pronta", "no modo manual fixar a configuração
> inteira" e "todos os campos do modelo são obrigatórios e limpam a linha de base do sistema"; outros
> comportamentos, evidências e decisões já concluídos não são reabertos.

## 1. Contexto e Problemas Verificados

O usuário relatou que às vezes não é possível desativar a configuração inteligente na página de
configurações de modelos. A investigação encontrou:

1. `ProviderModelMetadataDialog` desabilita o switch no modo inteligente quando o ID está vazio e a
   recomendação não está pronta; quando há ID mas não há recomendação e não está em pending, ele ainda
   oculta o switch.
2. `useProviderModelDraft.pending` expressa "precisa resolver mas não tem resultado" e não equivale a
   "a requisição está em andamento"; após uma falha de resolução ele pode ficar true para sempre. A falha
   de resolução automática é engolida pelo agendamento idle, o usuário pode não ver o erro e não consegue
   voltar para o manual.
3. Abrir o switch diretamente expõe um defeito de salvamento: ao ir de A para B e fechar antes de B ser
   resolvido, a submissão pode repor a partir do `currentModel.config` do A original o mapeamento oculto
   de max output.
4. Um modelo totalmente novo sem recomendação exige, mesmo com todos os campos visíveis preenchidos, o
   `maxOutputTokens.map` oculto no salvamento manual, e a ausência é reportada como erro de Token de
  max output.
5. A camada de domínio também fixa a configuração inteira: `manualModelConfigSchema` deriva da
   configuração completa, com apenas enabled opcional; `ModelConfigRules.resolve()`, ao encontrar uma
   regra manual, limpa a configuração anterior e mantém apenas enabled. Modificar apenas a UI não basta
   para atender à nova semântica.

Em 2026-09-11 foram feitas 7 verificações isoladas com o Hook e o componente de pop-up reais do
repositório, todas passando por asserção do **comportamento atual do problema**: estado do switch em
normal/ID vazio/aguardando, permanência desabilitado após falha de resolução e clique sem callback,
pending que não desaparece após falha ao reativar o manual, mapeamento do A antigo entrando em B, e
erro mesmo com os campos visíveis preenchidos e sem mapeamento oculto. Não se trata de uma regressão
formal pós-correção, e a falha de requisição daquele usuário não foi confirmada em campo.

Na verificação, o `HEAD=615657da82` local; a checagem de freshness apontou que o staging está 5 commits
atrás de origin/staging, e os schemas, regras e implementação de salvamento relacionados a Provider
estão consistentes com essa referência remota. Esta rodada não faz merge/rebase; é preciso checar e
alinhar novamente com a linha de base real de desenvolvimento antes de implementar. Não houve mudança de
código de produto, conta real, arquivo de configuração ou requisição.

## 2. Primeira Camada: Atribuição de Campos

| Editável na página, gerenciado pelo usuário no modo manual | Caminho de configuração correspondente                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Janela de contexto                                         | `properties.contextWindow`                                                                                |
| Teto de Token de max output                                  | `optionSpecs.maxOutputTokens.max`                                                                         |
| Entrada de imagem, vídeo, PDF                             | `properties.inputFormat.supportsImage / supportsVideo / supportsPdf`                                      |
| Saída estruturada, busca nativa, mensagem de sistema no meio da conversa | `properties.supportsJsonSchemaOutput / supportsNativeWebSearch / supportsMidConversationSystem` |
| Nível de raciocínio e mapeamento de parâmetros de raciocínio | `optionSpecs.reasoningLevel.values / map`                                                                 |
| Schema de ferramenta MFJS                                  | `properties.requiresMfjsToolSchema`                                                                       |

| Não editável na página, não fixado no modo manual | Caminho de configuração correspondente |
| -------------------------------------------------- | ---------------------------------------- |
| Mapeamento de parâmetros de requisição de Token de max output | `optionSpecs.maxOutputTokens.map` |
| Capacidade de tool call                     | `properties.supportsToolCall`             |
| Capacidade de entrada de áudio              | `properties.inputFormat.supportsAudio`    |
| Declaração de entrada de texto fixo e de saída de texto | `properties.inputFormat.supportsText`,`properties.outputFormat.supportsText` |

O ID do modelo pertence à identidade e enabled pertence à ativação independente; nenhum dos dois é
reescrito pela troca de modo. enabled continua preservando a semântica opcional/null atual e o valor
explícito do usuário, sem copiar uma nova sobrescrita de ativação da configuração válida ao fechar.

"Editável" é um contrato explícito de campos de produto e não pode ser inferido de se o controle DOM
atual está disabled, do tipo do cliente ou de um estado transitório. Travar os controles durante o
salvamento ou ainda não ter ID não muda a atribuição; novos campos internos criados depois não entram
por padrão no escopo de fixação manual, e qualquer nova configuração de usuário exige ajustar
explicitamente o contrato e os testes.

Dizer que o sistema é responsável não significa escrever sempre true/false ou um nome de parâmetro fixo,
e sim continuar fornecendo o fato pela fonte de regras atual. Não se forja campo de sistema com default
da UI nem se escreve um mapeamento `{}` automaticamente para resolver erro de salvamento.

## 3. Segunda Camada: Schema Manual e Fronteira de Escrita

### 3.1 Forma Alvo

Mantêm-se as regras exatas existentes de Provider/Model, o conjunto `manualProviderModelRules` e os
nomes aninhados; o protocolo de schema não é refeito. O `config` de uma regra manual exige **campos
editáveis completos** e não exige mais campos de sistema.

Tomando a camada optionSpecs como exemplo (a interface serve apenas para discutir a forma; a
implementação deriva o tipo do schema):

```ts
interface ManualModelOptionSpecs {
  reasoningLevel: {
    values: readonly string[];
    map: string;
  };
  maxOutputTokens: {
    max: number;
  };
}
```

A camada properties segue a seção 2 para as folhas editáveis; inputFormat exige apenas image/video/pdf.
As folhas editáveis mantêm o tipo e a validação originais: inteiro positivo, níveis de raciocínio não
vazios e sem duplicatas, CEL válido etc.; false é um valor de usuário válido e um mapeamento de
raciocínio legal `{}` segue a validação original. Não se pode transformar a camada inteira em um partial
arbitrário, sob pena de um campo manual ausente voltar a herdar a recomendação.

### 3.2 Princípios de Implementação

- Derivar por pick/omit/extend a partir do schema de folhas existente, usando `z.infer` para o tipo, sem
  manter um segundo conjunto escrito à mão de tipos ou validações.
- Declarar o contrato de campos manuais dentro do domínio de Provider; a UI o reutiliza ou usa as
  funções de extração de campos exportadas, e o domínio não importa componentes de UI.
- Schema, extração para salvamento e sobreposição na resolução usam a mesma base de atribuição, evitando
  três listas diferentes.
- Regras manuais recém-escritas não permitem campos de sistema; não se pode gravar por conta própria
  `currentModel.config`, o personalConfig antigo ou o inputFormat completo via object spread.
- Preservar as restrições existentes de validação de membro, IDs duplicados, modelos embutidos não
  renomeáveis, conflito de revision e submissão atômica de membro/ordenação/regra.
- O modo inteligente continua com a semântica existente de sobrescrita esparsa; a página não pode criar
  automaticamente sobrescritas de campos ocultos a partir de um valor inicial exibido de forma
  conservadora. Esta rodada não amplia para proibir toda configuração avançada em outras entradas; o
  problema está claramente concentrado na materialização do editor e na regra manual.

## 4. Terceira Camada: Síntese da Configuração Final

A lógica atual de limpeza completa precisa ser trocada por uma síntese que preserve os campos de
sistema. Usa-se o mecanismo de regras existente, a hierarquia de regras e a resolução homônima
Host/CLI, sem criar um segundo "Registry manual".

```text
当前 Provider / 模型 / API 格式 / Base URL
                    |
             现有系统规则解析
                    |
        提取并保留系统负责的字段 + 原启停语义
                    +
             完整的手动可编辑字段
                    |
               最终模型配置
                    |
           原有完整性/可执行性校验
```

É preciso garantir simultaneamente que:

1. Os campos manuais editáveis não acompanham mais as mudanças da recomendação do sistema e, quando
   ausentes, são rejeitados pelo schema manual, sem preenchimento silencioso de valor.
2. Os campos de sistema continuam sendo resolvidos a partir da identidade atual, e atualizações de
   Builtin e mudanças de integração podem valer; não são congelados na configuração pessoal.
3. Depois de mudar de A para B, jamais preencher campos de sistema a partir da linha de base ou do cache
   de A; o rascunho editável preservado do usuário ainda é intenção explícita do usuário.
4. Desligar a configuração inteligente apenas interrompe a escrita automática de valores recomendados no
   formulário editável, e não interrompe a resolução das regras de sistema da configuração final do
   modelo.
5. `completeModelConfigDataSchema` e a admissão de configuração completa do Registry continuam estritas;
   não se tolera campo faltante para execução por causa do modo manual.
6. Não se altera o ciclo de vida de congelamento já existente do Model criado e das requisições em
   execução; a validade é pela atualização do Registry atual e pela próxima fronteira de resolução de
   modelo.

## 5. Quarta Camada: Página e Ciclo de Vida do Rascunho

### 5.1 Switch e Troca de Modo

- O switch aparece sempre e `disabled` é controlado apenas por saving; sem ID, durante o parsing, após
  falha de parsing e sem recomendação ele pode ser alternado.
- Ao fechar, salva-se a entrada editável existente e preenchem-se os valores de recomendação editáveis
  válidos já obtidos pelo modelo atual. Valores não obtidos, níveis de raciocínio e mapeamentos ficam
  vazios; controles de capacidade mantêm o valor inicial explícito do formulário, sem declará-lo resultado
  de recomendação.
- Não copiar campos ocultos; `maxOutputTokensMapValue` e afins, se servem apenas para fixação, devem
  perder a responsabilidade de salvamento de rascunho. Valores de sistema com uso real de exibição
  permanecem somente leitura e não entram no objeto submetido.
- Remover fallbacks de modelo antigo no salvamento como `draft.map ?? currentModel.config.map`, em vez
  de mascarar a ausência com um novo fallback.
- Após fechar, mantém-se a validação de geração/identidade de edição já existente, invalidando
  resultados de recomendação em trânsito e parando de aplicar recomendações ao formulário manual; sem
  criar request/cache de estado extra.
- Reativar continua limpando as sobrescritas pessoais no escopo gerenciado pelo editor e tomando a
  recomendação pela identidade atual; novas edições posteriores são preservadas e enabled não muda.
- pending não pode mais decidir se o switch está disponível; se ainda for usado para exibição de
  recomendação ou preparação de submissão, é preservado conforme sua responsabilidade real, sem renomear
  ou refatorar todo o Hook assíncrono por causa do switch.
- A troca de modo só altera o rascunho; só o salvamento grava em disco, cancelar não escreve e falha
  preserva a edição. Adição e edição compartilham a mesma lógica, preservando as diferenças de
  permissão de identidade.

```text
推荐解析中/失败
      |
用户关闭智能配置
      |
冻结可编辑草稿，旧推荐回包失效
      |
手动编辑 → 可编辑字段校验 → 原子保存个人规则
      |
系统字段仍由当前 Registry 合成；不会被迟到响应写入手动草稿
```

### 5.2 Dois Erros Precisam Ser Distinguidos

| Estado                                             | Tratamento                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| Campo editável do usuário ausente/inválido        | Impede o salvamento, apontando o campo real                                 |
| Campos editáveis completos, mas a configuração do sistema sem campo de execução | Permite salvar a regra pessoal válida; o modelo permanece não-executável no Registry e mostra o problema de configuração |

Mantém-se o mecanismo candidato atual de "modelo incompleto pode ser corrigido nas configurações, mas
não executa". A ausência de `maxOutputTokens.map` não reporta mais erro de limite de entrada do
usuário, não se adiciona editor de campo oculto e não se afrouxa a verificação real de criação de modelo.

## 6. Compatibilidade Mantida Leve Sob a Premissa de Não Publicação

A decisão do usuário sobre as preocupações de compatibilidade na rodada anterior foi, literalmente:
"isso provavelmente não existe, não é um problema grande". Por isso esta rodada **não pressupõe** upgrade
de versão, escrita dupla, arquivo novo, migrador complexo ou sistema de rollback, nem transforma esse
risco em um projeto grande independente.

- Na implementação, fazer uma verificação de fato de publicação com fronteira definida; sem evidência
  contrária, tratar como correção do formato não publicado deste branch, sem exigir compatibilidade com
  todos os estados intermediários de iteração.
- Para os registros manuais completos que podem já existir no ambiente de desenvolvimento atual, uma
  normalização local basta: preservar campos editáveis, a identidade Provider/Model e enabled; campos
  de sistema fixados no passado não participam da nova sobrescrita manual. Não se apaga a configuração
  pessoal inteira nem se reseta Provider/seleção padrão/ordenação não relacionados.
- Verificar a normalização de escrita após leitura no codec e no Repository, garantindo que o novo schema
  estrito não faça um registro manual antigo completo ser julgado ruim por inteiro e perder a visão
  pessoal. O tratamento acontece só na fronteira em que a estrutura manual antiga é claramente
  identificada, sem engolir indiscriminadamente todo campo desconhecido/arquivo inválido.
- Se, na implementação, surgir evidência clara de que esse formato manual completo já foi publicado
  oficialmente, descrever a evidência e os ajustes de compatibilidade necessários; não se reescreve o
  "provavelmente não existe" do usuário como isenção de compatibilidade permanente já verificada, nem se
  desenha antecipadamente uma solução complexa para uma hipótese.

## 7. Locais de Modificação e Ordem de Implementação

| Camada                    | Local principal                                                                                                  | Finalidade                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Contrato de campos/schema | `packages/provider/src/config/rule-data-schema.ts`; reusando as folhas de `packages/shared/src/model-config.ts` | O manual exige apenas campos editáveis, sem enfraquecer o schema completo final |
| Síntese/escrita de regras | `packages/provider/src/config/model-config.ts`, fronteiras de escrita existentes de ConfigService/Facade | Campos de sistema herdados, campos manuais sobrescritos explicitamente, mantendo atomicidade e permissões |
| Rascunho/submissão        | UI `ProviderModelMetadata.ts`, `ProviderModelDraftState.ts`, `useProviderModelDraft.ts` | Materializar apenas itens editáveis e remover fallback de modelo antigo e de campos ocultos |
| Página                    | UI `ProviderModelMetadataDialog.tsx` e controles existentes                                                | Switch sempre visível, desabilitado só durante o salvamento; sem editor de item oculto e sem mudar o layout |
| Formato local             | `packages/provider-node/src/provider-config-file-codec.ts`, `personal-provider-config-repository.ts`, conforme necessidade | Tratar localmente registros antigos de desenvolvimento, evitando estrago na decodificação/normalização |
| Verificação/sincronização de fatos | schema, resolver, draft, componentes, Repository e E2E de configurações atuais                      | Verificar a cadeia completa e atualizar os fatos estáveis do Design V2 após a implementação |

Os caminhos de UI são relativos a `packages/ui/src/settings/model-provider-section/`. Não é obrigatório
que cada arquivo listado seja alterado; na execução, vale a referência real e os testes.

Ordem de implementação:

1. Atualizar os designs e as expectativas de caso relevantes deste Working Memory, acrescentando testes
   que falham na implementação antiga; não reescrever a verificação histórica dos Todo antigos como se a
   nova semântica já tivesse passado.
2. Conectar primeiro o schema, a síntese de regras, a fronteira de salvamento e a normalização local de
   leitura/escrita necessária.
3. Só depois alterar a extração do rascunho e o switch, evitando um estado meio-acabado em que a UI já
   escreve o novo formato e o Host ainda rejeita pelo schema completo antigo.
4. Validar em lote a configuração final no salvamento/reabertura da página e na criação real do Model, e
   por fim preencher os resultados e o commit. Mudanças pequenas de campo não disparam build completo
   repetidamente.

## 8. Checklist de Verificação

| Case    | Configuração e ação                                                          | O que precisa provar                                                                 |
| ------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| M120-01 | Adição/edição, sem ID, durante o parsing, em falha, sem recomendação, trocando de modo | O switch existe e é utilizável; só saving desabilita; é possível voltar de inteligente para manual |
| M120-02 | A para B, B ainda não resolvido, fechando e preenchendo os itens editáveis para salvar | Sem fallback de campo de sistema de A; a regra salva não tem campo oculto e a configuração interna final vem de B |
| M120-03 | Liga→desliga→liga, A→B→A, troca de Provider, fechamento do pop-up, invertendo a ordem de conclusão do parsing | Retornos antigos não sobrescrevem o rascunho manual/da nova geração; nenhuma reativação automática do inteligente |
| M120-04 | Configuração manual fixa valores editáveis, sistema atualiza capacidade e mapeamento | Campos do usuário não mudam; campos de sistema são atualizados; a semântica original de ativação não muda |
| M120-05 | Falta manual de qualquer campo editável obrigatório, ou passagem de campo de sistema | O novo schema de escrita rejeita com precisão; false e CEL válido são aceitos pelas restrições originais |
| M120-06 | Campos visíveis completos mas o mapeamento de sistema de maxOutput ausente, tentando criar o Model após salvar | A regra pessoal pode ser salva; o candidato mostra o problema de configuração do sistema, a execução é proibida e nenhum erro numérico falso é reportado |
| M120-07 | Registro manual completo antigo no ambiente de desenvolvimento, contendo outros Providers, seleção padrão e ordenação | A normalização local preserva valores/identidade/ativação do usuário, sem limpeza do arquivo inteiro nem perda de campos não relacionados |
| M120-08 | Salvamento com reabertura, cancelar, falha de salvamento, conflito de revision, reativar e editar de novo | Modo e valores corretos; cancelar não escreve; falha preserva; nova edição não é engolida pela recomendação restaurada |
| M120-09 | Modo inteligente com campo intocado/sobrescrita explícita/false explícito           | Mantém a intenção esparsa original e não gera sobrescrita de campo oculto por causa desta rodada |
| M120-10 | Desktop, celular com entradas de configuração existentes e CLI/Host consumindo a mesma configuração | Atribuição de campos e configuração final consistentes, sem novo desvio de escrita entre plataformas; sem mudar identidade remota/fluxo de mensagens |

- schema, regras, síntese de configuração, codec e rascunho usam testes unitários direcionados; testar
  classes/fronteiras reais e não apenas afirmar botão disabled.
- A interação do APP precisa de E2E cobrindo clique para fechar, preenchimento, salvamento, reabertura e
  cancelamento; casos de configuração inteligente já pendentes são atualizados conforme o lifecycle de
  E2E, sem tratar aprovação histórica como nova aceitação.
- Preservar as evidências de execução: callbacks de componente/rascunho e payload de salvamento, regra
  lida de volta e configuração final do Model. Quando for preciso log, seguir o logger da UI e evitar
  imprimir credenciais; a verificação de requisição usa transport isolado e não consome serviço real
  apenas para conferir mapeamentos.
- Desktop e celular mantêm as fronteiras originais shared-host e continuous/replayable, sem mudar a
  distribuição de Account, owner, queue, a identidade de Workspace ou a configuração de sessão em
  execução.
- Antes de implementar, checar as fronteiras com a skill de arquitetura; após o código, rodar
  `pnpm architecture:check --changed`, `pnpm typecheck`, `pnpm lint`, os testes unitários e E2E
  relevantes; o que não for verificável em máquina real fica registrado como pendente com honestidade.

## 9. Não Objetivos e Status de Entrega

Não se adiciona entrada de edição para campo oculto, não se renomeiam todos os tipos
smart/recommended, não se ajustam o catálogo de modelos nem os valores recomendados de Builtin, não se
alteram autenticação/plano/telemetria/Composer, não se implementam Todo128/129 e não se refaz a
arquitetura do arquivo de configuração pessoal. A nota de interrogação e os textos do Todo125 são tratados
de forma independente e não são polidos às escondidas nesta rodada.

Os riscos se concentram em extração incompleta de campos, fallback de valor antigo, campos de sistema
sendo gravados de novo e lacunas manuais mascaradas pela recomendação; os testes acima verificam isso
diretamente. A implementação concreta deve manter lotes completos e revisáveis, sem criar um novo
framework para abstrair cada folha.

Esta rodada entrega apenas a investigação, a decisão, a estrutura alvo e o plano de verificação em
disco. Os testes formais, a implementação de produto e a aceitação real de salvamento/requisição estão
pendentes; depois da implementação, acrescentar as mudanças reais de arquivo, a verificação, o commit e os
itens restantes.