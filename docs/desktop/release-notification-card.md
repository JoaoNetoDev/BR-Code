# Cartão de Notificação de Lançamento do ZCode

## Objetivo

Após a publicação de uma versão oficial, `release:notify:feishu` usa o Zara para enviar ao grupo Feishu configurado um Cartão 2.0 com as notas de atualização. O conteúdo do cartão vem do diretório compartilhado `macos-arm64/latest.yml.releaseNotes`, editado pela infra, mantendo ao mesmo tempo uma hierarquia de informação clara e contida no mobile e no desktop.

## Estrutura de informação

- Header: número da versão, status de publicação oficial e ícone de notificação, com tema azul.
- Bloco de resumo: exibe apenas "esta atualização já foi publicada" e a quantidade de novos recursos / correções de problemas; não exibe CI, publicador nem endereços internos.
- Changelog: exibe apenas seções não vazias; "Novos recursos" tem prioridade de expansão, versões só de correções expandem diretamente "Correções de problemas" e títulos desconhecidos vão para "Outras atualizações", mantendo os itens completos.
- Links: apenas dois botões no rodapé, para o site oficial e a documentação, sem gerar callback no servidor.

## Visual e compatibilidade

- Usa Card 2.0 `schema: "2.0"` e largura `default`.
- As cores principais se limitam a azul, branco e cinza; sem gradientes, imagens grandes, emojis de comemoração ou decoração altamente saturada.
- A densidade do texto longo é controlada por padding interno do contêiner, fundo claro e seções colapsáveis, sem empilhar títulos grandes.
- O preview da conversa no Feishu precisa conter o número da versão; o cartão pode ser reencaminhado e, para clientes antigos sem suporte, o próprio Feishu faz o degrade na exibição.

## Limites de envio

- Tags de teste, sandbox release e `ZCODE_ENV=test` não enviam notificação oficial.
- Só após a publicação bem-sucedida de uma versão estável, a execução manual de `release:notify:feishu` envia.
- O pipeline de tag usa automaticamente `CI_COMMIT_TAG` como versão; um ensaio sem Tag com `CI_RELEASE_BRANCH=1` precisa fornecer explicitamente `ZARA_RELEASE_NOTIFY_VERSION`, caso contrário o Job de notificação falha antes de chamar o Zara.
- O escopo padrão de recebimento cobre 5 usuários confirmados do ZCode e os grupos internos e de beta da plataforma; é mantido de forma unificada em `ZARA_RELEASE_NOTIFY_RECEIVE_ID` separado por vírgulas, e ao adicionar um grupo a asserção de regressão do CI deve ser atualizada junto.
- A notificação oficial lê o `releaseNotes` de `${ZCODE_CI_SHARED_ROOT}/${TARGET_OUTPUT_DIR}/macos-arm64/latest.yml`; se o manifesto estiver ausente, se a versão for diferente da versão da notificação ou se o log estiver vazio, a execução falha diretamente, sem recorrer ao `CHANGELOG.md` do repositório.
- Cada destinatário recebe o envio de forma independente, com um `uuid` de Feishu estável derivado de "versão + destinatário"; a falha de um grupo não impede os grupos seguintes, e o erro final apresenta a lista de falhas. Depois de passar a janela de deduplicação de uma hora do Feishu, só é possível reenviar com precisão aos grupos que falharam usando `ZARA_RELEASE_NOTIFY_RETRY_RECEIVE_ID`.
- Antes do envio, são removidos os alvos de links Markdown e URLs internas em texto puro, e cartões que excedem o orçamento de segurança de 24 KiB são rejeitados, deixando margem de serialização para o limite de requisição de 30 KiB do Feishu.
- O dry-run apenas imprime o JSON do cartão, sem chamar a API do Feishu.
- Logs de falha de Zara/Feishu mantêm apenas status code, error code e um resumo mascarado de no máximo 500 caracteres, sem registrar a resposta completa do terceiro.