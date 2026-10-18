# Contrato de Passagem Direta e Recuperação de Erros de Permissão do CUA

- Data: 2026-08-25
- Status: implementado, aguardando MR review
- Relacionado: producer `zcode-cua` !576, consumer `z-code` !2315

## Decisões

O ZCode não consome mais nem gera `CUA_PERMISSION_REQUIRED`. As falhas do CUA Helper/Broker entram no modelo e no ToolCallRow como um MCP tool error comum; depois de ler o erro exato, o próprio modelo decide chamar o `request_access` somente leitura, reativar o aplicativo ou observar novamente. O erro comum em si não tem efeito colateral de UI; apenas um snapshot estruturado de permissão, do `request_access` ao vivo e validado pela official-CUA authority, pode disparar um processo de confirmação do Host separado.

## Causa raiz

```text
permission_denied
  -> producer adivinha como TCC do macOS
  -> MCP structuredContent é achatado em texto
  -> Renderer includes("CUA_PERMISSION_REQUIRED")
  -> requisição automática de Accessibility + Screen Recording
```

`permission_denied` carrega simultaneamente falhas distintas de TCC, foreground policy, Windows UIPI, input do Linux e capacidade nativa inválida. Continuar refinando e reconferindo entre camadas introduziria novas máquinas de estado sem conseguir provar, a partir de um código de erro genérico, qual é a lacuna real de permissão.
Por isso, remover a classificação automática é mais confiável do que continuar estreitando as classificações.

## Nova cadeia

```text
Erro original do Helper/Broker
        |
        v
MCP error comum + mensagem original + evidência de entrega
        |
        +--> ToolCallRow / continuous / cold replay comuns
        |
        v
modelo escolhe request_access / activate / re-observe / stop

metadata tipada de request_access oficial ao vivo
        |
        v
Host local do desktop-continuous reconfirma o status atual
        |
        v
Confirmação do ZCode -> permission onboarding já existente
```

## Invariantes

- O producer não retorna `CUA_PERMISSION_REQUIRED` e o consumer não faz busca por essa string.
- O Renderer não abre automaticamente caixa de confirmação, configurações do sistema ou permission onboarding por causa de um tool error.
- A página de configurações e as entradas de status do Composer são preservadas. Além disso, o resultado ao vivo do `request_access` oficial no macOS local `desktop-continuous` pode, quando a falta de permissão é explícita, exibir primeiro a caixa de confirmação do ZCode; as configurações do sistema não podem ser abertas antes da confirmação do usuário.
- `request_access` permanece somente leitura, sem solicitar permissões do sistema e sem criar um novo Helper.
- A análise de texto de `request_access` serve apenas à exibição no Tool Card e não pode se tornar um gatilho de comportamento. O disparo deve vir do `_meta` com namespace do producer, da official authority e de um runtime schema estrito.
- Com `action_sent=true` ou `request_delivery_state=possibly_sent`, a ação original não pode ser reproduzida automaticamente.
- `broker_unavailable` continua usando `CUA_NOT_READY`, porque ela expressa transport readiness e segurança de retry, e não pertence à inferência de permissões.
- O continuous do desktop e o replayable do celular exibem o mesmo fato de falha comum; a observação de permissão ao vivo existe apenas no continuous do desktop local, e o celular não recebe esse evento nem inicia um Helper separado.
- Strings antigas em transcripts históricos são exibidas apenas como texto comum e não podem disparar efeitos colaterais novamente.
- Depois de a autorização retornar, apenas o Helper é restaurado e as permissões são atualizadas; nenhum task command, continuation ou replay automático de ferramenta é enviado.

## Cobertura

- Unit do producer + stdio MCP: tanto a forma de TCC quanto `permission_denied` não-TCC são retornados como são.
- Fault do producer: `possibly_sent` é preservado e o dispatch não é duplicado.
- Unit do consumer: Root/ToolCallRow não têm gate de permissão e o texto do erro antigo não tem efeito colateral.
- Observação ao vivo do consumer: apenas metadata legítima do `request_access` oficial dispara; ferramenta de terceiro com o mesmo nome, metadata malformada, snapshot/recovery/mobile/remote não têm efeito colateral.
- Replay de conversa: ToolCallRow de falha, conteúdo posterior do assistant e cold restore são consistentes.
- Package: um novo pacote com o mesmo semver e buildId diferente substitui o Helper antigo.
- Modelo real: tudo usa Kimi K3, e o estado final da aplicação é verificado por um oracle independente.

Artefato determinístico de replay atual:
`packages/desktop/.e2e-artifacts/desktop-e2e-20260824-194204-941`. Esse artefato prova que um MCP error comum contendo o texto histórico `CUA_PERMISSION_REQUIRED` gera apenas uma linha de ferramenta com falha, que live/cold restore é consistente e que não há pop-up automático de permissão; ele não substitui o gate de modelo real com Kimi K3.