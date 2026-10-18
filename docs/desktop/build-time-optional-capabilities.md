# Capacidades opcionais de build do desktop

## Objetivo

Três capacidades têm sua habilitação definida pela configuração de build; quando não configuradas, ficam sempre
desabilitadas:

| Capacidade | Item de configuração | Comportamento quando desabilitada |
| --- | --- | --- |
| Envio para ARMS RUM | `ZCODE_ARMS_RUM_ENDPOINT` | O ARMS SDK do processo principal e do renderer é inicializado com `enable: false`, sem nenhum envio |
| Envio de eventos (data warehouse) | `ZCODE_TELEMETRY_REPORT_ENDPOINT` | Os eventos de telemetria retornam imediatamente antes de serem enviados |
| Atualização automática | `ZCODE_AUTO_UPDATE` (`1`, `true`, `yes` habilitam) | Igual à forma Preview: nenhuma verificação e nenhum download de atualização |

Dessa forma, o mesmo código-fonte pode gerar builds "sem envio e sem atualização automática por padrão", como também
builds oficiais com essas capacidades habilitadas, sem precisar fixar endereços de envio no código-fonte.

## Fontes de configuração e prioridade

1. Variáveis de ambiente do processo de build. Definir explicitamente como string vazia significa desabilitar.
2. `config/private/build-defaults.json`. Existe apenas nos repositórios internos; a exportação open source não o contém.
3. Desabilitado quando nenhuma das opções acima estiver presente.

## Propriedade e fluxo de dados

```
Variáveis de ambiente / config/private/build-defaults.json
        │ scripts/build-time-config.mjs (única entrada de parsing)
        ▼
define do desktop tsup (main, host, preload) e do desktop vite (renderer)
        │ __ZCODE_ARMS_RUM_ENDPOINT__ / __ZCODE_TELEMETRY_REPORT_ENDPOINT__ / __ZCODE_AUTO_UPDATE_ENABLED__
        ▼
Constantes de env de @zcode/shared ── o código em tempo de execução só lê estas constantes
```

- Ambientes sem os defines injetados (testes, outros bundles) recebem os valores desabilitados; o vitest injeta um endpoint fixo de envio de eventos para os testes, a fim de validar a cadeia de envio.
- A atualização automática é decidida na inicialização do Desktop Main: `ZCODE_PRODUCT_FLAVOR === "production" && ZCODE_AUTO_UPDATE_ENABLED`.
- A telemetria OTLP do Agent segue o mecanismo já existente, injetada pelas variáveis `ZCODE_PACKAGED_AGENT_OTEL_*` do ambiente de empacotamento, e está fora do escopo deste arquivo.

## Aceitação

1. Quando existe a configuração padrão privada no repositório interno, o resultado do build é idêntico ao de antes da mudança: ARMS, envio de eventos e atualização automática ficam habilitados e os endereços não mudam.
2. Sem configuração padrão privada e sem variáveis de ambiente, as três capacidades ficam desabilitadas.
3. As variáveis de ambiente têm prioridade sobre os padrões privados, e uma string vazia explícita desabilita uma capacidade individual.
4. A verificação de tipos, o lint e os testes unitários relacionados passam.