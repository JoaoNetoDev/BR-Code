# Plano de implementação das configurações de controle de computador no Windows

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** fazer com que a página de configurações do desktop Windows exiba a seção "Controle de computador" e
ofereça apenas o interruptor geral do plugin oficial `zcode-cua`, compartilhado com o macOS.

**Arquitetura:** a configuração da página de Settings passa a ser gerada a partir de props explícitos `isMacDesktop` /
`isWindowsDesktop`, evitando que o lado Web exponha capacidades de desktop por dependência de user agent.
`ComputerUseSection` mantém o fluxo compartilhado de interruptor do plugin, mas separa a capacidade de "ligar" local
no Windows das capacidades de permissão, Helper e configurações adicionais que são exclusivas do macOS.

**Stack técnico:** React 19, TypeScript, Zustand, Vitest, Testing Library, Tailwind CSS

## Restrições globais

- Windows e macOS precisam reutilizar `ZCODE_CUA_OFFICIAL_PLUGIN_ID`, o store de plugins e o fluxo `setEnabled`.
- Windows mostra apenas o interruptor geral; não mostra picture-in-picture, modo em segundo plano, estado do Helper
  nem conteúdo de autorização.
- As configurações completas existentes do macOS e a lógica de capacidade de permissões permanecem inalteradas.
- Linux, Web comum, controle remoto por celular e workspace remoto não liberam essa capacidade de configuração local.
- A UI continua reaproveitando `SettingsGroupCard`, `SettingsRow`, `Switch` e os textos de internacionalização já
  existentes.
- Nenhum protocolo, campo de configuração, runtime, local host ou estado de controle remoto novo é adicionado.
- Antes de qualquer código de implementação, escrever os testes e confirmar que eles falham como esperado.
- Antes de concluir, é obrigatório executar `pnpm typecheck` e `pnpm lint`.

---

## Estrutura de arquivos

- Modify: `packages/ui/src/settings/settingsPageConfig.ts` — gerar as seções visíveis por plataforma de desktop e
  resolver o destino de navegação visível por plataforma.
- Modify: `packages/ui/src/settingsPageHelpers.tsx` — reexportar para a página de Settings as funções de configuração
  de plataforma.
- Modify: `packages/ui/src/SettingsPage.tsx` — usar a configuração de plataforma, proteger o destino inicial e a
  intenção de navegação, e passar o flag de Windows para a seção de controle de computador.
- Modify: `packages/ui/test/settingsPageConfig.test.ts` — cobrir as seções de macOS, Windows e não-desktop e o
  fallback de destino invisível.
- Modify: `packages/ui/test/settingsPageIntegratedTerminalShell.test.ts` — fazer o mock existente do SettingsPage
  fornecer a nova interface de funções de configuração.
- Modify: `packages/ui/src/settings/ComputerUseSection.tsx` — o Windows reutiliza o interruptor geral e o macOS fica
  exclusivo com as configurações adicionais e os efeitos colaterais de permissão.
- Create: `packages/ui/test/computerUseWindowsSettings.test.ts` — validação em nível de render de que o Windows tem
  apenas o interruptor geral e chama o fluxo compartilhado de liga/desliga do plugin.

---

### Task 1: configuração de seções de Settings ciente de plataforma

**Arquivos:**

- Modify: `packages/ui/test/settingsPageConfig.test.ts`
- Modify: `packages/ui/src/settings/settingsPageConfig.ts`

**Interfaces:**

- Produces: `createSettingsPageConfig(options: { isMacDesktop?: boolean; isWindowsDesktop?: boolean })`
- Produces: `resolveSettingsSectionForPlatform(section, visibleSections, fallbackSection?)`
- Returns: `{ settingsSections, settingsSectionGroups }`

- [ ] **Step 1: escrever os testes que falham para configuração de plataforma e fallback de destino**

Em `packages/ui/test/settingsPageConfig.test.ts`, passar a ler a configuração pela fábrica e adicionar as
asserções:

```ts
it.each([
  ["macOS", { isMacDesktop: true }, true],
  ["Windows", { isWindowsDesktop: true }, true],
  ["Web/Linux", {}, false],
] as const)("%s 的电脑控制入口符合桌面平台边界", async (_name, options, expected) => {
  const { createSettingsPageConfig } = await loadSettingsPageConfig("test");
  const { settingsSections } = createSettingsPageConfig(options);

  expect(settingsSections.some((section) => section.id === "computerUse")).toBe(expected);
});

it("不可见的电脑控制落点回退到 general", async () => {
  const { createSettingsPageConfig, resolveSettingsSectionForPlatform } =
    await loadSettingsPageConfig("test");
  const { settingsSections } = createSettingsPageConfig({});

  expect(resolveSettingsSectionForPlatform("computerUse", settingsSections, "general")).toBe(
    "general",
  );
});
```

Mudar também o teste de ordem existente para chamar `createSettingsPageConfig({})`, mantendo a ordem esperada do lado
não-desktop sem `computerUse`.

- [ ] **Step 2: rodar o teste e confirmar o vermelho**

Run:

```powershell
pnpm exec vitest run packages/ui/test/settingsPageConfig.test.ts
```

Expected: FAIL, avisando que `createSettingsPageConfig` ou `resolveSettingsSectionForPlatform` ainda não foram
exportados.

- [ ] **Step 3: implementar a fábrica mínima de configuração de plataforma**

Em `packages/ui/src/settings/settingsPageConfig.ts`, remover a dependência de `IS_MACOS_DESKTOP` e implementar:

```ts
export interface SettingsPageConfigOptions {
  isMacDesktop?: boolean;
  isWindowsDesktop?: boolean;
}

export function createSettingsPageConfig({
  isMacDesktop = false,
  isWindowsDesktop = false,
}: SettingsPageConfigOptions = {}) {
  const showComputerUse = isMacDesktop || isWindowsDesktop;
  const settingsSections = BASE_SETTINGS_SECTIONS.filter((section) => {
    if (section.id === "computerUse" && !showComputerUse) return false;
    return isSettingsSectionEnabled(section.id);
  });
  const settingsSectionGroups = BASE_SETTINGS_SECTION_GROUPS.map((group) => ({
    ...group,
    sections: settingsSections.filter((section) => section.groupId === group.id),
  })).filter((group) => group.sections.length > 0);

  return { settingsSectionGroups, settingsSections };
}

export function resolveSettingsSectionForPlatform(
  section: SettingsSectionId,
  visibleSections: ReadonlyArray<Pick<SettingsSectionDefinition, "id">>,
  fallbackSection: SettingsSectionId = "general",
): SettingsSectionId {
  if (visibleSections.some((candidate) => candidate.id === section)) return section;
  if (visibleSections.some((candidate) => candidate.id === fallbackSection)) {
    return fallbackSection;
  }
  return visibleSections[0]?.id ?? "general";
}
```

- [ ] **Step 4: rodar o teste de configuração e confirmar o verde**

Run:

```powershell
pnpm exec vitest run packages/ui/test/settingsPageConfig.test.ts
```

Expected: PASS, com todas as asserções de ordem das configurações, entrada de plataforma e fallback de destino
passando.

---

### Task 2: SettingsPage usa a configuração de plataforma e roteia com segurança

**Arquivos:**

- Modify: `packages/ui/src/settingsPageHelpers.tsx`
- Modify: `packages/ui/src/SettingsPage.tsx`
- Modify: `packages/ui/test/settingsPageIntegratedTerminalShell.test.ts`
- Test: `packages/ui/test/settingsPageConfig.test.ts`

**Interfaces:**

- Consumes: `createSettingsPageConfig` e `resolveSettingsSectionForPlatform` da Task 1
- Produces: um único `settingsSections` / `settingsSectionGroups` da plataforma atual no SettingsPage
- Produces: `ComputerUseSection.isWindowsDesktop`

- [ ] **Step 1: estender o mock existente do SettingsPage, expondo primeiro a lacuna da nova interface**

