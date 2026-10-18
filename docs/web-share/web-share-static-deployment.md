# Publicação estática via Jenkins da landing page Share

## Objetivo

A landing page Share é construída e publicada separadamente como imagem estática nginx, sem
compartilhar com a imagem `/remote` do controle remoto do celular nem com o Deployment. O Job
Jenkins seleciona o endpoint de API/OAuth do ZCode injetado no build via `ZCODE_ENV=test|production`;
a entrada da página é `/cn/share` (chinês) ou `/share` (inglês).

## Cadeia de publicação

```text
Jenkins checkout z-code
  -> pnpm / Dockerfile.web-share
  -> Vite build:web-share (base=/cn/share/)
  -> nginx static image
  -> Docker registry push
  -> kubectl set image share Deployment
  -> rollout status
```

O Jenkins não coloca API token nem senha do Docker em Docker ARG, tags de imagem, contexto de
build ou logs. O build de Share instala apenas as dependências leves de `@zcode/web-share` e usa
o lockfile do repositório para garantir reprodutibilidade das dependências de renderização; a
instalação filtrada não traz as dependências completas de CUA de Web/Remote para o closure nem
requer CUA Git token. A imagem de runtime contém apenas nginx e os artefatos estáticos, e o
material-icons é copiado junto de `packages/web/public`.

## Configuração do Jenkins

`Jenkinsfile.web-share` usa, como o Job remote existente, o template de Pod Kubernetes `default`
e exige que esse template contenha os containers `buildkit` e `kubectl`. A configuração padrão
do Pipeline visa a staging:

- registry: `openwebui-hk-registry-vpc.cn-hongkong.cr.aliyuncs.com/glm-chat`
- imagem: `staging-zcode-conversation-share`
- Deployment e container: `staging-zcode-conversation-share`
- namespace/context: `zcode` / `openwebui`
- `ZCODE_ENV=test`, com endpoint de build `https://zcode.z.ai`

É possível alternar para `production` por parâmetro do Pipeline, sobrescrevendo o nome da imagem,
do Deployment e do container. A credential do repositório Git segue o valor do Pipeline remote; o
Share não precisa de credential de CUA. A nomenclatura de imagem e Deployment específicas do
share precisa ser confirmada por quem mantém a infraestrutura.

O Jenkins precisa ter o Pipeline script from SCM habilitado, com o caminho do script definido como
`Jenkinsfile.web-share`. O Pipeline faz clone raso de `BRANCH_TO_BUILD`, gera uma tag imutável
`<clean-branch>-<8 primeiros dígitos do commit sha>`, constrói com BuildKit e envia o
`Dockerfile.web-share`, e então executa:

```text
kubectl set image deployment/<DEPLOYMENT_NAME>
  <CONTAINER_NAME>=<REGISTRY>/<IMAGE_NAME>:<tag> -n zcode --context openwebui
kubectl rollout status deployment/<DEPLOYMENT_NAME> -n zcode --context openwebui --timeout=4m
```

## Caminho de aceitação

Após subir a imagem, é obrigatório que:

- `/cn/share`, `/cn/share/callback`, `/share`, `/share/callback` retornem 200;
- `/cn/share/` redirecione para `/cn/share` e `/share/` para `/share`;
- Ambas as entradas acessem a SPA, os mock fixtures e os assets; os artefatos de build usam por
  padrão o prefixo `/cn/share/assets/`;
- `/remote/v4` não é servido pela imagem share.

O smoke test completo de build local e das rotas nginx ainda pode usar
`scripts/test-web-share-build.sh`; ele só precisa de Docker, sem credenciais Git de CUA.