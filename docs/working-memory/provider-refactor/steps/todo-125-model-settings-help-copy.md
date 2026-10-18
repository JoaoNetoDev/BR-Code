# Todo 125: ajuda com interrogação e texto final na página de configurações de modelos

> 2026-09-11, em execução: gravar literalmente os pacotes de idioma zh e en conforme a seção 3, com
> 9 interrogações reaproveitando o Popover existente. A posição da configuração inteligente segue o
> Todo131 e nenhum ponto de interrogação é adicionado ao ID. As explicações não participam de eventos de
> formulário e não alteram a configuração do modelo nem a capacidade de execução.

> Decisão posterior de layout (2026-09-11): o [Todo131](todo-131-model-settings-smart-config-placement-and-restore.md)
> move a configuração inteligente e a interrogação para o lado direito do contêiner do ID do modelo,
> substituindo a restrição de posição "ainda no rodapé" deste documento; o texto das explicações e a
> interação da interrogação não mudam e nenhum ponto de interrogação foi adicionado ao ID do modelo. O
> Todo131 está pendente de execução e isso não significa que a UI já foi movida.

> Status: implementação de produto, verificação parcial e review concluídos; aceitação final do lote
> completo do Goal pendente. Implementação autorizada em 2026-09-11.
>
> Data: 2026-09-11

## 1. Contexto e restrições de implementação

O usuário quer explicar na página de configurações de modelos o que é a configuração inteligente e o
significado de cada ajuste. O texto atual de "智能配置" usa o `title` nativo, a dica não é evidente e o
tempo de exibição é controlado pelo navegador. Este Todo adiciona uma entrada explícita de
explicação por interrogação.

**A implementação precisa seguir as decisões finais item a item desta discussão, sem improvisar, mudar
por conta própria ou redesenhar. A seção 3 é o texto final em chinês e deve ser usado literalmente; não
suavizar, não adicionar nem remover lembretes, não acrescentar exemplos nem detalhes técnicos.** O inglês
é uma tradução de mesmo significado, sem ampliar promessas ou restrições. Se algum texto conflitar com
o comportamento real, primeiro apresente a evidência concreta e discuta com o usuário, em vez de alterar
o texto ou o comportamento de negócio para eliminar o conflito.

- adicionar apenas a interrogação e o popover de explicação, preservando o layout atual, os títulos de
  campo, as opções e os agrupamentos; a configuração inteligente continua no rodapé original;
- não alterar valores de configuração, defaults, modo inteligente/manual, sobrescrita e herança,
  salvar/cancelar, capacidades do modelo ou comportamento de seleção de modelo;
- não alterar Schema, protocolo, arquivos de persistência, tabelas, configurações embutidas
  recomendadas, mecanismos de refresh ou push; o texto descreve a funcionalidade existente e não
  autoriza refazer a funcionalidade;
- não adicionar popup de confirmação, lembretes extras após alternar, tutoriais, exemplos, entradas de
  link ou outros elementos de produto não confirmados;
- as decisões explícitas deste Todo prevalecem sobre esboços e propostas iniciais da conversa.
  Demandas fora de escopo são discutidas primeiro, sem corrigir outros problemas por conta própria.

## 2. Posição e interação confirmadas

- exceto pelo ID do modelo, adicionar um ícone de interrogação depois de cada campo ou título de grupo
  listado na seção 3. O `ⓘ` no texto serve apenas para marcar a posição da entrada de ajuda; na
  implementação usa-se o ícone de interrogação;
- quando há várias opções sob um título, usa-se uma única interrogação depois do título, explicando os
  itens um a um na mesma explicação; não se repetem interrogações ao lado das opções;
- o ID do modelo não recebe interrogação nem explicação;
- no desktop, passar o mouse sobre a interrogação mostra imediatamente, sem usar a espera do `title`
  nativo; no celular, tocar na interrogação mostra;
- a interrogação suporta foco por teclado para exibição; clicar nela apenas abre a explicação, sem
  alternar interruptores ou opções vizinhos e sem enviar o formulário;
