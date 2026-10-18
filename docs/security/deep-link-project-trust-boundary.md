# Limite de Confiança entre Deep Link e Configuração do Projeto

> Status: Implemented (2026-08-06)
>
> Especificação relacionada: `docs/specs/workspace-hook-trust.md`

## Contexto

O ZCode Desktop suporta `zcode://workspace/open?path=...` para abrir workspaces locais, e também lê, no escopo de descoberta de projetos, as declarações de Hook em `zcode.json` e `.zcode/config.json`, bem como os perfis de subagent em `.zcode/agents/*.md`.
Deep links externos, arquivos de repositório e workspaces remotos não pertencem à configuração confiável de nível de usuário: confirmar "abrir diretório" não equivale a confirmar "executar o código desse diretório".

## Limites de Segurança

- No Windows, o comando de protocolo `zcode://` deve colocar a URL externa depois de `--`: em produção,
  `"<ZCode.exe>" "--" "%1"`, e em desenvolvimento `"<electron.exe>" "<entry>" "--" "%1"`.
  `registerDeepLinkProtocol` é o owner do registro; cada inicialização normal sobrescreve o registro antigo, evitando manter templates inseguros.
- O artefato empacotado do Windows desativa `enableNodeCliInspectArguments` antes da assinatura, de modo que `--inspect` / `--inspect-brk` de registros antigos ainda não atualizados não possam iniciar o depurador do processo principal. Essa configuração não modifica o Electron de desenvolvimento não empacotado nem desativa `runAsNode`, necessário para a inicialização do Agent.
- O isolamento de argumentos deve ocorrer antes da análise de inicialização nativa do Electron. A validação de URL no JavaScript do aplicativo e o lock de instância única não substituem esse limite; callbacks de OAuth, pagamento, workspace e share mantêm as rotas e validações existentes.
- `zcode://workspace/open` é entrada externa e não equivale ao usuário selecionar um diretório dentro do aplicativo.
- O workspace path vindo de deep link deve rejeitar UNC / caminhos de rede antes de qualquer verificação no sistema de arquivos.
- Abrir um diretório local via deep link exige confirmação do usuário; quando o usuário cancela, o workspace path não pode ser armazenado em cache nem entregue.
- A confirmação de deep link autoriza apenas a abertura do caminho e não estabelece Workspace Hook Trust.
- Declarações de Hook em `zcode.json` e `.zcode/config.json` de nível de projeto são tratadas como código não confiável e, por padrão, não podem entrar em caminhos executáveis.
- A discovery apenas gera um `WorkspaceHookBundleSnapshot` imutável; a admissão em Runtime deve acontecer antes do lifecycle do Hook e do início do processo.
- A Trust persistente só é atendida por `workspaceIdentity + hookDeclarationDigest`; o digest do bundle garante que o snapshot de revisão e o de execução sejam consistentes.
- A Trust só pode ser estabelecida pela revisão em `Configurações → Hooks → Workspaces` de um Host confiável, ou pelo comando explícito `zcode hooks trust`; repositório, variáveis de ambiente e respostas comuns de permissão não podem autorizar.
- `deny` gerenciado tem precedência sobre a Trust persistente e passa a valer no próximo dispatch gate.
- Hooks de nível de usuário e Hooks de plugins habilitados continuam rodando conforme suas respectivas regras de fonte confiável já existentes.
- `.zcode/agents/*.md` de nível de projeto não pode reescrever o modo de permissão do runtime filho pelo frontmatter; `permissionMode` só se aplica a perfis de nível de usuário ou de plugins confiáveis.

## Rollout e Rollback

```text
URL externa → exe [entry] -- URL escrito pelo owner do registro de protocolo do Windows
         → Electron trata o conteúdo após -- como dados → rotas e confirmação de Deep Link existentes
Registro antigo → fuse do Inspector dos novos artefatos do Windows rejeita parâmetros de debug → registro seguro reescrito após inicialização normal
```

```text
trusted embedder / Host
  ├─ workspaceHookTrustEnabled = false
  │    -> hard block de Hook de projeto
  │    -> não lê o Trust store
  │    -> não cria solicitação de revisão
  │    -> preserva os registros de Trust no disco
  └─ workspaceHookTrustEnabled = true
       -> snapshot de discovery
       -> política gerenciada
       -> avaliação da Trust persistente
       -> revisão pendente ou dispatch admitido
```

`ZCodeAppOptions.workspaceHookTrustEnabled` é uma entrada de bootstrap confiável, e não é resolvida a partir da configuração de workspace/projeto nem de variáveis de ambiente.
A fábrica genérica de App tem isso desativado por padrão; os Hosts de workspace Desktop/Web/Mobile do ZCode Protocol habilitam explicitamente na fronteira confiável. Em caso de problema de segurança, o Host pode desativar o campo para restaurar o hard block, sem apagar os registros do usuário. Essa flag decide apenas se a admissão de Trust é acessada e jamais representa confiança automática.

## Observabilidade e Privacidade

O Workspace Hook Trust registra, pelo Logger Port existente, eventos estruturados de baixa frequência, incluindo review created, trust selected, timeout, superseded, snapshot mismatch, policy block, falha do Trust store e falhas de toggle/rebuild.
Os logs contêm apenas reason codes estáveis, generation, o digest SHA-256 da identidade do workspace e um resumo curto dos digests de bundle/declaration; não devem registrar o texto do comando, o conteúdo de scripts, o source path, o payload de Trust ou o corpo de resposta da interação.

## Pontos de Verificação

- Os registros de produção e de desenvolvimento no Windows colocam `--` antes da URL, e registros repetidos continuam usando o template seguro; o comportamento de registro em macOS/Linux permanece inalterado, e falhas de registro continuam registrando os avisos existentes.
- Com o `--` incluído, as URLs de OAuth, pagamento, workspace e share permanecem inalteradas na análise de parâmetros de cold start e na entrega de instância única.
- Em uma inicialização real do Electron, `--inspect`, `--inspect-brk` e `--remote-debugging-port` após o `--` não devem habilitar o depurador; o pacote de release do Windows também deve verificar que o fuse do Inspector está desligado, cobrindo o cenário de upgrade a partir de registros antigos.
- A aceitação de release do Windows cobre nova instalação, upgrade de registro antigo, cold start e instância existente, além do caminho real de abertura do protocolo pelo navegador.
- Um deep link UNC não chama filesystem stat nem entrega `OpenWorkspacePath`.
- Quando o usuário cancela a confirmação de deep link, o diretório não é aberto.
- Depois que o usuário confirma um diretório local, Hooks de projeto sem Trust ainda não podem executar.
- Com a flag desativada, mesmo que o Trust store já contenha o registro exato, o retorno é `workspace_hooks_feature_disabled`, sem ler o registro e sem enviar revisão.
- Com a flag ativada, apenas um digest de declaração exato é executado; após mudanças de configuração, as declarações afetadas passam por nova revisão.
- Um deny gerenciado pode sobrepor um registro existente e impedir dispatches subsequentes.
- Respostas stale de task/run/remoteSession/generation/snapshot são rejeitadas antes da mutação do store.
- Os limites de permissão de Hook de nível de usuário, Hook de plugin e subagent de projeto não são ampliados por este gate de rollout.