# Tarefa seguinte: observabilidade da inicialização do tasks-index no Host

> Escopo mais recente: foi incorporado ao [Todo 145: preparação unificada do banco de dados antes de entrar no ZCode](./todo-145-global-database-startup-loading.md) e não é mais adiado separadamente. Abaixo está o registro de escopo da rodada anterior; a construção do Repo e o momento real de abertura/migração precisam ser reconferidos conforme o novo TODO.

Status: a ser projetado separadamente; não faz parte do hotfix de session store da sessão do Todo 144.

Em 2026-09-14, após a discussão sobre a escala da alteração, ficou confirmado que o escopo do session store seria concluído primeiro.
Os Repos da parte do Host abrem ou migram tasks-index.sqlite sincronamente antes da publicação do serviço; nesse momento o serviço de estado do session store ainda não está disponível.
É preciso projetar primeiro o provedor de estado, a thread de execução do banco, a ordem de liberação dos serviços dependentes, o scheduler/bot em segundo plano e os limites de retentativa em caso de falha, e só então implementar.

- [ ] Mapear a inicialização e o momento de migração de AutomationRepo, OffPeakTaskRepo e TaskIndexRepo.
- [ ] Decidir entre um Worker de migração ou a inicialização adiada de serviços; o Main mantém a responsabilidade de agendamento e repasse.
- [ ] Manter o SQLite como único coordenador de migração do mesmo banco físico, evitando adicionar outro lock de migração no Host.
- [ ] A observação da fase é possível antes da publicação do serviço; o negócio que depende dos Repos só é liberado após o commit da transação.
- [ ] Validar múltiplas janelas, Host remoto, shared-host no celular, crash/reconexão e recuperação de falhas.

O session store e o índice de tarefas são arquivos diferentes; seus respectivos locks e estados de conclusão não podem ser misturados.