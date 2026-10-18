# Briefing de handoff de implementação da correção de OAuth do Exa MCP (v4)

> Handoff da sessão de staging (2026-08-14). Este worktree concluiu a análise de causa raiz da primeira fase (ver `exa-oauth-reauth-analysis.md` no mesmo diretório). Este documento é a segunda fase: registrar a spec conforme o plano v4 e implementar os PRs 1-3.
> Você é o implementador. O revisor já concluiu três rodadas de revisão adversarial.

## 0. Primeiro passo: absorver a conclusão da revisão final da terceira rodada

A conclusão final do revisor (revisão de convergência v4) é entregue separadamente:

- Se a conclusão for "implementável": execute este briefing diretamente. Se a conclusão final ainda não tiver chegado, faça antes o esqueleto da spec do passo 2 abaixo, que é independente da revisão.
- Se a conclusão ainda tiver itens bloqueadores: absorva os bloqueadores no design (revisando os capítulos correspondentes da spec); os bloqueadores afetam apenas os detalhes do PR correspondente e não derrubam a arquitetura geral de duas fases (essa arquitetura já teve a direção confirmada em duas rodadas de revisão).

## 1. Contexto e as duas causas raiz (já decididas, não reanalisar)

O pacote de produção é `@modelcontextprotocol/client@2.0.0` (`apps/zcode-cli/packages/adapters/package.json:105`). Atenção: o repositório também tem `@modelcontextprotocol/sdk@1.29.0`, não leia o pacote errado.

- **Causa raiz 1 (race de refresh)**: múltiplos processos da CLI compartilham `~/.zcode/v2/credentials.json`; `withFileLock` cobre apenas a leitura/escrita de credenciais, não a troca de tokens de rede; quando o access token expira, vários processos tentam refresh concorrentemente com o mesmo refresh token, acionando a detecção de reuso de rotação do servidor, e o token family é revogado → o SDK invalida os tokens → é preciso reautorizar.
- **Causa raiz 2 (loop de segunda autorização)**: o client registrado por DCR fixa `redirect_uris` na porta aleatória de callback do momento do registro; o servidor de callback troca de porta a cada `listen(0)`; quando o redirect_uri não bate, o servidor de autorização (RFC 6749 §4.1.2.1) proíbe o retorno e renderiza a página de erro no local (é o que o usuário vê como "Server Components render error" do Exa) → o callback nunca chega → timeout, e a repetição nunca se autocorrige.
- Código crítico: `apps/zcode-cli/packages/adapters/src/mcp/oauth.ts` (arquivo único de provider com 595 linhas), `src/auth/localhost-callback.ts`, `src/mcp/index.ts` (orquestração de conexão; após a conexão bem-sucedida a oauthSession vive por muito tempo e só é fechada em closeRecord) e `src/auth/shared-credentials.ts`.

## 2. Plano v4 (conexão em duas fases, já revisado em três rodadas)

### Princípios de design

1. Conexão passiva: zero listener, zero discovery, zero DCR.
2. Somente a autorização interativa cria listener, com single-flight entre processos e o client DCR transacional em memória.
3. Todos os refresh (ativo + reativo) passam por uma mesma trava de arquivo entre processos.
4. Erros OAuth determinísticos invalidam via CAS; apenas erros não determinísticos fazem fail-soft.
5. 15s é o orçamento de espera do caller; a vida global da transação de autorização é 300s; os dois são separados.

### Fase 1 em runtime: AuthProvider puramente mínimo

O client@2.0.0 suporta nativamente (`node_modules/@modelcontextprotocol/client/dist/index.d.mts:186`): ao passar um AuthProvider puro (apenas `token()` + `onUnauthorized()`), o `_oauthProvider` do transport fica vazio (`dist/index.mjs:4978-4980`), um 401 chama apenas o nosso `onUnauthorized` e há um retry automático; o auth()/discovery/DCR do SDK não participam. **Não** passar OAuthClientProvider ao transport de runtime (ele seria envolvido por adaptOAuthProvider, e o 401 iria para auth() do SDK, contornando a nossa trava).

