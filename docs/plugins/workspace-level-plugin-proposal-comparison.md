# Comparação de propostas de Plugin em nível de Workspace

> Status: propostas superadas, decisão final registrada
> Data: 2026-08-17
> Baseline: `origin/staging` at `c707c9576c`

## 1. Final decision

As propostas anteriores A e B colocavam o Workspace assignment fora do diretório do projeto. Essa premissa comum foi sobreposta pela decisão de produto:

```text
不采用：
~/.zcode/cli/plugins/assignments/workspaces/<hash>.json

采用：
<workspace>/.zcode/config.json
```

A proposta final não é um meio-termo entre as duas propostas antigas. Ela toma o arquivo de configuração do projeto como autoridade e, conforme a decisão do usuário, converge para dois níveis User/Workspace e abre a runtime config de Workspace:

```text
Workspace config
  = shared Plugin declaration + options/credentials/secrets

target Host user storage
  = package/cache/user options/credentials/data
```

O contrato completo está em
[Workspace-level Plugin Architecture](./workspace-level-plugin-architecture.md).

## 2. Historical proposals

| Proposal | Historical shape | Useful analysis retained | Rejected core |
| --- | --- | --- | --- |
| 方案 A | Host package store + user/workspace assignment store + effective resolver | o package e a declaração de habilitação do projeto devem ser separados; autoridade no target Host; Session freeze | autoridade de assignment externa, workspace data, APIs/GC de assignment |
| 方案 B | CLI-owned workspace state overlay + shared package/cache | o cold resume recria o App; o antigo `scope=workspace` não tinha workspace key | workspace state externo, ownership overlay, design de sincronização/migração |

As duas propostas continuam fornecendo um diagnóstico válido do código atual:

- o installed record e o package cache são estado de nível de usuário do Host;
- `scope=workspace` hoje não tem capacidade de isolamento de runtime;
- a capacidade de Plugin é congelada na construção do App;
- a autoridade do runtime de Plugin local/remoto está no Agent Host de destino;
- o `/remote` do mobile deve reutilizar o Host compartilhado.

Mas esses fatos não exigem introduzir um assignment store.

## 3. Why the project file is authoritative

| Dimensão | Arquivo de assignment externo | Config do projeto com política ZCode aberta |
| --- | --- | --- |
| Compartilhamento em equipe | cada usuário reconstrói manualmente | rastreável pelo Git |
| Descoberta | o estado fica escondido em arquivos hash no diretório do usuário | declaração explícita dentro do repo |
| checkout/branch | deixa pra trás assignments antigos facilmente | muda junto com o conteúdo do Git |
| override de scope | exige um schema de assignment customizado | reutiliza o scope User/Workspace, consistente com Skill/Command |
| comportamento com pacote ausente | o assignment facilmente se embaralha com o inventory | a declaração é preservada e o package aparece como missing |
| Segurança | evita o repo, mas não pode ser compartilhado | sem Workspace trust/aprovação de Plugin MCP; mantém a validação de schema/path e o mascaramento da saída |
| Complexidade de implementação | nova persistence/API/GC/migration | estende o config loader/merger existente e a escrita de sensitive option |

A cadeia de ativação aberta adotada:

```text
repo declaration
      |
      v
installed package check
      |
      v
runtime activation
```

## 4. Adopted configuration

| Concern | ZCode |
| --- | --- |
| Config de projeto do Workspace | `.zcode/config.json` |
| Local scope | não adotado; não existe arquivo de configuração Local |
| Declaração de habilitação | `plugins.enabledPlugins` |
| Marketplaces adicionais | `plugins.extraKnownMarketplaces` (apenas User/Host; Workspace não suporta Marketplace) |
| Plugin options | `plugins.options` totalmente aberto para User/Workspace, incluindo sensitive values |
| Diretório de Plugins do projeto | `.zcode/plugins` ou `plugins.dirs` do Workspace, sem Workspace trust |
| Plugin MCP | entra diretamente no runtime, assim como Hook/Skill/Command/Agent, sem aprovação separada |
| install/cache de Plugin por usuário | `~/.zcode/cli/plugins` do target Host |

Adota-se o nome de arquivo de config já existente no ZCode, evitando a dupla autoridade entre `.zcode/settings.json` e `.zcode/config.json`;
a política de segurança é aberta conforme a decisão de produto do ZCode.

## 5. Explicitly removed design elements

O seguinte não entra na implementação:

- `assignments/user.json`;
- `assignments/workspaces/<hash>.json`;
- schema de assignment user direct / workspace direct / override;
- revision, CAS, repair e version gate de workspace assignment;
- `plugins/assign`, `plugins/removeAssignment`, `plugins/configureAssignment`;
- package GC por ref-count de assignment;
- dados de Plugin em escopo Workspace;
- migrar legacy installed records para assignment;
- cópia implícita de assignment/package local ao abrir um remote workspace.

## 6. Retained constraints

- package/cache/installed inventory pertencem ao usuário do Agent Host de destino;
- a configuração do Workspace não exige Workspace trust; ao abrir o workspace ela passa a participar diretamente do novo runtime do App;
- quando falta o package, a declaração do projeto não instala automaticamente;
- o Workspace pode injetar Plugin options, credentials e secrets, sobrescrevendo por option key;
- sensitive values podem ser persistidos em texto claro, mas UI/log/diagnostic/provider capture devem aplicar mascaramento;
- o Plugin MCP roda direto, como os demais componentes de Plugin, sem necessidade de aprovação separada;
- na V1, um active version por Plugin ID por Host;
- o App resident não faz hot load; o efeito vale para uma nova Session/cold resume;
- no remote, os arquivos do projeto são lidos a partir do `workspacePath` de destino e a associação de estado usa `workspaceIdentity`;
- cada BrowserWindow tem apenas um Local Host; o remote passa pelo `RemoteConnectionRegistry`;
- o `/remote` do mobile reutiliza o Host compartilhado.

## 7. Implementation consequence

O trabalho principal passa de “criar um subsistema de assignment” para “completar o scope de config de projeto e a semântica de sensitive option”:

```text
Plugin deep merge
        +
Workspace sensitive option persistence
        +
target Host missing-package UX
        +
startup/catalog common resolver
```

O scope User/Workspace, o deep merge de Plugin options e a escrita de sensitive option hoje não são capacidades completas e são pré-requisitos da entrega oficial;
o Local scope não entra na implementação, e o Workspace trust também não entra na implementação de Plugin.