# Documento de produto de Skills (alinhado ao z-work)

## 1. Finalidade do documento

Este documento define o design de produto da capacidade `Skills` no ZCode, com o objetivo de reutilizar e localizar o sistema de skills já validado no projeto de mesmo nível `z-work`, formando uma proposta de produto de skills implementável, operável e extensível.

## 2. Contexto e problemas

Atualmente o Agent já possui muitas capacidades em tarefas complexas, mas existem três problemas centrais:

- capacidades dispersas: o usuário não sabe “o que dá para fazer agora”;
- experiência não reutilizável: os processos da equipe têm dificuldade de cristalizar em capacidades invocáveis;
- congestão de contexto: injetar todas as explicações de uma vez aumenta o custo de tokens e reduz a estabilidade.

O valor central de `Skills` é empacotar “capacidade profissional + processo + recursos” em unidades de capacidade descobríveis e ativáveis sob demanda, reduzindo a carga de prompts e elevando a taxa de conclusão de tarefas e a consistência.

## 3. Objetivos de produto

- Estabelecer um mecanismo unificado de descoberta e ativação de skills, com carregamento sob demanda;
- Support skills pessoais e de equipe coexistindo, com prioridade explícita;
- Permitir que skills se vinculem a scripts, templates e materiais de referência, formando fluxos de trabalho completos;
- Oferecer na UI uma entrada de baixo custo (como disparo por `$` na caixa de entrada) e um painel gerenciável;
- Garantir que o processo de ativação seja auditável, autorizável e reversível.

## 4. Não objetivos (nesta fase)

- Não implementar um mercado de skills online multiplataforma na v1;
- Não construir um sistema de cobrança complexo na v1;
- Não executar automaticamente operações externas de alto risco na v1 (por padrão continua exigindo confirmação do usuário).

## 5. Usuários-alvo e cenários centrais

- **Desenvolvedores individuais**: instalam e reutilizam skills como “revisão de código / geração de documentação / verificação de release”;
- **Desenvolvimento em equipe**: cristalizam os SOPs da equipe em um catálogo de skills compartilhado;
- **Mantenedores da plataforma**: controlam qualidade e risco por meio da governança de skills (habilitar/desabilitar/versão).

Cenários típicos:

- um novo membro, após assumir o repositório, executa fluxos padrão rapidamente por meio das skills;
- ao lidar com tarefas repetitivas, invoca diretamente templates de skill já existentes;
- em tarefas complexas de várias etapas, o Agent julga e ativa automaticamente a skill correspondente.

## 6. Definição de termos

- **Skill**: um diretório com `SKILL.md` como núcleo, contendo metadados, instruções de execução e recursos opcionais;
- **Skill Catalog**: a lista de skills visível na sessão atual;
- **Skill Activation**: o processo de passar de “visível” para “carregada e executável”;
- **Skill Scope**: o escopo de validade da skill, com os níveis workspace e user.

## 7. Arquitetura de informação e convenção de diretórios

Tomando z-work como referência, adota-se a seguinte convenção de diretórios:

- `workspace skills`: `<repo>/.agents/skills/` (diretório alias compatível)
- `user skills`: `~/.agents/skills/`
- `extension skills`: embutidos em pacotes de extensão (versões posteriores)

Estrutura recomendada para cada skill:

```text
my-skill/
├── SKILL.md
├── scripts/
├── references/
└── assets/
```

Onde `SKILL.md` é obrigatório e contém no mínimo:

- `name`: identificador único da skill (recomenda-se que seja igual ao nome do diretório);
- `description`: descrição dos cenários de disparo e da capacidade (usada na descoberta e no casamento);
- `body`: regras de execução, processo e restrições de fronteira após a ativação.

## 8. Descoberta e prioridade das skills

Na inicialização da sessão o sistema carrega apenas metadados leves (name + description), sem carregar o corpo completo.

Prioridade de descoberta:

1. Workspace
2. User
3. Extension

Skills com o mesmo nome são sobrescritas pela prioridade mais alta, garantindo que as regras da equipe possam sobrescrever as capacidades padrão pessoais.

## 9. Mecanismo de ativação (fluxo central)

1. O usuário inicia uma tarefa;
2. O Agent casa a descrição da skill com a semântica da tarefa;
3. Em caso de casamento, é emitida uma solicitação de ativação (exibindo nome da skill, finalidade, caminho e escopo de permissões);
4. Após a confirmação do usuário, o corpo de `SKILL.md` e os recursos do diretório são carregados;
5. A skill entra no estado ativado da sessão e, durante a execução, seu processo é priorizado;
6. Ao fim da sessão o estado ativado expira (na próxima vez ela é reativada sob demanda).

Princípios de design:

- **Divulgação progressiva**: primeiro os metadados, depois o corpo;
- **Autorização explícita**: um ponto de confirmação para o usuário antes da ativação;
- **Privilégio mínimo**: só é aberto o escopo de acesso necessário ao diretório da skill.

## 10. Design de interação (MVP)

### 10.1 Entrada

Na caixa de entrada do chat mantém-se a dica de entrada de skills (como `$ for skills` / `$ 使用技能`), reduzindo o custo de aprendizado.

### 10.2 Painel de skills

Fornece um painel `Skills` com suporte no mínimo a:

- visualização em lista (nome, descrição, origem, estado);
- habilitar/desabilitar;
- troca de escopo (workspace / user);
- atualização manual do resultado da descoberta.

### 10.3 Entrada por comando (opcional)

Mantém-se a capacidade de gerenciamento por comando (alinhada à interação `/skills` do z-work), para operações em lote de usuários avançados.

## 11. Segurança e governança

- auditoria de ativação: registrar nome da skill, origem, horário de ativação e tarefa de origem;
- isolamento de risco: skills de alto risco exigem confirmação secundária;
- governança de versão: ao sobrescrever uma skill de mesmo nome, exibir origem e informação de versão;
- estratégia de fallback: em caso de falha na ativação, degradar automaticamente para o modo sem skill, garantindo que a tarefa possa continuar.

## 12. Métricas de sucesso

Após o lançamento, observar principalmente:

- `taxa de disparo de skills`: proporção de tarefas com participação de skills;
- `taxa de sucesso de tarefas com skill`: taxa de conclusão de primeira vez após ativar a skill;
- `tempo médio de execução`: se o tempo de tarefas do mesmo tipo diminuiu;
- `taxa de redução de operações repetidas`: quanto os passos manuais de fluxos padrão foram reduzidos;
- `satisfação do usuário`: feedback sobre a usabilidade e a controlabilidade das skills.

## 13. Sugestão de marcos

- **M1 (capacidade básica)**: descoberta por diretório, injeção de metadados, ativação manual;
- **M2 (gerenciável)**: página de lista + habilitar/desabilitar + gestão de escopo;
- **M3 (inteligente)**: ativação por casamento automático, auditoria de ativação, classificação de risco;
- **M4 (ecossistema)**: fontes de extensão, importar/exportar, marketplace de templates de equipe.

## 14. Questões em aberto

- Em caso de conflito entre skills, há suporte a uma “estratégia de merge” em vez de sobrescrita simples;
- Em concorrência de múltiplas sessões, o estado das skills precisa de isolamento e exibição em nível de sessão;
- Como definir a sincronização do diretório de skills e a estratégia de permissões no modo remoto;
- Se é necessária uma avaliação e ordenação automática do efeito da execução das skills.