```ts
{
  async token() {
    const pair = await loadCanonical();
    if (!pair?.tokens) return undefined;                  // → 401 → onUnauthorized
    if (!isNearExpiry(pair)) return pair.tokens.access_token;
    return refreshUnderLock(pair);
  },
  async onUnauthorized() {                                // transport depois retenta automaticamente uma vez
    const pair = await loadCanonical();
    if (!pair?.tokens?.refresh_token) throw interactiveRequired();
    return refreshUnderLock(pair, { reactive: true });
  },
}
```

refreshUnderLock (`refreshAuthorization` importado de `@modelcontextprotocol/client`, existência já verificada):

```
withFileLock(<arquivo de trava de refresh dedicado, basename apenas hash/hífen, sem dois-pontos — ilegal no Windows>, async () => {
  cur = loadCanonical()
  cur.generation !== pair.generation → return cur.tokens?.access_token    // mescla, sem segunda requisição
  meta = resolveAsMetadata()
    // discovery_state existe e não expirou (TTL próprio de 24h) → usa direto
    // ausente/expirado → discoverOAuthServerInfo() uma vez (metadados públicos) → grava de volta → continua
    // falha no discovery → fail-soft devolvendo o valor atual, nunca tratar o grant como inválido
  next = refreshAuthorization(meta.url, { ...meta, clientInformation: cur.client, refreshToken, resource })
    sucesso → publishCanonical({ client intacto, tokens: next, obtainedAt: now }); return next.access_token
    invalid_grant  → compareInvalidateTokens(cur.generation); throw interactiveRequired
    invalid_client → compareInvalidateBoth(cur.generation);  throw interactiveRequired
    rede/5xx → fail-soft devolvendo o valor atual
})
```

- `interactiveRequired()` = erro com code estável + marca de symbol (não só instanceof, para resistir a carregamento duplicado do bundle). O SDK deixa erros não-OAuth borbulharem como são e o transport preserva a identidade com `Symbol.for("mcp.authSeamEscape")` (`index.mjs:2263,2270-2277`); o adapter precisa reconhecê-lo antes de `failConnection()` (perto de `mcp/index.ts:570`) e criar um novo transport para a Fase 2 (um transport fechado por negociação não pode ser reutilizado, `index.mjs:3283`).
- A estrutura canônica de credenciais ganha `obtained_at`/`expires_at`/`issuer` (o issuer é apenas um campo armazenado; desta vez não há chaveamento por AS). **Migração**: registros antigos sem campos de tempo → tratados como próximos do vencimento, entram na trava para tentar um refresh (a releitura dentro da trava evita disparos concorrentes de vários processos); se nessa tentativa vier `invalid_grant` (a família antiga já estava morta, exatamente o caso observado no Exa) → compareInvalidate e ir para a Fase 2; esse caminho é o correto.
- 403 insufficient_scope: com um AuthProvider puro, o SDK ignora o 'reauthorize' padrão e lança diretamente `InsufficientScopeError{requiredScope,...}` (`index.mjs:5010`) → o adapter calcula unionScope = token.scope ∪ requiredScope → leva o unionScope para a Fase 2 (tanto o clientMetadata.scope do DCR quanto o authorize o usam), senão o 403 entra em loop infinito.

### Fase 2, autorização interativa: trava de autorização dedicada + generation de baseline + abort real

