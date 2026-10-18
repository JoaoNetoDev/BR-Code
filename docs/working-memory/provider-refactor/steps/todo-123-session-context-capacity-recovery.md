# Todo123: desaclopamento entre consulta de capacidade de sessão histórica e validação da seleção de execução

> Status: implementação e revisão concluídas em 2026-09-12; 12 testes direcionados novos, gate final em lote e os casos CW01–CW06 reais em Electron no Pro passaram. O ramo de protocolo do celular é coberto pelos testes de integração do Bootstrap e não é declarado como aprovação prática do controle remoto pelo celular.

## Registro de implementação e revisão desta rodada

- O App ganhou uma entrada de consulta somente leitura ao Registry conforme a seleção especificada; a capacidade vem da identidade atual do Runtime e, na falta dela, da `restoredModelSelection` já existente. Não foram alterados a validação da seleção de recuperação, a criação oficial do Model nem o momento de limpeza dos candidatos de recuperação.
- O mesmo load usa a capacidade exata tanto para a síntese histórica quanto para o seed de usage, devolvendo as duas coisas juntas ao Gateway; primeiro restaura a semente e depois completa o buffer live, sem aumentar caches de longo prazo nem introduzir nova sincronização. Sem capacidade, não se sintetiza mais 200k; o maxTokens interno da semente pode ser null e o uso é preservado. Protocolo, `desktop-continuous` do desktop／`replayable` do celular, shared-host e o isolamento de workspace seguem inalterados.
- SQLite real + App real + Server reais validaram separadamente que, nos dois clientMode, a identidade sem o tier de raciocínio continua exibindo 1M, com conteúdo legível e sem vínculo no Runtime; e que um modelo desconhecido abre normalmente com capacidade null. Também foram testados uso desconhecido seguido de recuperação, novo evento sobrescrevendo a semente antiga, entrega única sem segunda consulta, prioridade da identidade atual e não ressurreição de candidatos limpos — 12 itens passaram. A fixture de teste inicial passou por engano o formato codificado do DB para a Store API; depois de corrigi-la para o formato de domínio, reconfirmou-se que os dois casos sem o tier falhavam na implementação antiga de consulta, e a validação da correção foi refeita.
- No lote de seis arquivos, 410 passaram e 5 falharam; no commit de pré-correção e1a28f23eb, em worktree temporário isolado, os mesmos cinco itens foram rodados de novo e falharam todos da mesma forma: três fixtures antigas de cold recovery gravando campos velhos após a migração, o denylist remoto de Cron e uma asserção antiga de serialização de Account. A correção não foi ampliada. Os demais cobrem Compact, cache, breakdown, seleção completa e backfill. O typecheck do Bootstrap foi inicialmente afetado por declarações dist antigas do Adapter e passou após reconstruir o Adapter; typecheck／lint da raiz (0 errors/41 warnings) e arquitetura passaram.
- CW05/CW06 estenderam o E2E de Electron existente: modificam o novo campo de seleção de uma Session de teste isolada apenas depois da barreira de saída, preservando o corpo criado pela UI real e a marca de Compact, e então testam a cold read sem tier e com modelo desconhecido. Em 2026-09-12, após reconstruir App／Agent a partir de `fc757c0ec9` no diretório isolado do Pro, o grupo inteiro passou; o título do relatório ainda é CW01-CW04, mas a execução real inclui CW05/CW06. Log `/tmp/provider-20260912-pro-cold-resume.log`, artefato remoto `/Users/dev/provider-stabilization-pro.euQzIZ/packages/desktop/.e2e-artifacts/provider-20260912-pro-cold-resume/summary.md`. A aprovação da configuração de browser não substitui esta aceitação de cold recovery.

## Problema e objetivo

Uma sessão histórica no Air exibe GLM-5.3-Flash, mas aparece com uma capacidade de contexto de cerca de `29,908 / 200,000`. A configuração Built-in do pacote instalado já verificado declara a capacidade desse modelo como `1,000,000`; a seleção no novo formato da sessão está sem o tier de raciocínio.

A entrada de recuperação atual lê a ModelSelection salva e a devolve intacta à camada superior, mas só a grava na seleção de sessão do Runtime quando a validação completa de execução passa. Como a consulta de capacidade obtém a seleção apenas do Runtime, quando falta o tier ela não consegue obter a identidade do modelo, pula a consulta ao Registry e a recuperação histórica acaba usando o padrão de 200,000. Não se trata de um Model de execução já criado sem capacidade, e também não se pode concluir daí que a requisição real foi limitada a 200,000.

