# Todo127 — implementação, verificação e revisão

## Limite de implementação

2026-09-11, o Goal autorizou a implementação. Reaproveita-se a分层 existente e o schema de Release, sem nova migração de dados, sem restaurar campos já removidos e sem modificar outros consumidores de client/configs.

```text
App / Server Environment       Standalone Prompt / TUI
ApiClient existente            fetch existente
             \                /
       download de URL compartilhado por provider-node
       plano de controle → CDN HTTPS → verificação → Active
                         │
                   Mudança de Config
                         │
             AccountProviderService
       Built-in / credenciais compartilham fila serial, resultado expirado descartado
                         │
                publicação de Registry da mesma versão

Environment verifica a cada minuto
  ├─ download: lease existente + TTL + backoff em caso de falha
  └─ reconstrói Account apenas quando não alinhado (não bloqueado pelo resultado do download)
Managed Worker: consome apenas arquivos e Host Account, não possui loop de download
```

- O orçamento total das duas fases é de 20 segundos, incluindo o corpo; o limite real de bytes é 10.000.000; CDN via HTTPS, proibido userinfo na URL, sem seguir redirecionamentos, sem cabeçalhos de conta / Cookie. Em caso de falha, apenas reporta a fase, o caminho do schema / a classe de erro, sem imprimir query da URL, corpo ou Key.
- Intervalo de sucesso de uma hora; em caso de falha, 1/2/4 minutos até uma hora; lease de 30 segundos; o refresh explícito ignora o TTL mas não ignora o lease. A verificação normal é debug, a atualização é info; cancelamento não conta como falha de rede.
- A CLI Entry apenas materializa os recursos que acompanham o pacote e passa o caminho; o novo caminho de ambiente bundled serve apenas ao Standalone de longa duração. Mesmo herdando esse campo de ambiente, o Managed não cria downloader.
- A origem de Account é construída a partir da Config atual; credenciais e Built-in reutilizam uma única fila de refresh; resultados assíncronos antigos não são publicados. As primeiras leituras concorrentes são combinadas, sem tratar o segundo leitor como um novo fato e provocar um fail-closed seguido de nova falha na inicialização.
- Se a reconstrução de Account falhar, o Registry antigo completo é preservado; a verificação de um minuto reconstrói apenas quando a versão não está alinhada, sem relogar, sem solicitar Key e sem forçar um novo download do CDN.
- Preservam-se as guardas de versão do Registry, a execução fixa e o Personal / Selection originais. Corrigida a gravação tardia de Active na saída; o fechamento do lock de arquivo ainda é concluído de forma assíncrona.

## Correspondência da verificação

| Item             | Evidência                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BR117-01/02/03   | `zcode-builtin-download.test.ts`: nova URL, campo ausente, HTTP/JSON/schema/regex/CEL, os dois lados de 10 MB, soma das duas fases de 20s, cancelamento; testes de Services usam montagem com o NodeApiClient real, sem difusão de autenticação |
| BR117-03         | `zcode-builtin-http.test.ts`: HTTP real retorna cabeçalhos primeiro mas o corpo não termina, o socket é cancelado por volta de 20s e a requisição seguinte tem sucesso; o teste de CDN mapeia o transporte para a máquina local e não representa uma medição real de TLS do CDN |
| BR117-04/05      | 16 itens de Release + 2 de lifecycle: lease/force/versão/Endpoint/saída, agendamento por minuto, TTL de 1 hora, backoff de 1/2/4/8/16/32/60 minutos; preserva o mecanismo de manter o owner antigo sem sobrescrever o arquivo de controle |
| BR117-06         | 12 itens de Bootstrap: novo download de longa duração em duas fases → Active → Registry; credenciais inalteradas / sem conta ainda acompanham; Managed não baixa; alterações reais de credenciais, invalidação e falha na primeira leitura continuam passando |
| BR117-06/07      | 9 itens de AccountService, consulta de Built-in expirada não é publicada; `providerBuiltinRecovery.test.ts` usa Config/Account/Registry reais; em caso de falha preserva a versão antiga e, dentro do TTL, no minuto seguinte só recupera o Account |
| BR117-08         | `zcode-builtin-consumption.test.ts`: modelo novo de Registry atualizado, configuração já obtida inalterada, Personal byte a byte inalterado, sobrescrita pessoal e seleção preservadas; a verificação de execução do lote inteiro para Core Models realmente criados ainda exige a consolidação final |
| BR117-09         | `zcode-builtin-process.test.ts`, dois subprocessos reais observando a substituição atômica do arquivo, todas as saídas Built-in e Account da mesma versão; passou em Linux e Pro macOS, não testado no Windows |
| BR117-10         | Pro Electron completo BR117-N02 passou: refresh das configurações → download HTTPS real → Registry → novo Model no wire; a-phone shared-host / SSH joint acceptance ainda não foi testada e o protocolo continuous/replayable não foi modificado |
| BR117-11         | Os 14 itens de arquivo da revisão final 22 após o segundo round do Todo113 passaram; SHA256 consta da revisão final do lote inteiro; a cópia da revisão 21 anterior é evidência histórica e não representa o que está publicado em produção |