```
G0 = generation canônica atual (baseline)
tryAcquire(authz-lock:<hash>, maxWaitMs≈0)          // arquivo de trava dedicado, não trava o credentials principal
 ├─ não obtido → follower: faz polling da canônica; generation ≠ G0 volta para a Fase 1 e reconecta
 │              orçamento do caller (session 15s / settings 300s) esgotado → informa "a autorização está em curso em outro lugar" e continua esperando em background
 └─ obtido → leader:
      releitura dentro da trava: generation ≠ G0 (outro concluiu enquanto esperávamos) → solta a trava e encerra
      listen(0) em porta aleatória (abandona completamente a reutilização de porta — o listener vive durante toda a conexão, e reutilizar sempre colide)
      OAuthClientProvider interativo (state novo, scope = unionScope):
        clientInformation(): devolve o clientId da configuração estática → retorna; senão undefined
                            → o SDK necessariamente refaz o DCR com a URL do listener vivo atual → o desvio de redirect_uri é eliminado pela raiz
        saveClientInformation(): escreve só em memória transacional (o único leitor de produção no repositório é o oauth.ts, já verificado;
                                 o client@2.0 completa o issuer do client antigo e chama saveClientInformation;
                                 a semântica interativa é memória; o passivo não tem este método e não contamina a canônica)
        tokens(): undefined (não dispara refresh)
        saveTokens(): saveMany atômico dentro da trava publica a canônica + legacy (client vindo da memória transacional, na mesma autorização)
      URL de autorização + state escritos na chave compartilhada pending_authorization (com TTL) → a TUI da session e a página de settings conseguem ler para exibir
      espera o callback até o TTL global de 300s
      ao desistir, AbortController cancela de verdade listener/fetch/finishAuth
        // o withTimeout atual apenas ignora resultados atrasados e não cancela (timeout.ts:1); sem abort real, a troca de token atrasada
        // ainda seria publicada, e o fencing (= trava) ficaria furado
      finally: solta a trava + remove a chave pending + fecha o listener + destrói o transport → **volta à Fase 1 e reconecta**
```

- **A passagem Fase 2 → Fase 1 é um requisito rígido**: após a autorização bem-sucedida é preciso descartar o transport da Fase 2 e voltar à Fase 1 para reconectar com o provider passivo. Reutilizar o transport já autenticado da Fase 2 faz o 401 em runtime ir para auth() do SDK e contornar a trava de refresh.
- A preocupação com usar trava de autorização dedicada em vez de marker/trava longa já foi refutada pelo código: o maxWaitMs do `withFileLock` limita apenas a aquisição, não a posse (`packages/shared/src/node/privateFilePersistence.ts:51`), e uma trava de PID vivo não é recolhida como stale (`atomicFileLock.ts:69`); o `67666ea256` corrigiu um cleanup indevido após timeout do waiter. A própria trava já é o fencing.
- Todos os erros de listen, como `EACCES/EMFILE/ENFILE/EADDRNOTAVAIL`, são tratados como falha do leader (soltar a trava e tentar de novo/reportar), sem tratamento especial para EADDRINUSE.
- Validação de state no localhost-callback: sem correspondência → retornar 400 mas **não rejeitar a própria promise de callback** (continuar esperando o callback correto); state correspondente e com `error=access_denied` → falhar imediatamente com settle.

### Sequência de PRs (a ordem não pode ser invertida)

| PR | Conteúdo |
|---|---|
| PR1 | localhost-callback: state sem correspondência não envenena a promise; state correspondente com error=access_denied faz settle imediato. oauth.ts: branches de invalidateCredentials e logging de nível warn nos eventos de autorização/refresh (sem texto puro do token) |
| PR2 | Fase 2: trava de autorização dedicada + DCR novo com client transacional em memória + publicação atômica dentro da trava + chave compartilhada pending_authorization + separação do orçamento do caller e da vida da transação + abort real. **Corrige a causa raiz 2**. Atenção: quando o PR2 aterrissar, a Fase 1 ainda usa o provider atual; o caminho interativo é ligado primeiro à nova orquestração da Fase 2 |
| PR3 | Fase 1 troca para AuthProvider puro + refreshUnderLock (trava + mescla + invalidação CAS de erros determinísticos) + migração obtained_at/expires_at + TTL de discovery + passagem de unionScope no 403 + passagem Fase2→1. **Corrige a causa raiz 1**. O PR3 deve vir depois do PR2: depois que a Fase 1 trocar para AuthProvider puro o SDK não mais inicia sozinho a autorização interativa, e sem o PR2 em posição o usuário não consegue autorizar |

