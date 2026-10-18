# Design de implantação paralela dos assets estáticos do Web Remote v3

## Contexto

Atualmente a página de controle remoto mobile é uma SPA Vite em `packages/web`. O fluxo de publicação em produção executa primeiro
`pnpm run build:web-remote-control`, gravando o artefato em `packages/web/dist`, e depois usa
`Dockerfile.web-remote-control` para copiar os arquivos estáticos para a imagem `nginx:alpine`. O caminho de serviço atual é
`/remote`, e o script de publicação envia por padrão `uhub.service.ucloud.cn/tianqi/zcode-remote-mobile-v2:<tag>`,
atualizando `zcode/frontend/deployment-remote.yaml` no repositório `cgx-dev-k8s`.

A nova versão precisa usar um novo caminho de serviço `/remote/v3`, mantendo inalterados os assets, a imagem, os scripts,
o deployment e o comportamento de serviço do `/remote` original.

## Objetivos

1. Implantar os assets estáticos do controle remoto mobile da nova versão em `/remote/v3`.
2. Manter inalterados o build dos assets do `/remote` original, o build da imagem, o script de publicação e o caminho de atualização do k8s deployment.
3. O script de publicação do v3 atualiza ao final apenas `zcode/frontend/deployment-remote-v3.yaml`.
4. A URL padrão do QR Code do desktop da nova versão aponta para `https://zcode.z.ai/remote/v3`.
5. Os assets estáticos do v3 continuam hospedados pelo nginx, sem introduzir Node server, relay, agent runtime ou recursos de desktop runtime.
6. Os caminhos de assets no navegador de `/remote` e `/remote/v3` são independentes entre si, evitando que a publicação de uma versão afete a outra.

## Não objetivos

1. Não modificar o protocolo externo de relay, o repasse de `rpc-frame`, shared-host attachment, task stream ou a semântica de recuperação replayable.
2. Não transformar `/remote/v3` em uma subrota reutilizada dentro do container do `/remote`.
3. Não criar arquivos de service, ingress ou deployment no k8s a partir dos scripts de publicação do z-code.
4. Não alterar a antiga entrada de compatibilidade OAuth `/web-remote`.
5. Não migrar nem remover a antiga imagem e implantação do `/remote`.

## Abordagem recomendada

Adotar um fluxo de publicação v3 paralelo, em vez de reutilizar ou reescrever o fluxo v2 existente.

```text
v2:
  pnpm run build:web-remote-control
  -> packages/web/dist, base=/remote/
  -> Dockerfile.web-remote-control
  -> nginx.web-remote-control.conf
  -> image zcode-remote-mobile-v2:<tag>
  -> zcode/frontend/deployment-remote.yaml
  -> /remote

v3:
  pnpm run build:web-remote-control:v3
  -> packages/web/dist, base=/remote/v3/
  -> Dockerfile.web-remote-control-v3
  -> nginx.web-remote-control-v3.conf
  -> image zcode-remote-mobile-v3:<tag>
  -> zcode/frontend/deployment-remote-v3.yaml
  -> /remote/v3
```

Dessa forma falhas de publicação, erros de rota nginx, erros de base dos assets e erros de atualização da imagem k8s ficam restritos ao fluxo v3,
sem sobrescrever a imagem antiga e sem alterar o deployment antigo.

## Script de build

O `package.json` da raiz mantém o script existente:

```bash
pnpm run build:web-remote-control
```

Adiciona-se o script v3:

```bash
pnpm run build:web-remote-control:v3
```

O conteúdo do script usa o base do Vite:

```bash
pnpm --filter @zcode/web exec vite build --base=/remote/v3/
```

`packages/web/dist` continua sendo o único diretório de artefatos estáticos. O script de publicação executa em sequência, então v2 e v3 não precisam manter dois
diretórios dist ao mesmo tempo. O build da versão correspondente precisa ter sido executado antes do build Docker.

## Detecção da entrada Web

`packages/web/src/main.tsx` hoje usa apenas `window.location.pathname === "/remote"` para detectar a entrada de controle remoto via QR.
O caminho da página v3 é `/remote/v3`; sem alterar esse ponto, a página v3 Passaria pelo bootstrap Web comum.