- a dica usa as normas de design e o estilo de componente existentes, contemplando desktop, Web no
  celular, zh/en e temas claro e escuro; não move controles existentes nem refaz o layout do formulário;
- o `title` original da configuração inteligente é substituído pela nova entrada de explicação, evitando
  duas versões diferentes de texto ao mesmo tempo.

```text
Campo ou título de grupo existente + interrogação
                     |
          hover / foco por teclado / toque no celular
                     |
              mostra a explicação desse título
                     |
         afeta apenas a visibilidade da dica, não altera o rascunho de configuração

Rodapé do formulário: interruptor original de configuração inteligente + texto original + interrogação
```

## 3. Texto final em chinês (implementação literal)

### 模型 ID

Sem interrogação.

### 上下文窗口 ⓘ

> 模型一次可处理的上下文容量，单位为 Token。ZCode 会据此管理上下文。
> 请勿超过模型的实际上限。

### 最大输出 Token ⓘ

> 单次模型请求允许生成的最大 Token 数。
> 请勿超过模型的实际上限。

### 输入类型 ⓘ

> 设置模型能够接收的内容类型：
>
> - **文本**：接收文本内容，为必选项。
> - **图片**：接收图片内容。
> - **视频**：接收视频内容。
> - **PDF**：直接接收 PDF 文档。

### 输出类型 ⓘ

> 模型生成回复的内容类型。目前不支持文本以外的其他选项。

### 模型能力 ⓘ

> - **结构化输出**：支持通过 JSON Schema 约束模型输出的字段、类型和结构。
> - **原生联网搜索**：支持使用模型接口内置的联网搜索能力。
> - **对话中系统消息**：支持在对话中途插入系统指令。
>
> 请勿勾选模型不支持的能力。

### 推理档位（从低到高）ⓘ

> 设置聊天时可选择的推理档位，**必须按推理强度从低到高排列**。
> 请勿配置模型不支持的推理档位。

### 推理参数映射 ⓘ

> 使用 CEL 表达式，将当前推理档位 `reasoningLevel` 映射为模型接口的请求字段。表达式返回的 JSON 对象会合并到实际发送的请求体中。

### 高级设置 ⓘ

> **MFJS 工具 Schema**：启用 Moonshot Flavored JSON Schema（Moonshot 的 JSON Schema 格式）兼容处理，常用于 Moonshot 的 Kimi 模型接口。仅在模型接口要求该格式时开启。

### 智能配置 ⓘ

> 根据模型 ID、Base URL 和 API 格式，为您智能匹配推荐配置。ZCode 会持续更新推荐配置，并自动同步给您。
> 如果手动修改某项配置，该项将转为手动管理，不再跟随推荐更新；其他配置仍由智能配置管理。

## 4. Propostas retiradas ou esclarecidas (proibido reintroduzir)

- não mover o interruptor de configuração inteligente; o esboço inicial no topo foi corrigido;
- o ID do modelo é a exceção explícita à regra de adicionar interrogação a todos os títulos;
- em Tipo de entrada não se escreve tamanho de arquivo, número de páginas nem outros limites de anexo, e
  também não se acrescenta um "acima estão os limites do ZCode..." ou algo equivalente;
- os níveis de raciocínio continuam de baixo para alto. O usuário confirmou explicitamente que o "do alto
  para baixo" anterior foi um lapso de fala, e a exibição, o armazenamento e a lógica de seleção do nível
  máximo não são revertidos;
- em Níveis de raciocínio não se escreve que "o nome e a quantidade podem ser customizados"; em
  Mapeamento de parâmetros de raciocínio não se anexa exemplo, diagrama de conversão nem lembrete extra
  sobre requisitos de interface;
- não adicionar mecanicamente lembretes como "não exceda..." a todas as explicações. Mantêm-se
  apenas as frases concretas já confirmadas na seção 3;
- usar uniformemente "模型" conforme o texto final, sem voltar a "模型服务" ou variantes; a
  configuração inteligente usa os mesmos termos Base URL e API 格式 da página de configurações;
- não incluir garantias absolutas como "sempre o mais preciso" nem explicar o comportamento de
  desligar/religar a configuração inteligente; esses comportamentos não são modificados nesta rodada;
