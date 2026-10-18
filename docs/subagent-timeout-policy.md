# Política de timeout de subagent

## Contexto

`Agent` / `Task` são as entradas pelas quais o runtime pai agenda subagents. Anteriormente o ZCode
definia um timeout fixo de `600000ms` para `Agent` na camada de ferramentas; o objetivo atual é
remover essa limitação fixa de tempo de parede, evitando que subagents que rodam há muito tempo,
mas ainda saudáveis, sejam julgados pelo executor de ferramentas pai como `tool_timeout` antes da
hora.

## Semântica desejada

- `Agent` / `Task` não definem timeout fixo de execução de ferramenta.
- Um subagent em primeiro plano termina quando o próprio runtime filho conclui, falha ou é
  cancelado.
- Sinais de cancelamento como parar o turn pai, abort do turn pai ou saída do processo continuam
  sendo propagados para as chamadas `Agent` / `Task` que estão aguardando.
- Setup, persist, resume e a espera por `onSessionReady` da child session fazem parte do ciclo de
  vida cancelável e detectável por inatividade da chamada em primeiro plano; Ready é apenas uma
  barreira de publicação de `SubagentSpawned`, não o limite de instalação de abort/watchdog.
- O ciclo de vida de subagents em segundo plano continua gerenciado por `SubagentPort` / runtime
  task registry, sem limpeza pelo timeout fixo do executor de ferramentas.

```text
register task -> child setup/persist/resume -> onSessionReady -> foreground/background race -> settle
      ^                    ^                       ^                       ^
      |                    |                       |                       |
      +------------- parent abort + inactivity watchdog -----------------+
```

- Ao receber abort do pai ou timeout por inatividade na fase pre-ready, o `Agent` / `Task` externo
  deve falhar prontamente, limpar as runtime tasks não publicadas e não pode continuar esperando a
  child chamar `onSessionReady` ativamente.
- Depois que uma foreground task vira background, a provenance `background` do child tool mirror
  deve ser lida do estado atual do runtime task registry a cada evento emitido; não pode reutilizar
  o snapshot booleano do momento em que a child iniciou. Portanto, eventos da fase em primeiro plano
  não carregam `background: true`, e eventos atrasados após a mudança para segundo plano devem
  carregar `background: true`, permitindo que o lifecycle terminal real continue sendo projetado
  após o fim do turn pai.

## Fora de escopo

- Não alterar a política de timeout de ferramentas comuns como Bash, WebFetch, Read e Edit.
- Não restaurar a lógica de conversão automática de foreground para background com `120000ms`.
- Não alterar a política temporária de `subagents.backgroundEnabled` desativado por padrão.

## Restrições de implementação

- O executor de ferramentas deve suportar explicitamente `timeout: { kind: "none" }`; ferramentas sem
  timeout não podem recorrer ao timeout padrão do executor.
- O provider contract de `Agent` / `Task` não expõe mais `timeoutMs`, evitando que o modelo ou a UI
  supostam que o subagent tem um limite fixo de 10 minutos.
- A ausência de timeout cancela apenas o cronômetro de tempo de parede; o `AbortSignal` do nível
  pai ainda deve conseguir cancelar o handler em espera.
- O watchdog de inatividade do subagent deve ser iniciado antes do setup da child; a espera por
  ready e a espera por completion devem observar juntas o mesmo task abort signal, preservando o
  motivo `ToolTimeout` gerado pelo watchdog.