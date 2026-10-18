# Atribuição do modelo do Project Memory e controle de Extraction de rodada única

## Conclusão

A escolha de modelo do Project Memory segue atribuição causal, em vez de reler a Session Selection mutável no início do trabalho em segundo plano:

```text
Active Model do Turn atual
        |
        +--> Semantic Recall (funcionalidade ainda desativada)
        |
        `--> Extraction agendada após a conclusão do Turn

Dream
`--> atualmente sem entrada de produto; não ajustada nesta rodada; será decidida
     à parte na refatoração geral posterior
```

- Semantic Recall serve o Turn atual, portanto usa o Active Model já criado para o Turn atual.
- Extraction é produzida por um Turn bem-sucedido, portanto o Snapshot salva o Active Model daquele Turn.
- Nenhuma das duas chains pode reler a Session Selection ou o Registry mutável no limite assíncrono para escolher o modelo.
- A identidade do Model, o Provider, as Properties e as vinculações de acesso ficam congeladas; uma requisição individual de Memory ainda pode sobrescrever opções de chamada como `maxOutputTokens` e reasoning via `ModelRequest.options`.

## Semantic Recall

O Semantic Recall permanece desativado hoje. Nesta rodada só se ajusta a atribuição do modelo, uma implementação de baixo custo, para limpar a releitura de Session Selection antes da abertura futura:

```text
Turn admission
      |
      v
Criar o Active Model desta rodada
      |
      +--> Main Loop
      `--> Recall Selector
             ├─ herda o orçamento total de saída já montado no Active Model
             └─ usa uma única vez a faixa de reasoning pública mais baixa
                (quando o modelo declara essa Option)
```

O Selector depende de uma saída em JSON Schema estrito. Quando o Active Model não declara essa capacidade, não é permitido procurar automaticamente outro modelo no Registry. A degradação para índice completo do `MEMORY.md` precisa ser concluída antes da abertura oficial do Semantic Recall; enquanto a funcionalidade estiver desativada, não se adiciona um segundo ramo de montagem de Context para ela.

O Recall expressa raciocínio de baixo custo por meio de uma Option dedicada à requisição:

```ts
model.generateText({
  // ...
  options: {
    reasoningLevel: model.optionSpecs.reasoningLevel?.values[0],
  },
});
```

`reasoningLevel.values` é ordenado do mais baixo ao mais alto; o Recall usa diretamente o primeiro item no `ModelRequest` atual e continua passando pela cadeia normal de Option Spec Map/Adapter. A faixa mais baixa não exige que o modelo suporte desligar Reasoning.

O Recall não adivinha o thinking budget do Provider no Core; o orçamento total de saída é herdado do Active Model, e reasoning e max-output são projetados pela mesma cadeia de Option Map. O JSON Schema estrito continua restringindo o formato da resposta.

## Extraction

O Extraction Scheduler mantém a semântica limitada atual: no máximo um Snapshot em execução e um Snapshot pending mais recente. A implementação atual já mantém no Snapshot um Model criado no momento do agendamento; passar a salvar o Active Model do Turn que produziu o trabalho não aumenta o número de Models retidos nem cria um novo ciclo de vida de recurso.

```text
Turn bem-sucedido
   |
   | Active Model + fronteira de mensagens + estado de ferramentas/leitura
   v
Extraction Snapshot
   |
   +--> running (no máximo um)
   `--> latest pending (no máximo um, sobrescrevendo um pending mais antigo)
```

A Extraction continua anexando às suas próprias requisições de modelo telemetry independente, `skipTranscript` e permissões das ferramentas de Memory, mas isso pertence ao Invocation Context e não pode servir para recriar ou reselecionar o modelo.

## Pular Extraction em uma única rodada

O CLI/Core ganha um parâmetro opcional na execução `modelExecution` já existente:

```ts
modelExecution: {
  // ...restrições de Selection já existentes no escopo da execução
  memoryExtraction?: "skip";
}
```

Ele tem os seguintes limites:

- Afeta apenas os Turns bem-sucedidos que carregam esse parâmetro.
- Não modifica o `memory.extractionEnabled` da Session.
- Não escreve na Session Selection, no histórico de mensagens nem na configuração persistente.
- Não afeta o Recall, as chamadas de ferramentas de Memory em primeiro plano nem o Dream.
- Um Turn comum não passa o parâmetro por padrão e continua obedecendo ao interruptor de Extraction de nível de Session.
- O despacho Off-Peak passa explicitamente `"skip"`, garantindo que a Memory Extraction automática não seja executada, evitando que credenciais de uso único sejam reutilizadas pelo trabalho em segundo plano depois que o Turn principal termina.

Protocolo e cadeia de chamada:

```text
Host Off-Peak dispatch
        |
        | sendText.modelExecution.memoryExtraction = "skip"
        v
Protocol V4 admission
        |
        v
SubmitPromptOptions / ExecuteTurnOptions
        |
        v
Turn bem-sucedido
        |
        +-- skip --> não agenda Extraction
        `-- absent -> agenda conforme o interruptor de nível de Session
```

Esse campo compartilha a fronteira de rodada única `modelExecution` já existente com a Selection de escopo de execução, o material de acesso do período da requisição e as restrições de subagente; ele não entra no Submission Intent enfileirável. O chamador atual é apenas o despacho Off-Peak, que exige início imediato em idle, portanto nada se perde no CommandInbox.
