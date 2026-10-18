# Notificação de artefatos de build do CI via Feishu Card 2.0

## Escopo

Esta especificação cobre apenas a notificação de fase de build `notify:feishu:<platform>:<arch>`, sem alterar a notificação de release oficial `release:notify:feishu`. Após o sucesso do build de cada plataforma ainda é enviada uma mensagem; sandbox/test tag continuam pulando a notificação; e a falha no envio da notificação continua não bloqueando o pipeline principal.

## Contrato da mensagem

A notificação é montada pelo script de CI como um Feishu Card 2.0 e entregue pelo serviço genérico de notificação do Feishu do zcode-internal:

```
POST <ZCODE_FEISHU_NOTIFY_BASE_URL>/api/v1/feishu/messages
Authorization: Bearer $ZCODE_FEISHU_NOTIFY_TOKEN
```

O serviço entrega usando o aplicativo ZCode Infra; o lado do CI não mantém mais credenciais de aplicativo do Feishu. O `scene` é `ci.build.completed` / `ci.build.failed`; os destinatários preferem o `FEISHU_RECEIVE_ID` do próprio CI (passado explicitamente ao serviço), e, quando não configurado, caem para o destinatário padrão da cena no servidor. Os campos usados pelo Template original permanecem inalterados:

- Título: `构建完成 · 测试/生产 · <平台架构> · <分支名>`
- Branch: `CI_COMMIT_REF_NAME` (exibido apenas no título)
- Committer: `CI_COMMIT_AUTHOR`
- Commit message: `CI_COMMIT_MESSAGE`

O @ do autor do commit passa a ser o placeholder `{{mention:<CI_COMMIT_AUTHOR>}}` dentro do card, resolvido pelo serviço de notificação, a partir do diretório unificado「人员配置」, em `<at id=ou_xxx></at>` — esse diretório é justamente o mantido na página「人员配置」do console, cobrindo os 15 usuários do GitLab da antiga tabela de referência `zcode-labs`. Também é possível especificar @ adicionais por `FEISHU_MENTION_OPEN_IDS` (lista de `open_id` do Feishu separada por vírgulas); esses ids explícitos continuam embutidos diretamente no card. Quando o placeholder não é encontrado, o serviço degrada para texto simples e não forja @; quando não há match e não há configuração adicional, o bloco「相关人员」não é renderizado.

O card de sucesso não exibe a URL do artefato diretamente no corpo, mas oferece um botão “下载产物” no rodapé do corpo; o card de falha não exibe a URL do artefato e oferece um botão “查看失败 Job” no rodapé do corpo, que navega para o `web_url` do Job de build correspondente que falhou na mesma pipeline; esse endereço é obtido por `notify-feishu-ci.mjs` consultando os Pipeline Jobs do GitLab usando a variável de CI `GITLAB_ACCESS_TOKEN` (ou a `GITLAB_PRIVATE_TOKEN` compatível). Quando a URL correspondente não existe, o botão não é renderizado; quando a consulta falha, o Job de notificação de falha termina com status diferente de zero e imprime o motivo.
Os dois botões usam estilo de contorno `default` e largura adaptativa `default`.

Ambiente, arquitetura, quem disparou e branch são tratados apenas no título ou em variáveis internas e não são mais exibidos como campos independentes no corpo. O card usa Card 2.0 com `schema: "2.0"`, header azul e bloco de informação claro; os botões servem apenas para abrir o artefato ou o endereço do Job, sem novos callbacks externos ou outras interações de negócio. Textos longos devem ser escapados com segurança no JSON do card e passar por uma validação de tamanho compatível com os limites de requisição do Feishu; autor do commit e mensagem de commit, tratados como entrada não confiável, têm escapamento unificado de caracteres especiais de Markdown/HTML e limite de comprimento.

Em caso de falha de build, é adicionada a notificação de falha para a plataforma correspondente: no título “构建完成” é substituído por “构建失败”, o corpo exibe autor do commit e mensagem de commit e oferece o botão com o endereço do Job do GitLab; o card de falha não exibe o endereço de download do artefato. Quem disparou e o branch não são exibidos como campos independentes no corpo.
O card de sucesso usa Header azul e o ícone `success_colorful`, e o card de falha usa Header vermelho e o ícone `fail_colorful`, garantindo que os dois estados sejam diferenciados rapidamente na lista de notificações.

Após configurar `FEISHU_HEADER_ICON_IMAGE_KEY`, o Header passa a usar o `custom_icon` do Feishu para exibir o Logo do ZCode; essa key deve ser obtida pelo mesmo aplicativo do Feishu depois que ele fizer upload de `public/icon_512@2x.png` com as permissões `im:resource:upload` ou `im:resource`. Sem configuração, volta para os ícones padrão de sucesso/falha descritos acima.

## Configuração e testes

É necessário criar a variável GitLab CI/CD `ZCODE_FEISHU_NOTIFY_TOKEN` (com o mesmo valor do servidor), e opcionalmente `ZCODE_FEISHU_NOTIFY_BASE_URL` (padrão `http://intranet.example.invalid:3011`). O receptor de produção continua sendo fornecido pelo `FEISHU_RECEIVE_ID` do GitLab. Os testes unitários da notificação de build e a validação manual posterior usam uniformemente o grupo de teste temporário `oc_5725795450da6920872fdb25412848bf`, e esse grupo de teste não deve ser escrito na configuração padrão de produção do CI.

A notificação de build tem apenas esta via de envio: o lado do CI não mantém nenhuma credencial de aplicativo do Feishu, e `FEISHU_APP_ID` / `FEISHU_APP_SECRET` não têm relação com esse script. Quando `ZCODE_FEISHU_NOTIFY_TOKEN` está ausente, o script-erra e sai diretamente, sem degradar silenciosamente para outra identidade de envio — caso contrário, robôs que não são do ZCode Infra se misturariam ao grupo.

## Limite de falha

Quando a chamada ao serviço de notificação falha, o script tenta uma vez; só retorna status diferente de zero quando as duas tentativas falham, porque a notificação não pode ser perdida silenciosamente. `notify-feishu-ci.mjs` captura esse estado e sai com zero, garantindo que uma falha de notificação não altere o estado do build, do release nem das pipelines seguintes.