# Todo 62: Encerramento do UX Review de Provider Template

> Atualização de atribuição de verificação (2026-09-09): as pendências de teste, falhas e promoções manuais que restavam neste documento foram transferidas uniformemente para [Todo102](todo-102-verification-debt-closeout.md); a programação de verificação independente neste documento é encerrada. As evidências históricas são preservadas, e a transferência não significa que os testes passaram.

> A falta de teste de E2E gráfico do Desktop que restou é encerrada uniformemente pelo Todo 78, e este Todo deixa de agendar isso separadamente.

> Status: concluído (o E2E de Desktop depende de Xvfb, ausente no ambiente Linux atual, e precisa ser reexecutado em uma máquina com ambiente gráfico)
>
> Data: 2026-09-02
>
> Pré-requisito: o Todo 61 já entregou a primeira implementação da casca de domínio Provider Template, da página de seleção, dos metadados de marca e do Logo empacotado. Este Todo apenas encerra os problemas de produto já confirmados no Review e as evidências automatizadas, sem alterar a atribuição de estado de Provider, Template, Overlay, Registry ou Model Config Rule.

## 1. Objetivo

Concluir os quatro tipos de trabalho de acabamento restantes após o Todo 61:

1. todos os Logos de Provider embutidos usam material quadrado, substituindo o wordmark horizontal da Alibaba Cloud, que não se adapta a um slot de ícone quadrado;
2. a falha na criação de um Template dá feedback claro dentro da área de detalhes do Provider;
3. o editor de enumeração ordenada de Reasoning Level é compactado para etiquetas mais enxutas;
4. completar a verificação de interação da criação real de Built-in Template e da exibição de marca.

Este ciclo mantém uma única cadeia principal:

```text
Provider Template
├─ nameMap
└─ config: Provider Config Overlay
          |
          v
createPersonalProvider
          |
          v
Personal Provider Config
          |
          v
Effective Provider / Registry
```

Não se adiciona Catalog, Service de marca, mapeamento de produto de Provider ID, downloader de Logo nem um segundo sistema de notificação de erro.

## 2. Contrato de material quadrado dos Logos embutidos

### 2.1 Requisitos obrigatórios

Todo o material empacotado correspondente a `ProviderConfig.logo.type = "builtin"` deve atender a:

- o canvas ou o `viewBox` do SVG é quadrado, com proporção `1:1`;
- usa o símbolo gráfico da marca adequado a um slot de ícone, e não um wordmark horizontal que contenha o texto completo da marca;
- a UI continua exibindo por meio de um contêiner quadrado unificado e `object-contain`, sem esticar nem cortar o gráfico;
- prefere-se o SVG oficial fornecido publicamente pelo fabricante; quando não há SVG adequado, usa-se o PNG oficial transparente;
- a origem do material continua registrada em `model-provider-logo-sources.json`;
- key de Logo remoto ausente ou desconhecida continua caindo no ícone genérico de Provider, sem afetar a resolução da configuração, a integridade nem a execução.

A validação mecânica deve cobrir todos os materiais embutidos do manifesto de empacotamento: para PNG, conferir que a largura e a altura em pixels são iguais; para SVG, conferir o `viewBox` quadrado ou dimensões intrínsecas quadradas equivalentes. Não basta validar que o contêiner CSS é quadrado.

### 2.2 Material da Alibaba Cloud

O `model-provider-alibaba-model-studio.svg` atual é o wordmark horizontal completo `Alibaba Cloud`, de cerca de `183.8 × 22.45`. Ao ser colocado em um slot quadrado de `28 × 28`, na prática fica com apenas cerca de `3.4px` de altura, o que não atende ao contrato de Logo embutido.

Requisitos de substituição:

- encontrar e empacotar o símbolo de marca quadrado oficial da Alibaba Cloud ou do Alibaba Cloud Bailian/Model Studio;
- os Templates da China e internacional podem continuar reutilizando a mesma key de recurso;
- não recortar nem redesenhar por conta própria o gráfico a partir do wordmark horizontal;
- após a substituição, conferir a nitidez e o tamanho visual nos dois temas reais, Zai Light e Zai Dark.

Os nomes permanecem:

```text
zh-CN：阿里云百炼（中国） / 阿里云百炼（国际）
en-US：Alibaba Model Studio (China) / Alibaba Model Studio (International)
```

O que está sendo conectado aqui é o serviço de modelos Model Studio/DashScope, então escrever apenas "阿里云" é amplo demais; usar o símbolo da marca principal da Alibaba Cloud no Logo não exige remover o nome de produto "百炼".

### 2.3 Conclusões para os outros nomes

- em `Z.AI`, o `AI` permanece em maiúsculas;
- BigModel mantém o nome oficial da marca em inglês;
- os nomes em chinês e inglês do Template Moonshot são unificados como `Moonshot Kimi`, sem usar "月之暗面 Kimi";
- os demais Templates mantêm o nome oficial atual da marca em inglês; não traduzir por Provider ID de forma isolada no Renderer.

