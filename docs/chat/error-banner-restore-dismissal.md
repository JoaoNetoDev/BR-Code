# Error Banner Dismissal (fatos atuais)

O estado de fechamento do banner de erro da conversa é um estado de UI local do pane: não pertence à projection da CLI e não é gravado no bucket Zustand do workspace.

- A impressão digital é composta por session, error code, tempo e message.
- O pane atual mantém apenas cerca dos 20 fingerprints descartados mais recentes, evitando que o mesmo erro reapareça repetidamente nesta visualização.
- Após trocar ou reconstruir o pane, é permitido exibir novamente o erro autoritativo que ainda exista; fechar o banner não limpa o estado de erro da CLI.
- Quando chega um novo fingerprint de erro, a exibição ocorre normalmente.

Ponto de entrada da implementação: `packages/ui/src/v4/SessionPane.tsx`.