No design, a detecção da entrada deve ser calculada com base no Vite base do artefato atual:

```text
import.meta.env.BASE_URL = "/remote/"    -> 远控入口路径 "/remote"
import.meta.env.BASE_URL = "/remote/v3/" -> 远控入口路径 "/remote/v3"
```

Assim o build v2 reconhece apenas `/remote` e o build v3 apenas `/remote/v3`. Isso evita que o artefato antigo do v2 reconheça inadvertidamente
`/remote/v3` depois de ser reconstruído, e evita que o artefato v3 assuma o antigo `/remote`.

## Configuração nginx do v3

Adiciona-se `nginx.web-remote-control-v3.conf`; o diretório raiz de serviço continua sendo `/usr/share/nginx/html`, mas o SPA fallback e os aliases de assets estáticos
são oferecidos apenas para os caminhos v3.

Rotas principais:

```text
/remote/v3                 -> /index.html, no-cache
/remote/v3/                -> 301 /remote/v3
/remote/v3/assets/*        -> /usr/share/nginx/html/assets/*, immutable
/remote/v3/material-icons/* -> /usr/share/nginx/html/material-icons/*, immutable
/                            -> 302 /remote/v3
```

Manter a compatibilidade de acesso direto a `/assets/*` e `/material-icons/*` não é objetivo do v3. O HTML do artefato v3 deve usar
`/remote/v3/assets/...`, e o gateway de produção também deve precisar apenas encaminhar o prefixo `/remote/v3`.

`/web-remote` e `/web-remote/callback` são as antigas entradas de compatibilidade OAuth e não fazem parte do escopo de mudança da implantação estática QR v3.
A configuração nginx do v3 não precisa adicionar rotas `/web-remote`.

## Imagem Docker v3

Adiciona-se `Dockerfile.web-remote-control-v3`:

1. Usa `nginx:alpine` como imagem base.
2. Copia `packages/web/dist` para `/usr/share/nginx/html`.
3. Copia `nginx.web-remote-control-v3.conf` para `/etc/nginx/nginx.conf`.
4. Expõe a porta 80.
5. O healthcheck acessa `http://127.0.0.1/remote/v3`.

A imagem não instala Node, não contém `node_modules`, não contém `packages/server`, não contém relay, não contém desktop runtime
e não contém assets do agente remoto.

## Script de publicação

`scripts/docker-build-and-push-web-remote-control.sh` é mantido como está, Continue serving v2.

Adiciona-se `scripts/docker-build-and-push-web-remote-control-v3.sh`, seguindo a estrutura do script antigo, mas com os valores padrão alterados para:

```text
DOCKER_IMAGE_NAME=uhub.service.ucloud.cn/tianqi/zcode-remote-mobile-v3
DOCKERFILE=Dockerfile.web-remote-control-v3
K8S_DEPLOYMENT_FILE=zcode/frontend/deployment-remote-v3.yaml
K8S_BRANCH_NAME=deploy/zcode-remote-mobile-v3-<tag>
MR title=chore: update zcode remote v3 image to <tag>
```

Ordem de execução do script:

```text
docker login
pnpm run build:web-remote-control:v3
docker build --platform <platform> -f Dockerfile.web-remote-control-v3 -t <image> .
docker push <image>
git -C <cgx-dev-k8s> checkout/update base branch
replace first image field in zcode/frontend/deployment-remote-v3.yaml
commit and push MR branch
```

Se `deployment-remote-v3.yaml` não existir, o script falha diretamente com uma mensagem. A razão é que a fronteira de recursos service, ingress e deployment
pertence ao repositório k8s e não deve ser gerada temporariamente pelos scripts de publicação do z-code.

## URL do QR Code no desktop

Em `packages/desktop/src/main/index.ts`, o valor padrão de `mobileRemoteControlUrl` passa a ser:

```text
https://zcode.z.ai/remote/v3
```

A variável de ambiente `ZCODE_WEB_REMOTE_CONTROL_URL` continua mantendo a prioridade mais alta, para debug local ou reversão temporária:

```bash
ZCODE_WEB_REMOTE_CONTROL_URL=https://zcode.z.ai/remote pnpm dev:desktop
```

Assim a nova versão do desktop entra por padrão no v3 ao escanear o QR Code, e as versões antigas do desktop continuam usando o `/remote` padrão antigo de quando foram compiladas.

## Requisitos complementares do k8s

O script de publicação do z-code atualiza apenas a imagem do deployment v3. O repositório k8s precisa ser preparado separadamente:

1. `zcode/frontend/deployment-remote-v3.yaml`
2. Um service apontando para o deployment v3, por exemplo `remote-mobile-v3`
3. No ingress, o prefixo `/remote/v3` apontando para o service v3
4. No ingress, o prefixo original `/remote` continuando apontando para o service v2

Como `/remote/v3` é um subcaminho de `/remote`, o ingress do k8s precisa garantir que o casamento mais específico de `/remote/v3` não seja
engolido pelo prefixo antigo `/remote`. Esse comportamento deve ser validado na configuração de ingress do repositório k8s.

## Testes

Adiciona-se o smoke test Docker do v3:

```bash
bash scripts/test-web-remote-control-v3-docker-build.sh
```

Itens de verificação:

1. `pnpm run build:web-remote-control:v3` tem sucesso.
2. `packages/web/dist/index.html` existe.
3. `packages/web/dist/assets` existe.
4. `packages/web/dist/material-icons` existe.
5. O caminho do primeiro script do HTML começa com `/remote/v3/assets/`.
6. `/remote/v3` dentro do container retorna 200.
7. `/remote/v3/` dentro do container retorna 301.
8. `/remote/v3/assets/<built-js>` retorna 200.
9. `/remote/v3/material-icons/typescript.svg` retorna 200.
10. `/` retorna 302 para `/remote/v3`.

Mantém-se o smoke test antigo:

```bash
bash scripts/test-web-remote-control-docker-build.sh
```

O test antigo continua provando que o fluxo v2 `/remote` não foi quebrado.

## Verificação de regressão

Após a implementação, executar:

```bash
pnpm typecheck
pnpm lint
bash scripts/test-web-remote-control-docker-build.sh
bash scripts/test-web-remote-control-v3-docker-build.sh
```

Se a máquina atual não tiver Docker ou não conseguir acessar o registry, executar ao menos o build Vite local e a verificação estática dos scripts, listando na
descrição do commit os itens não verificados.

## Riscos e mitigação

1. `packages/web/dist` é um diretório de saída compartilhado. Mitigação: o script de publicação executa o build da versão correspondente antes de cada docker build.
2. A página v3 ser assumida pelo bootstrap Web comum. Mitigação: calcular o caminho da entrada de controle remoto por `import.meta.env.BASE_URL`.
3. O subcaminho do ingress k8s ser engolido pelo prefixo antigo `/remote`. Mitigação: configurar o prefixo mais específico `/remote/v3` no repositório k8s
   e validar o roteamento em produção no MR do deployment v3.
4. O QR Code da nova versão do desktop continuar apontando para o caminho antigo. Mitigação: alterar o padrão `mobileRemoteControlUrl` no desktop, mantendo o fallback por variável de ambiente.
5. O script de publicação v3 alterar por engano o deployment antigo. Mitigação: adicionar um novo script e fixar o `K8S_DEPLOYMENT_FILE` padrão como
   `zcode/frontend/deployment-remote-v3.yaml`.

## Arquivos previstos para implementação

Mudanças previstas no repositório z-code:

1. `package.json`
2. `packages/web/src/main.tsx`
3. `packages/desktop/src/main/index.ts`
4. `Dockerfile.web-remote-control-v3`
5. `nginx.web-remote-control-v3.conf`
6. `scripts/docker-build-and-push-web-remote-control-v3.sh`
7. `scripts/test-web-remote-control-v3-docker-build.sh`
8. `docs/web-remote-control/web-remote-control-architecture.md`
9. Nos testes unitários relacionados, as asserções sobre o `/remote` padrão passam a cobrir o helper do v2 e a URL padrão do desktop v3