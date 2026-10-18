# Todo 45: Ferramenta de evidência do publicador para a Models API

> Status: a executar; a correção do catálogo real está bloqueada por falta de credenciais de acesso
>
> Data: 2026-08-28
>
> Origem: revisão dos fatos de modelos Built-in após a conclusão dos Todo 41/43

## 0. Posicionamento da tarefa

Fornecer aos mantenedores do Built-in Provider Config uma ferramenta de evidência pré-publicação. A ferramenta usa o `Endpoint + API Schema` da configuração oficial do Provider, combinado com o material de acesso fornecido na execução, para chamar a Models API do fabricante e gerar um relatório de diferenças entre os modelos visíveis com o material de acesso atual e `builtinModelIds`.

```text
ZCode Built-in Provider Config
        |
        | Endpoint + API Schema + builtinModelIds
        v
Publisher Models API Inspector <--- 执行期访问材料
        |
        v
实时模型目录 / 已录制 Fixture
        |
        v
结构化差异报告
        |
        v
发布者人工复核并修改 Built-in Config
```

É uma ferramenta de manutenção do publicador, não o Runtime do cliente, o Registry, uma Config Source ou uma quarta camada de Config Overlay. Por padrão a ferramenta apenas relata e não pode reescrever automaticamente `zcode-builtin.json`.

## 1. Localização e limites

A implementação reutilizável fica em:

```text
packages/provider-node/src/publisher/model-discovery/
```

Ali é possível reutilizar o Built-in Release Parser oficial, o Provider Schema e a capacidade de rede do Node, mas não se deve exportar pela raiz pública de `@zcode/provider-node`, evitando que o runtime da aplicação dependa da ferramenta de publicação.

O ponto de entrada fino do comando fica em:

```text
scripts/provider/inspect-builtin-models.mjs
```

O ponto de entrada do comando cuida apenas de argumentos, entrada do material de acesso e saída do relatório; requisições de protocolo, parsing de resposta e cálculo de diferenças precisam ser uma implementação testável. Recomenda-se um nome de comando que expresse “coletar e inspecionar evidências”, sem usar um `validate` genérico que sugira validação de negócio completa:

```bash
pnpm provider:inspect-models --provider minimax
```

## 2. Modos de evidência

A ferramenta deve oferecer três modos explícitos:

1. `live`: usa material de acesso real para chamar a Models API, formando evidência ao vivo com hora, Endpoint, Schema e identidade do Provider;
2. `fixture`: lê um Fixture de resposta já anonimizado e revisado, validando o parsing de protocolo e o algoritmo de diferenças;
3. `static`: verifica apenas fatos estáticos como a associação ao Built-in e o parsing de Rules, por meio do Parser oficial, sem acessar a rede.

O relatório de cada modo precisa marcar explicitamente o nível de evidência. Exemplos de documentação, Fixture e resposta ao vivo não podem ser misturados como se fossem a mesma coisa “verificada”.

## 3. Credenciais e limites de segurança

A maioria das Models API dos fabricantes exige API Key, OAuth Token ou material de acesso de conta. Sem material de acesso, normalmente se obtém apenas
`401/403`, o que não prova qual conjunto de modelos aquele Endpoint realmente enxerga no momento.

O material de acesso é injetado apenas na execução:

- Preferencialmente lido de variáveis de ambiente ou da entrada padrão;
- Proibido gravar em Built-in Config, Fixture, relatório de diferenças ou Git;
- Proibido passar em texto claro por argumentos comuns de linha de comando, para não entrar no histórico do shell nem na lista de processos;
- O relatório registra apenas o tipo de credencial e um identificador irreversível, nunca o valor original;
- Endpoints OpenAI-compatible e Anthropic-compatible do mesmo fabricante são requisitados e registrados separadamente, sem extrapolar de um para o outro;
- Membros específicos de conta, como Start/Individual/Team, continuam sendo regidos pelas interfaces de produto de conta e pelo Account Overlay; a Models API genérica não substitui a interface de direitos da conta.

