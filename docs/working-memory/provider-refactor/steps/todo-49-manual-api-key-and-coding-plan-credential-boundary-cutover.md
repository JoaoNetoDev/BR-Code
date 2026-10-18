# Todo 49: troca da fronteira de credenciais entre API de pagamento por uso e Coding Plan digitados manualmente

> Estado: concluído
>
> Data: 2026-08-31
>
> Evidência prévia: [`todo-48-account-api-and-manual-api-key-boundary-cleanup.md`](./todo-48-account-api-and-manual-api-key-boundary-cleanup.md)

## 1. Objetivo

Reverter o “Account API Provider” introduzido no refactor de Provider sem base de produto em staging, restaurando a semântica de produto que já existia em staging:

```text
API de pagamento por uso da Family
└─ zai-api / bigmodel-api
   ├─ access.type = api-key
   ├─ group = zai-family / bigmodel-family
   ├─ Built-in enabled = true (fixo na configuração da Family)
   ├─ usuário digita a API Key manualmente
   ├─ Built-in fornece Endpoint / API Schema / models
   └─ Personal guarda a Key e os Overlays permitidos

Account Provider
├─ Start Plan
├─ Individual Coding Plan
├─ Team Coding Plan
└─ Off-Peak
```

A capacidade do Coding Plan de obter automaticamente a Key do projeto para executar requisições ao modelo continua existindo, mas pertence apenas à autenticação interna de requisições do Coding Plan e não pode mais ser interpretada como “API de conta com pagamento por uso”.

## 2. Cadeia única de credenciais

### 2.1 API de pagamento por uso

```text
Key digitada pelo usuário
      |
      v
Personal Provider Config
      |
      v
Effective access.type = api-key
      |
      v
ModelFactory / Adapter usa diretamente essa Key
```

- A identidade de Provider é fixada em `zai-api` / `bigmodel-api`;
- Ambas ocupam respectivamente o slot de “API de pagamento por uso” de `zai-family` / `bigmodel-family` e não entram como candidatas do fluxo comum “adicionar provedor”;
- Built-in `enabled=true`, sem botão de ativação/desativação de Provider para o usuário; a ausência de Key significa apenas configuração incompleta e não executável;
- Nenhum Provider customizado é criado dinamicamente;
- Endpoint, Schema ou membros de modelo do Built-in não são copiados para o Personal Config;
- A seleção de conexão da Family pode continuar usando `kind: "api-key"`, mas precisa referenciar o Provider de API comum acima;
- Não entra nas cadeias de Account Overlay, Account Request Auth ou Coding Plan entitlement.

### 2.2 Coding Plan

```text
conta atualmente autenticada
      |
      +--> Individual Coding Plan
      |       `--> procura ou cria a Key de projeto com base na organization/project pessoal
      |
      +--> Team Coding Plan
      |       `--> obtém a Key de projeto da equipe com base na organization/project escolhida
      |
      +--> Start Plan
      |       `--> usa o JWT do Start Plan
      |
      `--> Off-Peak
              `--> usa o material de requisição da conexão Coding Plan compatível atual
```

- O usuário não preenche a Key de projeto do Coding Plan;
- A Key obtida automaticamente não entra no Personal Provider Config;
- O Individual continua descobrindo a organization/project pessoal a partir da conta atual e então procura ou cria a Key de projeto pessoal;
- O Team continua usando o `organizationId/projectId` já escolhido e validado para obter a Key de projeto da equipe;
- Os dois caminhos podem compartilhar a API subjacente de Key de projeto, mas não podem compartilhar descoberta de identidade, chave de cache ou Owner da credencial;
- Os Resolvers são nomeados pela responsabilidade real, evitando que `AccountProviderApiKeyResolver` volte a ser usado por engano em um Provider `api-key` comum;
- Não é criado nenhum objeto de política nem uma nova abstração genérica de Access; basta usar o dispatch de Mode `zhipu-account` já existente.

## 3. Mudanças em Config e Registry

1. Remover do Built-in Config da ZCode:
   - `account:zai-api-key`;
   - `account:bigmodel-api-key`.
2. Remover `api-key` de `ZhipuAccountMode`; `zhipu-account` passa a guardar apenas os Modes de produto de conta reais.
3. Manter `zai-api` / `bigmodel-api`, mudando seus groups de `standard-builtin` para `zai-family` / `bigmodel-family`,
   e fazendo deles o único Provider de API de pagamento por uso de cada Family.
4. Os dois Providers de API de pagamento por uso das Families têm `enabled=true` fixo no Built-in. O Built-in continua possuindo Endpoint fixo, API Schema,
   membros de modelo e ordem padrão; o Personal guarda apenas a Key e os overrides esparsos permitidos, não guarda a ordenação de Provider da Family nem expressa Key ausente com `enabled=false`.
5. A seleção `kind=api-key` da Family resolve para o Provider de API comum; o Account Resolver não enumera mais API Key Mode nem o projeta.
6. No Registry, a mesma Family não pode mais apresentar dois Providers de pagamento por uso duplicados, com Endpoint, Schema e models idênticos e apenas tipo de Access diferente.
7. O Personal Source continua proibindo que um Provider `zhipu-account` real sobrescreva `access`; um Provider `api-key` comum pode normalmente guardar a Key.

### 3.1 Semântica unificada de Settings e Registry

As três categorias de Provider não estabelecem três “UIs de ativação” distintas. O `enabled` do Provider expressa apenas se ele entra na configuração atual; a elegibilidade de pacote da conta é expressa por `access.entitled`. Depois de entrarem na mesma Effective Provider Config, Settings e Registry a consomem em par:

```text
Effective Provider Config
├─ enabled
├─ visibility
└─ access.entitled（apenas zhipu-account）
        |
        +--> Settings：enabled decide se um Built-in comum fica na lista principal ou no menu de adição
        |
        `--> Registry：enabled + access entitlement + complete + model enabled
```

