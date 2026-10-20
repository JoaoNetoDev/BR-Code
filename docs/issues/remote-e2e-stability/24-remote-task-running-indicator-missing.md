# A sessão remota está gerando, mas a linha da tarefa no painel lateral não tem indicador de execução

Status: ready-for-human

Baseline de negócio `d31e735905cf744e75a0a93548a80acabe871ae5`, patch 08.
O `p0-main` do lote `r3-server-20261011143037600-31012b` falhou em 150.8 segundos.

A reprodução original usava resposta fixa de 1200ms, com a possibilidade de perder o estado de execução. Desta vez foi adotado um gate explícito: após a saída do primeiro trecho de resposta de B, o quadro de encerramento fica retido até a asserção do painel lateral ser concluída. Durante os 30 segundos de espera, o estado da linha da tarefa permaneceu sempre como `exists=true, inProject=true, active=true, error=false, running=false`.
Na gravação de falha, a área principal mostrava "trabalhando há 31 segundos", o indicador de geração e o botão de parar, mas a linha B não tinha indicador de execução.
Portanto, desta vez foram excluídos a conclusão antecipada da resposta, a inexistência da linha da tarefa e a atribuição errada.

```text
Primeira saída de B → o gate de reprodução bloqueia o encerramento → área principal continua trabalhando
  → linha B do painel lateral ativa, sem erro → nenhum ícone de running em 30 segundos
```

A linha atual usa `deriveTaskLeadingIndicator` para decidir o ícone de loading. É preciso conferir a projeção do TaskActivity remoto para a linha do projeto; a causa raiz única ainda não foi localizada em uma assinatura ou cache específico. O código de negócio não foi alterado.
O teste preserva a falha final, mas resume essa diferença de exibição não bloqueante no final, para continuar validando o isolamento de histórico de quatro turnos entre A/B e a telemetria; problemas de atribuição da linha, de estado ativo ou de estado de erro ainda interrompem de imediato. A segunda metade do lote atual ainda não foi alcançada; a reverificação posterior fica para outra rodada.

O patch 09, lote `r3-server-20261011150809016-2aeaba`, concluiu os quatro turnos e a telemetria, terminando em FAIL (209.1 segundos) por causa da ausência dos dois indicadores de execução nas linhas B. A e B tiveram cada um 2 agent_step e 2 message_completion, e as asserções de atribuição remota e de isolamento de histórico de cada um passaram; nas duas observações de B — primeiro envio e continuação — o resultado foi sempre active=true, running=false.

Evidências: os logs de execução e a gravação de falha do `p0-main` do lote acima; os testes focados dos quatro gates de reprodução HTTP reais passaram.
