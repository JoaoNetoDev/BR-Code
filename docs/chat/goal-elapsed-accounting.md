# Contabilização do Tempo Decorrido do Goal

A projeção `GoalState` da V4 contém, para o target atual, `timeUsedSeconds` e `activeRunStartedAtMs`. O target reducer do CLI continua sendo a única fonte autoritativa do tempo acumulado; o live delta, o cold snapshot e os renderizadores do desktop/web consomem os mesmos campos.

Fórmula de exibição:

```text
active elapsed = timeUsedSeconds + floor((now - activeRunStartedAtMs) / 1000)
paused/terminal elapsed = timeUsedSeconds
```

- O renderer pode atualizar `now` com um intervalo de 1 segundo, mas não deve escrever o tick de volta na session, no store, no relay nem no main process.
- `pauseGoal` primeiro deixa o target reducer contabilizar o intervalo ativo desta execução em `timeUsedSeconds` e só então entra em paused; em seguida a UI congela a exibição.
- `resumeGoal` estabelece um novo `activeRunStartedAtMs`, sem zerar o valor acumulado histórico.
- Estados terminais como verified/failed congelam o valor acumulado; a consistência precisa ser mantida ao reabrir, na restauração a frio e após a restauração replayable no celular.
- Quando `activeRunStartedAtMs` está ausente ou é posterior ao horário atual, exibe-se apenas o valor base acumulado, sem gerar números negativos ou `NaN`.

`pauseGoal` não equivale ao stop genérico: o primeiro altera explicitamente o estado de produto do target e pode ser executado mesmo sem trabalho de provider em curso; o segundo apenas encerra a execução atual e entra no fluxo existente de queue hold/disposition.