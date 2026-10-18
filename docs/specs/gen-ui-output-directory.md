# Diretório de Saída Fixo do Gen UI

## Contrato de Diretório

Os arquivos gerados usam o diretório raiz de saída fixo fornecido pelo Host da ponta de execução, por padrão localizado em `visualizations/` dentro do diretório de dados do app; o Agent não faz fallback para o diretório de trabalho atual. A identidade do workspace (usando o workspace path quando ausente) e o session ID determinam juntos o subdiretório da sessão sob a raiz.

"Diretório fixo" é uma convenção de local de saída, não uma restrição de contenção do workspace. Quando o usuário abre Home, a raiz do sistema de arquivos ou outro workspace que contenha o diretório de dados do app, o diretório raiz de saída fornecido pelo Host continua válido. O código não deve recusar a inicialização ou a leitura por o fato de o diretório de saída ser igual a estar dentro do workspace. O guia de geração dentro da Skill não é modificado.

O subdiretório da sessão apenas organiza os arquivos gerados e não é uma fronteira de autorização de leitura. Ao ler arquivos do diretório de saída fixo do Host não é exigido que o caminho pertença ao workspace/sessão atual; após o fork herdar o caminho HTML da sessão pai ele pode carregar diretamente, sem precisar copiar arquivos nem reescrever mensagens do histórico. O widget state continua sendo salvo por workspace/sessão atual.

Continua sendo recusado qualquer caminho fora do diretório de saída raiz do Host, subdiretórios ou links simbólicos de arquivo sob a raiz, arquivos não regulares, fragmentos de HTML inválidos e arquivos acima do limite de tamanho. O próprio diretório raiz de saída do Host pode ser resolvido via link simbólico e, após a resolução, as mesmas verificações de raiz continuam valendo.

## Cadeia de Chamadas e Superfície de Impacto

```text
Host 提供固定根目录 → 按 workspace/session 派生输出目录 → Agent 初始化 / 生成
                                                           ↓
界面读取请求（可引用父会话路径）→ 执行端 Host 校验根目录与文件 → 原有桌面沙箱
```

A validação original entendia "não gerar no diretório atual" como "tem de estar fora do workspace", o que fazia a inicialização do Gen UI no workspace Home lançar erro e bloqueava em cascata o diretório de skills e a execução de mensagens que dependem da inicialização no mesmo contexto.

Outro equívoco foi tratar o agrupamento do diretório de geração como isolamento de leitura, o que impedia que as mensagens do fork, mantendo o caminho da sessão pai, fossem exibidas.

Esta mudança remove a restrição de contenção do workspace e a restrição de leitura de arquivos entre sessões/workspaces; não modifica skill, escolha da raiz fixa, regras de cópia do fork nem roteamento do serviço remoto. A cadeia continuous do desktop e a cadeia replayable do celular mantêm as fronteiras originais; o HTML continua sendo lido pelo Host da ponta de execução e o widget state continua pertencendo ao host do desktop.

## Verificação de Regressão

- Testes unitários de caminho cobrindo o diretório raiz de saída dentro do workspace, igual ao workspace, workspace na raiz do sistema de arquivos e identidade de workspace local / SSH; caminhos relativos continuam recusados.
- Testes de leitura de arquivos cobrindo workspace que contém o diretório de saída, leitura entre sessões/workspaces, resolução de alias da raiz e as já existentes restrições de saída da raiz, link simbólico, tipo de arquivo e tamanho.
- O E2E Gen UI existente do Electron define o workspace como ancestral do diretório raiz de saída, verificando leitura real de arquivo, renderização e interação com a página; ao trocar de sessão e referenciar o mesmo arquivo da sessão pai, verifica a semântica de carregamento do histórico do fork.
  Isso é um fixture local de identidade remota e não representa transmissão SSH real nem verificação completa do comando de fork.