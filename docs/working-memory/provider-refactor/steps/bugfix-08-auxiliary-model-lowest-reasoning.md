# Bugfix 08: chamadas do modelo auxiliar unificadas no nível de Reasoning mais baixo

> Status: concluído
>
> Data: 2026-08-28
>
> Origem: GLM-5.3 Flash gerando título sem carregar o nível público de Reasoning

## 1. Problema

Título de Session, título de Goal, Git Commit Message, Memory Recall Selector e teste de conexão de Provider são
chamadas curtas e de baixo custo ao modelo auxiliar.
Esses pontos de entrada hoje não compartilham a semântica de "Reasoning de baixo custo", e sim procuram individualmente, via `reasoningMode: "disabled"`, um Mapping `disabled`, `off`, `nothink` ou `none`.

Isso gera dois problemas:

- modelos que não permitem desligar o Reasoning mas expõem `low / high / max` (por exemplo GLM-5.3) acabam sem nenhum Mapping de Reasoning, e a requisição de título fica inconsistente com a capacidade pública do modelo;
- o código de negócio expressa "custo mínimo", enquanto a implementação expressa "desligar à força" e depende de adivinhar nomes de níveis específicos de Provider.

## 2. Semântica correta

Os `values` do Reasoning Enum são uma lista ordenada, da menor para a maior intensidade de raciocínio:

```text
reasoningLevel.values[0]             最低公开档位
reasoningLevel.values[1..n]          逐步提高
reasoningLevel.default               普通请求的默认档位（可以不是最低档）
```

"Menor nível" não é igual a "desligado":

- quando o modelo expõe `off / low / high`, o nível mais baixo é `off`;
- quando o modelo expõe apenas `low / high / max`, o nível mais baixo é `low`;
- quando o modelo não tem Reasoning Option Spec, nenhum nível é sintetizado nem adivinhado.

Conversa normal, Compact, Subagent, Repo Wiki e por aí vão continuam usando a escolha explícita do usuário ou `default`. Este Bugfix só altera os pontos de entrada declarados explicitamente como requisições auxiliares de baixo custo.

## 3. Cadeia de execução unificada

```text
辅助调用读取 Model.optionSpecs
                    |
                    v
          reasoningLevel.values[0]
                    |
                    v
      Model.bind / ModelRequest.reasoningLevel
                    |
                    v
          正常 reasoningMapping / Adapter
```

- Título e Git Commit Message fazem bind direto de `values[0]` no Model já criado;
- Memory Recall passa `reasoningLevel: values[0]` diretamente na Request única;
- o teste de conexão de Provider faz bind direto de `values[0]` no Model oficial, continuando a emitir a requisição pela mesma cadeia de Registry, ModelFactory, runtime headers e Adapter;
- remover `reasoningMode: "disabled"` e a varredura de Mapping de desligamento oculto que ele usava para escolher o nível auxiliar;
- não adicionar Policy, Resolver, Factory Input ou Request Option; o Adapter consome apenas o `reasoningLevel` normal;
- o Active Model continua imutável, e uma requisição única de Memory Recall não pode modificar suas `options`.

## 4. Escopo de impacto

| Entrada | Novo comportamento |
| --- | --- |
| Session Title | cria um Model auxiliar usando o nível público de Reasoning mais baixo |
| Goal Title | compartilha a mesma implementação do Session Title |
| Git Commit Message | independentemente do nível atual da sessão, o Model auxiliar usa o nível público mais baixo |
| Memory Recall Selector | a requisição única usa o nível público mais baixo do Model atual, e o Active Model não muda; o orçamento total de saída é herdado do Active Model |
| Teste de conexão de Provider | testa o Model oficial do Registry atual usando o nível público mais baixo; sem Spec, nenhum nível é sintetizado |

Não muda a seleção de modelo, a persistência de Session, o Provider Registry, o overlay Account/Personal, os defaults de requisições normais nem a semântica de restauração desktop/mobile.

## 5. Restrições de autoria de Schema e config

