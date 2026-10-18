# BG26 429 Failure Projection Isolation Plan

**Objetivo:** fazer com que BG26 valide de forma determinística, usando um `429` synthetic real uma única vez, a notificação de falha, o hover e o restore, sem modificar a lógica de rede normal do produto.

**Arquitetura:** o worker do BG26 simultaneamente converte o retry para 0 e define o replay server dinâmico como um HTTP proxy local ao caso, forçando as requisições de modelo a passar pelo Node http + um canal `ProxyAgent` separado; os demais workers restauram o ambiente anterior à inicialização do WDIO.

## Restrições

- Não modificar `apps/zcode-cli`, `packages/ui` nem `product-projection.ts`.
- Não adicionar timeout e não alterar o erro original do provider.
- Não estender as semânticas de `continuous` do desktop nem de `web-remote-replayable` do celular.

### Task 1: registrar e desfazer os experimentos refutados

- [x] Desfazer o experimento de ordem de cleanup/abort do runner.
- [x] Desfazer o experimento de leitura única de body no registry.
- [x] Remover o teste falso-positivo de `server.maxConnections = 1`.
- [x] Provar com E2E real que `closeConnection` e retry=0 isolado não corrigem BG26 de forma estável.

### Task 2: isolar o canal de requisição do worker BG26

- [x] Adicionar um RED test focado exigindo que BG26 defina retry=0 e faça bind do replay proxy atual, com os workers subsequentes restaurando o valor original.
- [x] Implementar o isolamento de ambiente com escopo de worker e rodar o GREEN.
- [x] Remover o fixture de retry que o BG26 não usa mais e rodar a verificação de contrato dos fixtures.

### Task 3: verificar e commitar

- [x] Rodar duas rodadas consecutivas do BG26 sem alterações, confirmando 1 passed em ambas.
- [x] Conferir, a partir de capture/log, um 429 do child, `maxAttempts=1`, child failed e o erro original da notificação do pai.
- [x] Executar `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm typecheck`, `pnpm lint`.
- [ ] Commitar `test(e2e): isolate BG26 failure projection`.