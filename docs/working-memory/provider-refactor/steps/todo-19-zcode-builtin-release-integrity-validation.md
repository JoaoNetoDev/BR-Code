# 19 Gate de Publicação de Integridade do ZCode Built-in Release

> Status: obsoleto (não é mais um Todo independente)
>
> Data: 2026-08-25
>
> Origem: revisão de design do Todo 18; hoje explicitamente fora da primeira versão de sincronização remota

> Complemento de status em 2026-08-28: a fase B depois passou por
> `packages/provider-node/test/zcode-builtin-integrity.test.ts`, que cobre duplicidade de membros no arquivo Built-in real,
> parsing completo do Model Config, montagem do Registry após a complementação dos materiais de acesso e a proibição de
> salvar API Key, como prova estática/de integração; isso não equivale a este Todo estar concluído.
> O comando de publicação, a responsabilidade de publicação, a admissão no CI, publicação incorreta/rollback e o gate mínimo no cliente
> continuam sem decisão. Este arquivo é mantido como registro histórico de discussão e não volta a ser um item de execução independente;
> se no futuro for realmente necessário um gate de publicação, deve ser criado um novo Todo conforme o processo de publicação vigente.
> A ferramenta de evidência de catálogo em tempo real da Models API é registrada separadamente em
> [`todo-45-models-api-publisher-evidence-tool.md`](./todo-45-models-api-publisher-evidence-tool.md).

## 0. Posicionamento da tarefa

Este Todo discute quem deve provar a integridade de negócio do ZCode Built-in Provider Config e das Model Config Rules, e como o pipeline de publicação, a implementação de validação compartilhada e o runtime do cliente dividem as responsabilidades.

A decisão atual é: o Todo 18 não adiciona um validador de integridade de negócio Built-in exclusivo do cliente, nem injeta API Key, `accessId` de Account ou Request Auth fictícios para simular um Registry executável. O cliente do Todo 18 é responsável apenas pelo Release Envelope, pelo `schemaVersion`, pela `revision` e pelo parsing compatível com os Parser de Provider/Model Config existentes.

## 1. Questões a discutir depois

- Se o publicador precisa provar, antes de gerar a revision, que todos os fatos estáticos de Built-in Provider/Model estão completos;
- Como o gate de publicação reutiliza o Domain Parser oficial do repositório, evitando manter três conjuntos de regras no backend, no CI e no cliente;
- Como separar a integridade estática dos Providers de API, Account e Request Auth da executabilidade após a injeção de conta/credenciais;
- Se deve existir um comando de publicação independente `zcode-builtin validate` ou uma entrada de CI equivalente;
- Responsabilidade e fronteira de auditoria para falha de validação de publicação, publicação incorreta e rollback de emergência;
- Se o cliente precisa de algum gate mínimo de segurança de negócio além do parsing compatível.

## 2. Limite em relação ao Todo 18

O Todo 18 continua implementando:

- O Release Schema de duas camadas de Bundled, Remote e Environment Active Cache;
- A seleção de revision, o debounce de refresh de nível Environment, a persistência atômica e o refresh de Source;
- Manter o Active Cache atual quando algo não pode ser interpretado, o Schema não é suportado, a revision está desatualizada ou há falha de disco.

O Todo 18 não implementa:

- Um novo conjunto de regras de integridade estática Built-in;
- Julgar se um Release remoto pode ser publicado com base na conta atual ou no Personal Config;
- Serviço de publicação, auditoria de publicação ou CI de integridade de negócio.

Este Todo não entra mais na sequência de execução e não bloqueia as capacidades de transporte, cache e refresh do Todo 18.