- o Provider Model Config Schema anota `reasoningLevel.values` como "ordenados da menor para a maior intensidade de raciocínio";
- o TypeScript Contract, o Provider Config Design, o Model Contract e as especificações de autoria built-in passam a explicar a semântica de ordenação;
- nos Built-in Configs, os Reasoning values existentes são ordenados do mais baixo para o mais alto e o `default` mantém o valor original, portanto o comportamento de requisições normais não muda;
- o Schema só valida não vazio e que `default` pertença a `values`. A ordenação correta e a ausência de valores duplicados são responsabilidade do publicador da configuração, sem validatorias complexas duplicadas no cliente.

## 6. Testes

Escrever primeiro os testes que falham, depois implementar:

- com Reasoning Spec, pega direto `values[0]`; sem Spec, não sintetiza nível;
- Session/Goal Title e Git Commit Message fazem bind de `values[0]` no Model já criado, sem mudar a Selection;
- a requisição única de Memory Recall usa o nível mais baixo e as options do Active Model permanecem inalteradas;
- o teste de conexão de Provider faz bind de `values[0]` quando há Reasoning Spec e não faz bind sem Spec;
- o teste de conexão de Provider continua usando a mensagem de usuário provider-neutral, sem restaurar corpo de requisição específico de Start Plan, branch por Provider ID ou autenticação específica de teste;
- Memory Recall herda o orçamento total de saída do Active Model, sem manter a antiga suposição de "256 fixo após desligar reasoning";
- o Adapter envia o nível mais baixo pelo Mapping de reasoning normal, sem varrer aliases ocultos de desligamento;
- a revisão das configs built-in confirma que os Reasoning values estão ordenados do mais baixo para o mais alto; o cliente não mantém outro conjunto de níveis conhecidos nem validação de ordenação;
- os testes direcionados de Core, Bootstrap, Adapters e Provider, além de `typecheck` e `lint` na raiz, passam.

## 7. Critérios de conclusão

- todos os pontos de entrada conhecidos de modelo auxiliar têm uma única implementação do nível mais baixo;
- nenhuma Reasoning Policy, Resolver, Factory Input ou Request Option foi adicionada;
- não existe `reasoningMode` no código de produção; a escolha do nível auxiliar não chama `resolveReasoningDisabledMappingKey`;
- as requisições auxiliares de GLM-5.3/Flash usam `low`, em vez de nenhum parâmetro de Reasoning;
- as requisições normais continuam usando a escolha explícita ou `reasoningLevel.default`;
- documentação, Schema, ordenação built-in e testes dão uma explicação consistente de que os "Reasoning values são ordenados".

## 8. Registro de implementação e verificação

- a implementação lê `optionSpecs.reasoningLevel.values[0]` diretamente em apenas três lugares: a cadeia compartilhada de Session/Goal Title, Git Commit Message e Memory Recall;
- foram removidos `reasoningMode`, as Model Request Options dedicadas, o Factory Input e a entrada interna de seleção de Mapping, sem nenhuma abstração substituta;
- o teste de completude de GLM-5.3/Flash confirma a ordem pública `low / high / max`, que o default normal continua `max` e que o Mapping do nível mais baixo é `low`;
- passam os testes direcionados de Contracts, Adapters, Bootstrap, Core e Provider Node;
- passam o `typecheck` da raiz, o typecheck dos pacotes da CLI afetados e o `lint`;
- a suíte completa de testes unitários passa: 1491 arquivos de teste aprovados, 1 pulado; 12720 testes aprovados, 25 pulados.
- a verificação de formatação dos 26 arquivos alterados e o `git diff --check` passaram; o `fmt:check` de todo o repositório continua bloqueado pela sintaxe HTML de exemplo do Electron já existente e por problema de leitura em `apps/zcode-cli/tests/gb2312.js`, não Ampliado nesta rodada.
- o Todo 42 foi além e removeu o falso parâmetro inválido de 256 Tokens do Git Commit Message, o branch especial de ignore correspondente no Core e a varredura de nomes de nível de desligamento no Adapter Telemetry; Title, Git Commit e Recall sem Reasoning Spec têm testes diretos.
- a revisão de 2026-08-30 descobriu que o teste de conexão de Provider ainda omitia o bind do nível mais baixo; este Bugfix o inclui na mesma regra direta de `values[0]`. A recusa de risco 3012, não reproduzível após o fim da campanha do Experience Plan, não foi alterada por adivinhação para virar um caso especial de Provider.