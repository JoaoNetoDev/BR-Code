# Especificação de instalação sem Git de fontes de plugins públicas do GitHub

## Status

- Data: 2026-08-06
- Baseline: `origin/staging`
- Decisão: fontes públicas HTTPS do GitHub priorizam o GitHub Archive; o Git não é embutido no pacote do Desktop nem no do Agent.

## Problema e causa raiz

Hoje as origens `github`, `git`, o `url` legacy e `git-subdir` de Marketplace e de entradas de plugin acabam sempre em
`execFile("git", ...)`. Isso faz com que a capacidade de gerenciamento de plugins dependa implicitamente de a máquina que executa o ZCode Agent já ter Git instalado:

- Workspace local do Desktop depende do Git da própria máquina;
- A CLI standalone depende do Git da máquina onde a CLI roda;
- Workspaces SSH, WSL e Docker dependem do Git dentro do Agent Host remoto, e não do Git do Desktop.

A descoberta de plugins instalados, o start/stop e a injeção de sessão leem apenas o installed cache local e, por si só, não precisam de Git. O problema é uma lacuna de design na fronteira de "materialização de origem remota" e não deve ser resolvido adicionando ramificações especiais na UI, no main do Desktop ou no relay.

## Objetivos

1. Todas as origens de Marketplace e de plugin em `github.com` HTTPS que podem ser lidas anonimamente continuam pudendo ser atualizadas,
   verificadas, descritas, instaladas e atualizadas mesmo sem Git no sistema.
2. O GitHub Archive compartilha download, limites, extração segura e capacidade de proxy com o ZIP explícito já existente, sem misturar as duas semânticas de integridade:
   o ZIP explícito verifica `sha256` e o GitHub Archive se vincula ao `sha` / `commit` / `ref` do Git.
3. O snapshot de Marketplace e o installed plugin cache mantêm sempre uma versão antiga completa e legível offline, antes e depois de falhas, cancelamentos ou abnormalidades de processo.
4. A atualização em lote isola falhas por Marketplace; a falha de uma origem não pode bloquear as outras nem apagar o último snapshot bem-sucedido.
5. Repositórios privados, SSH, serviços Git que não sejam o GitHub e origens que realmente precisem de semântica avançada do Git continuam passando pelo Git do sistema; sem Git, é retornado um
   diagnóstico estruturado e acionável.
6. A mesma implementação de adapter vale em macOS, Windows e Linux, e em Desktop local, CLI standalone e
   Agent Host SSH/WSL/Docker.

## Não objetivos

- Não embutir nem baixar o executável do Git, e não introduzir libgit2/isomorphic-git.
- Não criar um novo protocolo de credenciais para token SSH/chave SSH de repositório privado.
- Não mudar a semântica de ativação de plugin, confiança de Hook, MCP, Skill, Subagent ou injeção de sessão.
- Não afundar o estado de negócio de plugins no main do Desktop, no remote relay ou no lado do celular.
- Não implementar transação distribuída integrada sobre vários JSON/diretórios; cada target substituído usa um marcador de restauração no mesmo diretório e
  um backup determinístico, restaurado antes do próximo carregamento de estado ou descoberta de plugins.

## Cadeia alvo

```text
Settings / CLI command
        |
        v
plugins protocol -> workspace Agent Host (local / SSH / WSL / Docker)
        |
        v
source classifier
        |
        +-- public github.com HTTPS / github shorthand
        |       |
        |       v
        |   pin = sha/commit > ref > HEAD
        |       |
        |       v
        |   GitHub Archive REST zipball (HTTPS -> codeload redirect)
        |       |
        |       v
        |   bounded download -> secure extract -> semantic validation
        |
        +-- private/auth/SSH/non-GitHub/submodule/LFS
                |
                v
             system Git
                |
                +-- unavailable -> structured actionable diagnostic

validated source tree
        |
        v
same-volume staging copy
        |
        v
write transaction marker
        |
        v
target -> backup ; staging -> target ; authority JSON writes transactionId
        |                         |                    |
        +------ failure ----------+--> backup -> target rollback
                                                   |
                                                   v
                                  finalize removes backup + marker
        |
        +------ process exit -----> next read cross-checks authority generation

startup / discovery / enable / session injection
        |
        +----------------------------> installed cache only (no HTTP, no Git)
```

