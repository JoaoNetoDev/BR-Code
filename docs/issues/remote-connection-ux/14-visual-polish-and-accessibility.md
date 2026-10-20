# 14 — Acabamento visual e acessibilidade

Status: done

**Especificação pai:** [Otimização da interação e da experiência visual da conexão remota](./01-remote-connection-ux-optimization.md)

**Bloqueado por:**

- [11 — Redesenho das telas de "Conectando" e de Seleção de Diretório](./11-connecting-and-directory-screens.md)
- [12 — Barra lateral, cabeçalho da sessão e menus](./12-sidebar-header-and-menus.md)
- [13 — Cartões de dispositivo, conexões incompletas e aviso de atualização na página de configurações](./13-settings-device-cards-and-updates.md)

**Comportamento a entregar:**

Após a conclusão do redesenho principal da interface, fazer um acabamento unificado na UI remota, cobrindo tema escuro, especificação de design, detalhes de texto, teclado e leitor de tela, garantindo que esses usuários consigam usar o produto com fluidez.

- **Contraste no tema escuro**: o texto e o fundo das etiquetas de status, da barra lateral e da navegação das configurações têm contraste suficiente para ser legível.
- **Limpeza de violações da especificação de design**:
  - tamanhos de fonte fora da escala tipográfica;
  - cores hardcoded e cores com valores arbitrários;
  - tamanhos de ícone e raios de cantos que não estão na especificação.
- **Detalhes de texto**:
  - fonte unificada nos placeholders dos campos de entrada;
  - textos explicativos não são truncados;
  - parágrafos em chinês não terminam com uma única palavra na última linha.
- **Operação por teclado**:
  - todas as ações do assistente, das linhas de item da barra lateral e dos cartões de configurações podem ser concluídas apenas com o teclado;
  - a navegação de foco é razoável.
- **Leitor de tela**:
  - controles de seleção conseguem anunciar o estado selecionado;
  - os rótulos estão corretamente associados aos controles correspondentes;
  - o estado da conexão pode ser anunciado;
  - o nome acessível do botão de fechar dos diálogos está localizado.
- **Outros detalhes**:
  - o campo de senha permite alternar entre mostrar e ocultar;
  - o botão de seleção de chave privada passa a usar um ícone de arquivo;
  - a pré-visualização durante o arraste do projeto preserva a etiqueta do dispositivo.

Corresponde à seção "Sistema de design" da especificação pai, assim como aos itens de baixa prioridade restantes da lista de correção de defeitos.

Escopo:

- **Limpeza de código antigo**: o código antigo de agrupamento de dispositivos e os blocos de comentários sem referência em produção só são removidos depois de confirmados como removíveis pela lista de deleção da cadeia antiga da especificação principal.

Critérios de aceite:

- [x] **Revisão por capturas de tela**: cobre todas as combinações de tema claro e escuro, português e inglês, barra lateral de 264px e janela de 900px; todos os problemas de contraste foram corrigidos.
- [x] **Testes automatizados**: os testes de conformidade de token da UI remota e de contraste de superfícies semânticas foram estendidos para cobrir as interfaces desta issue, e todos passaram.
- [x] **Verificação por teclado**: os fluxos completos do assistente, das linhas de item da barra lateral e dos cartões de configurações podem ser concluídos apenas com o teclado, e o resultado da verificação foi registrado.
- [x] **Teste de leitor de tela**: o estado selecionado, a associação de rótulos e o nome acessível do estado de conexão têm cobertura de teste.
- [x] **Verificação antes do commit**: `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, os testes unitários afetados e os E2E afetados passam; depois disso, commit local.


## Comments

2026-09-29 implementação e verificação:

- Ponto de partida `44ac7aeedd23924b4c4aa214117c5e92c22b353e`, workspace inicialmente limpo. Foi introduzido o token de texto auxiliar remoto, complementando rótulos, descrições de status, exibição da senha, candidatos do histórico e a operação por teclado na lista do Docker; o arraste preserva o nome do dispositivo; foram removidos o componente antigo de agrupamento de dispositivos e as funções auxiliares sem referência em produção, mantendo a resolução da identidade estável e do legacy alias.
- `pnpm typecheck`, `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm lint` e `pnpm architecture:check --changed` passaram. O lint ficou com 65 avisos pré-existentes e 0 erros; a arquitetura, com 0 violação.
- Os testes unitários afetados cobriram 373 arquivos e 3892 itens. Na batch final, 372 arquivos passaram; depois de separar, nos testes da linha de projeto, a asserção da etiqueta curta visível da nova descrição para leitor de tela, as 10 execuções direcionadas passaram todas. Não foi executada a suíte completa de testes unitários. Inclui os testes unitários já existentes de layout web no celular, de tarefas de controle remoto e de recuperação do relay.
- O seletor de escopo do ponto de partida reportou incompletude por causa de dois imports de recursos estáticos não alterados (mp3 / html?url) e do cabeçalho de grupo antigo removido; os testes por ele identificados, o novo teste de teclado do histórico e o teste de seções da barra lateral foram escritos como lista explícita e executados via `pnpm test:unit:affected --files-manifest`. A ausência de chamadas em produção do cabeçalho de grupo antigo e da função de agrupamento foi confirmada por dep:refs sem restrição de escopo e por busca de referências em todo o repositório; a função auxiliar de identidade foi mantida por regressão.
- O E2E real por SSH `conversation-session-remote-accessibility.test.ts` passou: instalação no novo alvo, exibição da senha, alternância do download, entrada de diretório, Enter no projeto, menus de detalhe/mais, desconexão e conexão pelo cartão de configurações, "escolher depois", preenchimento de candidato do histórico e fechamento — todos por operação de teclado; a etiqueta do dispositivo foi verificada à parte com arraste via ponteiro. As credenciais de teste são injetadas por fixture.
- Capturas de tela revisadas: 8 de cada para a tela de seleção, o formulário, a confirmação de instalação, a tela de diretório, o detalhe da barra lateral e o cartão de configurações, totalizando 48, cobrindo claro/escuro × pt/en × 1400/900px; cada captura afirma a barra lateral de 264px. As 96 combinações de superfície de status e o contraste do texto auxiliar e das etiquetas de tipo nos quatro temas passaram no portão de 4.5:1.
- Evidências locais: `packages/desktop/.e2e-artifacts/rdux14-accessibility/`, com `summary.json`, seis `*-matrix.jpg`, as imagens originais, `drag-device.png`, a lista de testes e os logs de verificação. O leitor de tela foi validado por testes de nome acessível, descrição e estado selecionado no DOM; não foi executado VoiceOver/NVDA nativos; os controles de WSL/Docker foram verificados por teste de componente, e o caminho real foi exercitado por SSH.
- Revisão code-review em dois eixos: Standards sem apontamentos residuais; Spec apontou omissões de teclado no histórico e na exibição da senha, corrigidas e reconferidas. Os novos casos E2E permanecem em manual-review/pending, ainda não promovidos manualmente nem incluídos no CI do Docker.
