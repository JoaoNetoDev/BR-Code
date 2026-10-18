# Manter plugins instalados ao remover a Marketplace Source

- Status: Accepted
- Data: 2026-07-15

## Context

O Personal Source exerce simultaneamente o papel de "catálogo descobrível" e de "fonte de atualizações futuras", mas os plugins instalados já foram copiados para o armazenamento de plugins em nível de usuário e podem ter configuração, estado de ativação/desativação e dados. Se a remoção da fonte causar implicitamente uma desinstalação em cascata, uma operação que aparenta apenas gerenciar um catálogo se transforma em exclusão destrutiva de dados; se o plugin for totalmente ocultado, uma instalação válida em disco perde seu ponto de entrada de gerenciamento.

## Decision

Remover o Personal Source apaga apenas o registro do marketplace e a projeção do catálogo; não remove instalações, configurações, estado de ativação/desativação, caches nem dados de plugins. As instalações que continuam existentes entram no estado `Orphaned Installed Plugin`:

```text
source present + installed
           |
           | remove source
           v
orphaned installed -------------------+
  | use/configure/enable/disable       |
  | uninstall                          | re-add same source
  | update unavailable                 |
  +------------------------------------+
                      source-associated installed
```

Plugins órfãos continuam aparecendo no Installed Strip, nos detalhes e na Manage Installed View. A UI deve mostrar honestamente a ausência da fonte e não deve executar atualizações antes de a fonte ser adicionada novamente. Readicionar o mesmo marketplace id/source reassoci a instalação atual, restaurando a listagem e a capacidade de atualização; não se pode reescrever automaticamente a configuração ou o estado enabled do usuário.

## Consequences

- A remoção da fonte se torna uma operação reversível de gerenciamento de catálogo, sem perda implícita de dados.
- O estado de instalação e o estado da fonte devem ser modelados de forma independente; a UI não pode deduzir "não instalado" a partir de "inexistente no catálogo".
- A detecção de atualizações exige a existência da fonte; no estado órfão só é possível usar a versão instalada atual.
- O usuário ainda pode desinstalar explicitamente plugins órfãos pela página de gerenciamento, limpando os dados conforme as regras normais de desinstalação.
- O Lifecycle E2E deve cobrir os caminhos de remoção da fonte, estado órfão, uso contínuo, reassociação e desinstalação explícita.