O typecheck da raiz, o typecheck de CLI Bootstrap/CLI, o lint da raiz (0 erros, 42 warnings já existentes) e a architecture (0 novos / 0 violações no total) passaram. Na primeira consolidação: 479 passaram / 2 falharam. Uma era um novo parâmetro local do Todo128 que usava por engano o nome já removido `providerRevision`, alterado para o nome semanticamente correto `registryRevision` (sem mudar o comportamento); a outra era um teste que removia o diretório temporário antes de a lease em background terminar de gravar em disco, alterada para aguardar a conclusão do refresh. Os 55 itens dos dois arquivos correspondentes passaram depois. Nenhum teste de limite foi afrouxado e nenhuma tolerância por sleep foi adicionada.

Logs da revisão: `/tmp/provider127-{all-unit,review-fixes,standalone3,entry,integration,recovery,consumption,api-client,artifact,types2,cli-types,lint,arch}.log`. Os 2 itens de HTTP real + processo passaram; os 4 itens de CLI Entry passaram. O SHA256 da cópia de integridade `/tmp/provider127-release-FPDKMA/zcode-builtin-21.json` é `e9403074ad99eca33538d8c76cc6cce9bffeca8daa84f767c44a2c51151cad08`.

## Aceitação suplementar do Pro (2026-09-12)

- `zcode-builtin-http/process/consumption.test.ts` passou em Pro Node24.14.0 / Darwin arm64, três arquivos, três itens. O corpo real lento foi cancelado pelo orçamento de 20s, com nova tentativa depois; dois processos reais publicaram cada um o mesmo Built-in / Account; os bytes de Personal, a sobrescrita e o objeto de configuração já obtido foram preservados. Log em `/tmp/provider-20260912-pro-builtin-runtime.log`. Preservar o objeto de configuração não se passa por prova congelada de Core Model realmente criado; esta continua coberta pelos casos de SDK/Core do lote inteiro.
- Novo accepted pending BR117-N02: o aplicativo Electron real obtém do plano de controle HTTPS de teste isolado uma URL de CDN versionada; altera-se apenas a nova URL devolvida pelo plano de controle, clica-se no refresh da página de configurações, capacidade 500K → 700K. O `top_p` das requisições reais do teste de conexão antes e depois do refresh foi 0.17 / 0.37, com a identidade do modelo igual; Personal inalterado byte a byte e o cache da seleção recente pré-definida também inalterado. Sem mock do downloader, do Registry, da plataforma ou do Model; sem escrita de Active; sem leitura da conta do dia a dia; sem publicação de CDN real.
- Caso: `packages/desktop/test/e2e/settings/manual-review/pending/provider-builtin-refresh.test.ts`. A resposta do modelo local é synthetic / fast-text, e o manifesto declara explicitamente as duas requisições, sem alegar requisições sem modelo; o plano de controle e o CDN são respondidos pelo proxy de teste MITM já existente, usando a CA de configuração e sem afrouxar a verificação HTTPS do produto.
- O refresh da página de configurações não se transforma em espera antes do envio de negócio; este exemplo continua seguindo o caminho já estabelecido de notificação de atualização do Host / alinhamento de Account. Ele não cobre o Model em execução, não substitui os benefícios de conta paga nem a aceitação em celular / SSH.
- A primeira rodada e a segunda, de asserção de seleção persistente com a correção, passaram ambas; a evidência da segunda rodada foi escrita por engano no workspace de teste limpo em afterSession, e passou-se a usar o diretório de relatórios existente para preservar a rede e o wire, sem alterar o produto. O resultado final consta da revisão final do lote inteiro.

## Pré-requisitos de produção e partes não concluídas

O plano de controle e o CDN respondem HTTP200 de fato, mas o novo downloader compartilhado rejeita a revision19 em produção: os dois templates de access ainda contêm `teamApiKeyManagementUrl`. Este é um artefato de publicação antigo com um campo explicitamente removido nesta rodada, e não se restaura compatibilidade. Mantém-se o local/LKG; a publicação da nova URL versionada será executada por quem tiver permissão, e nada foi enviado automaticamente nem o ponteiro de produção alterado.

Antes da publicação real, executar: `ZCODE_BUILTIN_RELEASE_TEST_FILE=/caminho/absoluto/arquivo-final.json pnpm exec vitest run packages/provider-node/test/zcode-builtin-integrity.test.ts`, registrando o hash do arquivo; após o upload, comparar o hash baixado. Não se pode usar a aprovação da cópia atual como substituição da aceitação do arquivo final após as alterações posteriores do Todo113, nem usar a aprovação do decoder como substituição das asserções de integridade.

O código deste item, toda a cadeia de refresh no desktop e a verificação do arquivo final estão concluídos; as limitações de celular / SSH, Windows e validação real em produção permanecem no Goal, não são repassadas ao 102 para mascarar e não se declara concluída toda a aceitação de produção.