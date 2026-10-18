# Design de deploy de recursos estáticos do Web Remote Test

## Contexto

A página atual de controle remoto do celular é uma SPA Vite em `packages/web`. O repositório já possui duas esteiras de deploy estático:

```text
v2:
  pnpm run build:web-remote-control
  -> base=/remote/
  -> Dockerfile.web-remote-control
  -> nginx.web-remote-control.conf
  -> uhub.service.ucloud.cn/tianqi/zcode-remote-mobile-v2
  -> zcode/frontend/deployment-remote.yaml
  -> /remote

v3:
  pnpm run build:web-remote-control:v3
  -> base=/remote/v3/
  -> Dockerfile.web-remote-control-v3
  -> nginx.web-remote-control-v3.conf
  -> uhub.service.ucloud.cn/tianqi/zcode-remote-mobile-v3
  -> zcode/frontend/deployment-remote-v3.yaml
  -> /remote/v3
```

O novo requisito é adicionar o caminho de recursos de teste `/remote/__test__` sobre o mesmo código Web de controle remoto, e fazer com que o script de publicação atualize, ao final, apenas
`zcode/frontend/deployment-remote-test.yaml` no repositório `cgx-dev-k8s`.

## Objetivos

1. Adicionar uma esteira de deploy estático para `/remote/__test__`.
2. `/remote/__test__` usa script de build próprio, Dockerfile, configuração de nginx, nome de imagem e arquivo de deployment k8s.
3. O script de publicação altera ao final apenas `zcode/frontend/deployment-remote-test.yaml`.
4. Manter inalteradas as esteiras existentes de `/remote` e `/remote/v3`.
5. Não modificar a URL padrão do QR code do desktop; a entrada de teste é especificada por `ZCODE_WEB_REMOTE_CONTROL_URL=https://zcode.z.ai/remote/__test__`.
6. Não modificar o protocolo de relay, shared-host attachment, task stream, snapshot, queue nem a semântica de recuperação de replayable.

## Não objetivos

1. Não mesclar `/remote/__test__` nos contêineres v2 ou v3 como subrota reutilizada.
2. Não criar deployment, service ou ingress de k8s no script de publicação do z-code.
3. Não modificar o `mobileRemoteControlUrl` padrão em `packages/desktop/src/main/index.ts`.
4. Não alterar a entrada de compatibilidade OAuth de `/web-remote`.
5. Não adicionar runtime de Agent separado, local host, sessão SSH/WSL/Docker ou estado de negócio de relay.

## Solução recomendada

Adotar uma terceira esteira de deploy estático paralela:

```text
test:
  pnpm run build:web-remote-control:test
  -> packages/web/dist, base=/remote/__test__/
  -> Dockerfile.web-remote-control-test
  -> nginx.web-remote-control-test.conf
  -> image uhub.service.ucloud.cn/tianqi/zcode-remote-mobile-test:<tag>
  -> zcode/frontend/deployment-remote-test.yaml
  -> /remote/__test__
```

Essa solução reaproveita a ideia de isolamento da v3: ao publicar os recursos de teste, as imagens v2/v3 não são sobrescritas e `deployment-remote.yaml` ou `deployment-remote-v3.yaml` não são alterados indevidamente.

## Build Web

Adicionar o script no `package.json` da raiz:

```json
"build:web-remote-control:test": "pnpm --filter @zcode/web exec vite build --base=/remote/__test__/"
```

`packages/web/dist` continua sendo o único diretório de saída. Como o script de publicação executa o build de teste antes do docker build, não é necessário criar um diretório dist-test separado.

`resolveWebRemoteControlRoutePathFromBaseUrl()` em `packages/shared/src/web-remote-control.ts` já consegue normalizar qualquer base do Vite para o caminho de entrada do QR:

```text
/remote/__test__/ -> /remote/__test__
```

Na implementação basta adicionar testes unitários provando que a base de teste é reconhecida como rota de QR do controle remoto.

## Configuração do Nginx

Adicionar `nginx.web-remote-control-test.conf`, com estrutura baseada na configuração da v3; as rotas principais são:

```text
/remote/__test__                  -> /index.html, no-cache
/remote/__test__/                 -> 301 /remote/__test__
/remote/__test__/assets/*         -> /usr/share/nginx/html/assets/*, immutable
/remote/__test__/material-icons/* -> /usr/share/nginx/html/material-icons/*, immutable
/                                  -> 302 /remote/__test__
```

Não é preciso adicionar a rota `/web-remote` na configuração. O HTML gerado pelo build de teste deve referenciar `/remote/__test__/assets/...`, e o gateway de produção só precisa encaminhar o prefixo `/remote/__test__` para o service de teste.

## Imagem Docker

Adicionar `Dockerfile.web-remote-control-test`:

1. A imagem base usa `nginx:alpine`.
2. Copia `packages/web/dist` para `/usr/share/nginx/html`.
3. Copia `nginx.web-remote-control-test.conf` para `/etc/nginx/nginx.conf`.
4. Expõe a porta 80.
5. O healthcheck acessa `http://127.0.0.1/remote/__test__`.

A imagem não instala Node e não contém `node_modules`, server, relay, runtime de desktop nem recursos de agente remoto.