Objetivo: bastando a identidade conhecida do modelo, consultar a capacidade no Registry sem perder a exibição da configuração só porque a seleção ainda não é executável; quando a capacidade não puder ser obtida, não exibir um falso 200 mil nem percentual. O uso histórico de tokens continua preservando a origem real.

## Plano de mudança

```text
Seleção da sessão atual no Runtime; quando ausente, usa a restoredModelSelection existente
                         |
                         v
              Consulta ao Registry por providerId/modelId exatos
                         |
             +-----------+-----------+
             |                       |
   Inicialização da recuperação   Backfill da semente de uso
   de eventos históricos         uso histórico já consumido + mesmo resultado de capacidade
   usa a capacidade conhecida     |
   ou desconhecida               |
             |                       |
             +-----------+-----------+
                         v
                Projeção de usage V4 / snapshot
                         v
           Exibição de capacidade no desktop e no celular

Criar o Model de execução → continua submetendo a validação completa de execução (este item não a flexibiliza)
```

### 1. Reutilizar a identidade de sessão existente, sem novo estado persistido

- Reaproveitar o `record.restoredModelSelection` que o código de recuperação já tem, mantendo a mesma origem de seleção das sementes de configuração existentes; sem releitura do banco, sem cache de longo prazo e sem um segundo estado de seleção.
- Preservar a regra de limpar o candidato de recuperação depois que a nova seleção entra em vigor, para que a seleção antiga de recuperação não sobrescreva a nova nem ressuscite após a limpeza.
- A consulta de capacidade não pode usar o rascunho não submetido do Composer, nem completar o tier de raciocínio, nem remapear entre Providers, nem tomar emprestado o modelo padrão.

### 2. Fornecer um caminho somente leitura para consultar a config do Registry conforme a seleção

- Na camada do App, reaproveitar a implementação existente de consulta ao Registry e permitir que a entrada de capacidade consulte a config do modelo conforme a seleção recebida; não é preciso gravar antes a seleção no Runtime nem criar um Model.
- Usar a identidade Provider／Model de forma exata, sem tomar a completude do tier de raciocínio como requisito para consultar metadados; quando o Registry não tem o modelo correspondente ou não há capacidade válida, retorna desconhecido.
- Não alterar as convenções de gravação／limpeza da seleção de sessão do Runtime, nem mudar a semântica de execução e herança de ModelFactory, Submission, Guide e Subagent.

### 3. Fechar recuperação histórica e backfill de uso em conjunto

- A recuperação dos eventos históricos é responsável por reconstruir o conteúdo do chat e o estado inicial; a semente de uso é responsável por repor o nível de contexto mais recente a partir do Runtime／das mensagens persistidas. As duas podem escrever capacidade, portanto precisam usar o mesmo resultado de consulta, sem que uma fase posterior escreva de volta um denominador antigo.
- Durante a cold recovery, reaproveitar o resultado de capacidade obtido uma única vez, evitando que as duas fases leiam configs inconsistentes; sem espera de sincronização adicional, sem sistema de versões e sem estado de longo prazo.
- Capacidade desconhecida segue o `usage.contextWindow: null` já existente no protocolo; não introduzir pseudo-capacidades como `maxTokens: 0` e não exibir percentuais falsos. A semente／projeção de uso interno precisa suportar capacidade desconhecida preservando os tokens já usados, sem perder o fato do uso por ocultar o painel de capacidade.
- O protocolo atual já permite que o objeto de capacidade inteiro seja null, e não é exigida extensão do schema entre processos. Reaproveitar a exibição já existente de capacidade desconhecida, sem desenhar uma nova UI de "quantidade usada / limite desconhecido".
- A semente de recuperação não pode sobrescrever eventos reais de modelo／uso já vigentes durante a recuperação; preservar a precedência de eventos existente e o limite de atualização de capacidade do mesmo modelo.
- Tratar apenas o denominador padrão desta cadeia de exibição de recuperação, sem remover globalmente todas as constantes de 200,000 e sem alterar o limiar real de compactação nem o orçamento de saída da requisição.

