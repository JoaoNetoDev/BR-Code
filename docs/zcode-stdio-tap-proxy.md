# ZCode stdio Tap Proxy

Em ambiente de desenvolvimento, é possível abrir `Capture Agent stdio Traffic` pelo menu Help, fazendo com que o NDJSON de stdio entre o app e o ZCode Agent passe por um proxy em paralelo.

## Comportamento

- O item de menu é exibido e só tem efeito no runtime de desenvolvimento local; pacotes de teste/produção não o exibem.
- O estado do interruptor é gravado em `~/.zcode/v2/dev/zcode-stdio-tap.json`.
- Os arquivos de captura são gravados em `~/.zcode/v2/dev/stdio-traffic/<workspaceHash>/`.
- `latest.txt` aponta para o arquivo `.ndjson` gerado pelo proxy mais recente.
- Agents já em execução não são reiniciados; o interruptor afeta apenas os processos de agent iniciados depois.

## Visualização

A página `stdio 抓包` de `apps/dev-docs` lê, por meio de uma API Vite local, o arquivo `.ndjson` atualizado mais recentemente em `~/.zcode/v2/dev/stdio-traffic` e o exibe em ordem decrescente pelo tempo do record.
Quando o estado exibido é `real tail`, os dados vêm do arquivo de tap real; `mock replay` serve apenas para demonstração manual e não representa comunicação real de agent.

```sh
cat ~/.zcode/v2/dev/stdio-traffic/<workspaceHash>/latest.txt
```

Depois de obter o caminho do arquivo em `latest.txt`:

```sh
tail -f <traffic-file>.ndjson
jq 'select(.direction == "app-to-agent") | .message' < <traffic-file>.ndjson
jq 'select(.id == 7)' < <traffic-file>.ndjson
```

Cada record mantém `direction`, `raw`, `message`, `parseError`, `id`, `method`, `sessionId` e `inputId`. `raw` é a linha de stdio original, e `message` é a cópia estruturada do JSON que pôde ser interpretado.