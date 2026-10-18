# Design de migração do Bot State/Cache V2

## Contexto

O Bot atualmente usa `bot-state.json` para guardar o estado de execução e a seleção de draft, e `bots-model-cache.json` para guardar o cache de provedores de modelos. Depois que a configuração de provedores de modelos já foi migrada para `config.json`, o Bot ainda pode ler do state/cache antigo um provider id histórico ou um snapshot de modelo antigo, o que faz `/model` exibir um `providerId/modelId` antigo ao mostrar o modelo atual, mas ao escolher o provedor informar que o provedor de modelos não foi encontrado.

`model-providers.json` já tem a lógica de migração para `config.json`. O state/cache do Bot não deve reimplementar a migração de configuração de providers; deve reutilizar `modelProviderService.getAll()` para obter os dados autoritativos de providers já migrados e então elevar o próprio estado de execução e cache do Bot para os novos arquivos.

## Objetivos

- Adicionar `bot-state.v2.json` e `bots-model-cache.v2.json`.
- A nova versão do Bot lê e escreve prioritariamente os arquivos v2.
- Quando os arquivos v2 não existem, ler apenas os antigos `bot-state.json` e `bots-model-cache.json` como entrada de migração.
- Após a migração, os arquivos antigos não são modificados nem excluídos, e as aplicações de versão antiga continuam funcionando pela lógica antiga.
- O snapshot de provider/model do Bot segue os dados de providers já migrados em `config.json`.
- Evitar continuar preservando um draft model que não pode ser resolvido na nova estrutura de providers.

## Não objetivos

- Não mesclar o estado de execução do Bot dentro do `config.json`.
- Não modificar a lógica de escrita do `bot-state.json`, do `bots-model-cache.json` ou do `model-providers.json` antigos.
- Não alterar a semântica dos comandos do Bot, os modelos autorizados, as regras de seleção de workspace ou o protocolo dos adaptadores de plataformas de terceiros.
- Não migrar nem expor a API key do provider; o model cache do Bot continua guardando apenas campos não sensíveis usados para exibição de seleção.

## Arquivos e versões

A estrutura de nível superior de `bot-state.v2.json` contém:

- `version: 2`
- `migratedAt`
- `source?: { stateUpdatedAt?: number }`
- `bots`: o bot state existente na forma v2

A estrutura de nível superior de `bots-model-cache.v2.json` contém:

- `version: 2`
- `updatedAt`
- `migratedAt?`
- `source?: { cacheUpdatedAt?: number }`
- `providers`: snapshot sem dados sensíveis de provider/model vindo de `modelProviderService.getAll()`
- `modelIdRemaps?`: guarda apenas o mapeamento de modelo antigo para modelo novo que possa ser provado como único durante a migração, para facilitar o reuso pela migração do state

A lista de providers do cache v2 não é uma cópia direta do cache antigo. O cache antigo serve apenas como entrada auxiliar, para entender se um draft model antigo ou um item de cache antigo ainda pode ser mapeado para o novo provider.

## Fluxo de migração

Na inicialização do Bot service, a carga ocorre nesta ordem:

1. Se ambos o state e o cache v2 existirem e o schema for válido, usar diretamente os arquivos v2.
2. Se algum dos arquivos v2 não existir, ler o arquivo antigo correspondente como entrada de migração somente leitura.
3. Chamar `modelProviderService.getAll()` para obter a lista autoritativa atual de providers. Essa chamada continua reutilizando a lógica de migração existente de `model-providers.json -> config.json`.
4. Gerar `bots-model-cache.v2.json`:
   - o snapshot de providers vem da lista autoritativa atual de providers;
   - campos sensíveis são filtrados;
   - o tempo de origem da migração é registrado;
   - para providers/modelos antigos, gerar mapeamentos únicos verificáveis.
5. Gerar `bot-state.v2.json`:
   - preservar campos não relacionados a provider, como workspace, active task, pending permission, platform offset, reply mode, mode, thoughtLevel;
   - executar validação e migração de provider/model em `draftOptions.model`;
   - quando o casamento falhar ou houver ambiguidade, limpar esse draft model, para que o Bot volte ao estado seguro de modelo não selecionado.
6. Nas execuções seguintes, ler e escrever apenas os arquivos v2, sem mais escrever o state/cache antigo.

## Regras de migração de modelo

Ao migrar o draft model, o processamento segue uma ordem conservadora:

1. Se o `providerId` do valor antigo existe na lista autoritativa de providers e o `modelId` ainda pertence a esse provider, manter como está.
2. Se o `providerId` não existe, mas o cache antigo puder fornecer o nome do provider e `(nome do provider, modelId)` corresponder a apenas um provider na lista autoritativa, migrar para aquele provider id.
3. Se o valor antigo contiver apenas o modelId e esse modelId aparecer apenas uma vez na lista autoritativa de providers, é possível migrar para aquele provider.
4. Nos demais casos, considerar que não é possível migrar com segurança, limpar o draft model e registrar um log `warn`.

Aqui não se faz correspondência difusa, não se adivinha o provider por nomes semelhantes e não se escolhe aleatoriamente só porque o modelId é igual e vários providers casam.

## Compatibilidade e rollback

- Depois que a nova versão escreve os arquivos v2, a versão antiga ainda pode continuar usando os arquivos antigos; como a nova versão não modifica os arquivos antigos, a leitura da versão antiga não é quebrada.
- Se o usuário fizer rollback para a versão antiga, ela não vê os arquivos v2 e continua lendo o state/cache antigo.
- Se os arquivos v2 estiverem corrompidos, a nova versão pode regenerá-los a partir dos arquivos antigos e da configuração atual de providers; se os arquivos antigos também estiverem corrompidos, a inicialização ocorre com state/cache vazios.
- Excluir os arquivos v2 pode disparar uma nova migração, mas não restaura providers/modelos já inválidos nos arquivos antigos.

## Logs

A migração registra apenas logs de ciclo de vida de baixa frequência:

- `info`: arquivos v2 ausentes e início da migração, migração concluída.
- `warn`: falha na leitura do state/cache antigo, schema v2 inválido, draft model que não pôde ser migrado com segurança.
- `error`: falha ao escrever os arquivos v2 e o Bot não consegue continuar carregando o estado.

Os logs usam o `createServiceLogger(scope)` da camada de serviço e não registram API key nem o provider secret completo.

## Verificação

Adicionar testes unitários de armazenamento/migração do Bot service cobrindo:

- quando os arquivos v2 existem, eles têm prioridade e os arquivos antigos não são lidos como dados autoritativos.
- quando os arquivos v2 não existem, a migração vem do state/cache antigo e apenas os arquivos v2 são escritos.
- quando providerId/modelId continuam válidos, o draft model é mantido.
- quando o providerId mudou, mas nome do provider + modelId têm correspondência única, o draft model é migrado.
- quando há correspondência de vários providers ou nenhuma correspondência, o draft model é limpo.
- o snapshot de providers do model cache gerado vem de `modelProviderService.getAll()`, e não de uma cópia direta do cache antigo.
- a saída da migração não contém a API key do provider.

Após concluir a implementação, executar:

- testes unitários de migração do Bot relacionados
- `pnpm typecheck`
- `pnpm lint`