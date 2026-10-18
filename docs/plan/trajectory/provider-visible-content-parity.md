# Montagem do Conteúdo Visível ao Provider

## Escopo

Esta rodada ajusta superfícies já existentes de conteúdo visível ao modelo do ZCode: a communication longa na primeira volta de trajetórias sem tool-search, o act-don't-rederive compartilhado, o autonomy appendix do branch de objetivo, a descrição de MCS do Harness e a frase de research/exploration no EnterPlanMode; ao mesmo tempo, fixa o texto exato e os separadores do user context de nível de requisição e do reminder de anexos de texto. O conteúdo de provider do Agent não está no escopo.

## Restrições de Montagem

- Não modificar nenhum caractere do prompt original do ZCode; o texto original fica em `default`.
- O conteúdo novo fica em `additional`, carregado diretamente, sem entrar em julgamento de modelo ou provider.
- A communication fica antes do action caution.
- A communication, o action caution e o `# Harness` estável são independentes do `keepCodingInstructions` do output style; a montagem de objetivo usa esse campo apenas para controlar as coding instructions de doing-tasks. O ZCode hoje não tem um parágrafo independente correspondente, portanto `keepCodingInstructions: false` não deve cortar nenhum conteúdo de `# Harness`.
- O output style ativo é montado estritamente como `# Output Style: <name>\n<prompt>`, sem inserir linha em branco entre título e corpo.
- Depois do context management são montados, nesta ordem, o act-don't-rederive e os quatro parágrafos do autonomy appendix; o git context (se existir) continua depois deles.
- O input schema do EnterPlanMode permanece um objeto vazio estrito, e apenas a frase de research/exploration passa a ser `use the Agent tool instead`.
- O parágrafo final `IMPORTANT:` do user context de nível de requisição mantém seis espaços iniciais.
- O body do Read reminder sintetizado do mesmo anexo de texto é conectado com quebra de linha simples; anexos diferentes ainda são conectados com quebra dupla no mesmo MCS turn; live e resume seguem as mesmas regras de montagem.

## Linha de Base de Palavras Exatas

- A communication usa o texto longo, reaproveitando internamente a frase única no estilo de código já existente; a frase original aparece apenas uma vez.
- act-don't-rederive tem 277 caracteres e não termina com ponto.
- autonomy appendix tem 1354 caracteres e quatro parágrafos.
- O Harness usa o texto de system turn de mid-conversation e não descreve mais a injeção de tags em message/tool result.
- O texto de anexo truncado pelo limite padrão diz explicitamente `first 2000 lines` e orienta a continuar lendo aquele arquivo sob demanda.

## Fora de escopo

- Não ajustar beta, conteúdo exclusivo de produto, deferred tools, o catálogo de providers do Agent ou a forma de merge de system blocks.
- Não acrescentar outras seções dinâmicas nem chaves de runtime nem fallbacks.

## Aceitação

- Testes unitários validam palavras exatas, ocorrência única e ordem relativa.
- Testes unitários cobrem output style ativo com `keepCodingInstructions: false`, confirmando que o `# Harness` estável, a communication e o action caution continuam presentes.
- Testes unitários validam que há apenas uma quebra de linha entre o título do output style e o corpo.
- Testes de runtime validam a requisição final visível ao provider na primeira volta, e não apenas seções intermediárias.
- Testes de anexo e de resume validam respectivamente quebra simples para o mesmo anexo, quebra dupla para anexos diferentes, o texto de truncamento e a consistência após a retomada.
- `prompt-trajectory` roda a cadeia completa runtime/proxy/derive com um mock provider e cobre MCS, memory, context de nível de requisição e anexos; após gerar a trajetória, a validação segue o escopo desta seção e a linha de base de palavras exatas.