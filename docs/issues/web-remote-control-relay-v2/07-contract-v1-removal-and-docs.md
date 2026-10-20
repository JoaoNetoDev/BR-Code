# 07 — Consolidação: remoção do contrato V1 e da antiga cadeia de build Docker, alinhamento de documentação e aceite

**O que construir:** Depois que ambos os lados tiverem apenas a V2, fazer a fase de contrato: remover do shared o contrato de relay V1 e o suporte a `hash`/`t` do QR code, remover as três cadeias antigas de build Docker `/remote`, `/remote/v3`, `/remote/v4` e as referências à infraestrutura já migrada, consolidar os documentos de arquitetura e de implantação estática no comportamento final, sinalizar os designs antigos substituídos e concluir no ambiente de teste a matriz completa de aceite em aparelho real. Ao final, não deve haver no repositório nenhum caminho de código V1, nem script capaz de enviar indevidamente as páginas V2 para a implantação única antiga.

**Bloqueado por:** 03, 04, 05, 06

**Status:** in-progress

**Pai:** [Controle remoto Web com Relay V2: conectar o desktop após o login no celular](./01-relay-v2-login-pairing.md)

## Critérios de aceite

- [x] O shared remove os tipos de mensagem do relay V1, os ramos de parsing V1, os vetores de teste de proof, a construção e o parsing de `hash`/`t` do QR code e as constantes de heartbeat V1; os dois lados e os testes não têm nenhuma referência.
- [ ] Remover os Dockerfiles, a configuração do nginx, os scripts de build/push/verificação e os comandos de package.json de `/remote`, `/remote/v3`, `/remote/v4`; remover também os scripts auxiliares usados apenas por essas cadeias Docker, preservando os reaproveitados pelo pipeline OSS ou por `/remote/__test__`. A cadeia `/remote/__test__` e o pipeline OSS continuam funcionando.
- [x] Remover dos scripts e da documentação as referências ao repositório de infraestrutura antiga, às suas variáveis de ambiente de caminho e ao arquivo de Deployment antigo.
- [x] Consolidação da documentação: o documento de arquitetura remove a V1 e os parágrafos de implantação Docker, a seção "implantação estática" passa a descrever somente a cadeia OSS multiversão e a sinalizar que a implantação Docker antiga está congelada na última imagem V1; `remote-v4-static-deployment.md` remove em sincronia os parágrafos de Docker/Jenkins; `docs/superpowers/specs/2026-04-28-web-remote-login-design.md` recebe no topo a marcação de substituído por esta spec; `relay-v2-pairing.md` ganha as limitações conhecidas (link antigo com o desktop novo parado na página de espera, dispositivo offline sem `meta`, semântica negociada de `KICKED`) e a tabela de dependências externas.
- [ ] Executar e registrar no ambiente de teste a matriz completa de aceite em aparelho real em `relay-v2-pairing.md`: primeiro login por escaneamento, conexão direta já autenticado, seleção de dispositivo sem código, conta divergente e troca de conta, tomada por outro celular (esta máquina para de reconectar e exibe um aviso), desconexão do celular após o logout no desktop e restauração após o novo login, recuperação automática de `KICKED` causada pelo rolling do relay.
- [ ] Passar na verificação de consistência de todos os links, comandos e referências da documentação; `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, os testes unitários afetados e `pnpm verify:pre-push` passam.

## Registro de implementação (2026-09-19)

- Os tipos de relay V1, os vetores de proof, a sobrecarga de QR e as constantes de heartbeat foram removidos. O QR faz por padrão o parsing da V2 e rejeita os parâmetros de credencial antigos; o serializador de payload compartilhado passou a convergir por padrão o timestamp para segundos Unix.
- As três entradas antigas de build/push/verificação Docker de diretório único e os comandos npm correspondentes foram removidos. As ferramentas OSS foram preservadas; o script de publicação de teste independente agora só constrói e envia a imagem, e a lógica de atualização/MR do repositório de infraestrutura antiga foi removida.
- A construção real do Dockerfile de teste revelou patches faltantes; os patches, o provider, o public e as ferramentas de instalação via Git foram completados, e a regressão passou. Uma nova construção falhou na autenticação da dependência Git privada do CUA, e o smoke test do Docker ainda não foi concluído, portanto a disponibilidade completa não pode ser marcada.
- Os documentos de arquitetura, de implantação estática e de login foram alinhados ao comportamento final; os passos históricos de implantação foram arquivados e apontam para a entrada vigente. A matriz em aparelho real e as dependências externas estão em [Relay V2](../../web-remote-control/relay-v2-pairing.md#测试环境真机验收矩阵07), e todos os cenários em aparelho real continuam pendentes.
- O resultado completo da verificação está no registro de verificação 07 do mesmo documento. Como as verificações necessárias não foram todas concluídas, o status `in-progress` é mantido; conforme as regras do repositório, as alterações do workspace são preservadas e não há commit automático.