- não adicionar opções que a página atual não tem, como áudio ou chamada de ferramenta.

## 5. Entrada de implementação e aceitação

Arquivos de referência; na implementação vale a baseline mais recente:

- `packages/ui/src/settings/model-provider-section/ProviderModelMetadataDialog.tsx`: títulos do formulário e
  layout do rodapé.
- `packages/ui/src/settings/model-provider-section/ProviderModelMetadataDialogActions.tsx`: texto da
  configuração inteligente e o `title` existente.
- `packages/ui/src/settings/model-provider-section/ProviderModelSettingsGroups.tsx`: configurações de
  raciocínio e configurações avançadas.
- `packages/ui/src/ControlHintTooltip.tsx` e os componentes Tooltip/Popover existentes: reaproveitar o
  estilo e os componentes atuais, sem mudar globalmente o comportamento de outras dicas.
- `packages/ui/src/i18n/locales/zh-CN.ts` e `en-US.ts`: texto final e tradução em inglês de mesmo
  significado.

Depois da autorização de implementação, ler primeiro o `DESIGN.md` e respeitar as regras de spec, teste
primeiro e gate de arquitetura do repositório; este Todo é a especificação de implementação deste item
dentro do Working Memory atual.

- [ ] Conferência literal da seção 3 em chinês; inglês sem omissões e sem significado novo.
- [ ] ID do modelo sem entrada de ajuda e uma interrogação em cada um dos outros 9 títulos; opções de
  grupo sem interrogação repetida e posição da configuração inteligente inalterada.
- [ ] E2E verificando exibição imediata no hover do desktop, visualização por teclado e exibição no
  toque do celular; fechamento e troca de exibição do popover funcionando, sem dica nativa duplicada.
- [ ] Clicar de fato na entrada de ajuda não aciona interruptor, não modifica o rascunho nem salva; o
  comportamento original de edição, salvamento e cancelamento do formulário permanece.
- [ ] Temas claro e escuro, zh/en e tamanhos de desktop e celular com leitura completa, e textos longos
  sem corte no container de rolagem do popup nem overflow da viewport.
- [ ] Concluir as verificações afetadas, `pnpm typecheck`, `pnpm lint` e o E2E correspondente; registrar
  os resultados com fidelidade, sem marcar como aprovado o que não foi executado.

## 6. Resultado registrado nesta rodada

Foram implementadas 9 interrogações, exceto no ID do modelo; a posição inteligente obedece ao Todo131.
Reaproveitou-se o Popover/Button existente e os pacotes de idioma, renderizando apenas o negrito do texto
final, o código inline e as listas, sem aceitar HTML nem entrada do usuário. Os 9 testes unitários
literais em chinês e a revisão semântica do inglês foram concluídos; o texto antigo de `title` nativo
foi removido.

Verificação real de browser com Hook/componente para hover no desktop, foco por teclado, toque no
celular, fechamento por Escape e troca de explicação; cada popover foi conferido como inteiramente
dentro da viewport, sem modificação do rascunho nem gravação. 390 zh claro e 1200 en escuro passaram, com
revisão por captura da diagramação em inglês e da geometria em tela estreita; por falta de fontes
chinesas no Linux, **não se pode declarar a aceitação visual dos glifos chinesiros como aprovada**. As
explicações não adicionam capacidade de modelo, configuração nem lógica de execução;
shared-host/stream de mensagens seguem inalterados. typecheck da raiz, lint (0 erros/41 warnings) e
arquitetura (0 violações) passaram, assim como os 60 testes unitários relacionados. A interação no
browser não é uma integração real com um Host em celular; as limitações finais do lote e de hardware
são geridas pelo razão de execução.

# Complemento final de regressão associado

O botão de ajuda não pode ficar aninhado no label de um campo de entrada; o título se关联a à entrada por
htmlFor/id, e o botão de ajuda é um controle independente na mesma linha, sem roubar o label ou o foco
da entrada. O título de grupo com vários níveis não é o label de uma única entrada. Esta correção não
altera o texto da ajuda, o estado nem o comportamento de salvamento.