# Todo143: alinhamento das cores das caixas de seleção da configuração de modelo com os componentes do sistema

Estado: implementado e concluída a verificação/revisão local. Em 2026-09-12 o usuário autorizou a implementação e a
abertura do MR.

## Requisitos e limites

- as caixas de seleção de tipo de entrada e de capacidade do modelo mantêm as cores do Checkbox do sistema: quando
  selecionado, usam `border-primary bg-primary text-primary-foreground`; quando não selecionado, usam
  `border-input-border bg-input`.
- no Zai escuro, a seleção é com caixa branca e marca de verificação preta; no claro, caixa preta e marca branca; a
  borda não segue mais a cor inversa da marca.
- mantêm-se o quadrado de 16px, o gráfico Check de 12px, além do feedback de cor de fundo do botão de opção externo, da
  borda de override pessoal, das dimensões e da semântica de clique e teclado. O texto continua obrigatório e não pode
  ser desmarcado.
- a caixa indicadora continua sendo um elemento decorativo não interativo; não se aninha um Checkbox interativo dentro
  do botão existente, nem se modificam componentes globais ou a lógica de configuração/salvamento de modelo.

## Verificação e revisão

- primeiro foi adicionado, no fixture de navegador do componente real, um confronto com o computed style do Checkbox do
  sistema, cobrindo largura de celular em tema claro em português e largura de desktop em tema escuro em inglês, com
  opções selecionada/não selecionada e comum/com override pessoal.
- foram mantidas as asserções de clique, alternância única por teclado, destaque externo e bloqueio do texto; foram
  vistas as capturas de tela e executados os testes unitários relacionados, a verificação de tipos, o lint e a verificação
  de arquitetura.
- o Mac Electron e o controle remoto em celular real não são reexecutados integralmente por causa desta modificação
  puramente de cor; o fixture de navegador não se passa por validação nativa de cadeia completa.

Causa raiz: o `border-current` original acompanhava o `text-primary-foreground` e virava a cor da marca de verificação,
resultando em borda com cor invertida em relação ao preenchimento. A correção apenas consolida a cor semântica desse
elemento indicador.

## Resultado

- TDD: as novas asserções de cor falharam nos dois casos com a implementação antiga; após a correção, os casos de
  cor/interação, junto dos quatro casos de editor do Todo141, passaram **6/6**, e os testes unitários relacionados
  passaram **51/51**.
- `pnpm typecheck` (incluindo os tipos de E2E do desktop) e `pnpm lint` passaram; o lint apresenta os 42 warnings
  preexistentes e 0 erros. A verificação de arquitetura teve 0 violations e `git diff --check` passou.
- foram vistas as imagens `/tmp/zcode-provider-settings-batch/selected-{390,1200}-0.png`: as caixas e marcas em tema
  claro e escuro correspondem aos componentes do sistema. No Linux atual a biblioteca de fontes em português está
  incompleta e parte do texto das capturas em português aparece sem caracteres; não se declara aprovação da validação
  visual de fontes, o que não afeta as asserções já executadas de cor, dimensão e interação.
- revisão: no código de produção houve apenas a mudança de um branch de classe do indicador compartilhado; ambas as
  categorias de chamada foram cobertas, sem novos estados, eventos, IO, protocolo, persistência ou mudanças de
  capacidade de modelo. O override externo, o bloqueio do texto, a semântica de teclado do botão e o gráfico da marca de
  verificação não foram alterados, e nenhum controle interativo foi aninhado.
- Mac Electron e o shared-host do controle remoto em celular real não foram reexecutados; este item é uma correção de
  cor de UI compartilhada que não altera as cadeias desktop continuous/mobile replayable.
