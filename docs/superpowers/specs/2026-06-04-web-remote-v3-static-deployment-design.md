# Design de implantação paralela dos assets estáticos do Web Remote v3

> Arquivado: a parte de implantação foi substituída pela [tarefa de consolidação do Relay V2](../../issues/web-remote-control-relay-v2/07-contract-v1-removal-and-docs.md). Os passos antigos e as referências de infraestrutura que já migraram foram removidos e não podem ser usados como manual de operações da publicação atual.

O objetivo do design histórico era isolar os assets estáticos do mobile por caminho, evitando que os assets novos sobrescrevessem o App da versão antiga. Atualmente o V2 realiza esse isolamento por meio de diretórios de versão no OSS, veja [Implantação estática do Remote v4](../../web-remote-control/remote-v4-static-deployment.md).

A cadeia de testes independente de `/remote/__test__` continua sendo mantida; a construção, o push da imagem e a validação de roteamento seguem o documento atual de implantação estática. O comportamento final do pareamento de relay na camada da aplicação, do workspace bridge e da recuperação de tarefas está em [Relay V2](../../web-remote-control/relay-v2-pairing.md).
