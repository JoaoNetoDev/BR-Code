# Tarefas de intervalo Cron do lado da sessão (`intervalUnit` / `interval`)

## Objetivo

Quando a conversa cria ou altera, via `CronCreate` e `CronUpdate`, tarefas de “a cada N minutos / horas / dias /
semanas / meses / anos”, a semântica de agendamento precisa ser a mesma da “repetição personalizada” da UI de
tarefas agendadas:

- As unidades suportadas são `minute`, `hourly`, `daily`, `weekly`, `monthly` e `yearly`.
- `interval` deve ser um **inteiro de 1 a 200**; `0`, números negativos, decimais e valores acima de `200` precisam
  ser rejeitados no contract, no protocolo e na boundary do service.
- A semântica real de repetição é definida pelo `scheduleRule` persistido; `cronExpr` é mantido apenas como
  expressão de compatibilidade válida, e a frequência real não pode mudar por causa dos limites de passo dos
  campos do cron.
- Os valores de retorno de `CronList`, `CronCreate` e `CronUpdate` precisam trazer `scheduleRule`, para que o card
  da sessão possa exibir a frequência real em vez de ler o cron de compatibilidade como “a cada hora”.

Os intervalos de entrada e a semântica da repetição personalizada da UI são a fonte de verdade desta
funcionalidade: `docs/ui/scheduled-tasks-main-view.md`.

## Causa raiz

O cron padrão de cinco campos tem limites de passo por campo: minutos 59, horas 24, dias 31, meses 12. Portanto as
expressões a seguir são inválidas:

- A cada 61 minutos: `*/61 * * * *`
- A cada 31 horas: `49 */31 * * *`
- A cada 32 dias: `0 9 */32 * *`
- A cada 13 meses: `0 9 15 */13 *`

Se o intervalo acima do limite for escrito direto no cron, a camada de serviço rejeita a tarefa na validação
`isValidCronExpr`; e mudar silenciosamente para um cron de cada minuto/cada hora altera incorretamente a
frequência da tarefa.

## Modelo de Entrada Controlada

A ferramenta Cron mantém `cron` e ganha um par de campos opcionais:

```ts
intervalUnit: "minute" | "hourly" | "daily" | "weekly" | "monthly" | "yearly";
interval: 1..200;
```

`intervalUnit + interval` expressa a semântica de “repetição personalizada” da UI, e não permite que o modelo
submeta diretamente o `scheduleRule` interno.

### Regras de uso

1. Quando o usuário expressa “a cada N unidades”, a ferramenta precisa submeter os **dois** campos de interval,
   mesmo que `N` possa ser expresso por cron (por exemplo, a cada 20 horas). Isso é para avançar por
   `scheduleRule.anchorAt`, igual à repetição personalizada da UI, em vez de regredir para um cron de relógio de
   parede.
2. `cron` continua obrigatório, para especificar a hora, o dia da semana, o dia do mês ou o mês na expressão de
   compatibilidade; ele precisa ser um cron de cinco campos válido e serve apenas como carrier de
   exibição/compatibilidade do `scheduleRule`.
3. O carrier não pode ser usado junto com o atraso relativo pontual `delayMinutes` / `relativeDelayMinutes`.
4. O carrier pode ser combinado com os `recurring` / `maxRuns` existentes; ele define apenas “como calcular a
   próxima ocorrência”, e o número de execuções continua controlado pelas regras de lifecycle existentes.
5. Um cron comum sem carrier mantém a semântica antiga, evitando mudar tarefas existentes de data absoluta, dia útil
   ou tipo calendário.

### Cron de compatibilidade válido

O servidor executa o intervalo real pelo `scheduleRule`; o chamador só precisa fornecer um cron válido sem passos
fora dos limites:

| Semântica real | carrier | Exemplo de cron de compatibilidade válido |
| --- | --- | --- |
| A cada 200 minutos | `minute`, `200` | `* * * * *` |
| No minuto 49, a cada 31 horas | `hourly`, `31` | `49 * * * *` |
| Às 09:00, a cada 40 dias | `daily`, `40` | `0 9 * * *` |
| Às 09:00, nas segundas/quintas/sextas, a cada 8 semanas | `weekly`, `8` | `0 9 * * 1,3,5` |
| Às 09:00 do dia 15, a cada 13 meses | `monthly`, `13` | `0 9 15 * *` |
| Às 09:00 de 15 de junho, a cada 2 anos | `yearly`, `2` | `0 9 15 6 *` |

## Fluxo de dados

```text
CronCreate / CronUpdate
  { cron, intervalUnit, interval }
             |
             v
contract + protocol
  pair + 1..200 + recurrence invariant validation
             |
             v
Host AutomationService
  buildIntervalScheduleRule(intervalUnit, interval, cronExpr, Date.now())
             |
             +--> scheduleRule       (权威的真实调度)
             +--> cronExpr           (合法兼容/展示)
             |
             v
computeScheduleRuleNextRunAt(scheduleRule)
             |
             v
持久化 / 返回 scheduleRule
             |
             v
会话卡片 describeAutomationCardSchedule
  优先读取 scheduleRule，展示真实“每 N 单位”
```

## Boundaries Multicliente e de Host Antigo

Esta funcionalidade apenas estende o protocolo de automação app ↔ agent já existente; a cadeia de mensagens de
sessão do desktop continuous e do remote replayable do celular não muda. Workspaces remotos continuam tratando as
requisições pelo seu host attachment já existente.

Quando o schema estrito de um Host antigo não reconhece os novos campos, não é possível fazer fallback para uma
tarefa cron comum, porque isso gravaria frequências reais como 31 horas ou 40 dias de forma errada em “a cada
hora”/“a cada dia”. Essas requisições precisam falhar com uma indicação explícita de que o Host não suporta o
carrier de interval; os antigos `CronCreate`/`CronUpdate` sem carrier continuam compatíveis.

## Requisitos de verificação

1. Contract / protocolo: `1` e `200` são válidos; `0`, `201`, decimais, par de campos incompleto e mistura com atraso
   relativo são inválidos; tarefas com número de execuções limitado podem carregar o carrier.
2. Create e Update precisam cobrir a cadeia completa contract → port → protocol → Host → service.
3. Cobrir pelo menos `61/200` minutos, `25/200` horas, `32/200` dias, `13/200` meses e `2/200` anos; todos os
   crons de compatibilidade precisam passar na validação de cron, e a próxima execução precisa ser calculada pelo
   `scheduleRule` real.
4. As saídas de Create / Update / List precisam devolver `scheduleRule`, e o card de sucesso da criação da sessão
   exibe a frequência real.
5. Regressão das restrições de `1–200` da repetição personalizada da UI e do cron de compatibilidade quando os
   limites de campo do cron são ultrapassados.