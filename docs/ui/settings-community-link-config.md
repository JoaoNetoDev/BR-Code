# Configuração da entrada de comunidade do usuário

> Todo103: este documento preserva o comportamento já estabelecido em staging e o histórico de aceite; aprovações históricas não contam como aprovação desta rodada.
> As evidências de integração desta rodada estão registradas em todo103-staging-integration-ledger.md, sem alteração dos limites de Provider/Selection.

A entrada "Comunidade do usuário" no menu de ajuda e a ação "Enviar feedback" da plataforma passam a ler, de forma unificada, de `client/configs.data.configs.feedbackUrl` do endpoint atual; o `config/default.json` embutido serve como valor padrão.

## Formato de configuração

```json
{
  "feedback_url": "https://example.com/feedback",
  "community_urls": {
    "zh-CN": "https://example.com/zh-community",
    "en-US": "https://example.com/en-community"
  }
}
```

## Regras de resolução

- Idioma atual `zh-CN`: lê em sequência o remoto `zh-CN`, depois o embutido `zh-CN`
- Idioma atual `en-US`: lê em sequência o remoto `en-US`, depois o embutido `en-US`
- Se não houver entrada remota nem embutida para o idioma atual: a UI não exibe a entrada "Comunidade do usuário"

Não há fallback entre idiomas distintos, evitando que um usuário chinese entre no Discord ou que um usuário em inglês entre no Feishu.

```text
trocar idioma
   |
   v
clicar em comunidade do usuário
   |
   +--> remoto do idioma atual --> embutido do idioma atual --> não exibir entrada
                              |
                              v
                           abrir entrada
```

## Entradas padrão atuais

- A entrada padrão de `zh-CN` usa o link de adicionar amigo no Feishu: `https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=47ag983c-8fcb-4d6d-814b-5395193a712c&qr_code=true`
- A entrada padrão de `en-US` usa o link de convite do Discord: `https://discord.gg/z9aBcQXZQ3`

Portanto, usuários da interface em chinês entram na comunidade do Feishu e usuários da interface em inglês entram no Discord; quando o idioma correspondente não está configurado, a entrada não é exibida.

## Pontos de implementação

- Resolução compartilhada: `packages/shared/src/remoteAppConfig.ts`
- Resolução de plataforma Desktop e fallback para configuração local: `packages/desktop/src/main/desktopCommandHandlers.ts`
- Resolução da plataforma Web: `packages/web/src/communityUrl.ts`
- Exibição no menu de ajuda: `packages/ui/src/WorkspaceHelpMenuButton.tsx`

## 2026-09: migração para client/configs

A nova configuração de ajuda lê de forma unificada `GET /api/v1/client/configs` do endpoint atual, carregando os parâmetros existentes `app_version` e `platform`, e só lê `data.configs.feedbackUrl` após validar estritamente `code=0`. Inclui `community_urls`, `feedback_url` e `feedback_use_external_form`. Os arquivos antigos no CDN permanecem para clientes antigos; o `config/default.json` embutido é mantido, o Desktop continua distribuindo o pacote e o Web continua empacotando a importação.

```text
verificação de visibilidade / clique na entrada
          |
   plataforma injeta requisição HTTP (no-store, timeout de 10 segundos)
          |
   cache em memória do endpoint atual + version + platform (1 hora / merge de concorrência)
          |
   code=0 → feedbackUrl → resolução por campo
          |
   valor remoto válido → valor padrão embutido do mesmo idioma → ocultar comunidade / não abrir formulário sem endereço
```

O leitor público não grava cache HTTP em disco, localStorage nem banco de dados. A configuração de ajuda é uma requisição pública, sem autenticação de usuário; o cache é isolado pela URL completa da requisição e falhas não são cacheadas. Trocar de endpoint durante a requisição não pode gravar o resultado antigo no cache do novo endpoint. Campos ausentes, tipos inválidos e links vazios fazem fallback; booleano false é um valor de sobrescrita válido. O menu de ajuda nativo do desktop e o painel de comandos continuam escolhendo entre o pop-up embutido e o formulário externo conforme a opção; o comportamento do menu de interrogação e do menu desenhado pelo próprio Windows de abrir direto o formulário embutido não muda. A ação de feedback da plataforma Web continua abrindo o endereço externo.

A Web usa a mesma configuração de endpoint de implantação já existente para OAuth / relay, sem novos RPC de controle remoto, Host ou Agent, e sem alterar o encadeamento de sessões desktop continuous / web remote replayable.

Verificação: testes unitários cobrem envelope, campos e fallback de idioma, sobrescrita por false, falhas de HTTP/JSON/timeout, merge de concorrência, TTL e isolamento por endpoint; a verificação interativa cobre o link externo da comunidade e a ação de feedback da plataforma. É preciso executar typecheck e lint e preservar as evidências de requisição em runtime. Itens não executados em outros sistemas ou em aparelho mobile real devem ser apontados na entrega.

Verificação em runtime: o servidor não aceita `platform=web` (HTTP 400 / code 3001); a Web omite o platform opcional e, no endpoint oficial, foi medido retorno HTTP 200 / code 0. O desktop mantém o platform-arch.

### Resultados da verificação desta rodada

- 36 testes unitários passaram no total, cobrindo resolução pública/cache, resolução Web e configuração do desktop.
- `pnpm typecheck` e `pnpm lint` passaram (o lint apresenta apenas warnings já existentes no repositório).
- macOS Electron HC-01 passou: mock em runtime da nova interface, link externo da comunidade, opção de requisição no-store, false não abrindo formulário externo e, após trocar o endpoint, true abrindo o formulário de feedback especificado.
- Não foram executados testes reais em Windows/Linux nem em navegador mobile; a Web está hoje validada por testes unitários de resolução de requisição e pela interface real.
  Um endpoint Web customizado entre domínios ainda exige que o servidor permita CORS; caso contrário usa-se o valor padrão embutido por convenção.
- A primeira execução de E2E em paralelo com o typecheck criou risco de sobreposição de artefatos em out/host; após reconstruir isoladamente o Host ficou normal.
  As asserções interativas aguardam a chamada externa real, evitando confundir a conclusão do despacho do comando com a conclusão da ação assíncrona.

### Limpeza do link antigo do CDN

A nova versão não exporta mais as constantes de endereço do CDN antigo nem o construtor de URL versionada; os testes unitários obsoletos correspondentes foram removidos.
As funções de parsing de campos ainda usadas em `remoteAppConfig.ts` e seus testes foram mantidas.
O conteúdo do `config/default.json` embutido e a forma de empacotamento em Desktop/Web permanecem inalterados; os arquivos antigos do CDN em produção continuam atendendo as versões antigas.
Esta rodada apenas remove código sem chamadas e suas descrições, sem mudar a interação; os casos formais HC-01～HC-05 (8 casos) continuam cobrindo o novo link.