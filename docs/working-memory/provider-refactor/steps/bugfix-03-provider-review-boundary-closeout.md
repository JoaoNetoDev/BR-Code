# Bugfix 03: fechamento das fronteiras de revisão de Provider

> Status: concluído
>
> Data: 2026-08-27
>
> Origem: revisão item a item do lote mais recente de bugfixes de restauração de inicialização e interação de configurações do Provider Refactor
>
> Tarefa relacionada: [`Todo 23`](./todo-23-provider-refactor-decision-gap-closure.md)

## 0. Posicionamento da tarefa

Esta tarefa corrige quatro problemas de fronteira cujas decisões já foram tomadas na revisão
mais recente de bugfixes e que não exigem redesenhar a arquitetura principal de Provider:

1. Na primeira resolução de Account com falha, o Overlay fail-closed deixa de fora os Providers
   de Off-Peak;
2. O Token de saída máximo tem simultaneamente uma entrada de edição simplificada e uma entrada
   em JSON completo, o que pode sobrescrever silenciosamente o input do usuário;
3. A recuperação do Configured Default corrompido exclui o arquivo fora do lock, existindo uma
   corrida de exclusão entre processos;
4. Quando o Host sincroniza o Account Overlay para o processo ZCode CLI em execução, ele usa o
   Parser genérico de Provider e uma checagem manual em vez do Schema exclusivo da Account Source.

Esta tarefa não altera o Overlay de três camadas, a divisão de responsabilidade entre Host e
processo CLI, nem a arquitetura de sincronização do Account Config:

```text
ZCode Built-in Provider Config
        |
        v
Host Account Resolver
        |
        v
Account Provider Overlay Snapshot @ revision
        |
        | provider/updateAccountConfig
        v
CLI Account Source（本地事实副本）
        |
        v
Personal Provider Config
        |
        v
CLI Effective Provider Registry
```

O Host continua sendo, no modo Desktop hospedado, a autoridade sobre a conexão da conta atual e
sobre os fatos do pacote; o CLI guarda uma cópia revisionada do Account Overlay, usada para
construir seu próprio Effective Registry e Active Model. O protocolo não distribui credenciais de
conta, não sincroniza o Registry completo e não faz o CLI reconsultar e reparsear um conjunto de
fatos upstream da conta.

## 1. O fail-closed de Account cobre Off-Peak

### 1.1 Problema atual

`createFailClosedAccountProviderConfigSnapshot()` hoje publica `enabled=false` apenas para os
Built-in Providers com `access.type = "zhipu-account"`. Os dois Providers de Off-Peak usam:

```ts
access: {
  type: "zhipu-account";
  family: "zai" | "bigmodel";
  mode: "off-peak";
}
```

Eles não têm `enabled=false` explícito no Built-in, e o Resolver interpreta a ausência de
`enabled` como habilitado. Assim, quando a primeira resolução de Account falha, os Providers de
conta comuns são desligados, mas os Providers de Off-Peak ainda podem entrar no Registry e ser
projetados pela Model Selection View específica de Off-Peak segundo o Provider ID fixo.

```text
首次 Account 解析失败
        |
        v
只关闭 zhipu-account
        |
        v
Off-Peak enabled 缺省为 true
        |
        v
进入 Registry / Off-Peak Selection View
```

### 1.2 Comportamento alvo

Quando os fatos iniciais da Account são desconhecidos e não há Last Known Good Snapshot, todos os
Built-in Providers controlados pelo Account Overlay devem ser desligados explicitamente:

```text
Account-controlled Provider =
  access.type === "zhipu-account"
```

O Todo 26 já unificou a identidade estática da conta comum e da Off-Peak em `zhipu-account`,
distinguindo o caminho de produto pelo `mode`.
O Account Resolver normal e o fail-closed reutilizam o mesmo critério de Provider controlado pela
Account, e não podem mais manter uma whitelist legada de Access Type.

### 1.3 Aceitação