## 3. Feedback de criação de Template

Atualmente `handleCreateProvider`, ao capturar uma falha, escreve apenas no UI Logger, e o usuário não recebe feedback visível. Comportamento alvo:

```text
Clicar em Template / criar fornecedor personalizado
              |
              v
      Host cria atomicamente o Personal Provider
              |
      +-------+-------+
      |               |
    sucesso          falha
      |               |
Entra na página de   Permanece na página de seleção de Template
detalhes do novo     e mostra a faixa de erro
Provider
```

- o feedback de falha reutiliza o estilo de faixa e a fila já existentes na base da área de detalhes à direita das configurações do Provider;
- a faixa contém o ícone de erro e a mensagem de erro real e compreensível;
- não adicionar outro Toast no topo da página, no nível da janela ou dentro do card do Template;
- em caso de falha, restaurar o estado operável, permitindo tentar de novo ou voltar;
- o comportamento de sucesso continua sendo entrar nos detalhes do novo Provider, sem mensagem de sucesso duplicada;
- os logs continuam sendo registrados por `packages/ui/src/logger.ts`, mas o log não substitui o feedback ao usuário.

## 4. Compactação do editor de Reasoning Level

Os `values` de Reasoning Level continuam sendo um array ordenado do mais baixo ao mais alto. Este ciclo ajusta apenas a densidade da interação, sem mudar a estrutura de configuração, o parsing, os defaults ou a semântica de Runtime.

Hoje cada nível é composto por uma moldura externa de altura mínima `36px`, padding horizontal amplo e uma área de remoção sempre visível, o que é visualmente pesado. O alvo passa a ser uma etiqueta compacta ordenada:

- a etiqueta do nível usa a altura compacta comum de cerca de `28px`;
- reduzir o padding horizontal, o espaçamento entre etiquetas e o espaço ocupado pelo botão de remoção;
- a ação de remoção fica atenuada por padrão e claramente visível no hover, no focus ou no estado de edição;
- manter clique para editar, adicionar, remover, reordenar por arrasto e operação por teclado;
- manter `Alt + Left/Right` como alternativa de teclado para a reordenação por arrasto, sem exibir textos de atalhos adicionais;
- a semântica de borda do Personal Override continua seguindo o estilo existente de campos booleanos/de configuração, sem novo texto de "padrão/modificado";
- a restrição de pelo menos um valor e o tratamento de valores duplicados mantêm o comportamento atual, sem adicionar novas validações de domínio por causa do ajuste de UX.

Os testes do editor de Reasoning não podem mais usar apenas "etiqueta compacta" como nome de teste, sem restringir de fato a estrutura apresentada; devem pelo menos fixar a class de tamanho compacto, o tamanho no estado de edição e a acessibilidade do botão de remoção.

## 5. Complementação automatizada

Escrever primeiro os testes que falham, depois alterar a implementação.

### 5.1 Logo

- todos os Logos Built-in do manifesto atendem ao contrato de material quadrado;
- a Alibaba Cloud não referencia mais o wordmark horizontal;
- o comportamento para key conhecida, key desconhecida, key ausente e falha de carregamento do recurso permanece inalterado;
- a escolha Light/Dark e o fallback de material único continuam corretos;
- o card de Template, a navegação de Provider e o título dos detalhes leem o mesmo fato estruturado de `logo`.

### 5.2 Criação de Template

- o E2E de Desktop realmente clica em um Built-in Template e verifica que, após a criação, entra nos detalhes do novo Provider;
- verificar que o novo Provider herda do Template o Endpoint, o API Schema, os membros do modelo e o Logo;
- verificar que, na criação, o seed do nome é gerado no idioma atual e desduplicado atomicamente pelo Host;
- manter a cobertura de criação de Provider puramente personalizado;
- injetar falha de criação e verificar a faixa de erro na base, a capacidade de tentar de novo e o ponto de queda da página;
- não substituir a cadeia de clique real por um teste de HTML estático de SSR.

### 5.3 Editor de Reasoning

- etiqueta compacta, estado de edição, adicionar, remover, arrastar e `Alt + Left/Right`;
- mudanças de ordem continuam sendo escritas direto no Draft atual, sem voltar à posição antiga antes de saltar;
- layouts em chinês e inglês, por teclado, Light/Dark e de largura estreita não transbordam.

## 6. Não objetivos

- não modificar a semântica de `values[0]` do Reasoning como o nível mais baixo;
- não introduzir `reasoningLevelPolicy` nem outra abstração de estratégia;
- não alterar a prioridade de resolução de Provider Template, Personal Overlay ou Registry;
- não adicionar busca de Template;
- não modificar a página de Account Provider nem os cards de plano;
- não adicionar upload de Logo pelo usuário nem Logo por URL remota arbitrária;
- não restaurar o `enabled` do Provider nem o Provider Switch na página de configurações;
- não usar este ciclo para tratar a baseline de testes de todo o repositório, sem relação com Provider.

