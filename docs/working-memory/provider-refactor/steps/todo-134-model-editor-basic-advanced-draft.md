# Todo134：Visão enxuta do editor de modelo e expansão de avançado

Status: implementação, review e validação dentro do escopo desta rodada concluídos. O usuário já confirmou todas as decisões abaixo; a aceitação formal em Electron / na cadeia real de celular não foi executada nesta rodada.

As discussões posteriores de layout estão registradas em [Todo141](todo-141-model-editor-product-ux-alignment.md), hoje em rascunho e não executado, e não substituem o comportamento já implementado neste arquivo; depois que o usuário autorizar e implementar novamente, serão atualizados a posição dos campos, a posição do interruptor inteligente e o layout dos botões inferiores.

## Interação final e escopo

| Área | Conteúdo |
| --- | --- |
| Corpo padrão | Model ID, comprimento de contexto, lista ordenada de níveis de pensamento (a edição define as faixas, não a escolha de faixa na sessão) |
| Configuração avançada, recolhida por padrão | Limite máximo de Token de saída, tipos de entrada, capacidades do modelo, mapeamento de parâmetros de inferência |
| Base fixa à esquerda | Interruptor de configuração inteligente e a explicação já existente |
| Base fixa à direita | Restaurar (botão outline), Salvar (botão principal), Cancelar |

- A configuração avançada é expandida no lugar, dentro do mesmo diálogo; não se adota mais a página secundária independente discutida no início. Os campos básicos não são exibidos em duplicidade.
- Adição e edição reutilizam a mesma visão; o Model ID de modelos integrados permanece somente leitura. Ao fechar e reabrir, o avançado volta recolhido por padrão.
- Cancelar as bordas, os cantos arredondados e o padding dos cartões de agrupamento internos. Preservar o estilo do diálogo mais externo e dos controles de entrada, sem ampliar as mudanças para o formulário de Provider e a lista de modelos.
- Preservar a borda de destaque de substituições pessoais, os placeholders de herança, o texto de ajuda com ícone de interrogação, a interação de edição dos níveis de pensamento, o formato Map, a exclusão por arrastar, o IME e o feedback de salvamento.
- Aprovação explícita mais recente: o ícone decorativo antes das opções booleanas editáveis passa a ser o indicador de checkbox; mantém-se a área de clique original do botão, a semântica de teclado e o destaque de substituição, sem embutir um checkbox focável dentro do botão. O input de texto fixo continua usando a explicação de bloqueio.
- Restaurar passa a ser um botão com borda, posicionado à esquerda de Salvar; ele ainda restaura todo o rascunho editável, preservando o Model ID e o `enabled` independente, sem gravar imediatamente em disco.
- Em telas estreitas de desktop e celular, nos temas claro e escuro e em chinês e inglês, todos os campos e ações devem ser acessíveis; a base pode quebrar linha em tela estreita, sem transbordar horizontalmente.

## Atribuição de campos e princípios de salvamento

1. O grupo inteiro de tipos de saída e o Schema de ferramentas MFJS deixam de aparecer na página de edição, e nenhum item bloqueado e inoperável é mantido; os tipos de configuração de baixo nível, as regras e a capacidade de execução são preservados.
2. Os dois campos saem do rascunho de UI e da marcação de substituição e não participam da validação de obrigatoriedade do formulário. O modo manual não os aceita nem passa a fixá-los.
3. O mecanismo genérico segue o Todo130: **a configuração manual extrai, limpa e valida apenas pelo schema dos campos editáveis**, sem chamar o schema completo de execução para adicionar ao usuário campos obrigatórios invisíveis. Novos campos de sistema entram por padrão fora da configuração manual.
4. "Recolhido em avançado" é apenas uma mudança de visibilidade; os campos dentro dele continuam editáveis e continuam pertencendo ao rascunho completo; não pode ser confundido com os campos de sistema removidos.
5. No modo inteligente, salvar os demais itens não gera magicamente substituições de MFJS ou de tipos de saída, nem limpa substituições pessoais legadas de campos de sistema já existentes. Depois de alternar para manual, salva-se pelo schema manual; as folhas de sistema continuam vindo da composição das regras.
6. Arquivos manuais legados e válidos já carregavam MFJS: na fronteira de normalização do codec de arquivo existente, reconhecer a antiga forma editável ou a antiga forma completa e então extrair os campos manuais atuais. Não alterar o schemaVersion, não introduzir migração global de dados e não deletar campos de formato desconhecido/corrompido fingindo sucesso.
7. Preservar as proteções existentes de identidade e de geração de edição das ações de recomendar e restaurar. Não há novo cache de recomendação, nem um segundo rascunho, nem estado de recolhimento persistido.

