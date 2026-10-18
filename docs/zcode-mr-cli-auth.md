# Contrato de Autenticação e Criação do CLI do zcode-mr

`setup`, `mr` e `create` usam de forma unificada o estado de login do glab no host GitLab de destino; a origem das credenciais é gerenciada pelo próprio glab, e o helper não lê Token do ambiente, arquivos de credenciais nem envia requisições HTTP por conta própria.

```text
setup → glab auth status --hostname <origin host> → ready / 安装或登录指引
mr / create → 同一认证检查 → 校验分支并推送 → glab api 查询已有 MR
                                             ├─ 已存在：返回 IID / URL
                                             └─ 不存在：glab api 创建 → 返回 IID / URL
```

- `mr` e `create` têm comportamento idêntico; `create duo <target>` e `mr --duo <target>` mantêm compatibilidade.
- Quando a autenticação não está disponível, o processo falha antes do push. O push do Git continua usando a autenticação SSH/HTTPS do próprio Git, e o estado de login do glab não garante permissão de push.
- A consulta e a criação passam pelo glab CLI, com o mesmo host especificado explicitamente. O corpo da criação é passado via JSON stdin, preservando texto, quebras de linha e literais de shell, e sem colocar o token nos argumentos do comando.
- Se a consulta do glab falhar, a criação não prossegue; erro no POST não dispara nova tentativa com troca automática de credenciais, evitando criação duplicada quando a rede está incerta.
- Push bem-sucedido mas consulta/criação de MR falha: sai com código diferente de zero e retorna um estado de falha explícito com link pré-preenchido. Apenas `created` / `already_exists` podem ser reportados como sucesso.
- Normas de descrição, proteção de branches, título DUO e a consulta idempotente de MR já existente permanecem inalteradas.

Cobertura de regressão: sem CLI ou sem login, não há push; autenticado e sem Token no ambiente, é possível criar; a interpretação do Token do ambiente fica a cargo do glab; host consistente; MR existente não é recriado; escape do corpo; falha em consulta/criação sai com código diferente de zero; os dois comandos e o comportamento DUO são consistentes.

## Personal Access Token como recomendação padrão quando não há login

- Quando já autenticado, apenas reaproveita, sem relogar nem migrar o armazenamento de credenciais. Sem login, imprime o link da página de criação de PAT do host de destino, a sugestão de escopo `api,write_repository` e o método de login por `Token`.
- No GitLab, em avatar → Edit profile → Access / Personal access tokens (em versões antigas pode aparecer apenas como Access Tokens), crie o Token: preencha nome e validade, marque `api` e `write_repository` e salve na hora. O valor do Token só aparece na criação e não pode ser consultado novamente na lista.
- O usuário digita o valor no campo oculto de Token do glab; não cole no chat nem escreva em argumentos de comando. Em seguida execute o setup e faça a verificação de acesso somente leitura ao projeto pelo glab.
- O protocolo Git/API e o armazenamento de credenciais seguem a escolha atual do usuário. Quando o usuário atual exige manter o armazenamento em arquivo de configuração, use o `--insecure-storage` do glab; esse parâmetro não é um requisito padrão de todos os ambientes novos. Testes de isolamento usam um GLAB_CONFIG_DIR temporário e privado, escolhem explicitamente o armazenamento em arquivo e limpam tudo ao final, evitando gravar no keychain real do sistema.
- Os testes Web do GitLab autohospedado deste trabalho apontam falta de `client_id`. O fluxo padrão com Token não exige deploying de um app OAuth; o pré-requisito só é tratado quando o usuário escolhe explicitamente Web/Device.

Referências: [Criação de PAT no GitLab](https://docs.gitlab.com/user/profile/personal_access_tokens/), [Escopos de acesso](https://docs.gitlab.com/security/tokens/access_token_scopes/).