## Classificação da origem e pin

### Candidatos ao GitHub Archive

As origens abaixo usam Archive preferencialmente quando a URL do repositório pode ser normalizada para `https://github.com/<owner>/<repo>[.git]` e o Marketplace
não declarou `sparsePaths`:

- Marketplace `{source:"github", repo, ref?, path?}`;
- Marketplace `{source:"git", url, ref?, path?}`;
- Entrada de plugin `{source:"github"}`, `{source:"git"}`, `{source:"url"}`,
  `{source:"url", type:"git"}` e `{source:"git-subdir"}`.

Somente URLs HTTPS de `github.com` / `www.github.com` e o shorthand `owner/repo` são aceitos. SSH, `git://`,
URLs com userinfo e outros hosts não entram na rota Archive. A URL do repositório precisa resolver exatamente owner e repo, e caminhos extras de página tree/blob são
rejeitados.

A ordem de escolha da ref do Archive é fixa:

```text
source.sha || source.commit || source.ref || "HEAD"
```

`sha` / `commit` são a identidade do objeto no Git; `ref` e `HEAD` podem mudar com o remoto. Nenhum deles equivale ao
SHA-256 dos bytes do ZIP e não podem ser escritos nem reaproveitados no campo `sha256`.

### Rota de Git do sistema

As origens abaixo mantêm o Git do sistema:

- SSH, host que não é o GitHub, URLs com credenciais ou que exigem autenticação;
- Marketplaces que declaram `sparsePaths`; o Archive ainda não implementa uma projeção de caminhos equivalente ao sparse checkout do Git, e não pode baixar o
  repositório inteiro antes e thereby quebrar a usabilidade existente de repositórios grandes;
- Archive devolvendo 401, 403 ou 404, o que pode significar repositório privado ou não legível anonimamente;
- o caminho alvo após a extração depende de submódulo, ou o arquivo de plugin alvo é um ponteiro de Git LFS;
- origens legacy que não podem ser normalizadas com segurança e sem ambiguidade em um repositório do GitHub.

Timeout do Archive, falha de conexão, 5xx, limite de cota ou falha na verificação de segurança não mudam automaticamente para o Git, para não repetir a mesma rede ou o
mesmo pacote malicioso em outro caminho imprevisível. Só as classificações que "precisam de semântica/autenticação do Git" fazem fallback.

Quando o Git do sistema não existe, o código de diagnóstico é `plugin_git_unavailable`, e a mensagem precisa explicar: a origem, por que essa origem precisa de Git,
e a forma de recuperar, instalando o Git no Agent Host atual ou usando GitHub HTTPS público/ZIP explícito.

## Segurança de download e extração

O GitHub Archive usa o endpoint REST oficial `repos/{owner}/{repo}/zipball/{ref}` e reaproveita o
materializador HTTP ZIP de baixo nível de `zip-source.ts`:

- Somente HTTPS é permitido no remoto; fixtures de teste permitem apenas HTTP loopback;
- Usa o ambiente de rede unificado de proxy/CA/NO_PROXY;
- No máximo 5 redirecionamentos, sem encaminhar headers customizados entre origins;
- Pacote de no máximo 100 MB, extração de no máximo 250 MB, no máximo 20.000 entradas e arquivo único de no máximo 50 MB;
- Rejeita zip-slip, caminhos absolutos, symlinks e arquivos especiais;
- O GitHub Archive remove automaticamente o único diretório de topo e resolve o plugin ou o `path` do Marketplace dentro dele;
- `sparsePaths` não entra na rota Archive e continua sendo executado pelo sparse checkout do Git do sistema.