Mudar o mock `settingsPageHelpers.js` em
`packages/ui/test/settingsPageIntegratedTerminalShell.test.ts` para devolver uma fábrica de configuração fixa:

```ts
const settingsSections = [
  {
    id: "general",
    titleId: "settings.general",
    navLabelId: "settings.general",
    icon: () => null,
  },
];
const settingsSectionGroups = [
  {
    id: "basics",
    titleId: "settings.general",
    sections: settingsSections,
  },
];

vi.mock("../src/settingsPageHelpers.js", () => ({
  createSettingsPageConfig: () => ({ settingsSectionGroups, settingsSections }),
  resolveSettingsSectionForPlatform: (section: string) => section,
  GeneralSectionContent: (props: Record<string, unknown>) => {
    generalSectionCapture.props = props;
    return createElement("div", null, "general");
  },
  GeneralSectionHeader: () => null,
}));
```

Rodar o teste enquanto o `settingsPageHelpers.tsx` real ainda não reexporta a nova interface, confirmando que o
ambiente de teste expõe claramente a incompatibilidade de exportação antes da troca de interface no SettingsPage.

- [ ] **Step 2: reexportar as funções de configuração de plataforma na camada de helper**

Em `packages/ui/src/settingsPageHelpers.tsx`, mudar para:

```ts
import {
  createSettingsPageConfig,
  resolveSettingsSectionForPlatform,
  type SettingsSectionId,
} from "@/settings/settingsPageConfig.js";

export type { SettingsSectionId };
export { createSettingsPageConfig, resolveSettingsSectionForPlatform };
```

- [ ] **Step 3: SettingsPage gera a configuração da plataforma atual e protege o destino inicial**

No início do componente em `packages/ui/src/SettingsPage.tsx`, gerar a configuração:

```ts
const { settingsSectionGroups, settingsSections } = useMemo(
  () =>
    createSettingsPageConfig({
      isMacDesktop: Boolean(isMacDesktop),
      isWindowsDesktop: Boolean(isWindowsDesktop),
    }),
  [isMacDesktop, isWindowsDesktop],
);
```

Ao inicializar `activeSection`, resolver pela visibilidade de plataforma:

```ts
const [activeSection, setActiveSection] = useState<SettingsSectionId>(() => {
  const initialSection = resolveSettingsSectionForPlatform(
    consumeInitialSettingsSection("general"),
    settingsSections,
    "general",
  );
  writeLastSettingsSectionPreference(initialSection);
  return initialSection;
});
```

Atualizar o callback de navegação para garantir que a intenção em runtime também não salte para uma página invisível:

```ts
const setActiveSettingsSection = useCallback(
  (section: SettingsSectionId, fallbackSection: SettingsSectionId = activeSection) => {
    const globallyResolved = resolveSettingsSection(section, fallbackSection);
    const resolvedSection = resolveSettingsSectionForPlatform(
      globallyResolved,
      settingsSections,
      fallbackSection,
    );
    setActiveSection(resolvedSection);
    writeLastSettingsSectionPreference(resolvedSection);
  },
  [activeSection, settingsSections],
);
```

Mudar a barra lateral e o active meta para usar respectivamente `settingsSectionGroups` e `settingsSections`, e
passar aos componentes:

```tsx
<ComputerUseSection
  isWindowsDesktop={Boolean(isWindowsDesktop)}
  workspacePath={activeWorkspacePath}
  workspaceIdentity={activeWorkspaceIdentity}
  remoteSessionId={activeWorkspaceTab?.remoteSessionId}
  remoteTarget={activeWorkspaceTab?.remoteTarget}
  localWorkspacePath={activeWorkspaceTab?.localWorkspacePath}
/>
```

- [ ] **Step 4: rodar os testes relacionados ao SettingsPage**

Run:

```powershell
pnpm exec vitest run packages/ui/test/settingsPageConfig.test.ts packages/ui/test/settingsPageIntegratedTerminalShell.test.ts
```

Expected: PASS; passam a ordem da configuração de plataforma, o fallback de destino invisível e o teste existente de
configuração de terminal do Windows.

