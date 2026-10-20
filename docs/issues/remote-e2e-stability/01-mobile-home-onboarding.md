# O onboarding inicial cobre a home do controle remoto pelo celular

Status: needs-triage

## Revisão de baseline de 2026-10-11

O lote completo do baseline de negócio `d31e735905cf744e75a0a93548a80acabe871ae5`,
`r3-server-20261011105317614-4a6780`, com `soakdual/mobile-initial.json`, já mostrou os
projetos remotos reais, o ID da tarefa original e a primeira mensagem, com `failures=[]` e
sem `onboarding-page`. A falha de 146,2 segundos nesta rodada foi causada pelo helper de
pareamento continuar aguardando o texto já descontinuado "conectado à janela atual do
desktop", e não por uma nova recorrência dos problemas de onboarding antigos descritos abaixo.

O teste passou a aguardar o nó de tarefa/projeto especificado pelo chamador e, em seguida, o
case original confere o estado de conexão do celular no Desktop; um painel lateral vazio não
conta como sucesso. O caso específico de rascunho usa a entrada de criação de nova tarefa com
o `projectId` original e continua exigindo zero mensagens do modelo. O teste unitário já
reproduziu a ausência do prompt antigo e validou o novo critério de prontidão; o encadeamento
posterior do celular real e o soak de 10 minutos ainda aguardam nova execução. As evidências
do baseline antigo abaixo são preservadas, e nesta rodada não se conclui que o celular
continua bloqueado pelo onboarding com base no problema antigo.

## Expectativa e realidade

O [contrato do controle remoto pelo celular](../../web-remote-control/web-remote-control-architecture.md)
exige que, após o escaneamento do QR code, o usuário entre na home de tarefas e possa navegar
pelos workspaces e pelas tarefas da janela atual do desktop.
No branch atual, o navegador do celular já carregou os recursos Web da mesma versão e entrou
no Root home-only, mas exibiu o onboarding de profissão em três passos; a home de tarefas e
os textos de estado do pareamento ficaram encobertos.
Isso impede que `mobile` e `mobileperm` continuem validando troca de tarefas, permissões e
recuperação após queda de rede; não se pode marcar esses caminhos como aprovados pulando o
onboarding nem semeando o estado do celular.

## Evidências da realidade

- Baseline de negócio: `54ece08f23f79ae54aea1f51e0d941497d627392`, sem alteração de código de negócio.
- Lote: `r3-server-20260924051309226-ac32d1`, servidor `/home/e2e/z-code-stability-20260924`.
- `mobile` e `mobileperm` usaram cada um seu próprio Desktop HOME, contêiner e Playwright
  context, e ambos falharam ao aguardar a home.
- Os dois arquivos `mobile-pairing-1.json` registraram `testIds: ["onboarding-page"]`, com corpo
  "direção de trabalho / modo de UI / preferências do assistente", e o array de erros de
  carregamento de recursos vazio.
- O `soakdual` do lote independente `r3-server-20260924054830817-45203b` apresentou a mesma
  página, falhando após 199 segundos; a observação de 10 minutos ainda não foi alcançada, de modo
  que não se pode afirmar que a estabilidade foi verificada.
- O build Web do branch atual é servido pelo host de teste em loopback, e HTML e JavaScript
  retornam de fato 200; o relay de teste real e o fluxo de pareamento do produto permanecem inalterados.
- Evidências locais: [mobile](../../../packages/desktop/.e2e-artifacts/remote-stability-20260924/mobile-pairing-recheck07.json),
  [mobileperm](../../../packages/desktop/.e2e-artifacts/remote-stability-20260924/mobileperm-pairing-recheck07.json).
  Os artefatos completos ficam no servidor em `.e2e-artifacts/<batch>-<case>/` e não contêm
  credenciais públicas de pareamento.

## Localização no código

1. `renderExternalRelayHomeOnlyRoot`, em `packages/web/src/main.tsx`, usa
   `createHomeOnlyWebRemoteControlServices()`; seus settings têm apenas recentProjects/locale e
   não fornecem `onboardingRecordService`.
2. `packages/ui/src/Root.tsx` envolve o conteúdo de workspace/home com `OccupationOnboarding`
   tanto no caminho do desktop quanto no do celular.
3. `packages/ui/src/onboarding/useOnboardingTrigger.ts`, quando o serviço de registro não existe,
   recorre a `!hasStoredOccupation` e, por isso, o serviço home-only dispara o onboarding.

Os itens acima são a localização da cadeia de chamadas consistente com o resultado no aparelho
real; a implementação ainda não foi modificada e a causa não foi atribuída a falhas de relay
ou de SSH.

## Reprodução e aceitação

No harness remoto já preparado, executar `node harness/remote/run-queue.mjs mobile mobileperm`.
A correção deve preservar o limite de serviços somente-leitura da home do celular e não pode
criar um Host/Agent separado para inicializar a home nem forçar a conexão a um workspace.
Em seguida, verificar que fresh context, novo pareamento e desconexão da home de workspace
conseguem entrar na lista de tarefas e continuar cumprindo as asserções originais de
mobile/mobileperm/soakdual.

Outro problema de ambiente independente é o 404 do script do site de teste publicado
`/remote/v4?app_version=3.12.2`, registrado no [README do harness](../../../harness/remote/README.md).
Esse 404 não deve ser confundido com a cobertura por onboarding dos recursos da mesma versão
descrito neste Issue.
