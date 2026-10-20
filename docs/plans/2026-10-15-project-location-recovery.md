# Plano de implementação da recuperação da localização do projeto

**Objetivo:** anomalias no cache de localização reconstruível se auto-curam primeiro de forma localizada, preservando um login válido; não ampliar as condições de invalidação de login.

**Arquitetura:** ProjectAccessTokenClient é o owner de pending/geração/ reconstrução de localização; CredentialService é o owner da recuperação condicional dentro do lock de arquivo compartilhado. OAuthService permanece como a autoridade de identidade, mantendo a verificação de autenticação de negócio já existente.

**Stack técnico:** TypeScript, Vitest, Electron/WDIO, fixtures HTTP locais sintéticos.

## Ordem de implementação

1. Atualizar `docs/oauth/jwt-401-auto-logout.md` e a lista de casos de auth-config.
2. Primeiro complementar o cliente compartilhado com os ramos de falha, single-flight e os testes de concorrência de armazenamento; executar para confirmar a falha.
3. Remover a fiação do logout global; implementar a porta de cache privada `recoverUnreadable` do Host e a reconstrução única pelo cliente compartilhado.
4. Modificar o caso Electron de pending; verificar a recuperação automática e a preservação do login após um 503, e registrar as evidências de arquivo/HTTP/UI em runtime.
5. Executar tipos, Lint, formatação, arquitetura e testes afetados; revisar o diff e consolidar em um único commit, criando um MR de staging.

## Impact Brief (planning)

### Feature Summary

- Capability: `capability.provider-registry`; camada de mudança: persistence / recovery / validation.
- Seeds: ProjectAccessTokenClient, createAccountProjectTokenClient, createCredentialService.
- Não objetivos: alterar a derivação de chaves, o protocolo de login, o modelo transacional da conta inteira, a semântica de 403 de plataforma ou o comportamento do Standalone CLI.

### UI Surface Matrix

| Cenário / entrada de UI | Implementação compartilhada / owner de exibição | Validação e submissão | authority / ponto de gravação | Modos e isolamento |
| --- | --- | --- | --- | --- |
| Conexão de plano em Configurações / ModelProviderSection | Account Provider → ProviderSettingsView | Resolução do Token durante a requisição, reconstrução em caso de anomalia de localização | Host é o owner do Token / credentials.json | Desktop, shared-host; não pode encerrar um login válido |
| Avatar da barra lateral / useRootOAuthEffects | Sessão OAuth em cache / usuário Root | Novo login apenas após a confirmação de autenticação original | OAuthService / oauth:\* | Preserva a identidade, sem novo estado de UI |
| Uso e requisições de modelo | Autenticação de requisição de conta / cliente de Token | Troca de credencial antes da requisição, sem reproduzir fluxos de modelo já estabelecidos | Runtime do Host / Token em memória | Isolamento dos namespaces pessoal/equipe; no remoto mantém a authority original |

### Shared And Divergent Behavior

Todas as entradas de Host que consomem o cache de localização compartilham uma única reconstrução e o lock de arquivo. O Renderer não lê nem escreve o cache; o Standalone CLI, que não tem porta de recuperação, mantém a semântica de erro original. Esta rodada não modifica componentes de UI, tema, textos, nem a rota replayable do celular.

### Feature Relationships

- must-inspect: `capability.provider-registry` → `surface.provider-settings`; disponibilidade do plano e configuração são independentes.
- must-inspect: OAuth/Credential → Account Token client; a identidade não pode ser revogada reversamente por um cache derivado.
- should-inspect: uso pessoal/equipe, MCP oficial e autenticação durante a requisição — todos consomem o Token de projeto do Host.
- invariant-only: `service.oauth`, `state.oauth-pending-callback`; uma recuperação bem-sucedida não altera o login nem o pending.

### State Owners And Commit Sinks

Pending de localização / geração: ProjectAccessTokenClient; OAuth: OAuthService; modificação do arquivo cifrado: CredentialService e o `withFileLock` existente; a UI apenas lê a ProviderSettingsView já existente, sem adicionar temporizadores nem uma segunda cópia do cache.

### Must-Preserve Invariants

IO comum não apaga nada; apaga-se apenas o cache alvo que continua impossível de decifrar; dentro do lock revalida-se e, se já estiver corrigido, reaproveita-se; após clear, tarefas antigas não são restauradas; se a recuperação falhar, o OAuth é preservado; não registrar Token, account ID ou texto cifrado; não gravar Token de curto prazo; não reproduzir automaticamente requisições de modelo.

### Codegraph Evidence

Atualmente não há ferramenta ou índice de codegraph disponível; usam-se dep:refs e rg para conferir as chamadas diretas, expandindo dois níveis: node.ts → accountProjectTokenClient → ProjectAccessTokenClient; runtime pessoal/equipe → o mesmo client; CredentialService → withFileLock → substituição atômica de arquivo; a cadeia de broadcast do OAuth Root serve apenas como fronteira de invariância.

### Graph Drift Candidates / Graph Delta

O grafo não lista em provider-registry as seeds exatas do Token de projeto e do credential store; complementam-se as seeds confirmadas e o invariante de isolamento da recuperação de cache, sem novas capacidades ou UI surface. As demais chamadas estáticas servem apenas como evidência.

### Unresolved Questions

Contabilidade adicional: o histórico da regra de correspondência de novos modelos no reasoning Map omitiu os novos modelos; completa-se a lista de exclusão nos testes; as asserções de tarefas remotas antigas são corrigidas conforme a spec de primeira migração vigente. Os dois pontos corrigem apenas testes, sem alterar a configuração de modelos nem a implementação da migração.
A causa original que disparou a anomalia do usuário ainda não foi determinada; isso não bloqueia a correção da lacuna de recuperação local já reproduzida, e o MR não deve alegar que a causa raiz está definida.

### Accepted Cases / Planning Handoff

Aceitos: recuperação automática de cache corrompido; 503 preserva o login; a correção é submetida primeiro; múltiplas recuperações são combinadas; após clear, a falha não tem efeitos colaterais.
Podados: tema/idioma não alteram a recuperação condicional do Host, mantendo como invariantes a UI bilíngue existente e a ausência de mudança nas regras de renderização; as diferenças entre plataformas são tratadas pela adaptação ao lock de arquivo assíncrono original, nesta rodada macOS Electron, listando honestamente as outras plataformas e o celular real como não verificados.
A spec e a lista de casos são os dois documentos acima; o E2E continua pending, sem promoção nem admissão em CI.

## Escopo de correção da revisão

Ponto de partida `6546165b3e`; trata-se apenas dos eventos de diagnóstico prévios aprovados SG-01, dos testes unitários e das referências de contrato SG-02.
Primeiro validar, nos testes do cliente compartilhado, a ordem dos eventos de IO interno da recuperação / falha na consulta seguinte e que erros de leitura comuns não disparam recuperação; depois complementar os eventos fixos e as tags de log do Host; não criar novos tipos de resultado de recuperação nem mudar o comportamento de recuperação/login.
Os dois testes de baseline apenas passam a citar a spec e o caminho já coberto de forma independente, mantendo as asserções. Concluído isso, executar os testes direcionados e os afetados, tipos, Lint, a checagem de arquitetura, e reproduzir os casos Electron de recuperação existentes para conferir os logs; após o push do commit, aguardar a revisão do mesmo commit.
O ponto de partida do grafo da revisão é de 48 affected files / 466 impacted nodes; os 53 testGaps são apenas candidatos pendentes de verificação.