## 3. Contrato de execução

1. **Spec primeiro**: atualizar primeiro `docs/mcp-oauth-client-auth.md` (promovendo a leader/lease OAuth entre processos e o single-flight de refresh, hoje ambos deferred, ao design v4, e acrescentando o diagrama de sequência das duas fases; a convenção de docs do repositório está em apps/zcode-cli/.claude/CLAUDE.md). Criar `docs/mcp-oauth-two-phase.md` ou incorporar ao texto anterior, a seu critério, mantendo a estrutura de docs consistente.
2. **Cada PR é um commit independente** (conventional commits, como `fix(adapters): ...`); rodar `npm run lint` e os testes relevantes antes de commitar. O trabalho é no branch atual `exa-oauth-analysis` (baseado em staging bfc91c54a9); não fazer push nem criar MR, e parar e reportar ao concluir.
3. **Matriz de testes** (portão de aceitação de cada PR, usando o pacote de produção client@2.0.0, com o e2e existente migrando do import direto do sdk@1.29):
   - PR1: requisição com state errado chegando primeiro e requisição correta depois → ainda tem sucesso; access_denied → falha imediata.
   - PR2: dois subprocessos reais disputando o leader → exatamente um listener/um DCR/uma URL de autorização; o timeout de A é assumido por B, e o saveTokens tardio de A precisa falhar (fencing); no caminho ServerError/403, enquanto o canônico antigo ainda existir o leader não pode tratar o token antigo como generation nova.
   - PR3: primeira conexão sem credenciais afirma zero discovery/zero DCR/zero listener; servidor de rotação estrita + barreira com dois processos resulta em apenas uma requisição de refresh (ver o teste `mcp-oauth-proactive-refresh.test.ts` do branch feat/cli-opt em 22ba5d86c4; a atenção: o layout de arquivos divergiu e não dá para fazer cherry-pick direto); invalid_client afirma que o par client+tokens inteiro é invalidado; canônico antigo sem campos de tempo → exatamente uma tentativa de refresh, sem repetição.
4. **Implementação de referência** (apenas referência somente-leitura, sem cherry-pick; o layout de arquivos divergiu): `git show e2b55fcd46` (direção de porta fixa, já rejeitada; ver apenas a parte estática de configuração do client) e `git show 22ba5d86c4` (ideia da trava de refresh e do teste com barreira).
5. Limitações conhecidas vão para a spec e não são corrigidas agora: o issuer não participa do chaveamento por keyPrefix (é apenas um campo armazenado); em cenário remoto por SSH/contêiner o callback entre hosts é inalcançável (problema preexistente).
6. Diante de dilemas de nível de design (por exemplo, a conclusão final conflita com este briefing e não há como conciliar), pare e liste os pontos no relatório, sem decidir sozinho mudar a arquitetura.

## 4. Evidências de runtime (coletadas durante a investigação, para verificação)

- Logs: `~/.zcode/cli/log/zcode-2026-08-1{1,2,3}.jsonl`; em 8-11 11:27 há uma única autorização bem-sucedida; em 8-12 09:00, depois que o refresh ficou inválido, houve 121 authorization.required e 0 completed.
- Credenciais: `~/.zcode/v2/credentials.json` com prefixo de chave `mcp:oauth:c50fd1fa...`; o `client_information` do exa está presente (redirect_uris travado em 127.0.0.1:54735) e os `tokens` foram removidos. notion/linear/canva/atlassian também têm portas aleatórias travadas no histórico, sendo risco da mesma categoria.
- Reprodução: a renderização da página de autorização para um redirect_uri divergente já foi medida empiricamente (auth.exa.ai renderiza a página de erro no local).