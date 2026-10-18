# Gerenciamento de processos via Job Object do MCP no Windows (protótipo)

## Objetivo

No Windows, criar um Job Object independente para o processo root stdio MCP local do ZCode e encerrar esse Job prioritariamente quando o MCP for fechado. Isso cobre processos descendentes criados pelo root durante o gerenciamento, reduzindo processos de console remanescentes após a saída do Agent/MCP.

## Escopo

- Cobre apenas o MCP stdio local iniciado pelo `ProcessTreeStdioClientTransport` do lado do Agent.
- macOS/Linux mantêm inalterada a lógica atual de limpeza por process group.
- Se a criação do Job Object ou a inclusão do PID falhar, continua-se usando o caminho de fallback existente `taskkill /T /F`.
- Este protótipo faz attach depois que o SDK já criou o root e, portanto, não garante cobertura de descendentes criados antes do attach; para garantir cobertura completa, ainda será necessário um launcher nativo `CREATE_SUSPENDED → AssignProcessToJobObject → ResumeProcess`.

## Contrato de ciclo de vida

```text
MCP start
  ├─ Fora do Windows: caminho de process group existente
  └─ Windows: SDK spawn root → tenta attach ao Job Object → em caso de falha, mantém o taskkill

MCP close
  ├─ Job do Windows existe: TerminateJobObject + CloseHandle
  └─ depois ainda executa a limpeza de pipe/transport do SDK; falha do Job não bloqueia o fallback
```

## Limites de segurança

- Cada transport MCP mantém seu próprio Job, sem usar um Job global, evitando matar por engano outros workspaces ou MCPs.
- O attach usa apenas o PID root do próprio transport, sem corresponder por nome de processo nem pela tabela global de processos.
- Toda falha em chamadas de API do Windows cai para a lógica de reciclagem já existente, sem alterar o comportamento fora do Windows.
- Este protótipo não afirma eliminar a corrida entre spawn e attach; antes de ficar pronto para produção, é obrigatório adicionar testes em máquina Windows real verificando que um descendant criado pelo root após o attach também é encerrado junto com o Job.