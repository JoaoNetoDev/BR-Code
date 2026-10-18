# Todo 30: Indicador de limite de rolagem na página de configurações de Provider

> Status: concluído
>
> Data: 2026-08-27
>
> Origem: feedback de experiência real na página de configurações de Provider

## 1. Problema

A página de configurações de Provider já faz a navegação de Provider à esquerda e o detalhe à direita rolarem de forma
independente, mas no macOS as barras de rolagem do sistema podem estar ocultas por padrão. Quando o contêiner de altura
fixa corta o conteúdo exatamente no limite de uma linha completa, o usuário tende a supor que não há mais conteúdo abaixo.

Este Todo não altera as áreas de rolagem, a altura dos contêineres, a ordenação de Provider/Model ou o salvamento de
configuração; apenas adiciona um indicador condicional de limite de rolagem.

## 2. Interação

```text
Sem overflow
└─ Não mostra o indicador

No topo e com conteúdo abaixo
└─ Mostra apenas o fade inferior

No meio
├─ Mostra o fade superior
└─ Mostra o fade inferior

No fim
└─ Mostra apenas o fade superior
```

- As duas colunas são medidas e atualizadas separadamente, sem compartilhar estado de rolagem;
- Preserva-se o comportamento das barras de rolagem do sistema, sem forçar barras permanentes e sem adicionar texto ou setas;
- A camada de fade não recebe eventos de ponteiro e não obstrui operações de modelo, arrastar ou seleção de Provider;
- Usa cores semânticas de Card, mantendo a consistência em Zai Light / Zai Dark;
- Remede após mudanças de conteúdo, redimensionamento do contêiner e redimensionamento da janela;
- A escuta de rolagem usa passive listener e evita renders React repetidos provocados pelo mesmo estado de limite.

## 3. Verificação

- Funções puras cobrindo sem overflow, topo, meio, fim e erro de 1px;
- Testes de componente cobrindo os estados de indicador `top/bottom` após a rolagem;
- Testes de layout provam que a navegação de Provider e o detalhe usam o mesmo componente;
- Regressão em arrastar Provider/Model, rolagem independente das colunas, banner de feedback do detalhe e layout de tela estreita;
- Executar testes direcionados de UI, typecheck, lint, verificação de formatação e `git diff --check`.

## 4. Resultado da implementação

- Novo `ScrollEdgeShadowViewport`, reutilizado pelas duas colunas com a mesma medição de limites e cores semânticas de fade;
- Escuta passive de scroll do viewport atual e uso de `ResizeObserver` para observar mudanças de tamanho do viewport/conteúdo;
- Estados `top/bottom` idênticos mantêm o mesmo objeto, evitando renders React sem sentido durante a rolagem;
- A camada de fade usa `pointer-events-none`, e o banner de feedback do detalhe continua em camada superior;
- 322 testes relacionados às configurações de Provider, o typecheck e o lint de todo o repositório passaram; o lint mantém apenas os warnings já existentes antes desta rodada.