- Um Built-in comum com `enabled=false` no Built-in recebe `enabled=true` explicitamente via Personal Overlay no momento da adição; a API de pagamento por uso das Families e o Account Provider têm `enabled=true` no Built-in e pertencem fixamente à Family;
- A ausência de API Key ou de outro material de configuração não reescreve `enabled`;
- O Account Overlay não reescreve mais o `enabled` de topo do Provider, apenas atualiza `access.entitled`;
- A página de settings do Provider não oferece um botão genérico de ativar/desativar manualmente. Depois que o usuário completa o material de acesso correspondente, o mesmo Resolver coloca o Provider no Registry de forma natural.

## 4. Mudanças em Services e Runtime

1. O Account Provider Connection Resolver remove a disponibilidade de `mode=api-key`, a verificação de identidade de conta e o ramo de carregamento dinâmico de Key.
2. O Account Request Auth remove o ramo `planKind=api-key` e passa a tratar apenas o material dinâmico necessário para Start, Individual, Team e Off-Peak.
3. Estreitar o Resolver de API Key hoje amplo para a responsabilidade de Coding Plan:
   - Individual usa a Key de projeto pessoal;
   - Team continua usando a Key do projeto de equipe escolhido;
   - A API de pagamento por uso comum nunca o chama.
4. A Key digitada manualmente e salva pelo Welcome e pelos Provider Settings só entra no Personal Overlay de `zai-api` / `bigmodel-api`.
5. Remover o helper antigo que reativa um Account Provider a partir de uma Key digitada, os ramos de salvamento correspondentes e os testes contrários.
6. Não alterar a semântica de segurança das requisições da versão oficial, do Start JWT, do escopo de Team, da execução de Off-Peak ou da autorização final do servidor.
   Antes e depois de remover `zhipu-account/mode=api-key`, o comportamento V4 das requisições reais de `zai-api` / `bigmodel-api` precisa permanecer equivalente; não é permitido remover silenciosamente assinaturas existentes por causa da remoção de uma identidade de Provider errada, nem espalhar o V4 para outros Providers `api-key` comuns. Na implementação, primeiro fixar essa fronteira com o comportamento atual do Adapter e os testes de requisição, e só então migrar a admissão estática para a identidade correta de API de pagamento por uso da Family.

## 5. Mudanças na UI

A página de settings de Provider lê apenas o `access.type` da Effective Provider Config para decidir a interface de configuração de acesso:

```text
access.type = api-key
└─ mostra a entrada de API Key, a entrada de gerenciamento e a configuração de modelos do Provider comum

access.type = zhipu-account
└─ mostra a conexão da conta, o pacote, a cota e o estado de produto correspondente
```

- Não criar parâmetros booleanos de página duplicando a expressão de Access, como `hideApiKeySection` ou `readOnlyEndpoints`;
- O texto de usuário para `kind=api-key` no menu da Family é unificado como “API de pagamento por uso”;
- Após escolher “API de pagamento por uso”, mostrar a interface de Key digitada manualmente;
- `zai-api` / `bigmodel-api` não aparecem no menu “adicionar provedor”;
- As páginas de conta Individual/Team continuam ocultando Endpoint, API Schema e credenciais da conta, mas a lista de modelos e a configuração de modelos continuam editáveis;
- A entrada de API Key do Welcome e a página de settings usam a mesma identidade de Provider e a mesma primitiva de salvamento.

O direito de edição do Model Config não é determinado pela Personal Model Config Rule. A Rule é apenas o resultado de persistência esparsa depois de uma modificação do usuário: todos os modelos Built-in/Personal editáveis nas páginas de settings são salvos pelo mesmo Personal Rule como override; já a possibilidade de renomear ou remover um membro de modelo é determinada pela origem do membro, e um Builtin Model ID é somente leitura e não pode ser removido.

## 6. Escopo de limpeza