---

### Task 3: Windows renderiza apenas o interruptor geral compartilhado

**Arquivos:**

- Create: `packages/ui/test/computerUseWindowsSettings.test.ts`
- Modify: `packages/ui/src/settings/ComputerUseSection.tsx`

**Interfaces:**

- Consumes: `ComputerUseSectionProps.isWindowsDesktop?: boolean`
- Consumes: `ZCODE_CUA_OFFICIAL_PLUGIN_ID`
- Preserves: `usePluginManagementStore.setEnabled(pluginId, next, pluginManagementService)`

- [ ] **Step 1: escrever os testes que falham de renderização e de comportamento do interruptor no Windows**

Criar `packages/ui/test/computerUseWindowsSettings.test.ts`, fazendo mock de plataforma, serviços, hook de permissões,
hook de configurações, internacionalização e store de plugins. Os casos centrais são:

```tsx
it("Windows 只展示共享总开关", () => {
  render(
    <ComputerUseSection
      isWindowsDesktop
      workspacePath="C:\\workspace"
      workspaceIdentity="local-workspace"
    />,
  );

  expect(screen.getByText("settings.computerUse.toggleLabel")).toBeTruthy();
  expect(screen.queryByText("settings.computerUse.pipModeLabel")).toBeNull();
  expect(screen.queryByText("settings.computerUse.backgroundModeLabel")).toBeNull();
  expect(screen.queryByText("settings.computerUse.helperLabel")).toBeNull();
  expect(screen.queryByText("cuaPermission.perm.accessibility")).toBeNull();
  expect(screen.queryByText("cuaPermission.perm.screenRecording")).toBeNull();
});

it("Windows 总开关复用官方 zcode-cua 启停流程", async () => {
  render(
    <ComputerUseSection
      isWindowsDesktop
      workspacePath="C:\\workspace"
      workspaceIdentity="local-workspace"
    />,
  );

  fireEvent.click(screen.getByRole("switch", { name: "settings.computerUse.toggleLabel" }));

  await waitFor(() => {
    expect(setEnabled).toHaveBeenCalledWith(
      ZCODE_CUA_OFFICIAL_PLUGIN_ID,
      false,
      pluginManagementService,
    );
  });
});
```

Adicionar também um caso de regressão de macOS, confirmando que, com o plugin habilitado, o PiP, o modo em segundo
plano e as duas linhas de permissão continuam sendo renderizados.

- [ ] **Step 2: rodar o novo teste e confirmar o vermelho**

Run:

```powershell
pnpm exec vitest run packages/ui/test/computerUseWindowsSettings.test.ts
```

Expected: FAIL; o componente atual não tem a capacidade `isWindowsDesktop` e fica totalmente oculto pelo gate
exclusivo de macOS.

- [ ] **Step 3: separar as capacidades de plataforma local e renderizar a UI mínima do Windows**

Adicionar em `ComputerUseSectionProps`:

```ts
isWindowsDesktop?: boolean;
```

Separar a fronteira de plataforma no componente:

```ts
const isLocalWorkspace =
  !remoteSessionId &&
  !remoteTarget &&
  !(workspaceIdentity?.trim() && isRemoteWorkspaceIdentity(workspaceIdentity.trim()));
const supportsLocalMacWorkspace =
  !isWindowsDesktop && supportsLocalMacCuaPermissionOnboarding(platform) && isLocalWorkspace;
const supportsLocalWindowsWorkspace = Boolean(isWindowsDesktop) && isLocalWorkspace;
const supportsComputerUseSettings = supportsLocalMacWorkspace || supportsLocalWindowsWorkspace;
const path = supportsLocalMacWorkspace ? (localWorkspacePath ?? workspacePath) : null;
```

O effect de inicialização do plugin passa a usar `supportsComputerUseSettings`, e o gate de retorno do componente usa
a mesma variável. Dar ao interruptor geral o texto já existente como nome acessível:

