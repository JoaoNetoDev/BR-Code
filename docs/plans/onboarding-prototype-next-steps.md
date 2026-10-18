# Próximos Passos do Protótipo de Onboarding

Data do registro: 2026-09-15. Branch: `prototype/onboarding-suggestions`.

## Necessidades Confirmadas

- Incorporar a etapa de migração de dados existentes ao novo onboarding, evitando que dois fluxos de
  entrada apareçam em sequência.
- Manter os três passos atuais: direção de trabalho → modo de UI → preferências do assistente.
- O modo de UI passa a usar o modo geral / de programação que já foi mergeado no staging; a memória do
  workspace mantém a terminologia da página de configurações.
- O projeto está na fase de iteração do protótipo; este documento registra necessidades e sugestões, e não
  significa que a interação de migração já esteja implementada nem que tudo esteja confirmado.

## Fatos da Implementação Atual

Após a conclusão do `OccupationOnboarding`, a aplicação renderiza o antigo `OnboardingDialog`. A ordem de
seleção da migração antiga é: conversas → Skills → servidores MCP → comandos → AGENTS.md → execução/resultado
da migração; as etapas de plugins e configurações de agentes estão temporariamente ocultas.

A origem das conversas é o histórico nativo do Claude Code; as demais categorias de importação usam a
capacidade de importação de recursos de agentes externos já existente. A etapa do AGENTS.md copia o
CLAUDE.md de nível de usuário do Claude para o AGENTS.md de nível de usuário do ZCode, exigindo uma
confirmação explícita antes da sobrescrita.

## Interação Sugerida (a confirmar)

Manter a barra de progresso das três preferências, tratar a migração como um ramo opcional após a conclusão
e não expandir as cinco categorias técnicas em cinco passos obrigatórios de primeira execução.

```text
登录／注册（顺序此前建议，尚待产品确认）
  → 工作方向 → UI 模式 → 助手偏好
  → 准备就绪：开始使用（主按钮）／导入已有数据（次按钮）
      ├─ 开始使用 → 工作区
      └─ 导入已有数据 → 选择内容 → 确认并导入 → 结果 → 工作区
```

- A página de preparação reaproveita o visual atual e remove a introdução duplicada da antiga página de
  boas-vindas. Explicar: "usou Claude Code e outras ferramentas? É possível importar conversas e
  configurações existentes, ou fazer isso mais tarde nas configurações".
- Não iniciar a migração sem escolha do usuário; só após entrar no ramo de importação a varredura é feita
  conforme a necessidade, distinguindo varredura em andamento, nenhum conteúdo encontrado e falha na
  varredura.
- A página de seleção concentra em um só lugar as cinco categorias: conversas, Skills, MCP, comandos e
  instruções de usuário; com a categoria expandida, escolhe-se a origem e os itens específicos, mantendo os
  controles existentes de destino, forma de importação e scope. Sem workspace, informar explicitamente que a
  importação em nível de projeto exige escolher um projeto antes.
- O modo geral continua permitindo importações; não ocultar capacidades com base na profissão ou no modo. Use
  rótulos fáceis de entender, como "histórico de conversas" e "instruções customizadas", mantendo os nomes
  técnicos como informação auxiliar.
- Área de ações: voltar / confirmar e importar; ao voltar, manter as seleções. Pré-visualizar o destino real
  da importação, os conflitos e o comportamento de sobrescrita. A sobrescrita do AGENTS.md mantém a
  confirmação explícita atual.
- A página de execução mostra o progresso real; a página de conclusão distingue sucesso, pulado e falha,
  oferecendo uma entrada para o workspace. Reaproveitar a confirmação de saída durante a execução em
  segundo plano; a capacidade de migração em segundo plano e de retry precisa ser confirmada separadamente e
  não é prometida antecipadamente.
- Usuários existentes, quem já concluiu as preferências ou quem já pulou a migração não vê o fluxo de novo;
  as configurações mantêm uma entrada para entrar na migração ativamente.

## Próxima Lista de Implementação

- [ ] Confirmar o desenho da página de preparação e do ramo de importação opcional, bem como a posição do
      login.
- [ ] Substituir o encadeamento dos guias antigo e novo por uma entrada de fluxo unificada, removendo a etapa
      de boas-vindas duplicada.
- [ ] Definir os limites de persistência para conclusão das preferências e para migração não escolhida /
      pulada / concluída, evitando que uma única flag controle todos os fluxos.
- [ ] Reaproveitar o serviço de migração e os controles de importação, unificando layout e os estados de
      varredura / vazio / erro / execução / resultado.
- [ ] Preservar a confirmação de sobrescrita, a proteção dos dados originais, o escopo de importação já
      existente e as regras de deduplicação.
- [ ] Alinhar desktop, workspace remoto e capacidades de celular; manter as fronteiras shared-host,
      workspaceIdentity e continuous / replayable.
- [ ] Só depois da confirmação de que o protótipo funciona, adicionar testes, o spec formal e preparar o
      commit.

Referências: `docs/ui/onboarding-migration-flow.md`, `docs/onboarding-external-agent-import-steps.md`. As
capacidades reais seguem a implementação atual.