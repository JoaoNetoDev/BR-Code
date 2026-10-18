# Todo115: Consolidação das Ações no Header do Provider e Correção de Acionamento Indevido do Toggle

> Status: em 2026-09-11 implementado e aprovado em revisão parcial, com validação de componente e de navegador; a aceitação final do lote inteiro ainda está pendente.

> Decisão posterior: Providers do tipo conta não permitem desativação total e não exibem toggle, e valores de desativação de conta existentes deixaram de ter efeito; ver [Todo117](./todo-117-preserve-account-domain-on-provider-save.md). O toggle do ajuste de layout deste item se aplica apenas à categoria de Key manual e não restaura a entrada de ativar/desativar de contas.

> Verificação complementar de 2026-09-12: a exclusão pelo menu "mais" na página Pro inteira, com confirmar e navegar, e a remoção de Personal passaram; criação de template, detalhes comuns, reordenação e edição em regressão passaram. Foi corrigida a falha de integração do E2E existente que ainda procurava a lixeira isolada, sem alteração de produto. Tipos/lint/arquitetura do lote inteiro e navegador real em duas resoluções passaram; shared-host do celular não foi testado. O resultado atual deve ser consultado em [revisão final do lote inteiro](./provider-stabilization-20260911-final-review.md); os trechos abaixo "pendente para o lote inteiro / Pro não testado" são preservados como processo histórico.

## Contexto

Usuários relataram que, após alterar o nome do supplier, ele acabava desativado; depois de investigar, a causa foi um acionamento indevido ao clicar na área em branco abaixo do nome para encerrar a edição.
Atualmente, `InlineEditableProviderCard` envolve o toggle de ativação em um `label` de linha inteira, de modo que a área em branco também aciona a alternância.
Este é um problema de área de clique, e não uma sobreposição comprovada da gravação da renomeação sobre `enabled`.

## Solução Confirmada

```text
[ícone] Kimi                              [toggle]   ⋯
                                                 Renomear
                                                 ──────────
                                                 Excluir supplier
```

- Manter o ícone e o nome do supplier à esquerda; remover o lápis isolado ao lado do nome e o ícone de lixeira isolado.
- Mover a ativação para a direita da barra de título do detalhe, com o menu "mais" à direita do toggle; deixa de ocupar uma linha própria.
- Não exibir texto permanente "Ativar" ou "Ativar supplier"; o toggle expressa o estado atual.
- Ao passar o mouse ou focar o toggle por teclado na categoria de Key manual, a dica segue a próxima ação: quando está ativado, "Desativar supplier"; quando está desativado, "Ativar supplier". Completar em chinês e inglês; a categoria de conta não exibe toggle.
- Manter um nome acessível explícito e o estado do toggle; o Tooltip não substitui o nome acessível.
- A área de clique cobre apenas o próprio toggle e uma zona de toque moderada; título, texto e espaços em linha não podem alternar nada. Remover a área de ativação do `label` de linha inteira, e a zona de toque não pode cobrir o menu vizinho.
- Renomear e excluir vão para um menu dropdown `⋯` sempre visível, sem depender do hover; excluir fica separado das operações comuns, mantendo o fluxo existente de confirmação de exclusão.
- Após fechar o menu, reutilizar o fluxo existente de edição de nome, sem criar um novo mecanismo de gravação de renomeação. Providers que não podem ser renomeados/excluídos não oferecem a ação correspondente; quando não há itens disponíveis, o menu vazio não é exibido.

## Semântica e Escopo