| Ação | Rascunho | Persistência |
| --- | --- | --- |
| Expandir / recolher | Mantém todos os campos | Não escreve |
| Modificar básico / avançado | Atualiza o mesmo rascunho | Não escreve |
| Restaurar / alternar para modo inteligente | Reaproveita o Hook existente e as proteções assíncronas | Não escreve |
| Salvar | Valida todos os campos editáveis; erros em campos avançados expandem e focam automaticamente | Segue a submissão original somente após a validação bem-sucedida |
| Cancelar | Descarta esta edição | Não escreve |

O posicionamento de erros usa o campo estruturado existente, sem interpretar textos traduzidos; ao submeter de novo o mesmo erro depois de recolher manualmente, a expansão também é obrigatória. Durante o salvamento, mantém-se o bloqueio de controles já existente. Não se pode ajustar ModelSelection, sincronização de conta, requisições ou execuções em andamento só para corrigir a apresentação.

## Superfície de impacto e aceitação

- UI: ProviderFormControls / ProviderCardSections compartilham o Dialog, o useProviderModelDraft, a submissão do rascunho e o mecanismo de substituições pessoais.
- Provider: apenas a atribuição do MFJS no schema manual editável é modificada; a extração/limpeza continua reaproveitando o schema.
- Provider-node: o formato manual legado é normalizado na fronteira do codec existente. O schema completo de execução não muda.
- Não alterar a cadeia desktop continuous / mobile replayable, o shared-host, a autoridade do Registry, o banco de dados nem a configuração real do usuário.
- A ferramenta de mapa de código não está disponível; a busca é dirigida pelas superfícies já declaradas de provider-settings / model-capabilities. O contexto de arquitetura retorna legacy/unmanaged, sem novos limites de módulo.

| Caso | Requisito |
| --- | --- |
| M134-01 | Campos básicos padrão visíveis, avançado recolhido; sem MFJS/tipos de saída; ordem correta dos botões inferiores |
| M134-02 | Expandir/recolher preserva valores e não escreve; destaque de substituição, checkbox e trava de texto fixo permanecem |
| M134-03 | Básico/avançado submetidos na mesma vez; salvamento manual sem campos de sistema ocultos |
| M134-04 | Erro em campo avançado expande e foca; reenvio do mesmo erro funciona igualmente |
| M134-05 | Restaurar/modo/fechar/salvar e as proteções existentes contra resultado de recomendação obsoleto não regridem |
| M134-06 | Adicionar ID editável, ID integrado somente leitura; cancelar não grava em disco, reabrir nasce recolhido |
| M134-07 | Desktop/tela estreita, tema claro/escuro, chinês/inglês, ajuda de rótulo/teclado e layout inferior |
| M134-08 | O novo schema manual rejeita campos ocultos; ausência de MFJS pode ser salva; MFJS de sistema acompanha a atualização das regras |
| M134-09 | A antiga forma manual válida pode ser lida e é estável em leituras/escritas repetidas; configurações desconhecidas/corrompidas continuam rejeitadas |
| M134-10 | Edição inteligente não relacionada preserva as substituições de sistema ocultas já existentes e não gera novas substituições ocultas |

A aceitação usa testes unitários de domínio e de rascunho, além de interação real de componente/Hook em Chromium; os campos e os passos de expansão avançada do E2E Electron existente são atualizados em sincronia. Não se trata o fixture de componente como passagem da cadeia completa em shared-host real de celular ou no cliente formal.

## Linha de base e registros

