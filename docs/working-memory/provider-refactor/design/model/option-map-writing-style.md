# Estilo de escrita do Option Map

> Status: já decidido; 2026-09-09. Aplica-se à escrita e à revisão dos Option Maps específicos do
> Built-in e dos de fallback.
> Este documento especifica apenas como as expressões são escritas e como são exibidas, e não
> estratégias de migração, compatibilidade histórica ou de refatoração de funcionalidade.

## 1. Princípio geral

Simplificar a lógica das expressões, mas não comprimir a estrutura. O critério é a legibilidade
na caixa de texto da página de configurações, não o número de linhas físicas do arquivo JSON de
configuração.

- Objetos aninhados são expandidos por nível, com indentação uniforme de dois espaços; campos
  irmãos ficam em linhas separadas.
- Expressões ternárias simples e não aninhadas permanecem na mesma linha, sem serem quebradas
  mecanicamente em três linhas.
- Condições complexas ou aninhadas quebram por ramo, com a indentação indicando a pertença; quando
  forem longas, a quebra é feita por semântica, sem depender da quebra de linha suave da caixa de
  texto para expressar a estrutura.
- Objetos simples de um único nível podem ficar na mesma linha; não é exigido que todos os Maps
  sejam expandidos.

```js
{
  "thinking": {
    "type": reasoningLevel == "enabled" ? "enabled" : "disabled"
  }
}
```

Objeto simples de um único nível:

```js
{"max_tokens": maxOutputTokens}
```

## 2. Condicionar onde há diferença

- Quando apenas o valor do campo difere, compartilhe a estrutura do objeto e desça a condição para o
  campo correspondente.
- Quando o ramo altera se o campo existe ou a estrutura do objeto, mantenha o branch em nível de
  objeto, sem encaixar campos sem relação para reduzir a quantidade de branches.
- Não expanda repetidamente objetos completos quase idênticos.

Quando um branch de objeto é necessário, por exemplo:

```js
reasoningLevel == "disabled"
  ? {
      "thinking": {
        "type": "disabled"
      }
    }
  : {
      "thinking": {
        "type": "adaptive"
      },
      "output_config": {
        "effort": reasoningLevel
      }
    }
```

O exemplo ilustra apenas a forma de estruturar; não exige que todos os modelos usem esses campos
ou níveis.

## 3. Passar adiante quando possível

Quando o valor aceito pelo campo de destino é igual ao valor da Option à qual pertence, use
diretamente a variável, sem listar cadeias de condições sinônimas do tipo `low → low / high → high /
max → max`. A conversão só é feita quando necessário, no estado desligado ou quando o valor da
interface difere.

As variáveis usam o nome oficial da Option à qual pertencem, por exemplo `reasoningLevel` e
`maxOutputTokens`; não se introduz um `value` genérico e ambíguo.

## 4. Propriedade da formatação

- Quebras de linha e indentação ficam preservadas na string de origem do Map do Built-in; no
  arquivo JSON isso pode aparecer como escape `\n`.
- A GUI exibe a string de origem como ela é, sem adicionar um segundo formato de exibição, um
  Formatter Service ou um rearranjo em runtime.
- O Personal Map do usuário não é formatado automaticamente; abrir, visualizar ou cancelar a
  edição não pode gerar override pessoal nem gravação em disco por causa da formatação.
- Esta especificação se aplica tanto aos Maps específicos quanto aos de fallback, independentemente
  de fornecedor, tema, idioma e largura de janela.

## 5. Separação das regras de refatoração

"Modificar uma regra existente exige manter o comportamento da requisição equivalente", "migrar ou
não os níveis antigos" e "dar compatibilidade ou não com as configurações antigas" pertencem ao
escopo do Todo de refatoração correspondente, e não são regras de estilo de escrita. Esses
conteúdos não podem ser misturados às exigências de estilo deste documento.

Relacionados: as convenções de formatação originais estão em
[Todo66](../../steps/todo-66-option-map-variable-naming-and-display-formatting.md); a correção de
regressão desta rodada está em
[Todo98](../../steps/todo-98-builtin-option-map-formatting-regression.md).