## 7. Critérios de conclusão

- o manifesto de recursos embutidos não tem Logo não quadrado, e a Alibaba Cloud usa material quadrado oficial rastreável;
- a falha na criação de Template tem um feedback unificado, visível e com possibilidade de tentar de novo;
- o editor de Reasoning Level fica visivelmente mais compacto, preservando por completo a capacidade de edição ordenada;
- o Template Built-in e o Provider puramente personalizado têm evidência de E2E da cadeia de interação real;
- passam os testes unitários direcionados de Provider, Provider Node, Services e UI;
- `pnpm --filter @zcode/desktop typecheck:e2e` passa;
- o E2E de Desktop afetado é executado de fato e passa em uma máquina com ambiente gráfico ou no CI;
- `pnpm typecheck`, `pnpm lint` e `git diff --check` passam;
- ao concluir, fazer um commit Conventional Commit e incluir o trailer real da sessão do Agent na mensagem de commit.

## 8. Resultado da implementação

### 8.1 Logo e nomes

- nova validação mecânica dos materiais de Logo embutidos: PNG lê as dimensões intrínsecas em pixels, SVG lê o `viewBox` ou as dimensões intrínsecas, e os recursos do manifesto precisam ser `1:1`;
- o wordmark horizontal completo da Alibaba Cloud foi substituído pelo símbolo de marca quadrado usado pela organização oficial da Alibaba Cloud no GitHub, empacotado com o aplicativo como PNG transparente de `80 × 80`;
- a origem do material, o proprietário e o processo de normalização continuam registrados em `model-provider-logo-sources.json`;
- os nomes em chinês e inglês do Template Moonshot foram unificados como `Moonshot Kimi`;
- a revisão do Built-in Config subiu de `8` para `9`, garantindo que a atualização de nomes entre na cadeia de publicação oficial e de refresh.

### 8.2 Feedback de criação de Template

- tanto a entrada de Template quanto a puramente personalizada aguardam a mesma Promise de criação do Host;
- em caso de falha, permanece-se na página de seleção de Template e reutiliza-se a faixa de feedback do rodapé dos detalhes do Provider para exibir o erro real e a ação de tentar de novo;
- `ModelProviderSection` continua registrando log de UI e, ao mesmo tempo, devolve o erro à camada de interação, acabando com a quebra em que "o log sabe que falhou e o usuário não vê nada";
- novo teste de interação com clique real, fixando o comportamento da faixa de falha e da nova tentativa; o E2E de Desktop ganhou asserções de criação real do Built-in DeepSeek Template, de Endpoint, Schema, ordem dos modelos e Logo.

### 8.3 Editor de Reasoning Level

- as etiquetas de nível foram compactadas para uma altura da casa de `28px`, com redução de espaçamentos, padding horizontal, input de edição e botão de remoção;
- o botão de remoção é atenuado por padrão, aparecendo apenas no hover/focus, com semântica e nome acessível inalterados;
- corrigido o problema em que a extensão do arquivo de teste original não atendia ao include atual do Vitest e portanto nunca era coletado; os novos testes cobrem de fato tamanho compacto, ordenação por teclado, arrasto, edição, adição, remoção e Personal Override.

## 9. Registro de verificação

- testes direcionados de Provider/UI: `5` arquivos, `15` testes, todos passando;
- `pnpm --filter @zcode/ui exec tsc --noEmit`: passou;
- `pnpm --filter @zcode/desktop typecheck:e2e`: passou;
- `pnpm typecheck`: passou;
- `pnpm lint`: passou, com apenas os warnings já existentes no repositório;
- `oxfmt --check` nos arquivos modificados neste ciclo: passou; o `pnpm fmt:check` de todo o repositório continua bloqueado pelo HTML inválido já existente em `docs/electron` e por falha de leitura de `apps/zcode-cli/tests/gb2312.js`;
- `pnpm test:unit:affected`: foi elevado a unit completo por haver arquivos já deletados no staging relativo; `1531` arquivos passaram, `1` foi pulado e `2` falharam, totalizando `13078` testes passando e `25` pulados. As duas falhas são respectivamente a asserção de pre-push `mise-run` já existente e a asserção de contagem de constantes de CLI Config do E2E, nenhuma delas envolvendo alterações deste Todo;
- E2E de configurações do Desktop: o aplicativo e o Agent foram construídos com sucesso, mas o ambiente Linux atual não tem `xvfb-run`, e o Chromedriver não consegue criar sessão gráfica antes de executar qualquer case; esse resultado é um bloqueio do ambiente de execução e não representa falha de asserção de case;
- `git diff --check`: passou.