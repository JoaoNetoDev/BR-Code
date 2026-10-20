# Notificação de artefatos de build do CI via Feishu Card 2.0

## Escopo

Esta especificação cobre os testes anteriores ao notify, o CUA Helper, a construção pública de desktop, os recursos remotos e o frontend de controle remoto, o processo de empacotamento da CLI, além da notificação de resultado de plataforma `notify:feishu:<platform>:<arch>`. A notificação de release oficial `release:notify:feishu` mantém o fluxo original. sandbox/test tag continuam pulando a notificação; a falha de notificação não altera o resultado original da tarefa.

## Notificações de processo e convergência de plataforma

- `notifyCiResult` é o card e o ponto de envio compartilhados, e aceita o nome do processo, o resultado de sucesso/falha, o resumo e os links de ação; trata de forma unificada as pessoas, o escapamento de texto, o tamanho do card, os destinatários, o timeout e o retry limitado. Desktop, processos e CLI compartilham este ponto de entrada.
- Testes, Helper, construção pública de desktop, recursos remotos e frontend de controle remoto são acionados pelo `after_script` do job original, enviando notificação de falha apenas quando o Runner fornece `CI_JOB_STATUS=failed`; sucesso não notifica, evitando poluição antes da geração do pacote principal. O empacotamento de plataforma do pacote principal continua enviando resultado de sucesso/falha; a notificação de sucesso da CLI continua sendo enviada pelo ponto de entrada independente após o upload. Cancelamento, timeout sem entrar no after_script, crash do Runner e falha ao obter o código-fonte não garantem notificação; não se trata execução não realizada como sucesso. Não se cria job novo de notificação de processo.
- O after_script usa um shell independente, no macOS recarrega o Node; no Windows usa a entrada de inicialização do Node do PowerShell, no Linux usa o Node do runner. Não depende de variáveis exportadas temporariamente pelo script principal.
- A etapa de notify tem apenas seis jobs reais (macOS/Windows/Linux × ARM64/x64), e cada plataforma trata sucesso e falha ao mesmo tempo; são removidos os `notify:feishu:failure:*` independentes. Quando a regra compartilhada de plataforma não especifica `when` explicitamente, build usa o padrão on_success, notify usa always, e as plataformas não selecionadas continuam sendo manual não bloqueante.
- Cada job de notify continua dependendo apenas do build da plataforma correspondente, sem esperar as outras plataformas. Usa a GitLab Jobs API da mesma pipeline para consultar o estado final e a URL daquele build; trata paginação e considera apenas a tentativa mais recente. Envia somente para success/failed; estados como manual/skipped/canceled/running são pulados, sem inferir sucesso. A consulta à API tem timeout.
- Ao consultar o build Job, a variável de plataforma é mapeada para o nome do Job: `darwin → macos`, `win → windows`, `linux → linux`, e a arquitetura usa o `ARCH` original. O mapeamento é usado apenas para a correspondência de Job, preservando as variáveis de plataforma originais e o endereço do artefato. Plataformas desconhecidas registram warning e são puladas, sem inferir o nome do Job pelo valor original; uma nova plataforma exige acrescentar o mapeamento e a validação de pareamento do CI.
- Falhas no upstream são cobertas pela própria notificação de processo do upstream; quando a plataforma é pulada, não se repete a mensagem de falha de plataforma.
- A CLI mantém os botões de download e de Job no caso de sucesso; a falha é tratada pelo after_script do job original da CLI chamando o ponto de entrada unificado, sem repetir notificação no sucesso.
- O retry automático reenvia apenas para o mesmo resultado imutável; um rerun explícito do job é considerado uma nova tentativa, sem manter um segundo arquivo de estado. Quando a resposta de rede se perde, o servidor pode já ter entregue a mensagem; o serviço existente não tem contrato de idempotência, portanto não se pode prometer entrega exatamente uma vez.

```text
job script anterior → Resultado do Runner → after_script → apenas failed → notifyCiResult → serviço de notificação do Feishu
build de plataforma  → notify correspondente (always) → resultado final da Jobs API ──────┘
CLI build/upload → notifyCiResult no sucesso; after_script na falha ──┘
```

Ordem de implementação: primeiro cobrir o card genérico, a seleção de resultado, a paginação/retry e a regressão de orquestração do CI; depois implementar o ponto de entrada compartilhado e a ligação dos jobs; por fim executar tipos, lint, arquitetura, testes unitários afetados e a validação com um serviço HTTP local falso; runners reais e a entrega ao Feishu ficam como fronteiras de verificação separadas.

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

O card de sucesso não exibe a URL do artefato diretamente no corpo, mas oferece um botão “下载产物” no rodapé do corpo; o card de falha não exibe a URL do artefato e oferece um botão “查看失败 Job” no rodapé do corpo, que navega para o `web_url` do Job de build correspondente que falhou na mesma pipeline; esse endereço é obtido por `notify-feishu-ci.mjs` consultando os Pipeline Jobs do GitLab usando a variável de CI `GITLAB_ACCESS_TOKEN` (ou a `GITLAB_PRIVATE_TOKEN` compatível). Quando a URL correspondente não existe, o botão não é renderizado; quando a consulta falha, o motivo é impresso e a notificação é pulada, sem alterar o estado da pipeline. A notificação de sucesso de plataforma também precisa dessa credencial de consulta.
Os dois botões usam estilo de contorno `default` e largura adaptativa `default`.

