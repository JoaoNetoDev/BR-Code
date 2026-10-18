# Appearance Settings

## Objetivo

Oferecer uma única seção de configurações de Appearance para o tema do aplicativo, o tamanho da
fonte da UI e as preferências de apresentação de código, no desktop, na Web e na Web mobile.

## Configurações

- Tema do aplicativo: System, Light ou Dark, usando a preferência de tema existente e a
  sincronização entre janelas.
- Tamanho da fonte da UI (rótulo em chinês: `界面字号`): um input numérico de 12px a 20px, com
  padrão de 14px. A preferência alimenta a escala `text-ui-*` dedicada via `--ui-font-size`, sem
  alterar o tamanho de fonte raiz do `html`.
- Apresentação de código: temas de sintaxe claro e escuro, numeração de linhas, quebra de linhas
  longas e um input numérico independente para o tamanho da fonte de código, de 12px a 20px.
- As configurações de código e a pré-visualização de código são empilhadas verticalmente. Dentro da
  pré-visualização, os cards de pré-visualização claro e escuro usam layout lado a lado em telas
  `sm` e caem para um card por linha abaixo desse breakpoint.

## Limites

- O tamanho da fonte da UI e o tamanho da fonte de código são persistidos de forma independente.
- A renderização de código e diff continua consumindo `codePreviewSettings.fontSizePx`; ela não
  herda o tamanho `rem` raiz da UI.
- O terminal integrado mantém sua própria configuração de fonte e não é controlado por nenhuma das
  duas configurações de tamanho de fonte de Appearance.
- As mudanças no tamanho da fonte da UI são aplicadas via `--ui-font-size`, persistidas e
  sincronizadas entre as janelas do aplicativo, sem alterar
  `document.documentElement.style.fontSize`.
- O antigo alvo de navegação Code Preview é substituído por Appearance. Um `codePreview` legado
  armazenado resolve para Appearance.

## Textos

- O título da subseção de interface é `界面设置` em chinês e `Interface Setting` em inglês.
- Descrever resultados visíveis em vez de detalhes de implementação como `rem`, tamanho de fonte
  raiz ou escala da UI.
- O texto sobre o tamanho da fonte da interface informa que ícones e dimensões de layout não mudam
  com o tamanho do texto.
- O texto sobre preferências de código cobre blocos de código, pré-visualizações de arquivo e
  visualizações de diff, e não apenas os cards de pré-visualização desta página de configurações.
- Os cards de pré-visualização claro e escuro são exibidos juntos abaixo dos controles; o texto não
  deve descrevê-los como um único visualizador à direita.

## Verificação

- Verificar que Appearance aparece depois de General e que o item de navegação separado Code Preview
  foi removido.
- Verificar que General mantém as configurações de idioma e comportamento do sistema, mas não
  duplica mais o tema do aplicativo.
- Verificar que os controles de tema, tamanho da fonte da UI e apresentação de código são
  renderizados juntos em Appearance.
- Verificar que ambos os tamanhos de fonte usam inputs numéricos em vez de sliders de arraste, e que
  são confirmados com Enter ou blur.
- Verificar que Code settings permanece acima de Code preview, enquanto os cards de pré-visualização
  claro / escuro ficam lado a lado em layouts `sm` e renderizam um card por linha abaixo desse
  breakpoint.
- Verificar a persistência, o clamping e a sincronização entre janelas do tamanho da fonte da UI sem
  mutação da fonte de tamanho do DOM raiz.
- Executar `pnpm typecheck`, `pnpm lint` e os testes de UI relevantes.