## Escopo e ordem de implementação

A previsão é de uma correção pequena a média, cerca de 5 a 7 arquivos de código de produto mais os testes e specs relacionados, conforme o resultado real do fechamento de interfaces, e não um limite de correção por número de arquivos.

1. Atualizar os fatos de recuperação e a convenção de capacidade desconhecida em `docs/context-window-usage-state.md` e `docs/coding-plan-context-usage.md`.
2. Adicionar primeiro os testes que falham para a seleção histórica sem tier e para a capacidade desconhecida, e só então implementar a consulta no App, a capacidade na recuperação e o tratamento da semente interna de uso.
3. Estender o E2E existente de cold recovery de capacidade e, com o grupo inteiro concluído, fazer a validação em lote e a review, sem rodar regressão completa repetidamente para cada pequena modificação.

Não envolve migração de banco, refactor de sincronização de conta, regras de capacidade do Registry, o objeto de execução real do modelo nem o serviço de cota. A correção de migração para perda de tier de raciocínio é tratada separadamente pelo Todo correspondente; não se pode substituir a aceitação deste item pelo desaparecimento do sintoma depois da correção pela migração.

O `desktop-continuous` do desktop e o `web-remote-replayable` do celular continuam consumindo os mesmos fatos de uso do V4, cada um mantendo seu limite de transmissão／recuperação original; não há novo Runtime para o celular e o isolamento por workspaceIdentity não muda.

## Aceitação e review

- [x] Modelo existente, capacidade de 1M e seleção sem tier: o conteúdo histórico abre; a capacidade está correta e os tokens usados não mudam; a execução ainda exige completar o tier.
- [x] Seleção normal e completa: a primeira projeção de uso visível e o backfill de semente posterior estão corretos e não piscam de volta para 200 mil; a execução real desta rodada e a atualização normal de capacidade não regridem.
- [x] Modelo inexistente ou capacidade desconhecida: não exibe pseudo-capacidade／percentual nem adiciona aviso de exceção; mensagens históricas e uso interno de tokens não se perdem; quando uma capacidade legítima for obtida depois, a exibição fica correta.
- [x] Nova seleção em vigor ou novo evento durante a recuperação: o candidato／a semente de recuperação antiga não pode sobrescrever o fato atual; o Composer altera apenas o rascunho e não muda a capacidade da sessão já em execução.
- [x] A cold recovery após Compact continua usando o nível persistido após a compactação, sem voltar ao uso anterior à compactação; cache／breakdown／uso acumulado mantêm a semântica original.
- [x] Estender o E2E existente de cold recovery e verificar a exibição compartilhada de desktop／celular e o ramo null do protocolo; validações de ambiente não executadas são registradas com fidelidade e não são marcadas como aprovadas.
- [x] Testes unitários relacionados, verificação de tipos e lint executados em lote; revisão item a item da origem da identidade de seleção, da consulta somente leitura ao Registry, da propagação de valores desconhecidos, da precedência de eventos e da não gravação de volta da seleção, antes de marcar como concluído.

## Principais entradas de código e teste

- `apps/zcode-cli/packages/bootstrap/src/app/create-app.ts`: seleção de recuperação e validação de execução, em princípio sem mudança.
- `apps/zcode-cli/packages/bootstrap/src/app/session-facade.ts`, `app/types.ts`, `app/provider-registry-selection.ts`: consulta somente leitura de config de modelo pelo App.
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-types.ts`, `server-operations.ts`: candidatos de recuperação já existentes e suas regras de limpeza.
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-runtime.ts`, `v4-bridge.ts`: origem da capacidade e as duas entradas de recuperação.
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/transcript-hydration.ts`, `product-projection.ts`: inicialização, semente de uso e propagação da capacidade desconhecida.
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-mapper.ts`: leitura do uso histórico real e nível de Compact, conferida conforme a necessidade.
- `packages/shared/src/zcode-protocol-v4/snapshot.ts`: protocolo existente de capacidade nullable, em princípio sem extensão.
- `packages/ui/src/v4/composer/V4ComposerToolbar.tsx`: consumo da exibição compartilhada, sem mudança de layout em princípio.
- `packages/desktop/test/e2e/conversation-session/conversation-session-context-window-cold-resume.test.ts` e os testes unitários de hydration／projection／protocol do Bootstrap.