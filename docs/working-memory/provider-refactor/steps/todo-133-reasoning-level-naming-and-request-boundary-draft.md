# Todo133: nomenclatura das faixas de raciocínio e fronteira de construção da requisição

> Estado: **Rascunho, apenas registro da discussão, sem autorização de implementação; o esquema de nomenclatura ainda não foi decidido.**
>
> 2026-09-12 o usuário pediu para registrar primeiro um rascunho e depois olhar outros problemas. Este item não faz parte das 19 entregas anteriores, não retoma automaticamente aquele Goal e não modifica configuração, migração nem SDK.
>
> Relacionado: [Todo95 — simplificação do mapa de faixas embutidas](./todo-95-builtin-reasoning-map-simplification-and-fallback.md), [Todo113 — segunda rodada de diretório e configuração](./todo-113-round2-research.md).

## Contexto e fatos já verificados

- O que preocupa o usuário é se modelos antigos e novos adotam o mesmo padrão de nomenclatura, e não apenas se um mesmo modelo já teve o nome trocado várias vezes.
- O commit `2c1addd3d8` do Todo95 mudou `off` de 24 regras e `nothink` de 1 regra para `disabled`; o `none` original do GPT-5.6 foi mantido. Hoje o ponto de entrada de conversão dos valores antigos trata apenas o `off/nothink` qualificado por origem.
- O commit `262c42e592` do Todo113 adicionou domínios de valores dedicados, contendo `none`, para GPT-5.4, Mini e Nano e Qwen3.8 Omni. Antes disso esses modelos não tinham configuração dedicada e podiam cair no fallback genérico, que só tem `disabled`.
- Portanto existe uma mistura de "modelos antigos usando o `disabled` normalizado e modelos novos usando o `none` nativo"; não foi encontrado caso em que os commits de unificação acima tivessem alterado o `none` nativo e depois o restaurado. A mistura é compatível com a exceção que permitia o `none` nativo na época, mas é preciso discutir de novo se essa exceção deve ser mantida.
- Na cadeia principal atual, a legalidade da faixa é validada primeiro, o SDK constrói o corpo da requisição e só então `model-option-map-fetch.ts` aplica o Reasoning Map ao JSON final. Nas cadeias de execução próprias que foram inspecionadas não foi encontrada seleção de ramo de empacotamento de mensagens por `reasoningLevel === "none"`; isso não prova que nenhum internamente do SDK tenha esse ramo, nem é uma falha de SDK confirmada.

```text
Faixa da Selection → validação de domínio → mantida como entrada do Map
                                 |
SDK constrói mensagens/corpo da requisição |
          |                      |
          +----→ aplicar o Reasoning Map → enviar a requisição

Se o SDK precisar do estado de raciocínio antes do empacotamento: um Patch no JSON final
talvez não cubra o comportamento dessa etapa.
```

## Preocupação do usuário

Não é insistência no uso do nosso próprio nome de desligamento, e também se considera seguir o do fabricante; mas o fabricante pode não ter uma faixa de string diretamente copiável, e o desligamento pode ser expresso por `thinking.type`, por um interruptor booleano, pela omissão de um campo ou por um ramo na construção da requisição. Unificar apenas o nome, ou copiar o do fabricante, não substitui a conferência da semântica de execução.

## Direções a discutir (nenhuma é uma decisão de implementação)

1. **Identificador interno único de desligamento**: configuração embutida unificada em `disabled`, com o parâmetro nativo expresso pelo Map; revogar a exceção do `none` nativo. É preciso avaliar o impacto nas escolhas existentes e nos Maps pessoais.
2. **Priorizar a nomenclatura do fabricante**: usar a faixa nativa quando ela existir; quando houver apenas uma chave booleana liga/desliga e nenhum nome nativo de desligamento, convencionar uma nomenclatura estável. É preciso aceitar ou resolver a inconsistência entre valores de escolha entre modelos, declarar claramente qual padrão os modelos novos adotam e não decidir caso a caso.
3. **Fronteira por etapa da requisição**: primeiro verificar se existe algum SDK ou interface específica que precise consumir o estado de raciocínio antes do empacotamento; se existir, definir onde ele deve ser adaptado corretamente. Isso não se resolve mudando o nome da string, e não se deve criar um estado global ou camada de conversão sem evidências.

## Investigação posterior e escopo de aceitação

- [ ] Confrontar as regras existentes de modelo, API e site, listar os valores de desligamento, os campos reais da requisição e a diferença entre raciocínio padrão, desligado e de baixa intensidade; verificar em especial os modelos sem enumeração oficial de desligamento.
- [ ] Rastrear o processo real de construção do SDK usado e validar, com capturas de requisição que distingam casos, se existe o problema de aplicação tardia do Map; não basta verificar que o campo alvo apareceu no JSON final.
- [ ] Definir separadamente as regras que seguem a nomenclatura da escolha, o texto de UI e os parâmetros da requisição, e só então decidir se a configuração ou o código de adaptação devem ser modificados.
- [ ] Se houver renomeação, avaliar as escolhas salvas com `none` e com o `disabled` de fallback, os domínios de valores pessoais e os Maps; delimitar um escopo de conversão limitado, sem substituição global de dados históricos.
- [ ] Após a decisão do esquema, atualizar primeiro o spec e adicionar testes que falham, e só então implementar; organizar a verificação pelo impacto real, sem usar o rascunho para disparar uma regressão ampla.

## Limites

- `minimal/low` não são automaticamente considerados desligamento; omitir o parâmetro não equivale automaticamente a desligar; modelos que não suportam desligamento não podem ganhar essa capacidade só por unificar a nomenclatura.
- Não deixar o Runtime genérico decidir comportamento de forma distribuída por adivinhamento de strings de faixa do fabricante; o Map atual responde apenas pelas mudanças de corpo de requisição que consegue expressar e não pode alegar cobrir todas as diferenças da etapa de empacotamento.
- Não alterar por conta própria domínios de valores ou Maps definidos pelo usuário, históricos de execução ou o Model em execução; o esquema de tratamento das escolhas antigas e novas precisa ser definido após a decisão formal deste item.
- Atualmente apenas o problema e as opções são registrados; não se anuncia uma nova falha de requisição e não se implementa a integração de planos do Kimi Code nem outras funcionalidades adiadas.