- Constantes, Fixtures, casos especiais de migração e testes de `account:zai-api-key` / `account:bigmodel-api-key`;
- Schema, Protocol, Resolver, Runtime e descrições de design de `zhipu-account / mode=api-key`;
- Persistência de Key digitada manualmente do Account Provider;
- `restoreFamilyApiKeyProviderForApiKeyMode` e seus chamadores;
- Condições na UI que adivinham a exibição da Key por Family/Provider ID;
- Nomes de classe, comentários e logs que chamam a Key de projeto do Coding Plan de Account API Key;
- Conclusões erradas no Todo 26, no Provider Settings Design, no Access Protocol Design e no Feature Graph.

## 7. Plano de testes

### Config / Provider

- O Built-in contém apenas os dois Providers de pagamento por uso de Family, `zai-api` / `bigmodel-api`;
- Ambos usam o group da Family correspondente, `enabled=true` no Built-in e não entram em `addableProviders`;
- `ZhipuAccountMode` rejeita `api-key`;
- Personal Key Overlay de Provider de API comum, round-trip de JSON e validação de completude;
- `access` de Personal da conta continua sendo rejeitado quando extrapola a permissão;
- Não existe Provider de pagamento por uso duplicado na mesma Family.

### Services / Runtime

- `kind=api-key` da Family seleciona com precisão o Provider de API comum;
- A Key digitada manualmente vai direto ao Active Model, sem chamar o Account Request Auth;
- O Individual Coding Plan obtém automaticamente a Key de projeto pessoal;
- O Team Coding Plan usa a Key do projeto de equipe escolhido;
- O Start usa JWT; o Off-Peak usa o material do pacote compatível atual;
- Não estar autenticado não afeta um Provider de pagamento por uso já configurado; e uma Key digitada manualmente também não pode forjar um estado de disponibilidade do Coding Plan.

### UI / E2E

- Após digitar a Key da Z.ai/BigModel no Welcome, entra no Built-in API Provider correspondente;
- A “API de pagamento por uso” da Family mostra a Key digitada manualmente e, depois de salva, o modelo fica selecionável e consegue enviar requisições;
- Com a Key vazia o Provider continua visível e habilitado, mas não entra no Registry; limpar a Key não desativa o Provider automaticamente;
- Individual/Team/Start não exibem a Key digitada manualmente;
- Trocar de Family não copia Key, não duplica Provider e não polui o Account Selection;
- Candidatos de modelo e identidade de seleção são consistentes entre Desktop, Web e controle remoto do celular.

### Verificação mecânica

- `rg` / `dep:refs` provam resíduo zero dos IDs de Provider removidos, do Mode antigo e do helper antigo;
- Testes unitários dos Providers, Services e UI afetados;
- E2E de desktop afetados;
- `pnpm typecheck`;
- `pnpm lint`;
- Verificação de formatação e `git diff --check`.

## 8. Critérios de conclusão

- A API de pagamento por uso da Family e o acesso a pacotes de conta não compartilham mais uma semântica de Access errada;
- Key digitada manualmente, Key de projeto do Coding Plan, Key de projeto de Team e Start JWT têm cada um um Owner único e uma cadeia de requisição única;
- Não existe a ilusão de um Account API Provider em Config, Registry, Runtime, UI e documentação;
- `zai-api` / `bigmodel-api` ficam fixamente pertencendo à Family e não entram no fluxo comum de adicionar provedor;
- Nenhum segundo conjunto de DTO de Access, matriz de permissões de página ou central de credenciais foi criado para corrigir isso;
- Após a conclusão de testes, review e limpeza mecânica, submeter um Conventional Commit.

## 9. Resultado da implementação e verificação

- `account:zai-api-key`, `account:bigmodel-api-key` e `zhipu-account / mode=api-key` foram removidos do Built-in, do Schema,
  do Protocol, do Resolver, da UI, dos Fixtures e das regras de modelo.
- `zai-api` e `bigmodel-api` passaram a ser a única configuração de “API de pagamento por uso” das duas Families; ambos aparecem
  de forma fixa na entrada de settings da Family, usam `access.type=api-key` e Personal API Key, e não entram mais no catálogo comum “adicionar provedor”.
- Account Start, Individual, Team e Off-Peak usam somente material de acesso de conta; as páginas de Account ocultam Endpoint, API Schema e
  Key digitada manualmente conforme o Effective `access.type=zhipu-account`, e a configuração de modelos segue usando a Personal Model Rule unificada.
- A API Key do Welcome e a página de settings compartilham a identidade real do Family API Provider; a obtenção automática da Key de
  projeto do Coding Plan continua pertencendo apenas à cadeia de credenciais da fase de requisição do Coding Plan.
- Integridade do Built-in, Access Schema, Runtime de conta/Key manual e os testes direcionados de login e da página de settings passaram; a varredura mecânica confirma resíduo zero de IDs de Provider fictícios, do Mode antigo e do helper de restauração no código de produção.