- Na primeira falha de resolução de Account, Start, Individual, Team e os dois Providers de
  Off-Peak ficam todos com `enabled=false`;
- API Key comum e Personal Provider ainda podem iniciar;
- A Off-Peak Model Selection View não contém o Provider em fail-closed;
- Após uma atualização bem-sucedida da Account, o Snapshot fail-closed é substituído atomicamente
  pela nova revision;
- Não se modifica o Provider ID fixo de Off-Peak, o provider group, a visibility nem o contrato
  de execução da autenticação em tempo de requisição.

## 2. Entrada única de edição do Token de saída máximo

### 2.1 Remoção da UI duplicada

A página de configurações remove o editor「最大输出 Token Option Spec JSON」e o campo de Draft
correspondente. A configuração oficial subjacente é mantida:

```ts
optionSpecs: {
  maxOutputTokens: {
    type: "limit";
    max: number;
    default: number;
  };
}
```

Não é permitido remover `LimitOptionSpec`, o Provider Schema, o Effective Model Config, a
validação de Model Options ou o uso de `max/default` pelo Runtime. O Option Spec JSON dos níveis
de reasoning e o Reasoning Mapping JSON continuam existindo.

### 2.2 Semântica de input única

O campo「最大输出 Token」da interface expressa o número de tokens de saída que o usuário deseja
usar como padrão, `N`. A base de comparação é o `max` herdado resolvido após excluir o slot
Personal atual de `maxOutputTokens`, registrado como `inheritedLimit`:

```text
N <= inheritedLimit
└─ max     = inheritedLimit
   default = N

N > inheritedLimit
└─ max     = N
   default = N
```

Exemplo:

```text
Inherited: max=32000, default=16000

输入 8000
-> Personal: max=32000, default=8000

输入 64000
-> Personal: max=64000, default=64000

随后重新输入 8000
-> Personal: max=32000, default=8000
```

O terceiro passo precisa restaurar `max` para `inheritedLimit` e não pode usar como base de
comparação o `max` Efetivo já ampliado pelo Personal. Quando o input é igual a `inheritedLimit`,
mantém-se o `max` herdado e define-se `default` como esse valor.

O input do usuário expressa uma intenção Personal explícita; mesmo que `N` coincida exatamente com
o `default` herdado, ele ainda é salvo como slot Personal explícito. Limpar o campo remove o slot
Personal `maxOutputTokens` e volta a herdar;「全部恢复默认」remove de uma vez todo o Personal
Model Config Overlay daquele modelo.

O Model Config completo precisa conseguir resolver `inheritedLimit`; quando ausente, exibe-se um
erro de validação explícito, e nunca se adivinha a partir de modelId, tipo de Provider ou
constante arbitrária.

### 2.3 Aceitação

- Existe apenas uma entrada de edição do Token de saída máximo na página;
- Inputs menores, iguais e maiores que o limit herdado geram o `LimitOptionSpec` completo segundo
  as regras acima;
- Ao ampliar primeiro o limit e depois digitar um valor menor, `max` volta ao limit herdado;
- O valor não sofre drift após salvar, reabrir e fazer round-trip do JSON;
-「全部恢复默认」remove o slot Personal completo;
- Não existe mais uma prioridade em que o JSON sobrescreve silenciosamente o input numérico.

## 3. Recuperação do Configured Default dentro do lock

### 3.1 Contexto

O Configured Default é uma preferência de Model Selection de nível Environment e reconstruível,
e não um Provider Config:

```ts
{
  providerId: string;
  modelId: string;
  options?: ModelSelectionOptions;
}
```

Um arquivo corrompido não pode bloquear a inicialização do Registry, da Model Selection View ou
do processo ZCode CLI em execução; ignorar ou excluir uma preferência comprovadamente corrompida
e depois usar o fallback do Registry é a estratégia correta.

### 3.2 Corrida atual

