# MCP: servidor de teste inacessível por padrão

## Contexto

Após ligar o interruptor na página de configurações de MCP, houve casos em que um server inacessível aparecia inicialmente em verde e só ficava vermelho depois que a conexão real falhava. Para reproduzir o problema de forma estável, são necessários servidores MCP do ZCode Agent habilitados por padrão, mas que nunca conseguirão se conectar, cobrindo respectivamente falha de conexão HTTP e falha de inicialização de processo STDIO.

## Local da configuração

A configuração de teste é gravada na configuração de MCP do ZCode Agent em nível de usuário:

```json
{
  "mcp": {
    "servers": {
      "zcode-unreachable-http-test": {
        "type": "http",
        "url": "http://127.0.0.1:9/mcp",
        "timeoutMs": 3000
      },
      "zcode-unreachable-stdio-test": {
        "type": "stdio",
        "command": "zcode-mcp-stdio-server-that-does-not-exist-for-test",
        "args": [],
        "timeoutMs": 3000
      }
    }
  }
}
```

Explicação:

- Não gravar `enable: false`, mantendo o padrão habilitado, para observar o estado inicial e a mudança de estado após a falha de conexão.
- O item de teste HTTP usa `127.0.0.1:9`, de modo que a requisição só atinge o endereço de loopback local, sem acesso à rede externa.
- O item de teste STDIO usa um nome de comando inexistente, com o objetivo de disparar uma falha de inicialização de processo.
- Se a porta 9 estiver ocupada na máquina, troque o item de teste HTTP por outra porta local sem listener.

## Verificação esperada

1. Depois de iniciar o desktop, abra Settings -> MCP Servers.
2. `zcode-unreachable-http-test` e `zcode-unreachable-stdio-test` devem aparecer na lista de MCP do ZCode Agent.
3. Ao ligar o interruptor de qualquer server ou atualizar o status do MCP, ele não deve permanecer verde como connected por muito tempo.
4. Depois que a conexão real terminar, deve ser exibido failed/error, com a mensagem de erro preservada; o erro do item de teste STDIO deve apontar que o comando não pôde ser iniciado ou não foi encontrado.

Essa configuração serve apenas para diagnóstico local e não deve ser distribuída como configuração padrão de produto.