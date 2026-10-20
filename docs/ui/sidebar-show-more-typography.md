# Texto “Mostrar mais” (Show More) da barra lateral

2026-09-15: A entrada de paginação da barra lateral de projetos usa o mesmo tamanho de fonte `text-ui-base` que os títulos das tarefas e que o estado vazio “Nenhuma tarefa” (No tasks), escalando conforme a configuração de tamanho de fonte da interface. A cor de texto padrão é a mesma do estado vazio, usando `text-foreground-subtlest`; no hover e no focus-visible do teclado, usa `text-foreground`, com o fundo permanecendo transparente.

Renderizado pela entrada existente `ProjectTaskRows`, preservando a indentação do texto e o comportamento de clique da paginação; a lista normal adiciona 5 itens por vez, e a lista de fixados mantém o expandir/recolher original. Apenas os tokens de exibição são ajustados, sem novos estados, IO, protocolo ou migrações. O desktop e a Web no celular compartilham este componente e os tokens de tema, e os limites de transmissão continuous/replayable não mudam.

## Aceitação

`VP-MORE-01` (accepted/pending): renderer Electron real com HOME isolado prepara 6 tarefas e um projeto vazio; comparam-se os computed font-size da entrada, do título da tarefa e de “Nenhuma tarefa”, e comparam-se as cores padrão da entrada e do estado vazio; os temas claro e escuro, 1200/390px e os tamanhos de fonte de interface de 14/18px permanecem consistentes. O hover real do mouse e o focus-visible do teclado produzem realce; o clique expande de 5 para 6 itens e oculta a entrada. Guardam-se capturas de tela e amostras de estilo, sem requisições ao provider; a simulação em tela estreita não representa validação no shared-host do celular nem em máquinas reais Windows/Linux.

## Resultados da verificação

Antes da correção, a medição real no Electron mostrou a entrada com 12px e o título e o estado vazio com 14px, e as cores padrão também divergiam; o caso falhou na asserção de tamanho de fonte. Após a correção, `desktop-e2e-20260915123224650-p53861-1395a2f25af8019d` passou 1/1, com 8 conjuntos de computed style, hover/focus e paginação 5→6 aprovados; as capturas de tela e o `show-more-styles.json` permanecem no diretório da execução. Mantém-se pending.

`typecheck`, `typecheck:e2e` e a checagem de formatação passaram; o lint reportou 47 warnings já existentes e 0 errors. A checagem incremental de arquitetura do HEAD apontou 0 violações; a checagem da branch padrão ainda aponta o `root/resolveConversationWorkspaceTarget.ts` unmanaged-new-file já existente, não introduzido nesta alteração.
