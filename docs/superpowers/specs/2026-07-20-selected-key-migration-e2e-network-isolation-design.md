# Design de Isolamento de Rede do E2E da Migração de SelectedKey

## Problema e objetivo

Os casos I32～I34 de `conversation-session-model-provider-selected-key-migration.test.ts`
verificam apenas a migração de inicialização local de `modelProviderFamilySelectedKeys`, mas o fixture padrão do WDIO grava
`oauth:active_provider=zai`, o access token da Z.AI e `zcodejwttoken`. Após o reload do app isso faz o runtime entrar na
recuperação de OAuth e usar o `e2e-oauth-token` falso para requisitar o provider, a API Key e os endpoints de benefícios reais da Z.AI.

O objetivo desta correção é tornar I32～I34 totalmente independentes de rede externa, mantendo inalterados o reload real do app e a cadeia local de migração de configurações.
A semântica de refresh remoto após a recuperação de OAuth já é coberta de forma independente por testes unitários de UI e não é repetida nestes três casos de migração.

## Esquema escolhido

Adicionar ao spec de migração de selectedKey uma política explícita de credenciais de inicialização:

- manter o `auth_token` falso, por compatibilidade com as cadeias auxiliares de E2E genéricas que ainda leem o token legado.
- não gravar `oauth:active_provider`.
- não gravar `oauth:zai:access_token`, informações de usuário do OAuth nem `zcodejwttoken`.
- continuar usando os fixtures existentes de settings, model provider e replay falsos.

A lógica de escolha de credenciais é extraída para uma função pura sem efeitos colaterais, chamada pelo `seedE2EStartupState()` do WDIO. O teste unitário afirma diretamente que o
resultado do spec de migração de selectedKey não contém nenhuma credência capaz de disparar refresh de recuperação ou requisições de rede de Plan.

## Sequência de inicialização

Antes da correção:

```text
fake active OAuth session
  -> restoreCachedSession
  -> refreshCodingPlanApiKey(Z.AI Coding + Start)
  -> requisições reais de provider/API Key/benefícios
  -> novo refresh por selectedKey
  -> migração local de selectedKey
```

Após a correção:

```text
fake local settings/providers + legacy auth_token
  -> restoreCachedSession: active provider inexistente
  -> refresh de família OAuth ignorado
  -> migração local de selectedKey
  -> I32/I33/I34 leem setting.json e afirmam
```

## Combinações de estado e poda

| Combinação | Tratamento | Motivo |
| --- | --- | --- |
| Conflito de mode/selectedKey local + sem OAuth ativo | Manter | Semântica mínima de produto de I32～I34 |
| Migração local + recuperação de OAuth da Z.AI bem-sucedida | Podar | O refresh após recuperação de OAuth já é coberto por `rootOAuthCallbackHandling.test.ts` |
| Migração local + rede real da Z.AI com sucesso/falha/timeout | Podar | Sem relação com o algoritmo de migração de selectedKey e introduz incerteza externa |
| identity do BigModel Team completo/malformado | Manter | Correspondem aos limites centrais de I33/I34 |

## Escopo de código e testes

- novo helper de função pura: constrói o fixture de credenciais padrão ou network-isolated conforme os specs de worker.
- o seed de inicialização do WDIO passa a usar esse helper; o fixture OAuth padrão dos demais specs permanece compatível.
- o teste unitário verifica primeiro que a implementação atual gera credenciais de OAuth ativo de forma incorreta e só então o helper é implementado para fazê-lo passar.
- executar o E2E alvo de I32～I34 e confirmar que os casos concluem e que o log de execução não contém
  `model-provider.refreshCodingPlanApiKey` nem requisições reais de `billing/balance`.
- executar o `pnpm typecheck` e o `pnpm lint` obrigatórios do projeto.

## Não objetivos

- não modificar a lógica de OAuth, refresh de provider, retry ou timeout do produto.
- não encurtar o timeout de requisições de rede reais.
- não montar um mock server HTTP de OAuth completo para este spec de migração.
- não alterar a semântica de desktop continuous, mobile remote replayable, workspace identity ou do Agent runtime.