- O que este item ajusta é a **barra de título do detalhe do Provider**, não a linha de modelo. O arranjo dos campos de conexão, o espaçamento dos blocos e a lista de modelos permanecem como estão, e as sugestões de layout anteriores não aceitas não são incorporadas.
- Providers de conta não exibem toggle geral nem introduzem um toggle geral por Family; as restrições públicas de escrita/análise de que contas não podem ser desativadas, bem como as correções de seleção de plano, ficam a cargo do Todo117 e não são reimplementadas aqui.
- Reutilizar a gravação esparsa e o resultado de estado público do `enabled` externo do Provider, sem adicionar nova fonte de estado. Após a desativação, ainda é possível editar a conexão e a configuração de modelos; não desvincular, não limpar a Key, não alterar a ativação própria do modelo nem excluir a Selection, e não interromper execuções já fixadas.
- Desktop e Web móvel compartilham a mesma semântica de interação; telas estreitas, nomes longos e traduções longas não podem empurrar o toggle nem o menu. Seguir as normas de tamanho, tipografia, tema e foco do `DESIGN.md`.

## Implementação e Aceitação

- [ ] Cobrir primeiro a regressão de interação: após renomear, clicar na área em branco da antiga linha de ativação para encerrar a edição, com o nome sendo salvo normalmente e o `enabled` do Provider inalterado.
- [ ] Consolidar as ações da barra de título, corrigir a zona de toque do toggle e remover o layout antigo de ativação em linha inteira e as entradas duplicadas de ação.
- [ ] Verificar que o clique e a operação por teclado do toggle submetem apenas uma vez; que operações em branco, no nome e no menu "mais" não alternam a ativação; e que a gravação da renomeação preserva o estado de ativação original.
- [ ] Verificar renomear, exclusão com confirmação e cancelamento no menu "mais"; as categorias de conta e os itens não excluíveis mantêm as fronteiras de permissão originais.
- [ ] Verificar Provider comum, planos de conta, ativado e desativado, chinês e inglês, tema claro e escuro, desktop e tela estreita de celular; incluindo nomes longos sem sobreposição entre menu e zona de toque do toggle.
- [ ] Atualizar os E2E relacionados, executar em lote a regressão direcionada, a verificação de tipos e o lint; registrar as evidências reais de execução e o que não foi testado, sem afirmar que a interação passou apenas com base no código estático.
- [ ] Após a conclusão, revisar escopo, semântica de persistência e acessibilidade, registrar o resultado deste Todo e fazer o commit.

## Implementação e Revisão de 2026-09-11

- À direita do header ficam o toggle de Key manual e o menu "mais"; excluir e renomear reutilizam os callbacks originais. Sem ações, o menu vazio não é exibido; contas não têm toggle. O `label` de linha inteira e o lápis/lixeira isolados foram removidos, e o layout de conexão e de modelos não foi alterado.
- O Switch tem aria-label e Tooltip da próxima ação em chinês e inglês. A revisão por capturas de tela do navegador encontrou problemas adicionais: o atributo `data-state` do Tooltip cobria o Switch e a zona de toque compartilhada se estendia até o menu. Isso foi resolvido isolando os atributos de estado com um wrapper local e reduzindo a zona de toque horizontal para 4px apenas aqui, sem alterar o controle compartilhado.
- Execução conjunta com o Todo132: 109 testes unitários passaram (incluindo cancelar/confirmar exclusão pelo `confirmAndDeleteModelProvider` existente e o nome salvo não alterar `enabled`); 6 casos de componente em navegador real passaram. 390 casos em chinês/claro e 1200 em inglês/escuro cobriram foco, nomes longos, zonas de toque que não se intersectam, menu, estado do toggle e ausência de overflow horizontal.
- O typecheck da raiz e o lint (0 errors / 41 warnings) passaram. Os casos existentes de criação/renomeação no Electron foram adaptados ao menu e à perda de foco explícita, sem se passar por execução real no Electron; o shared-host/Pro real no celular aguarda a validação do lote inteiro. No Linux deste ciclo faltaram as glifos chineses; o texto em chinês passou no DOM e na interação, e não se afirma que a aceitação visual da fonte chinesa foi concluída.
- Capturas de tela e estilos calculados: `/tmp/zcode-provider-settings-batch/header-options-*.png`, `header-options-*.json`. A revisão confirmou que apenas o layout das ações e a fronteira de envio do nome foram alterados, sem novas fontes de estado, permissões, campos de persistência ou verificações de elegibilidade de execução.