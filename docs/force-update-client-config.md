# Configuração de Cliente para Force Update

## Contexto

O ZCode Desktop precisa suportar o bloqueio por versão vindo do remoto. Quando a configuração remota envia explicitamente uma exigência de upgrade obrigatório, o cliente Desktop abaixo da versão mínima precisa bloquear o uso antes de criar a janela principal e orientar o usuário a atualizar; quando o remoto não envia essa configuração, não há comparação local de versão nem mudança no fluxo de inicialização atual.

## Campo de Configuração

O `data.configs` do `GET {activeZCodeEndpointOrigin}/api/v1/client/configs` remoto pode acrescentar:

```json
{
  "forceUpdate": {
    "minimalVersion": "4.0.0"
  }
}
```

O guard de inicialização do Desktop main lê o endpoint ZCode ativo resolvido a partir do `ZCODE_ENV` / endpoint override atual: `pnpm dev:desktop` é por padrão equivalente a `dev:desktop:prod`, portanto consulta o servidor de produção; em ambiente de teste é obrigatório rodar explicitamente `pnpm dev:desktop:test`. A forma de campo homônima do arquivo estático `https://cdn.zcode-ai.com/zcode/config/default.json` existe apenas como compatibilidade de parsing e deixa de ser o endereço fixo lido pelo guard de pré-inicialização do Desktop. O parsing de client config nos serviços de negócio continua reaproveitando a mesma semântica de campo.

## Regras de Decisão

- A comparação só ocorre quando `forceUpdate.minimalVersion` é uma string não vazia.
- Sem `forceUpdate`, ou com `minimalVersion` ausente, vazio ou fora de um semver válido, não há upgrade obrigatório.
- A versão local usa o `ZCODE_VERSION` de tempo de compilação.
- A versão local é comparada com `minimalVersion` pela semântica de semver; quando a versão local é menor que a mínima, é considerado necessário o upgrade obrigatório.
- Versões de pré-lançamento seguem as regras de semver: por exemplo, `4.0.0-beta.1` é menor que `4.0.0`.
- Quando tanto a leitura remota quanto a local falham, não há bloqueio; fica reservado o espaço para, em estado totalmente offline, pular a validação de atualização e entrar na interface. Se mais adiante for necessária uma política offline explícita, ela deve ser integrada ao guard do Desktop main, e não descida para o UI Root.

## Comportamento do Produto

- Quando o Desktop precisa de upgrade obrigatório, o main process mostra uma pequena janela independente / diálogo de sistema antes de criar a janela principal, não abre a interface principal e não entra em workspace nem na página de configurações.
- O conteúdo da mensagem apenas informa a versão atual e a versão mínima disponível, evitando descrições repetidas.
- O Desktop oferece duas formas de orientação para upgrade:
  - Upgrade automático: dispara o fluxo existente de verificação/download de atualização automática; se a atualização já tiver sido baixada, vai direto para reinstalar.
  - Upgrade manual: abre a página de download do site oficial, com ramificação para a página em chinês ou em inglês conforme o idioma do app.
- Depois que o usuário fecha ou trata o aviso de upgrade obrigatório, o cliente antigo não segue para a interface principal.
- O controle remoto Web / celular não participa desta mudança de atualização obrigatória; o celular mantém a semântica existente de "só pode ser usado depois que o projeto é aberto" e não ganha página de contingência de update forçado nem entrada de upgrade manual.

## Fronteiras entre Plataformas

Essa capacidade é lida somente antes da criação da janela principal no Desktop main, a partir do `client/configs` do endpoint ZCode ativo no momento, e bloqueia a inicialização; não modifica session, task stream, snapshot, queue, owner command nem as cadeias de mensagens replayable/continuous. O controle remoto Web no celular continua entrando pelo shared-host attachment no Root existente; esta lógica de force update do Desktop não espalha a semântica de restauração replayable para a cadeia principal continuous do desktop e não altera a fronteira do controle remoto do celular.