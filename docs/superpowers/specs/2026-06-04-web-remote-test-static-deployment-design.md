# Design de deploy de recursos estáticos do Web Remote Test

> Arquivado: a parte de deploy foi substituída pela [tarefa de consolidação do Relay V2](../../issues/web-remote-control-relay-v2/07-contract-v1-removal-and-docs.md). Os passos antigos e as referências de infraestrutura que já migraram foram removidos, e este documento não pode servir como manual de operação da publicação atual.

O objetivo do design histórico era isolar por caminho os recursos estáticos do celular, para impedir que os recursos novos sobrescrevessem a versão antiga do App. O V2 atual implementa esse isolamento com diretórios de versão no OSS, conforme o [deploy estático do Remote v4](../../web-remote-control/remote-v4-static-deployment.md).

A cadeia de teste independente `/remote/__test__` continua sendo mantida; a build, o push da imagem e a validação de rotas seguem o documento de deploy estático atual. O comportamento final do pareamento de relay na camada de aplicação, do workspace bridge e da recuperação de tarefas está em [Relay V2](../../web-remote-control/relay-v2-pairing.md).