```tsx
<Switch
  aria-label={intl.formatMessage({ id: "settings.computerUse.toggleLabel" })}
  checked={cuaEnabled}
  disabled={cuaToggling || !workspacePath}
  onCheckedChange={(checked) => void onTogglePlugin(checked)}
/>
```

O conteúdo adicional do macOS é renderizado apenas sob as seguintes condições:

```tsx
{
  cuaEnabled && supportsLocalMacWorkspace ? (
    <>{/* 保留现有 PiP、后台模式、Helper 和权限内容 */}</>
  ) : null;
}
```

Após a troca de plugin bem-sucedida, atualizar o estado de exibição de permissões e do Helper apenas quando
`supportsLocalMacWorkspace`; o Windows depende somente do store de plugins compartilhado para confirmar o novo estado.

- [ ] **Step 4: rodar o novo teste e confirmar o verde**

Run:

```powershell
pnpm exec vitest run packages/ui/test/computerUseWindowsSettings.test.ts
```

Expected: PASS; o Windows tem apenas o interruptor geral, a chamada compartilhada de liga/desliga está correta e as
configurações adicionais do macOS continuam presentes.

---

### Task 4: regressão, revisão e commit

**Arquivos:**

- Verify: `docs/superpowers/specs/2026-08-06-windows-computer-use-settings-design.md`
- Verify: todos os arquivos de código e de teste das Tasks 1–3

**Interfaces:**

- Consumes: o resultado de todas as tarefas anteriores
- Produces: um Conventional Commit que passa nos gates do repositório

- [ ] **Step 1: rodar os testes de regressão focados**

Run:

```powershell
pnpm exec vitest run packages/ui/test/settingsPageConfig.test.ts packages/ui/test/settingsPageIntegratedTerminalShell.test.ts packages/ui/test/computerUseWindowsSettings.test.ts packages/ui/test/computerUseNoAutoPermissionModal.test.ts
```

Expected: PASS, com zero falhas nos quatro arquivos de teste.

- [ ] **Step 2: rodar os testes afetados**

Run:

```powershell
pnpm test:unit:affected
```

Expected: PASS; se forem encontradas falhas preexistentes do branch e sem relação com esta mudança, registrar o nome
do teste e a evidência, e nunca ignorar falhas relacionadas a esta mudança.

- [ ] **Step 3: executar as verificações obrigatórias de tipo e estáticas**

Run:

```powershell
pnpm typecheck
pnpm lint
```

Expected: os dois comandos terminam com exit code 0.

- [ ] **Step 4: conferir o diff, a fronteira de plataforma e a consistência da documentação**

Run:

```powershell
git diff --check
git diff --stat
git status --short
```

Confirmar item a item: o Windows tem apenas o interruptor geral compartilhado; as configurações adicionais do macOS
foram preservadas; o lado não-desktop não exibe a entrada; o workspace remoto continua sendo recusado; e nenhum
protocolo, runtime ou estado de controle remoto foi modificado.

- [ ] **Step 5: solicitar revisão de código e corrigir problemas Critical/Important**

O escopo da revisão vai do baseline depois do commit do spec de design até a árvore de trabalho atual, com foco em
verificar se a configuração de plataforma poderia expor a entrada indevidamente na Web, se o Windows dispara efeitos
colaterais de permissão do macOS e se o liga/desliga do plugin continua usando o plugin id oficial.

- [ ] **Step 6: commitar a implementação**

```powershell
git add -- packages/ui/src/settings/settingsPageConfig.ts packages/ui/src/settingsPageHelpers.tsx packages/ui/src/SettingsPage.tsx packages/ui/src/settings/ComputerUseSection.tsx packages/ui/test/settingsPageConfig.test.ts packages/ui/test/settingsPageIntegratedTerminalShell.test.ts packages/ui/test/computerUseWindowsSettings.test.ts docs/superpowers/plans/2026-08-06-windows-computer-use-settings.md
git commit -m "feat(cua): add Windows computer control setting"
```

Expected: o Conventional Commit é criado com sucesso e não inclui `.pnpm-store/`, `.tmp/` nem outros arquivos sem
relação.