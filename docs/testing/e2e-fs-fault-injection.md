# E2E FS Fault Injection

Objetivo: fornecer uma capacidade estável e reproduzível de injeção de erros de sistema de arquivos para falhas de ambiente fora da área de sessão, permitindo que cases como `ENOSPC`, `EACCES`, snapshot corrompido e falha de escrita de log sejam reproduzidos localmente, na CI e no Docker com o mesmo protocolo, em vez de depender de disco realmente cheio ou de alteração manual de permissões.

Cases relacionados:

- `D01`: `ENOSPC` na escrita do histórico da sessão
- `D02`: `ENOSPC` na escrita de arquivo do workspace
- `D03`: `EACCES` ao salvar provider/settings
- `D04`: snapshot de sessão corrompido na recuperação de inicialização
- `D05`: falha na escrita de log/artifact

## Limites da injeção

Falhas de sistema de arquivos só podem ser habilitadas em ambiente de execução de teste. Por padrão, aceita-se apenas a configuração de injeção sob `ZCODE_ENV=test`; se no futuro for necessário habilitar em um pacote de depuração especial, é obrigatório definir explicitamente `ZCODE_E2E_FS_FAULTS_ALLOW=1`, evitando que o ambiente de produção do usuário receba injeção de erros por resíduo de variável de ambiente.

A primeira fase entrega um helper independente, conectado primeiro a pontos de escrita atômica de configuração como `atomicWriteText`. Ordem das próximas conexões:

1. Escrita atômica do `config.json` do provider: já conectado, cobre o caminho principal de salvamento de `D03`.
2. Escrita direta do `setting.json` de settings: já conectada, completa o caminho de salvamento de app settings de `D03`.
3. Escrita direta da ordem de exibição de providers: já conectada, cobre falha ao salvar a preferência de provider.
4. Abertura do DB de sessão SQLite: já conectada, cobre a impossibilidade de abrir o banco na inicialização/recuperação, a serviço de `D04`.
5. Escrita do histórico de sessão SQLite: já conectada em `sqliteRun`, cobre falhas de escrita de `saveMessage` / `savePart` / `createSession`, a serviço de `D01` e da escrita do compact marker.
6. Escrita de arquivos pelas ferramentas de workspace: conecta `createParents` de `NodeFileSystemAdapter.writeTextFile`, a escrita direta não atômica e o limite de remoção, a serviço de `D02`; a escrita temp com `atomic: true` padrão, chmod, sync, rename e o fallback não entram no fault injector.
7. Sink de artifacts de ferramentas: conecta a criação de diretório e a escrita de artifacts de texto/binário em `NodeToolArtifactStore`, a serviço do ramo de artifact de `D05`.
8. Sink de log da CLI: conecta a criação do diretório de logs e o append de JSONL em `NodeLoggerFactory`, cobrindo o ramo de escrita de log da CLI de `D05`.
9. Sink de log do main do desktop: conecta o append dos logs comuns do processo main e dos logs dedicados ao controle remoto web, cobrindo o ramo de escrita de log do processo main do desktop de `D05`. A falha de criação do diretório de logs no período de inicialização mantém o comportamento atual; se mais tarde se quiser mudar para engolir completamente o erro, é preciso confirmar separadamente a expectativa de produto.

### Observação sobre escrita atômica no workspace

Caminho `atomic: true` padrão de `NodeFileSystemAdapter.writeTextFile`: escrever arquivo temp, copiar as permissões do arquivo original, sync, rename; se esse caminho atômico falhar, o arquivo temp é limpo e há fallback para escrita não atômica com `O_TRUNC` no arquivo de destino. Esse fallback, sob erros de disco anormais como `ENOSPC` / `EIO`, pode truncar o arquivo de destino existente; a regressão atual de permissões das file tools aceita provisoriamente esse comportamento.