A implementação atual captura todas as falhas de `withFileLock()` e exclui o arquivo de destino
depois de sair do lock de arquivo:

```text
进程 A                         进程 B
-------                        -------
读取或锁操作失败
离开 withFileLock

                               获得锁
                               写入合法 Configured Default
                               释放锁

rm(filePath)
└─ 删除 B 刚写入的合法偏好
```

Além disso, falha ao obter o lock, erro de permissão, erro temporário de IO e corrupção de
JSON/Schema são mesclados numa única ação de recuperação. As primeiras categorias de erro não
provam que o conteúdo do arquivo está corrompido e não devem disparar exclusão.

### 3.3 Comportamento alvo

```text
withFileLock
    |
    ├─ 成功读取
    |    |
    |    ├─ JSON/Schema 合法 -> 返回 Selection
    |    `─ 确认内容损坏     -> 在同一锁内删除，返回 undefined
    |
    `─ 无法取得锁 / 临时 IO 失败
         `-> 不删除文件；本轮忽略偏好并报告恢复事件
```

O Configured Default é reconstruível e portanto não exige backup de recuperação como o Personal
Config; mas a exclusão precisa satisfazer simultaneamente "conteúdo comprovadamente corrompido" e
"ainda segurando o lock do arquivo". Uma falha do Legacy importer não pode excluir o arquivo
oficial escrito depois por outro processo.

### 3.4 Aceitação

- JSON inválido, Schema inválido ou versão não suportada não bloqueiam a inicialização;
- Quando a corrupção é confirmada, a exclusão acontece somente com o lock retido;
- Falha ao obter o lock, erro de permissão de leitura e erro temporário de IO produzem apenas
  fallback na rodada corrente, sem excluir o arquivo de destino;
- Salvamento concorrente e recuperação de corrupção não podem excluir uma Selection válida
  escrita depois;
- Salvamento e leitura continuam preservando o `ModelSelection.options` estruturado completo.

## 4. Sincronização de Account usa o Schema exclusivo da Source

### 4.1 Limites de responsabilidade

O Host Account Resolver já é responsável por parsear os resultados upstream de login, pacote e
interfaces de equipe em um Account Provider Overlay. A entrada de sincronização do CLI não
reparseia o negócio da conta, faz apenas validação física de Schema e substituição de Snapshot:

```text
Host Account Resolver
└─ 上游账号事实 -> Account ProviderConfigMap
        |
        v
Protocol JSON Envelope
        |
        v
CLI parseAccountProviderConfigMap()
        |
        v
Mutable Account Source.replace(snapshot)
        |
        v