## Script de publicação

Adicionar `scripts/docker-build-and-push-web-remote-control-test.sh`, copiado do script da v3 e com os valores padrão reduzidos:

```text
DOCKER_IMAGE_NAME=uhub.service.ucloud.cn/tianqi/zcode-remote-mobile-test
DOCKERFILE=Dockerfile.web-remote-control-test
K8S_DEPLOYMENT_FILE=zcode/frontend/deployment-remote-test.yaml
K8S_BRANCH_NAME=deploy/zcode-remote-mobile-test-<tag>
MR title=chore: update zcode remote test image to <tag>
build command=pnpm run build:web-remote-control:test
```

O script continua usando o fluxo existente:

```text
docker login
pnpm run build:web-remote-control:test
docker build --platform <platform> -f Dockerfile.web-remote-control-test -t <image> .
docker push <image>
git -C <cgx-dev-k8s> checkout/update base branch
replace first image field in zcode/frontend/deployment-remote-test.yaml
commit and push MR branch
```

Se `deployment-remote-test.yaml` não existir, o script falha imediatamente com uma mensagem, evitando que o repositório z-code gere recursos de k8s além da sua alçada.

## Entrada no Desktop

Não modificar a URL padrão do QR code do desktop. O padrão continua apontado por `packages/desktop/src/main/index.ts` para o caminho de produção do controle remoto.

Ao testar `/remote/__test__`, sobrescreva por variável de ambiente:

```bash
ZCODE_WEB_REMOTE_CONTROL_URL=https://zcode.z.ai/remote/__test__ pnpm dev:desktop
```

Essa abordagem preserva o comportamento padrão em produção e ao mesmo tempo permite uma regressão independente do deploy de teste.

## Requisitos complementares de k8s

O script de publicação do z-code atualiza apenas a imagem do deployment. O repositório de k8s precisa preparar com antecedência:

1. `zcode/frontend/deployment-remote-test.yaml`
2. Um service apontando para o deployment de teste
3. No ingress, o prefixo `/remote/__test__` apontando para o service de teste
4. No ingress, os prefixos `/remote` e `/remote/v3` continuando apontando para os serviços originais

Como `/remote/__test__` é um subcaminho de `/remote`, o ingress deve garantir que o prefixo mais específico de teste não seja engolido pelo prefixo antigo `/remote`.

## Testes

Adicionar um smoke test:

```bash
bash scripts/test-web-remote-control-test-docker-build.sh
```

Itens verificados:

1. `pnpm run build:web-remote-control:test` tem sucesso.
2. `packages/web/dist/index.html` existe.
3. `packages/web/dist/assets` existe.
4. `packages/web/dist/material-icons` existe.
5. O caminho do recurso do primeiro script no HTML começa com `/remote/__test__/assets/`.
6. `/remote/__test__` dentro do contêiner retorna 200.
7. `/remote/__test__/` dentro do contêiner retorna 301.
8. `/remote/__test__/assets/<built-js>` retorna 200.
9. `/remote/__test__/material-icons/typescript.svg` retorna 200.
10. `/` retorna 302 para `/remote/__test__`.

Após concluir a implementação, executar:

```bash
pnpm run typecheck
pnpm run lint
bash scripts/test-web-remote-control-docker-build.sh
bash scripts/test-web-remote-control-v3-docker-build.sh
bash scripts/test-web-remote-control-test-docker-build.sh
```

Se a máquina atual não tiver Docker, executar pelo menos `pnpm run typecheck`, `pnpm run lint`,
`pnpm run build:web-remote-control:test` e os testes unitários relacionados, e listar na descrição do commit que o smoke test de Docker não foi verificado.

## Riscos e mitigações

1. `packages/web/dist` é um diretório de saída compartilhado. A mitigação é o script de publicação executar o build da versão correspondente antes de cada docker build.
2. O script de publicação de teste alterar indevidamente o deployment v2/v3. A mitigação é o script independente ter como padrão fixo
   `zcode/frontend/deployment-remote-test.yaml`, com asserção sobre o texto do script no teste.
3. O caminho de recursos de teste ser engolido pelo ingress antigo de `/remote`. A mitigação é configurar no repositório de k8s o prefixo mais específico
   `/remote/__test__`.
4. A entrada padrão do desktop ser trocada indevidamente para a de teste. A mitigação é não alterar a URL padrão do QR code e fazer a cobertura de teste apenas por `ZCODE_WEB_REMOTE_CONTROL_URL`.
5. A entrada Web não reconhecer a base de teste. A mitigação é adicionar um teste unitário de `/remote/__test__/` para `resolveWebRemoteControlRoutePathFromBaseUrl()`.

## Arquivos a implementar

Alterações previstas na implementação:

1. `package.json`
2. `packages/shared/test/webRemoteControl.test.ts`
3. `packages/desktop/test/root-build-scripts.test.ts`
4. `Dockerfile.web-remote-control-test`
5. `nginx.web-remote-control-test.conf`
6. `scripts/docker-build-and-push-web-remote-control-test.sh`
7. `scripts/test-web-remote-control-test-docker-build.sh`
8. `docs/web-remote-control/web-remote-control-architecture.md`