# Provider Refactor Design V2

> Status: entrada do design vigente
> Baseline: implementação do branch Provider Refactor no momento da criação deste diretório e as
> decisões já adiadas
> Escopo: Provider / configuração de Model, resolução, Registry, criação de Model, overlay de
> conta, projeção de configurações e limite de execução

## Por que criar a V2

O Provider Refactor passou por várias rodadas de design, implementação, feedback em máquina real e
correções de fronteira. Os antigos `design/`, `steps/`, `research/`, `plan/` e logs de
implementação preservam o processo completo, mas neles coexistem:

- o design vigente já implementado;
- designs de fase substituídos explicitamente por Todos posteriores;
- candidatos de pesquisa usados apenas para descobrir problemas e nunca tornados design;
- registros históricos de implementações concluídas;
- trabalhos adiados, em rascunho ou ainda em execução;
- terminologia e Schema antigos que não correspondem aos fatos atuais do código.

Este diretório deixa de acumular contexto por fase de migração e passa a ser reorganizado em duas
linhas:

1. [`design.md`](./design.md): escreve apenas o design, princípios e fronteiras centrais que devem
   ser respeitados atualmente;
2. [`evidence-and-contradictions.md`](./evidence-and-contradictions.md): registra a origem das
   evidências, contradições históricas, decisões, diferenças de staging e pendências, para
   consulta e auditoria.

## Ordem de autoridade

Em caso de conflito, avalie na seguinte ordem:

1. A decisão explícita mais recente do usuário e os designs subsequentes já aceitos;
2. Os fatos de implementação comprovados pelo Schema, Resolver, Registry, ModelFactory e seus
   testes no domínio atual;
3. O design vigente deste diretório;
4. O conteúdo do antigo `design/` que ainda não foi substituído por decisões posteriores ou pelo
   código;
5. As conclusões finais de Todo / Bugfix concluídos;
6. Research, Draft, Delayed Todo, logs de implementação e planos históricos.

O item 2 só prova "o que está implementado agora" e não pode derrubar o item 1. Quando a
implementação diverge de um design já decidido, isso deve ser registrado como drift de
implementação e a implementação corrigida; não se pode promover um comportamento de código
acidental a design.

## Como ler

- Para entender o que o Provider Refactor deve resolver e por que o sistema é dividido assim: leia
  [`design.md`](./design.md).
- Para verificar se um campo, termo ou Todo antigo ainda é válido: consulte
  [`evidence-and-contradictions.md`](./evidence-and-contradictions.md).
- Para revisar um processo de migração específico, evidências de teste ou incidentes históricos:
  volte ao `steps/`, `research/` e `plan/` do nível acima.

## Regras de manutenção

- Novas decisões centrais de design do Provider atualizam primeiro `design.md` e só depois o código.
- Quando material antigo conflitar novamente com o design vigente, não reescreva o material
  histórico; acrescente um registro de decisão no documento de consulta.
- Apenas conteúdo com decisão concluída e dentro do objetivo vigente pode entrar em `design.md`.
- Draft, Delayed, Research ou implementações em execução ainda não verificadas devem permanecer na
  seção de pendências do documento de consulta.
- Este diretório não introduz novos objetos de domínio; "V2" é apenas uma versão de organização
  documental, não uma versão de runtime, de Config Schema ou do protocolo de migração.