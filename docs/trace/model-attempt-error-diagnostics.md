# Campos de diagnóstico de erro do model attempt

## Contexto

O `model_attempt` hoje guarda apenas a mensagem de erro normalizada. Quando uma requisição em
streaming é envolvida em um `TerminalStreamChunkError`, a exceção de rede real pode estar na cadeia
causal do erro envelopado, o que faz o ARMS ver apenas `terminated` e não consegue distinguir
reset de conexão, DNS, TLS ou outros erros de transporte.

## Objetivo

Ao encerrar um span de `model_attempt` que terminou com falha, manter os campos de sanitização já
existentes e gravar adicionalmente as informações de diagnóstico do erro no fim da cadeia causal:

- `error.cause.type`
- `error.cause.code`
- `error.cause.message`

Os valores dos campos precisam passar pelo sanitizador de erros já existente, com os mesmos limites
de comprimento e charset de `error.type` e `error.message`; não se deve gravar o corpo da
requisição, credenciais de autenticação ou o conteúdo completo da resposta.

## Regras de coleta

1. `TerminalStreamChunkError` precisa expor o `cause` do erro que ele envelopa, para que o
   classificador e a telemetria possam ler a exceção original ao longo da cadeia causal.
2. Os campos da cadeia causal só são gravados quando existe um erro aninhado e o erro de origem é
   reivindicado pela primeira vez; o span pai não copia novamente o corpo do erro.
3. Sem cadeia causal, o comportamento atual é mantido, e uma falha nos campos de telemetria não
   pode afetar a requisição do modelo.

## Exemplo de consulta

```sql
json_extract_scalar(attributes, '$["error.cause.type"]')
json_extract_scalar(attributes, '$["error.cause.code"]')
json_extract_scalar(attributes, '$["error.cause.message"]')
```

Esses campos podem ser agregados junto com `zcode.model_attempt.error_category`,
`zcode.model_attempt.failure_stage`, o código de status HTTP e os request/session id.

## Limite de merge e aceitação do Todo103

- Origem `79413e33cb`. Preserva a intenção de diagnóstico acima, sem restaurar o antigo
  `registry.ts` nem o `statusContext.model` aninhado; esta rodada não altera a seleção de modelo, o
  número de retries, os campos da requisição nem o texto de erro visível ao usuário.
- O campo cause é preenchido apenas quando existe um objeto de erro aninhado independente; um Error
  comum ou um cause autorreferente não pode registrar a si mesmo como causa raiz.
- Percorre uma única cadeia de envelopamento na ordem cause, depois adapterError e por fim error;
  preserva o limite original de oito níveis e a detecção de ciclos, sem ampliar para varrer
  quaisquer propriedades de objetos de erro.
- G13-A01: o wrapper de stream encerrado preserva o cause real; sem cause, mantém o adapterError; a
  identidade de message e adapterError não muda.
- G13-A02: causas aninhadas passam pela sanitização, e erros comuns e autorreferências não geram
  cause fictício; cadeias profundas e ciclos são limitados.
- G13-A03: em um exporter OTel real em memória, o primeiro span recebe a causa raiz sanitizada e o
  span pai não reporta de novo; spans sem causa aninhada não recebem novos atributos de cause.
- G13-A04: regressões de uso de streaming, finish reason original, parte das entradas de ferramenta
  e retry em modo ocioso. Quando o teste de finish reason original ainda referencia o
  AiSdkModelRegistry removido, migrar apenas para o TestProviderConfigFixture já existente neste
  arquivo, sem remover nem afrouxar as asserções originais.
- Este subgrupo tem apenas efeitos colaterais de log/telemetria e não altera a interação do App,
  sem novo E2E de UI; o comportamento de execução é verificado por testes de adapter e exporter
  reais. As demais fontes do Banner de erro de conversa continuam sob a verificação independente
  posterior do G13, que não pode ser substituída pela aprovação deste subgrupo.