通用 Registry Resolver 执行 Overlay
```

A entrada de sincronização não pode:

- Usar o `parseProviderConfigMap()` genérico e depois escrever à mão a checagem de `access.type`;
- Reimplementar o Account Connection Resolver;
- Montar por conta própria uma Account Config a partir de Provider ID, Family ou Access Type;
- Consultar conta, pacote ou credenciais;
- Aceitar campos como `label`, `api`, `group`, `visibility`, `modelIds`, que não pertencem à
  Account Source.

### 4.2 Implementação alvo

`parseProcessAccountProviderConfigSnapshot()` chama diretamente o `parseAccountProviderConfigMap()`
oficial para `providers`. O Parser genérico de Provider e a checagem manual por travessia
presentes na entrada de sincronização são removidos.

O Schema exclusivo da Account Source continua restringindo mecanicamente os campos permitidos
atualmente:

- `enabled`;
- `builtinModelIds` restringidos pela conta atual;
- Fatos de produto e de protocolo não sensíveis do Account Access.

O Account Overlay de Off-Peak sincroniza apenas `enabled`, portanto trocar para o Schema
exclusivo não afeta o Off-Peak. O `accessId` público já foi removido pelo
Todo 23/26; o Schema da Account Source não aceita nenhuma referência pública a credenciais sob
nome substituto.

### 4.3 Aceitação

- Overlays de Account válidos de Start, Individual e Team podem fazer round-trip entre processos;
- Overlays de Off-Peak no formato `{ enabled: true/false }` podem fazer round-trip entre
  processos;
- A sincronização de Account recusa API Key, Endpoint, Headers, label, group, visibility e
  modelIds pessoais;
- O CLI não reexecuta o Resolver de negócio da conta;
- A mensagem de sincronização não contém JWT, API Key, Team Key, Headers temporários ou chave do
  Credential Store;
- Host e CLI usam a mesma revision do Account Snapshot, e o CLI guarda apenas uma cópia local de
  execução.

## 5. Fronteira com o Todo 23

Este Bugfix pode ser concluído de forma independente, sem esperar o Todo 23:

- fail-closed cobrindo o Off-Peak;
- entrada única de Token de saída máximo e dedução determinística de `max/default`;
- recuperação do Configured Default dentro do lock;
- Schema exclusivo de Account entre processos.

Os problemas abaixo não foram sobrepostos neste Bugfix e já foram concluídos pelo Todo 23:

- remoção do `accessId` público, com as credenciais de conta e a versão da conexão devolvidas ao
  Account Service;
- mutação Host atômica única na edição de Model;
- commit de rename, membership, modelOrder e Personal Rule na mesma transação;
- preservação do diálogo e do Draft quando o salvamento falha;
- Draft de quatro estados separando Personal, Inherited e Effective Preview;
- desvio entre o editor simplificado Built-in e o editor completo Personal-only;
- zeragem final dos fatos de Design, Feature Graph e Todo legados.

## 6. Ordem de implementação e condições de conclusão

A implementação deve ser test-first; ordem sugerida:

1. Escrever testes de falha para o fail-closed de Off-Peak, a recuperação concorrente do Configured
   Default e o Schema da Account Source;
2. Corrigir as três fronteiras de domínio/persistência;
3. Escrever testes de falha para o Token de saída máximo menor, igual, maior, ampliado e depois
   reduzido, e para a restauração do padrão;
4. Remover a UI de JSON duplicada e implementar a dedução a partir do input único;
5. Executar os testes direcionados de Provider, Provider Node, Bootstrap, Services e UI;
6. Executar `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check` e `git diff --check`;
7. Verificar que a página de configurações não sofreu regressão de layout ou interação em
   Desktop/Web/Mobile, nos idiomas chinês e inglês e nos dois temas;
8. Ao concluir, enviar um Conventional Commit e atualizar o status e as evidências de implementação
   deste arquivo.

Só é possível marcar este Bugfix como concluído quando as quatro aceitações forem satisfeitas e
não tiver sido introduzido um segundo conjunto de Account Resolver, Provider Parser, Model Config
DTO ou tratamento de modelo específico por caso no runtime.

## 7. Resultado da implementação

- O item 1, fail-closed de Off-Peak, e o item 4, Schema exclusivo da Account Source, foram
  concluídos por commits anteriores;
- O item 3, Configured Default, foi fechado: na confirmação de corrupção de JSON/Schema/versão a
  exclusão ocorre dentro do mesmo lock de arquivo; falhas de lock, de leitura e do Legacy
  importer fazem apenas fallback na rodada corrente, sem exclusão fora do lock; tanto conteúdo
  inválido quanto falhas de leitura sem relação com o conteúdo têm testes de regressão;
- O item 2 foi concluído junto com o Todo 27: o editor JSON completo de `maxOutputTokens` e o
  campo de Draft correspondente foram removidos, e o único input numérico expressa o valor de
  saída padrão Personal `N`, resolvido deterministicamente em `max=max(inherited.max,N)` e
  `default=N`; limpar o campo volta a herdar; menor, igual, maior e ampliado-depois-reduzido têm
  testes de regressão;
- Os testes direcionados de UI e o `pnpm typecheck` da raiz passaram; as evidências finais de lint,
  formatação e regressão completa são registradas de forma unificada no fechamento do Todo 27.