Para evitar que o `ZCODE_E2E_FS_FAULTS` de test-only contamine essa lógica de prod, a escrita temp atômica / rename padrão do workspace não insere fault hook. Se `D02` precisar simular de forma estável a falha de escrita no workspace, deve usar a escrita direta com `atomic: false`, a criação do diretório pai, a remoção ou outra fronteira de armazenamento já conectada; se for reintroduzir um seam de teste dedicado no caminho atômico padrão, é preciso confirmar antes a semântica de produto.

## Formato da configuração

Variável de ambiente: `ZCODE_E2E_FS_FAULTS`

O valor é um array JSON, em que cada rule descreve uma classe de equivalência de falha:

```json
[
  {
    "id": "D01-session-history-enospc",
    "code": "ENOSPC",
    "operations": ["writeFile", "rename"],
    "pathIncludes": "/.zcode/",
    "maxMatches": 1,
    "message": "Injected ENOSPC while persisting session history"
  }
]
```

Significado dos campos:

| Campo | Significado |
| --- | --- |
| `id` | id de case estável ou id de fixture, precisa ser não vazio |
| `code` | código de erro no estilo Node, como `ENOSPC`, `EACCES`, `EPERM` |
| `operations` | operações de fs / storage casadas; suporta `mkdir`, `writeFile`, `appendFile`, `rename`, `rm`, `sqliteOpen`, `sqliteRun`, `any` |
| `pathIncludes` | casamento por substring do caminho; o caminho normaliza `\` para `/` |
| `pathEndsWith` | casamento por sufixo do caminho |
| `pathRegex` | casamento por expressão regular sobre o caminho normalizado |
| `maxMatches` | número máximo de acertos; padrão `1`; `0` significa acertos ilimitados |
| `message` | descrição legível do erro injetado |

Regras de casamento:

- `operations` ausente equivale a `["any"]`.
- Com `pathIncludes` / `pathEndsWith` / `pathRegex` todos ausentes, casa com todos os caminhos.
- Quando existem múltiplas condições de path, todas precisam ser satisfeitas.
- `maxMatches` dispara apenas uma vez por padrão, evitando que um case de fault contourne inadvertidamente escritas posteriores sem relação.

## Objeto de erro

O erro lançado pelo injetor precisa manter a forma de `ErrnoException` do Node:

```ts
{
  code: "ENOSPC",
  syscall: "writeFile",
  path: "/tmp/workspace/.zcode/session.json",
  zcodeFsFaultId: "D01-session-history-enospc"
}
```

Assim a camada de produto consegue tratar pelo código de erro real, e o artifact E2E consegue localizar a rule que foi acertada.

## Evidências de aceitação

Cada E2E de fault de armazenamento precisa preservar ao menos estas evidências:

| Camada | Evidência |
| --- | --- |
| UI | erro visível ao usuário, estado dos botões, se queue/runtime está de acordo com a expectativa de produto |
| Runtime | `activeInputId`, queue, status da sessão, compact marker |
| Files | se o arquivo de destino está ausente, parcialmente escrito, corrompido ou recuperado com sucesso |
| Log | código de erro e log de recuperação do mesmo `sessionId` / `inputId` |
| Fault artifact | `id`, `operation`, `path`, `code` acertados e número de acertos |

## Estado atual

A primeira fase fixou o protocolo de injeção, o teste unitário do helper e conectou os pontos de injeção do `atomicWriteText` usado por provider/config, da escrita direta do `setting.json`, da escrita da ordem de exibição de providers, da abertura do DB de sessão SQLite, da escrita do histórico de sessão SQLite, da criação de diretório pai / escrita direta não atômica / remoção das ferramentas de workspace, da escrita de artifacts de ferramentas, da escrita de log JSONL da CLI e do append de log do main do desktop; `D01-D05` continuam como `decision-needed`, e a simples existência da capacidade de injeção não significa que o case de produto já está coberto. Só quando um ponto de escrita de negócio é conectado ao helper e o case correspondente tem setup/action/assert bem definido ser marcado como `covered` na matriz de cobertura.