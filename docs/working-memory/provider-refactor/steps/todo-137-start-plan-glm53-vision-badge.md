# Todo137: ocultação do badge de visão do GLM-5.3 no plano de experiência

> Status: implementado; o resultado da aceitação está abaixo. 2026-09-12.

## Contexto e decisão

A [seção 4 do Todo126](todo-126-glm-flash-pdf-and-coding-plan-turbo-defaults.md) cobre apenas o
plano pessoal, o Coding Plan de equipe e a Key de plano manual. O critério compartilhado atual omite o
plano de experiência `start-plan`, e o teste unitário antigo ainda exigia explicitamente que ele
mostrasse o badge de visão. O usuário confirmou que o plano de experiência também deve ocultar o
badge de visão do GLM-5.3, seguindo a exceção de exibição já existente.

## Regras após a mudança

- Não exibe quando `supportsImage !== true`.
- Oculta quando o model ID, ignorando maiúsculas/minúsculas, for exatamente `glm-5.3` e o Access for
  uma Key de Coding Plan manual, ou um plano pessoal / de equipe / de experiência da conta.
- Vale tanto para os planos de experiência da Z.ai quanto da BigModel. Flash, outros modelos, API
  Key comum e planos ociosos seguem o status quo.
- Altera apenas a condição de exibição de `shouldShowModelVisionBadge`. O critério é compartilhado
  entre a página de configurações e o menu de seleção de modelo, de forma consistente entre
  desktop e Web mobile; upload de imagens, capacidade real de imagem, requisições de modelo,
  arquivos de configuração, Schema e builtin revision permanecem inalterados.

## Implementação e aceitação

- [x] Estender primeiro os testes unitários da página de configurações e do menu, cobrindo as duas
  Start, mantendo Flash e um `supportsImage` real; confirmar que a implementação antiga falha.
- [x] Adicionar `start-plan` ao critério compartilhado, com comentário explicando o motivo da omissão,
  sem adicionar estados, interfaces ou cadeias de critérios extras.
- [x] Estender os casos de navegador existentes, acessando as duas Start e validando a lista de
  configurações e o menu de modelo aberto; cobrir 390 em chinês claro e 1200 em inglês escuro,
  mantendo as regressões de plano existentes. Os casos seguem pending e não se passam por
  integração com o app nativo ou com o Host mobile.
- [x] Rodar os testes unitários relevantes, os casos de navegador, typecheck, lint e a verificação
  de arquitetura; registrar os resultados e commitar.

## Registro de implementação (2026-09-12)

- Em produção, alterou-se apenas a função pura compartilhada da UI: inclusão de `start-plan` e
  renomeação da variável para não chamar o plano de experiência de Coding Plan; a cadeia de
  chamadas existente da linha de configurações e do menu de modelos não muda.
- Primeiro em vermelho: 3 falhas em dois arquivos de teste unitário (menu das duas Start e linha de
  configurações), e os dois casos de navegador falharam porque a GLM-5.3 da Start ainda exibia o
  badge de visão. Após a correção, 77 testes unitários e 2 casos de navegador passaram; cada caso
  de navegador percorre as duas Start, mais pessoal, equipe e Key de plano manual.
- A cobertura de navegador cobre 390 em chinês claro e 1200 em inglês escuro, abrindo de fato o
  menu de modelos e verificando a linha de configurações; a GLM-5.3 fica oculta e o Flash
  permanece, com screenshots em `/tmp/zcode-provider-settings-batch/vision-start-*.png`. Foi usada
  a biblioteca Chromium isolada já existente para contornar a ausência de libatk na máquina, sem
  modificar o sistema ou as dependências do produto. Esta é uma aceitação de navegador de
  componentes compartilhados e não substitui os pacotes nativos Windows/macOS nem o controle
  remoto mobile real.
- O `pnpm typecheck` da raiz passou; o `pnpm lint` ficou com 0 erros e 42 warnings em arquivos não
  modificados; a verificação de arquitetura ficou com 0 violações. A primeira execução isolada do
  typecheck de E2E encontrou declarações de dependências antigas; após o build de tipos da raiz,
  `pnpm --filter @zcode/desktop typecheck:e2e` passou.
- Não foram modificadas a configuração de Provider/Model, o Schema, a rede, a capacidade de imagem
  nem a cadeia de upload, e não houve alteração de builtin revision.