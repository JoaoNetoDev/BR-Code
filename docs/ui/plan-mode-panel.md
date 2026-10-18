# Estado do modo de planejamento (fatos atuais)

Os antigos `PlanModeToolPanel` e as abas "planejar/dados brutos" foram removidos. Atualmente, o estado unificado de plan/goal/todo é exibido no `ConversationStatusPanel` da V4; a troca do modo de colaboração passa por `switchCollaborationMode` e pela barra de ferramentas do composer.

O painel de estado apenas renderiza uma projeção: não mantém fatos independentes do plano nem oferece a antiga aba de dados brutos.