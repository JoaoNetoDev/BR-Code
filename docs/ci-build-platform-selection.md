# Seleção de plataformas de empacotamento no CI

## Objetivo

Permitir que, ao criar um pipeline do GitLab, a variável opcional `ZCODE_BUILD_PLATFORMS` especifique as plataformas com empacotamento automático. O pipeline de MR faz por padrão apenas o empacotamento automático de macOS ARM64 e Windows x64; pipelines criados manualmente sem a variável continuam com o empacotamento automático de todas as plataformas.

## Identificadores de plataforma

A variável usa identificadores completos de plataforma separados por vírgula, com suporte aos seguintes valores:

- `macos-arm64`
- `macos-x64`
- `windows-x64`
- `windows-arm64`
- `linux-x64`
- `linux-arm64`

Exemplo:

```text
ZCODE_BUILD_PLATFORMS=macos-arm64,windows-x64
```

Ao criar manualmente um pipeline na página **Run pipeline** do GitLab, a variável pode ser preenchida em Variables; o mesmo vale para pipelines criados via Pipeline API ou Trigger API. Todas essas formas de disparo manual usam as mesmas regras de seleção de plataforma.

## Contrato de comportamento

- O pipeline de MR recebe por padrão `ZCODE_BUILD_PLATFORMS=macos-arm64,windows-x64` via workflow, portanto executa automaticamente apenas macOS ARM64 e Windows x64; as demais plataformas permanecem como manual job não bloqueante.
- Pipelines criados manualmente pelo **Run pipeline** do GitLab, pela Pipeline API e pela Trigger API, sem `ZCODE_BUILD_PLATFORMS` ou com ela vazia, executam automaticamente os seis platform jobs como hoje.
- Quando uma lista não vazia é informada, os platform jobs dentro da lista executam automaticamente.
- Quando uma lista não vazia é informada, os platform jobs fora da lista permanecem no pipeline com status de execução manual opcional e não bloqueiam o pipeline quando não executados.
- A verificação de plataforma usa correspondência de token completo com limite de vírgula; é proibido usar correspondência difusa por nome de plataforma ou substring de arquitetura.
- A variável participa da avaliação do job graph no momento em que o GitLab cria o pipeline; o **Run pipeline** da UI do GitLab é um ponto de entrada suportado para criação manual de pipeline.
- Após a criação do pipeline, clicar em um manual job, ou preencher temporariamente uma variável para esse job, não altera o estado de agendamento já determinado dos demais jobs.
- Essa regra de seleção vale para pipelines criados por MR, **Run pipeline** do GitLab (`web`), Pipeline API (`api`) e Trigger API (`trigger`).
- As pipelines de verificação de publicação por tag e `ci/*` mantêm sempre o empacotamento automático das seis plataformas, evitando que o DAG de upload/publicação formal fique sem artefatos de plataforma.

## Sequência de agendamento

```text
criar pipeline
  |
  +-- pipeline de MR
  |     `-- workflow injeta macos-arm64,windows-x64
  |           +-- macOS ARM64 / Windows x64 -> on_success
  |           `-- outras plataformas        -> manual + allow_failure
  |
  `-- Web / Pipeline API / Trigger API
        |
        +-- ZCODE_BUILD_PLATFORMS ausente ou vazio -> todos os platform jobs on_success
        `-- ZCODE_BUILD_PLATFORMS como lista não vazia
              +-- token completo da plataforma atual -> on_success
              `-- plataforma atual não encontrada   -> manual + allow_failure
```

## Limites de implementação

- A lógica de seleção controla apenas os seis build jobs dos instaladores desktop, sem saída antecipada por script, para que plataformas não selecionadas não ocupem runner.
- O build template de plataforma, os comandos de empacotamento, o diretório de artefatos e a lógica de upload/publicação permanecem inalterados.
- O CUA Helper job, atrelado ao instalador macOS, acompanha a seleção da plataforma macOS correspondente, evitando que, ao escolher apenas uma arquitetura macOS, o helper da outra arquitetura ainda seja construído automaticamente; o helper não selecionado também mantém a entrada manual.
- A notificação de build do Feishu acompanha se a plataforma correspondente teve empacotamento automático; plataformas não selecionadas não geram notificação automática, e ao executar manualmente o build dessa plataforma depois, seu job de notificação ainda pode ser executado manualmente conforme necessário.
- O `build:desktop:app` e os jobs de remote assets, independentes de plataforma, não pertencem à lista de plataformas e mantêm o comportamento de agendamento atual.

## Verificação

Testes automatizados cobrem:

- Os seis platform build jobs declaram o mesmo contrato de agendamento com parâmetro opcional.
- Os dois CUA Helper jobs usam o mesmo contrato de agendamento das plataformas macOS correspondentes.
- O workflow de MR injeta por padrão `macos-arm64,windows-x64`.
- Quando a variável está ausente ou vazia, a regra volta a executar automaticamente.
- Quando a variável não está vazia e não há correspondência, o job é de execução manual não bloqueante.
- A correspondência de plataforma inclui limites de token por vírgena explícitos.