Ambiente, arquitetura, quem disparou e branch são tratados apenas no título ou em variáveis internas e não são mais exibidos como campos independentes no corpo. O card usa Card 2.0 com `schema: "2.0"`, header azul e bloco de informação claro; os botões servem apenas para abrir o artefato ou o endereço do Job, sem novos callbacks externos ou outras interações de negócio. Textos longos devem ser escapados com segurança no JSON do card e passar por uma validação de tamanho compatível com os limites de requisição do Feishu; autor do commit e mensagem de commit, tratados como entrada não confiável, têm escapamento unificado de caracteres especiais de Markdown/HTML e limite de comprimento.

Em caso de falha de build, é adicionada a notificação de falha para a plataforma correspondente: no título “构建完成” é substituído por “构建失败”, o corpo exibe autor do commit e mensagem de commit e oferece o botão com o endereço do Job do GitLab; o card de falha não exibe o endereço de download do artefato. Quem disparou e o branch não são exibidos como campos independentes no corpo.
O card de sucesso usa Header azul e o ícone `success_colorful`, e o card de falha usa Header vermelho e o ícone `fail_colorful`, garantindo que os dois estados sejam diferenciados rapidamente na lista de notificações.

Após configurar `FEISHU_HEADER_ICON_IMAGE_KEY`, o Header passa a usar o `custom_icon` do Feishu para exibir o Logo do ZCode; essa key deve ser obtida pelo mesmo aplicativo do Feishu depois que ele fizer upload de `public/icon_512@2x.png` com as permissões `im:resource:upload` ou `im:resource`. Sem configuração, volta para os ícones padrão de sucesso/falha descritos acima.

## Configuração e testes

É necessário criar a variável GitLab CI/CD `ZCODE_FEISHU_NOTIFY_TOKEN` (com o mesmo valor do servidor), e opcionalmente `ZCODE_FEISHU_NOTIFY_BASE_URL` (padrão `http://intranet.example.invalid:3011`). O receptor de produção continua sendo fornecido pelo `FEISHU_RECEIVE_ID` do GitLab. Os testes unitários da notificação de build e a validação manual posterior usam uniformemente o grupo de teste temporário `oc_5725795450da6920872fdb25412848bf`, e esse grupo de teste não deve ser escrito na configuração padrão de produção do CI.

A notificação de build tem apenas esta via de envio: o lado do CI não mantém nenhuma credencial de aplicativo do Feishu, e `FEISHU_APP_ID` / `FEISHU_APP_SECRET` não têm relação com esse script. Quando `ZCODE_FEISHU_NOTIFY_TOKEN` está ausente, o script registra um erro de configuração e pula a entrega, sem degradar silenciosamente para outra identidade de envio — caso contrário, robôs que não são do ZCode Infra se misturariam ao grupo.

## Limite de falha

Quando a chamada ao serviço de notificação falha, o script tenta uma vez; quando as duas tentativas falham, retorna um resultado failed e imprime o motivo. O ponto de envio compartilhado captura o erro final e registra warning; o wrapper sai com zero. Erros de credencial de consulta, de API, de card e de envio não podem alterar o estado do build, do release nem das pipelines seguintes.

## Requisitos de regressão

- Cards de sucesso/falha, resumo, múltiplos links, escapamento de texto e compatibilidade com a identidade Preview/CLI existente.
- Cada plataforma tem apenas um job de resultado; mantêm-se a seleção de plataforma e a dependência do build correspondente, e a Preview continua somente com ARM64.
- Seleção do estado real do job, paginação e resultado mais recente após retry; estados não finais não são enviados.
- Cobrem-se o mapeamento de nomes de Job para as três plataformas e duas arquiteturas; o resultado de sucesso/falha no Windows é validado com a entrada real do Node e com os Jobs/serviço de notificação locais, evitando validar apenas o pareamento de `needs` do CI e deixar passar o erro de correspondência de nome em runtime.
- Após expandir o YAML da pipeline principal e da Preview, chamar a função de seleção de jobs de produção com o `TARGET_OS/ARCH` real e verificar que o build Job correspondente é coerente com a declaração de `needs`; plataformas desconhecidas não podem entregar notificação e devem registrar warning. `build:desktop:app` executa a regressão de notificação no gate comum após a preparação das dependências, e a defasagem de pareamento deve bloquear os empacotamentos seguintes.
- O after_script cobre os processos anteriores e preserva o código de saída do script principal; erros de notificação não fazem a tarefa original falhar.
- Para os processos anteriores, success/canceled/running não enviam notificação e failed envia; o resultado de sucesso/falha do pacote principal e a notificação de sucesso da CLI são preservados.
- O envio é validado com um serviço HTTP local falso para verificar requisição, retry e limites de falha, sem entregar mensagens de teste ao grupo real do Feishu.