Quando o fabricante não tem Models API, quando o Endpoint atual não suporta consulta de catálogo ou quando o material de acesso atual não tem permissão, o relatório precisa retornar explicitamente
`unsupported`, `unauthorized` ou `unavailable`, sem adivinhar o catálogo.

## 4. Motivo do bloqueio atual

O que está bloqueado é “corrigir de forma abrangente o Built-in Config usando interfaces ao vivo”, e não o código offline da ferramenta em si:

1. O ambiente de trabalho atual não tem material de acesso utilizável para cada fabricante Built-in;
2. A Models API retorna o “catálogo visível pelo material de acesso atual”, que pode variar entre contas, regiões e planos, e requisições anônimas não substituem isso;
3. Os caminhos de Models, a forma de autenticação e os campos de capacidade de resposta não são uniformes entre fabricantes, exigindo uma adaptação de protocolo por fabricante e confirmação por respostas reais;
4. A resposta OpenAI-compatible costuma provar apenas a identidade do modelo e não serve para corrigir contexto, limite de saída e capacidades multimodais que não são retornadas;
5. Antes de obter evidência ao vivo e revisão humana, a ferramenta não pode modificar automaticamente a configuração de publicação.

Portanto, a revision Built-in atual continua sendo a “versão corrigida por fatos do site oficial e do produto”, e não se pode afirmar que ela já passou por correção ao vivo via Models API de todos os fabricantes.
Para desbloquear a correção ao vivo, os mantenedores precisam fornecer ao fabricante-alvo material de acesso de teste utilizável, ou uma resposta real coletada e anonimizada em ambiente confiável.

## 5. Escopo de implementação

- Definir um resultado de discovery unificado, metadados de evidência e classificação de erros;
- Implementar adaptadores de Models API para OpenAI-compatible e Anthropic-compatible;
- Ler Provider, Endpoint, Schema e `builtinModelIds` do Built-in Release oficial;
- Gerar relatório de adições, ausências, membros em comum, diferenças de caixa e membros duplicados;
- Suportar saída em JSON e Markdown;
- Fixtures precisam estar anonimizados e trazer o Endpoint e o Schema de origem, o horário de coleta e o estado da evidência;
- A falha de um Provider não engole o relatório dos outros, mas o processo termina com status não zero para expressar a conclusão incompleta;
- Não entrar no startup do aplicativo, na atualização do Registry, na seleção de modelo ou na cadeia de requisição comum de modelo;
- Não escrever Config automaticamente nem mapear por adivinhação capabilities desconhecidas retornadas pela interface para dentro de Model Rules.

## 6. Testes e critérios de conclusão

- Usar Fixtures para cobrir OpenAI-compatible, Anthropic-compatible, não autorizado, não suportado, resposta malformada e paginação;
- Usar o Domain Parser real para ler o Built-in Release, sem copiar o Schema de Provider/Model;
- Provar que o relatório não contém o valor secreto da entrada;
- Provar que as diferenças de catálogo de modelos são comparadas apenas por identidade de Provider, Endpoint e Schema, sem mesclar entre Providers;
- Obter evidência real anonimizada de pelo menos um Endpoint OpenAI-compatible e um Anthropic-compatible;
- Gerar e revisar manualmente relatórios para todos os Built-in Providers que têm Models API e material de acesso fornecido;
- Providers sem material de acesso ou sem Models API mantêm a lacuna de evidência explícita, sem se passar por aprovado;
- Passar nos testes unitários relacionados, `pnpm typecheck` e `pnpm lint`, e fazer o commit no formato Conventional Commit.

## 7. Relação com a discussão histórica de gates de publicação

Este Todo resolve apenas a “coleta de evidência do catálogo de modelos ao vivo e o relatório de diferenças”. O Todo 19, já descontinuado, discutia um gate de publicação de integridade de negócio do Built-in Release muito maior, incluindo responsabilidade de publicação, integridade estática, publicação errada/rollback, admissão em CI e a defesa mínima do cliente.

Se um gate de publicação for reestabelecido no futuro, o relatório do Todo 45 poderá servir de evidência de entrada, mas o próprio Todo 45 não será promovido a gate de publicação obrigatório.