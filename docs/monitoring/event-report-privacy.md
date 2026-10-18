# Boundaries de privacidade do endereço de login e do corpo de erro de `/event/report`

## Objetivos e escolhas (2026-09-18)

A implementação antiga gravava a authorizeUrl OAuth completa em `app_login_ck.login_url` e permitia que o texto
original de `error_msg` de qualquer evento fosse para o HTTP body; as regex parciais da automação deixavam passar
o valor após um Bearer e chaves em formatos desconhecidos. O usuário confirmou que a primeira fase prioriza
privacidade: não enviar o texto original do erro criptografado e não depender de regex para adivinhar quais
fragmentos são segredos.

- Mantém-se o nome do campo `login_url`, enviando apenas o hostname em minúsculas de URLs HTTP(S), removendo
  userinfo, porta, caminho, query e fragment. URLs inválidas ou não-HTTP(S) retornam string vazia; um hostname já
  normalizado pode ser processado de forma idempotente.
- **Em todos os eventos**, `event_extra_detail.error_msg`: strings não vazias viram uniformemente `[redacted]`;
  string vazia permanece vazia e campos originalmente ausentes não são adicionados. Isso vale para os eventos
  atuais de conversation/automation e para eventos futuros.
- Eventos de conversa mantêm o `error_type` existente; falhas de criação de automation passam a ter um
  `error_code` fixo: `limit` / `timeout` / `network` / `auth` / `validation` / `unknown`, vazio em caso de
  sucesso. Localmente os códigos/padrões conhecidos são reconhecidos nessa ordem; textos desconhecidos ou
  ausentes são classificados como `unknown`, oferecendo apenas atribuição grosseria, sem devolver o conteúdo
  casado e sem prometer recuperar toda a capacidade de diagnóstico do texto original. Estado, duração e IDs
  correlatos permanecem inalterados.
- O tratamento age apenas sobre a cópia de telemetry; não altera o endereço do navegador OAuth, o login state,
  os resultados de ferramentas ou a exibição de erros de negócio.
- Antes do envio da UI e antes da serialização do Core, usa-se a mesma função pura; a função é idempotente e não
  modifica os objetos do chamador. Os payloads de debug de agent_step/message_completion registram apenas a cópia
  higienizada, passando a usar debug.
- O header de autenticação Authorization continua sendo usado normalmente para a autenticação, sem remoção nem
  cópia para o JSON; isso é separado da remoção do corpo de erro.

## Cadeia e compatibilidade

```text
URL original do OAuth -> navegador (valor original)
           `-> hostname do login_url -> UI sanitize -> IPC -> Core sanitize -> POST
Outros eventos de UI -> error_msg [redacted] -> mesma cadeia
Eventos de Host/Main ---------------------------------> Core sanitize -> POST
```

A implementação compartilhada não depende de Node, sistema de arquivos nem APIs de plataforma. Caminhos de
Windows/macOS/Linux, URLs arbitrárias, valores de Authorization e chaves (incluindo PEM multilinha) são removidos
por inteiro junto com qualquer corpo de erro não vazio.

A assinatura, a fila, a restauração e a atribuição de mensagens do desktop continuous e do
web-remote-replayable do celular não mudam; o celular continua encaminhando apenas a session_create strict já
existente. Tema, idioma e interações de UI não mudam.

O escopo desta fase é `login_url`/`error_msg` de `/event/report`; não é estendido para ARMS, OTLP,
`compaction.reason`, corpo de templates, `event_text` nem outros campos de negócio. Dados históricos já
existentes no servidor não são corrigidos nem removidos por este cliente.

## Aceitação

Primeiro executar os novos casos com o código antigo para confirmar a falha e depois verificar: a URL de login
completa é usada apenas em openExternal; o reporter da UI, os logs de debug e o body final da chamada direta ao
Core não contêm o texto original do erro; a semântica de higienização de vazio/ausente/repetida é estável;
eventos desconhecidos futuros também são higienizados; o objeto original permanece inalterado; as retentativas
de rede reutilizam o body higienizado e o event_id; o header Authorization normal é preservado; e o body
efetivamente recebido não contém marcadores sensíveis sintéticos, verificado com um receptor HTTP local
controlado.

Executar os testes relacionados, `pnpm typecheck` e `pnpm lint`; registrar na descrição do commit as
verificações em máquinas reais de Electron/celular/cross-OS que ficaram sem cobertura.

## Registro de Verificação

- A nova regressão foi executada primeiro na implementação antiga: 33 itens falhando, cobrindo URL original,
  corpo de erro original, logs e body HTTP final.
- Após a modificação, 15 arquivos de teste relacionados e 202 casos passaram, incluindo receptor HTTP local real,
  body de retry, header de autenticação normal, endereço OAuth original, agente pai/filho, workflow, automation e
  boundary de session_create do celular.
- Execução em macOS + Node 24.14.0; sem conta real, sem envio para rede de produção e sem amostras reais de
  privacidade de usuário.
- Caminhos de Windows/Linux foram cobertos como casos de entrada, mas não houve execução em máquinas reais de
  Windows/Linux, nem login real do Electron ou E2E de navegador no celular.
- `architecture:check` aprovado; shared/ui/services são módulos legacy/unmanaged da política atual, e a
  aprovação não prova automaticamente todas as suas boundaries de runtime. A higienização compartilhada é uma
  função pura sem I/O e não mudou o owner de estado de negócio.

O `pnpm typecheck` completo, o `pnpm lint` (55 avisos de arquivos fora desta modificação, 0 erros), a verificação
oxfmt dos arquivos modificados e o `git diff --check` passaram.

## Tabela de Campos e Migração de Relatórios

- [Tabela de campos de agent_step / message_completion do monitoramento de negócio](business-monitoring.md):
  usa `error_type` para agregar falhas, sem agrupar nem buscar pelo texto original de `error_msg`.
- [Tabela de campos de telemetry de mensagens de automation](automation-message-telemetry.md): mesma semântica de
  privacidade do corpo de erro.
- [Catálogo de performance telemetry](performance-telemetry-catalog.md): aqui só restringem-se os campos de
  `/event/report`, sem ampliação para ARMS/OTLP.
- [Relatório da visão principal de tarefas agendadas](../ui/scheduled-tasks-main-view.md): o `error_code` de
  `automation_create_result` era sempre vazio; esta rodada completa a classificação, e os relatórios passam a usar
  esse campo. A cobertura da classificação precisa ser avaliada olhando a proporção de `unknown` separadamente,
  sem tratar classificação desconhecida como sucesso.

Correções de revisão CR-01/CR-02: sincronizar primeiro os specs existentes acima e depois validar a classificação
e a privacidade com os envios reais de falha/sucesso do reporter; falhas sem informação de erro também precisam
emitir `unknown`, e sucessos não podem carregar classificação de erro desatualizada.