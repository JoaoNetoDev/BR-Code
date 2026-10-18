# Bugfix 06: Indicador visual de campo somente leitura no Provider

> Status: concluído

## Problema

O Base URL e o formato de API de um Provider embutido são exibidos conforme a Official Config, mas a página de
configurações usava uma estrutura visual quase idêntica à de um campo de entrada comum.
Embora os campos não possam receber foco nem ser editados, o usuário ainda não consegue perceber durante a navegação
que se trata de um fato somente leitura, e acaba entendendo "não é clicável" como um controle quebrado.

## Comportamento desejado

- Base URL e formato de API continuam exibindo a Effective Provider Config real;
- campos somente leitura mantêm o fundo, a borda, o tamanho da fonte e a altura de um campo de entrada comum, sem
  transparência de desabilitado nem cartão adicional;
- cada campo somente leitura exibe de forma fixa um ícone de cadeado à direita, deixando explícito que o campo atual
  não é editável;
- o ícone de cadeado oferece um nome acessível localizado, sem depender apenas do gráfico visual para comunicar o estado;
- um Base URL longo pode continuar quebrando linha, o texto ocupa o espaço restante e o ícone de cadeado não é
  comprimido;
- Provider, API Key, configuração de modelo, salvamento e semântica de Overlay permanecem inalterados.

## Causa raiz e limite da correção

A causa raiz é que o ramo somente leitura de `ProviderConnectionSection` apenas replicava a superfície do campo de
entrada, sem fornecer nenhuma indicação visual do estado somente leitura.
A correção adiciona, somente nesse ramo de exibição, um componente unificado de campo somente leitura e o ícone de
cadeado, sem alterar Provider Config, Registry ou as decisões de permissão.

## Aceitação

- o Base URL e o formato de API de um Provider embutido comum exibem um ícone de cadeado cada;
- o ícone de cadeado tem nome acessível nos ambientes em português/inglês e em chinês;
- Providers editáveis continuam usando Input/Select originais, sem ícone de cadeado;
- Desktop, Web, layouts estreitos e todos os temas continuam utilizáveis;
- testes direcionados de UI, typecheck, lint, verificação de formatação e `git diff --check` passam.

## Resultado da implementação

- o ramo somente leitura de `ProviderConnectionSection` passa a usar de forma unificada a aparência de campo somente
  leitura de camada única, com `LockKeyholeIcon` fixo à direita do Base URL e do formato de API visível;
- o texto usa `min-w-0 + flex-1 + break-all` para ocupar a largura restante, o ícone de cadeado mantém `shrink-0` e
  URLs longas não sobrescrevem nem deslocam a indicação de estado;
- em chinês e em inglês são fornecidos os nomes acessíveis "{field}（只读）" e "{field} (read only)";
- o ramo editável continua usando `Input` e `ProviderApiFormatSelect` originais, sem alteração em salvamento, Overlay ou
  Registry;
- 36 testes direcionados de UI de Provider/Model passaram, `pnpm typecheck` na raiz passou, `pnpm lint` na raiz passou
  (0 erros, 34 warnings preexistentes), a verificação de formatação dos arquivos alterados e `git diff --check`
  passaram.