- Antes de começar, origin/staging já foi buscado até `6121d8ba48`; as novas mudanças dele não envolvem o editor de modelo e nenhum merge foi executado nesta rodada.
- Ponto de partida da implementação `95c80f4ed8`, branch `provider-stabilization-20260911`; as verificações de atualidade e de linha de base de arquitetura passaram.
- O princípio geral de atribuição de campos do Todo130 continua válido, e a atribuição concreta do MFJS é atualizada por este Todo. A semântica de restauração do Todo131 é preservada e o layout é substituído por este Todo.
- A Demo aprovou apenas a direção de expansão em camadas e de checkbox; outros estilos desenhados à mão não servem de base para a implementação. A discussão inicial de "página secundária independente / interruptor inteligente abaixo do ID" foi substituída por esta decisão final.

## Resultado da implementação e do review (2026-09-12)

- Todas as interações e a atribuição de campos da tabela acima foram implementadas. O componente avançado gerencia apenas a apresentação e o foco de erro; o estado do modelo continua sendo gerenciado pelos Hooks e pelo callback de submissão já existentes; as duas entradas passam campos de validação estruturados.
- O controle de saída não utilizado foi removido (sem referências/reexportações em todo o repositório via dep:refs); as opções editáveis usam uniformemente um checkbox decorativo, mantendo a interação do botão externo e o destaque de substituição. Não há controle interativo aninhado.
- Testes unitários: 51 arquivos e 565 itens dos diretórios Provider e Provider-node, além dos testes relacionados de rascunho/layout de UI, passaram; em seguida os 2 itens adicionais de permissão de leitura do ID passaram (22 itens no arquivo correspondente, todos verdes), totalizando 567. Os novos testes verificaram primeiro a falha da implementação antiga e só então a implementação.
- Componente/Hook reais em Chromium: 8 itens passaram cobrindo proteção de geração na restauração, ajuda e layout em chinês e inglês, e expansão avançada/preservação de valores/salvamento/localização de erros; após completar salvamento conjunto de básico e avançado, cancelamento e estilo de destaque/checkbox, os 6 casos relacionados ficaram verdes de novo. Cobertura com 390px em chinês tema claro e 1200px em inglês tema escuro; não é uma Demo HTML estática.
- As capturas de tela de execução foram verificadas; a primeira execução faltava com bibliotecas dinâmicas do Chromium e reaproveitou as dependências temporárias já existentes. A primeira captura ficou sem fonte CJK e foi refeita e verificada com a fonte descompactada de forma isolada nesta rodada, sem alterar a instalação do sistema nem a configuração do usuário.
- `pnpm typecheck` passou; `pnpm lint` com 0 erros / 42 warnings (sem avisos em arquivos novos desta rodada); a checagem de arquitetura com 0 violações; a verificação de formatação e de diff dos arquivos alterados passou.
- Os passos de footer switch, expansão avançada e asserções de exclusão de MFJS foram atualizados em sincronia nos E2E Electron existentes marcados como pending; nenhum pending foi promovido a regressão formal. Esta rodada não iniciou Electron formal, Pro nem shared-host real de celular, e não se declara aprovação desses.
- Logs de validação: `/tmp/todo134-unit-final.log`、`/tmp/todo134-unit-extra.log`、`/tmp/todo134-browser5.log`、`/tmp/todo134-browser-delivery.log`; capturas `/tmp/zcode-provider-settings-batch/todo134-*.png` (evidência local, não submetida).
- Revisão de escopo: não foram modificados o schema completo de execução, a capacidade de requisição Builtin, o Selection, o estado da conta, as tabelas de dados, o protocolo e a cadeia de controle remoto. O arquivo manual legado válido continua legível na versão atual; não se promete que clientes antigos leiam o novo formato manual após a remoção do MFJS, portanto é preciso manter o backup da configuração correspondente antes de reverter a aplicação. Esta rodada não adiciona campo oculto de escrita dupla por causa disso.
- Verificação complementar dos testes relacionados antes do push: ao rodar os 5357 itens, verificou-se que o fixture de teste antigo do serviço `providerRuntime` ainda fornecia MFJS apenas pela regra manual; esse campo de sistema foi devolvido ao Built-in de teste, com asserções de ponta a ponta adicionais de que a regra manual não contém o campo enquanto a configuração de execução do Registry o possui. O Built-in de produção já tinha MFJS padrão e o código de produto do serviço não foi alterado.