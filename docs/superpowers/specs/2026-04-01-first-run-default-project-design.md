# Fallback Automático para o Workspace de Conversa sem Projeto na Inicialização (substitui o Projeto Padrão)

## Resumo

Na inicialização do app, o app prioriza restaurar `lastWorkspaceSession`; se não houver nenhum workspace restaurável,
garante a existência de `<dataBaseDir>/.zcode/workspace/default`, ativa-o com `workspacePurpose=conversation` e faz o
pré-aquecimento. A UI permanece como "nenhum projeto selecionado", e o usuário pode conversar diretamente.

## Critério de decisão

- `lastWorkspaceSession.length > 0` → restaura normalmente a sessão anterior
- `lastWorkspaceSession.length === 0` ou arquivo de settings inexistente → entra no fallback, no conversation backing
  workspace

## Escopo de plataforma

O Desktop (Electron) recebe a implementação primeiro; a Web mantém a mesma semântica de inicialização.

## Mudanças na camada de Service

### Extensão do fileService

No `IFileService` é fornecido um método idempotente:

```typescript
interface IFileService {
  ensureConversationWorkspace(): Promise<{
    path: string;
    created: boolean;
    workspacePurpose: "conversation";
  }>;
}
```

#### `ensureConversationWorkspace()`

- verifica se `<dataBaseDir>/.zcode/workspace/default` existe
- se não existe: cria com `mkdir` e retorna `{ path, created: true }`
- se existe: retorna `{ path, created: false }`

O método é idempotente e múltiplas chamadas não produzem efeitos colaterais adicionais.

### Restrições de escrita em settings

- `recentProjects` e `lastOpenTabs` podem ser escritos em sequência na mesma cadeia de abertura de workspace
- a atualização de settings deve ser serializada, para evitar que um patch escrito depois sobrescreva o campo anterior

## Ponto de entrada da inicialização no Desktop

O Desktop lê as settings na inicialização do processo main:

1. quando `lastWorkspaceSession.length > 0`, não aloca um novo caminho e deixa o renderer restaurar a sessão normalmente
2. quando `lastWorkspaceSession.length === 0`, garante a existência do backing path e passa ao renderer o conversation
   descriptor completo, usado também como target de warmup do Agent

Assim, na inicialização existem apenas dois caminhos principais: restaurar a sessão ou entrar diretamente no workspace
padrão.

## Arquivos envolvidos

| Arquivo | Mudança |
|------|------|
| `packages/services/src/file/fileService.ts` | Implementa o caminho do backing workspace e a criação idempotente |
| `packages/shared/src/protocol.ts` | Adiciona `WorkspacePurpose` e o descriptor persistido |
| `packages/desktop/src/main/startupWorkspace.ts` | Resolve na inicialização entre restaurar sessão e fallback de conversa |
| `packages/desktop/src/main/index.ts` | Integra a lógica de fallback da inicialização |

O desenho completo atual está em
[2026-07-10-non-project-conversation-workspace-design.md](./2026-07-10-non-project-conversation-workspace-design.md).
