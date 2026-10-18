# Carregamento Sob Demanda do Snapshot de Task (primeira fase)

## Contexto

Na primeira vez em que o controle remoto por celular abre uma task histórica, `getTaskSnapshot` retornava antes o conjunto completo de `messages`, o que gerava uma espera perceptível na primeira renderização quando o histórico é longo (transporte, parsing de JSON e renderização são todos afetados).

## Mudanças desta entrega

- `IZCodeTaskService.getTaskSnapshot` passa a aceitar um parâmetro opcional: `messageLimit?: number`
- No servidor, ao montar o snapshot de task do ZCode, é feito um recorte de cauda em `messages`:
  - sem `messageLimit`: mantém o comportamento completo atual
  - `messageLimit <= 0`: retorna um array de mensagens vazio
  - `messageLimit > 0`: retorna as `messageLimit` mensagens mais recentes

## Estratégia de ativação no cliente (primeira fase)

- Habilitado apenas no cenário de controle remoto Web: `messageLimit = 100`
- No desktop e em cenários sem controle remoto, o parâmetro não é enviado por padrão; o comportamento permanece inalterado

## Compatibilidade

- O novo parâmetro é um campo opcional e não afeta os chamadores existentes
- Chamadores antigos continuam funcionando sem qualquer alteração

## Sugestões para as próximas etapas

- Adicionar uma interface de paginação para mensagens antigas (cursor/beforeId)
- Adicionar uma entrada "carregar mensagens anteriores" na lista de chat da UI
- Migrar gradualmente o desktop para o carregamento sob demanda (gray release)