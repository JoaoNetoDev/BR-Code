# Capacidade de sondagem de rede interna (versão para serviços externos)

## Objetivo

Oferecer uma capacidade independente e reutilizável de sondagem de conectividade com a rede interna. Se alguma funcionalidade de produto usa o resultado da sondagem é definido pela própria funcionalidade.

## Solução

- Iniciar um serviço HTTP leve na máquina da rede interna (por padrão `10.0.0.100:3850`, pode ser sobrescrito por `INTRANET_MACHINE_HOST`)
- O cliente chama `systemService.probeIntranet(...)` para sondar esse serviço
- O serviço retorna um JSON fixo: `{ ok: true, marker: "xxx" }`
- O cliente valida:
  - status HTTP `2xx`
  - `ok === true`
  - se `expectedMarker` estiver configurado, `marker` precisa corresponder

## Lado do servidor (independente deste repositório)

O serviço de sondagem da rede interna não é mantido junto com o código deste projeto; basta implantá-lo de forma independente na máquina da rede interna.

Caminho de sondagem padrão:

- `GET /api/intranet/probe`
- `POST /api/intranet/probe` (compatibilidade, mesmo comportamento)

Variáveis de ambiente opcionais:

- `PORT` (padrão `3850`)
- `ZCODE_INTRANET_PROBE_PATH` (padrão `/api/intranet/probe`)
- `ZCODE_INTRANET_PROBE_MARKER` (padrão `zcode-intranet`)
- `ZCODE_INTRANET_PROBE_TOKEN` (opcional; quando configurado, o cliente precisa enviar `x-zcode-intranet-token`)

## Cliente

Exemplo de chamada:

```ts
const result = await services.systemService.probeIntranet({
  targets: [
    {
      kind: "service",
      url: "http://10.0.0.100:3850/api/intranet/probe",
      expectedMarker: "zcode-intranet",
      // token: "opcional",
    },
  ],
});

if (result.isIntranet) {
  // a rede atual consegue acessar o serviço de rede interna alvo
}
```

### Política de exibição da entrada SSH

A entrada de conexão remota (SSH) na UI é sempre exibida. A disponibilidade do SSH depende da máquina alvo, do enlace de rede e das credenciais; o resultado da sondagem da rede interna não é usado como portão de visibilidade do produto.

## Observações de compatibilidade

`probeIntranet` mantém a antiga sondagem de alvo TCP (`host + port`) para compatibilidade histórica ou transição de duas vias.