O `{source:"url", type:"zip"}` explícito continua exigindo `sha256`. O GitHub Archive não exige SHA-256 do archive,
mas, se a source fornecer um pin de commit, a URL de download precisa estar vinculada a esse commit.

## Ativação atômica do cache

O snapshot de Marketplace e o installed plugin cache compartilham o seguinte protocolo de commit por diretório:

```text
prepare:  target parent/.<name>.stage-XXXXXX
validate: manifest, path alvo, versão e checagem de compatibilidade passam dentro do stage
intent:   escreve .<name>.transaction.json（owner + transactionId + authorityPath）
commit:   target -> .<name>.backup
          stage  -> target
state:    known/installed JSON registra o mesmo cacheTransactionId
cleanup:  apaga backup e marcador de transação
rollback: quando o segundo rename falha, backup -> target
recovery: se a authority tiver transactionId, mantém target; caso contrário, restaura o backup
```

- Staging e target precisam estar no mesmo diretório pai, garantindo que o rename não cruze sistemas de arquivos;
- O nome do backup é determinístico, e o marcador de transação registra o nome do stage no mesmo diretório, o owner do processo, o transactionId e o arquivo de estado
  autoritativo; o código de restauração recusa limpar caminhos que não correspondam a esse prefixo de target;
- Cancelamento antes do commit: apaga o staging e o target antigo permanece inalterado;
- Depois que o commit começa, cancelamento não é mais tratado como falha, e a ativação e o registro de estado são concluídos, evitando "o novo diretório já está valendo, mas o
  installed record não foi escrito";
- Falha no cleanup apenas registra/acrescenta diagnóstico e não faz rollback da nova versão que já deu certo;
- Quando uma leitura comum encontra o owner ainda vivo, não executa restauração: enquanto o estado autoritativo ainda não tiver registrado o transactionId, lê o backup; depois de
  registrado, lê o target. Assim, o overview/runtime discovery não rouba os recursos de rollback do writer nem enxerga estado de gerações diferentes;
- Após a saída do processo, a leitura de restauração usa o mesmo `cacheTransactionId` em `known_marketplaces.json` / `installed_plugins.json` como critério de commit: se existir,
  mantém o novo target; se não existir, restaura o backup antigo (na primeira instalação, remove o novo target ainda não submetido);
- O arquivo de estado JSON, em plataformas que suportam rename com sobrescrita, faz substituição atômica no mesmo diretório; no Windows, quando o target já existe, usa o mesmo
  backup determinístico mais o protocolo de restauração antes da leitura;
- Os pontos de entrada de leitura sincronizada de `known_marketplaces.json`, `installed_plugins.json`, do manifest de Marketplace e do installed cache
  resolvem a geração legível, de modo que nem uma submissão ativa nem a janela de saída do processo são interpretadas como remoção de origem ou de plugin;
- A atualização de Marketplace carrega e verifica a source por completo antes de ativar o snapshot; qualquer erro de download ou parsing não toca o snapshot antigo.

## Estado de atualização do Marketplace

`KnownMarketplaceRecord` ganha um `lastRefreshFailure` opcional:

```ts
interface MarketplaceRefreshFailure {
  code: "plugin_git_unavailable" | "plugin_archive_fetch_failed" | "plugin_marketplace_invalid";
  message: string;
  failedAt: string;
}
```

- Falha na atualização de um único marketplace: salva a failure e mantém `lastUpdated`, `pluginCount` e snapshot originais;
- Atualização em lote: continua atualizando os outros marketplaces e retorna summaries de sucesso junto com diagnostics de falha;
- Próximo sucesso: limpa `lastRefreshFailure` e atualiza `lastUpdated`;
- `plugins/overview` retorna a failure, para que a UI ainda consiga exibi-la após reload ou restart, e não apenas em um toast passageiro;
- O installed cache é separado da disponibilidade do Marketplace, de modo que a falha ou remoção de uma origem não afeta a execução de plugins já instalados.

## Protocolo e comportamento da UI

