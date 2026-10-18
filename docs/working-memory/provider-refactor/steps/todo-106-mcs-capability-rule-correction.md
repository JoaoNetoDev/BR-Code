# Todo 106: Correção das regras de capacidade MCS e por site

> Status: implementação, verificação wire com SDK real e revisão item a item concluídas. 2026-09-10. Evidências de implementação/teste, revisão de cada fronteira e limitações do ambiente real estão em [a revisão de entrega deste lote](./provider-todos-105-113-delivery-review.md).

## Princípios e objetivos

Seguir [o princípio de manutenção da configuração Match do Design V2](../design-v2/design.md): configuração mainstream, oficial em primeiro lugar, sem reduzir a capacidade padrão para fins de compatibilidade com implementações de terceiros atrasadas; as regras por site são mantidas uma a uma, por URL concreta.

## Mudanças confirmadas

1. Remover a declaração ampla de MCS habilitado para todos os `claude-*` no site oficial da Anthropic. Declarar MCS conforme os modelos oficialmente suportados e o API Schema; o Sonnet 5 não pode ser habilitado por engano, e a busca nativa na web já existente não deve ser desligada junto.
2. Restaurar o suporte padrão a MCS no nível de modelo para `claude-opus-4-8` sob Anthropic Messages, cobrindo as formas de prefixo/sufixo já estabelecidas, sem exigir que sites proxy liberem separadamente. Quando o proxy não suportar, o usuário pode desligar em Personal; corrigir o teste atual de "Opus 4.8 em site desconhecido deve ser false".
3. Para os dois itens abaixo, escrever uma regra de site cada, com API `anthropic-messages`, sem restrição de modelo, declarando `supportsMidConversationSystem: true` e `supportsNativeWebSearch: true`:
   - `https://zcode.z.ai/api/v1/zcode-plan/anthropic`
   - `https://zcode.z.ai/api/v1/off-peak/anthropic`
4. Separar por URL as regras de site das URLs combinadas envolvidas nesta alteração (incluindo endpoints comuns Z.ai / BigModel); preservar as capacidades independentes existentes de cada URL, sem conceder a um site a capacidade de outro por causa da separação das regras. Não fazer refatorações de Runtime nem alterações de regras sem relação.

## Base de verificação e fronteiras

- A resolução Built-in atual foi revisada: o MCS do `claude-sonnet-5` oficial é true; o MCS do proxy Opus 4.8, Start e Off-Peak é false.
- Antes da alteração, em `fe8a3159c7^`, tanto `contracts/src/model/mid-conversation-system.ts` quanto `contracts/src/tools/websearch.ts` liberavam por domínios como `z.ai` e subdomínios; portanto o MCS e a busca nativa na web dos dois endpoints acima eram declarados como suportados. Esta evidência confirma o comportamento do código antigo, sem se passar por teste de gateway real.
- A [documentação oficial da Anthropic sobre MCS](https://platform.claude.com/docs/en/build-with-claude/mid-conversation-system-messages) afirma explicitamente que o Sonnet 5 não suporta MCS; na implementação, conferir os modelos oficialmente suportados, sem usar correspondência ampla pela marca Claude.
- O Runtime continua consumindo apenas os atributos finais; não restaurar a antiga allowlist de URLs nem o caso especial de fast model, e não modificar Selection, o estado da conta ou a estratégia de retry após falha de requisição.
- O desligamento explícito em Personal continua prevalecendo e não é invalidado por habilitação padrão de modelo ou site.

## Lista de aceitação

- [x] Primeiro cobrir a regressão de parsing de configuração: modelos oficiais suportados/não suportados, Opus 4.8 de terceiros, modelos com prefixo/sufixo, isolamento por tipo de API.
- [x] Revisar os quatro Providers BigModel / Z.ai (Start e off-peak), com MCS e busca nativa na web finalmente habilitados; o Coding Plan comum não sofre regressão.
- [x] Validar a normalização de URL e os casos negativos, sem correspondência indevida com domínios/caminhos sem relação; o desligamento pessoal pode sobrescrever o padrão.
- [x] Validar, no ponto final de codificação da requisição, o system reminder independente quando habilitado, o user reminder existente quando desabilitado e a codificação de ferramenta da busca nativa; não verificar apenas o booleano de configuração.
- [x] Executar os testes relevantes do lote inteiro, revisar a hierarquia das regras e a ordem de cobertura, registrar as limitações da verificação em serviço real e não tomar captura local de requisição como aceitação do upstream.

## Evidências de implementação e revisão

- Conforme a lista atual de modelos suportados na documentação oficial de MCS, declarar Opus 4.8/5, Fable 5/5.1 e Mythos 5/5.1 em `modelApiRules`; Sonnet 5 não é habilitado. Remover o MCS amplo da URL oficial e manter a declaração de busca dela.
- Coding Plan comum, Start e Off-Peak mantêm MCS/busca separados por URL; as regras de mídia dos três URLs originais também foram separadas por URL, sem estender a capacidade de mídia ao Off-Peak.
- `mcs-capability-rules.test.ts` + integridade Builtin + rule-collections: 20 casos passando, cobrindo oficial/proxy, modelos com prefixo/sufixo e apelidos com ponto, APIs distintas, casos negativos de caminho exato, barra final, Personal false e oito Account Providers.
- `builtin-mcs-search-wire.test.ts` passando pelas regras publicadas → projeção de reminder do Core → SDK/Adapter real → mock fetch: 7 cenários aprovados; junto com os wire tests existentes de MCS/WebSearch, 14 casos aprovados. Confirmado o system reminder e a codificação da ferramenta de busca nativa nos quatro Start/Off-Peak, o Sonnet rebaixado para user reminder, o proxy Opus habilitado e o desligamento em Personal.
- Revisão item a item: sem allowlist de URL/modelo no Runtime, sem novos ramos de autenticação ou retry, sem escrita em Selection; ordem das regras e sobreposição final de Personal preservadas. Keys/rede dos testes são fixtures; nenhum serviço real foi chamado.
- Evidência oficial: [modelos com suporte a MCS](https://platform.claude.com/docs/en/build-with-claude/mid-conversation-system-messages), reconferido em 2026-09-10. O template do Fable 5.1 e outras capacidades são continuados no Todo113, sem duplicar templates.