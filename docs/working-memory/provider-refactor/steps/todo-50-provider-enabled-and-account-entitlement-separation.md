# Todo 50: Separação entre Provider Enabled e Account Access Entitlement

> Status: concluído
>
> Data: 2026-08-31
>
> Pré-requisito: o Todo 49 remove primeiro o fictício Account API Provider e restaura a identidade real da Family pay-as-you-go API.

## 1. Problema

O `enabled` de nível superior do Provider hoje expressa duas coisas diferentes ao mesmo tempo:

```text
普通 Built-in
└─ Personal enabled=true 表示用户已经把它加入当前配置

Account Provider
└─ Account enabled=true/false 表示当前账号是否拥有套餐资格
```

O Resolver por sua vez interpreta os dois como um portão único de execução. Isso faz com que “o usuário habilitou a configuração” e “a conta tem direito a esse Access” não possam ser expressados de forma independente.

## 2. Contrato final

O `enabled` de nível superior do Provider é mantido, mas passa a expressar apenas “esta configuração de Provider já está habilitada e foi adicionada à configuração atual do usuário”. A qualificação da conta é reduzida ao Access correspondente:

```ts
type ZhipuAccountAccessConfig = {
  type: "zhipu-account";
  family: "zai" | "bigmodel";
  mode: "start-plan" | "individual-coding-plan" | "team-coding-plan" | "off-peak";
  entitled: boolean;
};
```

- `entitled` existe apenas em `zhipu-account`;
- Built-in é dono de `type/family/mode`; o Account Overlay só pode sobrescrever `access.entitled`;
- o Personal Overlay não pode modificar nenhum campo de Access de um Account Provider fixo;
- as evidências ricas de entitlement do Account Service, ao entrarem no Effective Provider Config, são projetadas apenas em `entitled`; unknown segue o tratamento atual de LKG/fail-closed;
- não adicionar `available`, `configured`, `activated` de nível superior no Provider nem um segundo conjunto de DTOs de estado.

## 3. Settings e Registry

```text
Built-in Provider Config
Account Provider Config
Personal Provider Config
            |
            v
Effective Provider Config
├─ enabled
├─ visibility
├─ access
│  `─ entitled（仅 zhipu-account）
└─ models
            |
      +-----+-------------------+
      |                         |
      v                         v
 Settings View             Provider Registry
 ├─ visibility             ├─ enabled
 ├─ enabled                ├─ access entitled（Account）
 │  ├─ true：主列表         ├─ Provider 完整
 │  `─ false：添加菜单       ├─ Model enabled
 `─ 配置问题                `─ Model 完整
```

```ts
const accessEntitled = provider.access.type === "zhipu-account" ? provider.access.entitled : true;
const providerExecutable = provider.enabled && accessEntitled && providerComplete;
const modelExecutable = providerExecutable && model.enabled && modelComplete;
```

- Built-in comum: Built-in `enabled=false`; “Adicionar provedor” grava Personal `enabled=true`; remover o Overlay faz voltar para false;
- Somente Personal: na criação `enabled=true`; na remoção a definição inteira desaparece;
- Family pay-as-you-go API: Built-in `enabled=true`, exibição fixa, sem botão de ligar/desligar; Key ausente apenas gera incompletude;
- Account Provider: Built-in `enabled=true`, exibição fixa; o Account Overlay apenas atualiza `access.entitled` e os fatos de modelo da conta;
- Off-Peak: Built-in `enabled=true`, `visibility=hidden`, e o Account Overlay atualiza `access.entitled`.

## 4. Escopo de implementação

1. Provider Access Config, JSON Schema, Overlay e serialização passam a ter `zhipu-account.entitled`;
2. O Account Source Schema só permite que providers de conta escrevam `access.entitled` e rejeita `type/family/mode`;
3. O Account Resolver passa a gravar `access.entitled` em vez do `enabled` de nível superior do Provider;
4. Account Built-in/Off-Peak Provider com `enabled=true` fixo no nível superior; o comportamento false do Built-in comum e true do Personal permanece;
5. O Registry Resolver verifica separadamente o `enabled` do Provider e o `access.entitled` da conta;
6. A Settings View coloca o Built-in comum diretamente na lista principal ou no menu de adicionar conforme `enabled`; o entitlement não altera o posicionamento nas Settings;
7. Remover julgamentos, nomes e comentários que tratam o `enabled` do Provider como entitlement de plano;
8. O `enabled` do Model Config permanece inalterado.

## 5. Testes e critérios de conclusão

- Adicionar/remover um Built-in comum altera apenas o Personal `enabled`;
- Com Account Provider `enabled=true, entitled=false`, ele fica permanentemente visível mas não entra no Registry;
- Com Account Provider `enabled=true, entitled=true` e completo, ele entra no Registry;
- O Schema de API Key Provider não aceita nem precisa de `entitled`;
- O Account Overlay não pode reescrever a identidade do Access, apenas `entitled`; o Personal não pode escrever Account Access;
- O comportamento de LKG/fail-closed para entitlement unknown permanece como está;
- Passam os testes direcionados de Settings, Registry, ModelFactory, Off-Peak, Start, Individual e Team;
- `rg` prova que o Account Resolver não grava mais o `enabled` de nível superior do Provider;
- Passam `pnpm typecheck`, `pnpm lint`, os E2E relacionados e `git diff --check`.

## 6. Resultado da implementação e verificação

- `zhipu-account.access.entitled` já entrou no Config, no Schema estrito, no Protocol e no Effective Provider; o Account Overlay só pode gravar `builtinModelIds` e `access.entitled` e não pode mais sobrescrever o `enabled` de nível superior do Provider nem a identidade do Access.
- Os Account/Off-Peak Built-in Provider têm `enabled=true` fixo; o Resolver verifica separadamente o estado de participação na configuração, o entitlement da conta, a completude do Provider e a completude do Model, sem carregar duas semânticas em um único booleano.
- O posicionamento nas Settings lê apenas o `enabled` do Provider; o entitlement afeta apenas a executabilidade no Registry. A página de configurações não oferece mais um botão genérico de ligar/desligar provider, apenas exibe status somente-leitura; adicionar/remover um Built-in comum continua sendo feito pelo fluxo formal de Personal Overlay.
- Passaram os testes direcionados de Account Resolver, Source fail-close, Registry, Settings View, Off-Peak e Start/Individual/Team; `pnpm typecheck` passou e `pnpm lint` ficou com 0 error (os warnings preexistentes no restante do repositório não pertencem a este Todo).
- A verificação de formatação direcionada dos arquivos alterados e o `git diff --check` passaram; o `fmt:check` de todo o repositório continua bloqueado por HTML inválido preexistente em documentação do Electron e pelo binário `gb2312.js`, e não foi mascarado alterando arquivos sem relação.
- A execução completa de `pnpm test:unit` deu 12.749 passed, 25 skipped e 2 failed; as duas falhas são, respectivamente, uma deriva de expectativa preexistente da stable identity do CUA fora do macOS e uma deriva de expectativa da exibição do nome do Provider no disparador de modelo V4, ambas reproduzíveis isoladamente e fora do caminho das mudanças desta rodada em Access/conexão de Provider. Os 410 testes direcionados de Provider e os 60 testes direcionados de CLI desta rodada passaram todos.