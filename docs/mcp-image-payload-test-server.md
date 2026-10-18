# MCP Image Payload Test Server

## Objetivo

`scripts/mcp-image-payload-test-server.mjs` é um MCP server stdio para debug local, usado para validar a lógica de roteamento entre inline e artifact dos resultados de imagem do MCP. Ele gera PNGs válidos e preenche bytes por meio de chunks ancillary `tEXt` do PNG, para que o payload base64 do image content fique próximo do tamanho especificado.

## Ferramenta

Recomenda-se configurar o MCP server com o nome `zcode_image_payload_test` e o nome de ferramenta `emit_image`.

Entradas:

- `preset`: `tiny`, `below_limit`, `just_over_limit`, `large`, `huge`
- `base64Bytes`: especifica manualmente o número de bytes do payload base64 alvo e sobrescreve o `preset`
- `label`: rótulo de texto opcional
- `dataUrl`: opcional; quando `true`, retorna uma data URL no campo `data` da image

O preset padrão é `below_limit`, com cerca de `180 KiB` de base64; `just_over_limit` tem cerca de `210 KiB` de base64 e serve para validar que, ao ultrapassar `200 KiB`, o resultado é salvo como artifact binário e apenas path/URI são retornados.

## Configuração do ZCode na máquina local

A configuração de usuário de MCP do ZCode Agent fica em `mcp.servers`, dentro de `~/.zcode/cli/config.json`. Para testes locais, é possível adicionar:

```json
{
  "mcp": {
    "servers": {
      "zcode_image_payload_test": {
        "type": "stdio",
        "command": "node",
        "args": ["/Users/dev/workspace/z-code/scripts/mcp-image-payload-test-server.mjs"]
      }
    }
  }
}
```

Após alterar a configuração, é preciso criar ou reiniciar a session do ZCode Agent para que a lista de MCP seja recarregada.