- `zcodePluginMarketplaceSummarySchema` ganha um `refreshFailure` opcional, sem quebrar payloads antigos do Agent;
- `plugins/marketplace/update` usa o `diagnostics` opcional já existente para retornar falhas parciais;
- A operação de update da UI precisa checar os diagnostics de erro e, após recarregar o overview, preservar o `refreshFailure` do Marketplace;
  uma falha parcial retorna false, escreve o estado de erro no store compartilhado e exibe message/failedAt na linha da source do
  Marketplace; mesmo com falha parcial, a atualização em lote exibe as origens atualizadas com sucesso;
- Os pontos de entrada de update dos dois stores de UI, antigo e novo, obedecem à mesma semântica de sucesso parcial; o `usePlugins` legacy, mesmo sendo aposentado, não pode
  reportar um error diagnostic como sucesso;
- Erros de materialização de origem removem de forma unificada username/password de URL na fronteira de geração de diagnóstico e limpam o userinfo de URL em causas de rede
  aninhadas; persistência, logs, protocolo e UI deixam de tratar informações sensíveis por conta própria;
- Novos códigos de diagnóstico: `plugin_git_unavailable` e `plugin_archive_fetch_failed`; outros erros de manifest/dependência continuam usando os
  códigos de diagnóstico existentes.

## Limites entre plataformas e remoto

- A classificação da origem, o download, a extração, o fallback do Git e a ativação atômica ficam todos no adapter do zcode-cli;
- Desktop/Web/mobile chamam apenas pelo plugin service tipado e pelo Agent Host do workspace atual;
- O workspace remoto continua usando `workspaceIdentity` / `remoteSessionId` para escolher o Agent autoritativo e não cria um runtime independente;
- O sync do archive de source de plugin remoto é outro caminho, "diretório já materializado localmente enviado ao remoto", e esta funcionalidade não o remove;
- Esta rodada não muda a entrega de sessão/task `continuous` do desktop nem `replayable` do celular.

## Ordem de aceitação e testes

Escreva primeiro os testes de falha e então implemente:

1. Fixture de GitHub Archive em loopback + PATH sem Git: add/update de Marketplace e instalação de plugin com sucesso;
2. Escolha de URL `sha/commit > ref > HEAD` e resolução de `path` / `git-subdir` do plugin;
3. Fallback de semântica privada retornando `plugin_git_unavailable` quando não há Git;
4. Falha de rede do Archive não 导致 fallback indevido para o Git;
5. Uma falha de refresh de Marketplace com a outra bem-sucedida, preservando o snapshot antigo e o estado de falha;
6. O próximo sucesso limpa a falha;
7. Marketplace público do GitHub que declara `sparsePaths` não emite requisição de Archive e mantém a rota sparse do Git do sistema;
8. Fallback para o Git quando as regras de LFS do `.gitattributes` dos ancestrais forem herdadas pelo subdiretório do plugin;
9. Simulando leitura ativa, saída não submetida e janela de saída submetida, ler ou restaurar state, Marketplace e installed cache conforme a geração de transação da authority;
10. Falha parcial de refresh de Marketplace ainda recarrega as origens bem-sucedidas, enquanto o store retorna false e a página exibe a falha persistida;
11. Store de UI legacy e atual retornam false para error diagnostic;
12. Origem Git com userinfo de URL e cause de Archive aninhada não escrevem usuário/senha no diagnóstico de falha;
13. Falha de cópia/rename injetada na instalação preserva o cache antigo e o installed record;
14. Regressão do SHA-256, dos limites de segurança e da proteção de caminho do ZIP explícito;
15. A discovery de startup ainda carrega o installed cache com PATH sem Git e rede indisponível;
16. Testes focados, `pnpm typecheck`, `pnpm lint` e então um smoke real com GitHub público.

Cases de ciclo de vida correspondentes: `PLM-LC-011 no-git-github-archive`,
`PLM-LC-012 isolated-refresh-atomic-cache`.