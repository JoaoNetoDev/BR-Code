# Diagnóstico do runtime CUA no Windows e a armadilha da «instalação obsoleta»

Data: 2026-08-18
Estado: já implementado
Relacionado: `docs/cua/windows-product-runtime.md` (o próprio contrato de lançamento)

## 1. Origem e conclusão

O juízo inicial desta tarefa foi «o producer fixado em 72a8487d removeu a camada de host do Windows». **Esse juízo está errado**;
a conclusão correta é:

> `node_modules/@zcode/zcode-cua` está parado num commit antigo anterior ao pin; o código-fonte do repositório em si não tem problema.
> Depois de reinstalar conforme o lockfile, o `tsc` do código-fonte sem alterações roda com zero erros e o `prepare:windows-cua-helper` empacota normalmente.

Isso é registrado porque a armadilha vai se repetir: `@zcode/zcode-cua` é uma dependência git e **mudar o pin não reinstala automaticamente**.

## 2. Como o diagnóstico errado aconteceu

Na auditoria foi lido o `node_modules/@zcode/zcode-cua`, tratado como «o conteúdo para onde o pin aponta». Na época os dois não coincidiam:

```
pnpm-workspace.yaml  catalog: ...zcode-cua.git#72a8487d   ← declaração
pnpm-lock.yaml       resolution: {commit: 72a8487d}       ← travamento (coincidente)
node_modules/...     ← instalação real: commit antigo instalado em 10/08 (não coincidente)
```

Assim, o mesmo símbolo levava a conclusões opostas em cada lugar:

| Fato | node_modules (antigo) | producer main@72a8487d (real) |
|---|---|---|
| `package.json.zcodeCuaRuntime` | ausente | **presente** |
| `dist/windows-helper.js` | ausente | **presente (versionado)** |
| `WINDOWS_DEV_CONTROL_PROTOCOL` | sem exportação | **presente** (`windowsDevHelperMain.ts:17`) |
| porta do controller em `ports.ts` | ausente | **presente** (`CuaController*` + take/stop) |

Os 8 erros de TS vieram todos daí; não era uma regressão do producer. As alterações feitas sobre a premissa errada foram revertidas por inteiro em `b99a74dbdf` (as portas do controller removidas por engano e a reintrodução em fonte única das constantes de protocolo foram restauradas).

### Método de distinção (faça este passo primeiro da próxima vez)

```sh
# A instalação está consistente com o pin? Os campos files, a versão ou um artifact-chave — bastam três opções para refutar
node -e "console.log(JSON.stringify(require('./node_modules/@zcode/zcode-cua/package.json').zcodeCuaRuntime))"
ls node_modules/@zcode/zcode-cua/dist/windows-helper.js
```

Se qualquer um desses não bater com o conteúdo do repositório do producer no mesmo SHA, rode primeiro `pnpm install --frozen-lockfile` e **não** apague interfaces no consumidor para se acomodar a ele. O CI instala limpo a partir do lockfile toda vez, então esse tipo de ilusão só aparece localmente — alterar o repositório conforme a ilusão equivale a cristalizar um problema de ambiente local no código.

## 3. As duas melhorias realmente mantidas nesta rodada

Ambas são independentes do diagnóstico errado acima: são lacunas de diagnosticabilidade que se sustentam por si só.

### 3.1 Falha de resolução do runtime agora gera log

`resolveWindowsCuaRuntime` tem 13 causas de falha estáveis (`missing-native-addon` /
`artifact-integrity-mismatch` / `incompatible-runtime-manifest` …), antes todas repassadas
como estavam por `createWindowsCuaHelperHost` ao chamador e engolidas: o usuário só via «não carregado» na página de configurações.

```
start() ──▶ getHost ──▶ resolveRuntime() ──✗ reject
                             │                 │
                             │                 └─▶ logger.error(reason, artifact, …)  ← novo
                             ▼
                        （rejection em cache）
start() chamado de novo ──▶ reaproveita a mesma promise ──▶ não registra log de novo
```

- O `catch` envolve apenas o próprio `resolveRuntime()`. Um `assertActive` lançar dentro do `then` seguinte é uma corrida de `stop()`, não uma falha de resolução; misturar os dois na mesma linha de log seria enganoso.
- O payload contém apenas `reason / artifact / errorName / message`. Como a resolução acontece antes do mint do token e do named pipe, o payload naturalmente não contém segredos; o caso de teste fixou essa garantia de ordem como asserção de regressão.
- `createWindowsCuaHelperHost` passou a precisar ser exportado (para os testes injetarem logger e host stub).

### 3.2 Erro de contrato em tempo de build prova a própria identidade

`readProducerRuntimeContract` antes espremia onze condições em um único `if`, lançando só uma frase:
`invalid zcodeCuaRuntime Windows artifact path contract`. Agora foi dividido em verificações item a item, e o erro contém
**nome do pacote@versão, diretório de origem, item específico não atendido** (falta `zcodeCuaRuntime` / `schema` incorreto / caminho inválido).

O valor disso fica exatamente comprovado por este incidente: se o erro desde o início tivesse dito com clareza «`@zcode/zcode-cua@0.5.2` em
`<caminho>`: `zcodeCuaRuntime is missing`», a instalação obsoleta apareceria na hora e não seria lida como regressão do producer.

### 3.3 Início padrão em dev completa a raiz do runtime no lado Windows

`scripts/dev-desktop-env.mjs` sempre injetou `ZCODE_CUA_BUNDLED_HELPER_APP_PATH` no macOS
(vinculado ao Helper.app construído deste checkout), e no Windows não injetava nada. Assim o host caía no ramo de produto para ler
`process.resourcesPath` — em dev isso é `node_modules/electron/dist/resources`, que na prática contém apenas
`default_app.asar`:

```
                     ┌ macOS：ZCODE_CUA_BUNDLED_HELPER_APP_PATH → Helper.app dentro do checkout  OK
pnpm dev:desktop ────┤
                     └ Windows：sem injeção → resourcesPath = electron/dist/resources
                                        → sem tools/cua-helper → invalid-runtime-manifest  FALHA
```

O resultado é que o computer use do Windows no início padrão em dev era sempre indisponível, dependendo de o desenvolvedor lembrar de definir
`ZCODE_CUA_DEV_ROOT` (`docs/cua/windows-source-development.md` documenta isso, mas é um manual de desenvolvimento de código-fonte,
e não é lido por quem apenas roda dev).

Novo `scripts/dev-desktop-cua-env.mjs`, que por padrão vincula `ZCODE_CUA_DEV_ROOT` a
`<repo>/node_modules/@zcode/zcode-cua`, ou seja, a versão apontada pelo pin do catalog, da mesma origem do staging do produto.
Limites:

- Quando o desenvolvedor define explicitamente, seu valor é **sempre** respeitado (o cenário de apontar para o próprio checkout do producer não muda); espaço em branco puro é tratado como não configurado, de forma consistente com o lado do runtime.
- Completa apenas o padrão do script de início em dev, sem tocar nos limites já existentes do lado do runtime («só reconhece `ZCODE_CUA_DEV_ROOT`, não busca diretórios vizinhos, não recorre aos recursos do pacote instalado»).
- O `node-linker=hoisted` do `.npmrc` do repositório faz com que esse caminho seja um diretório físico. Se o linkeder isolado for usado, ele será um symlink, a resolução falha fechada como `development-root-not-found`, e o log do item 3.1 explica o motivo.


## 4. Itens revisados e confirmados como «não são lacunas»

- **o reaper de órfãos roda só no darwin**: correto. Processos filhos no Windows têm um watchdog de `--parent-pid` como rede de proteção, não precisam de varredura de sobras na inicialização.
- **o instalador existe só no darwin**: correto. No Windows é usado o `resources/tools/cua-helper` dentro do pacote de instalação, sem fonte de download.
- **a tela de configurações do Windows tem apenas uma opção**: travado por `2026-08-17-cua-settings-surface-minimization.md`. Levar o motivo do runtime de ponta a ponta até a UI seria derrubar aquela spec, exige revisão própria e não foi alterado nesta rodada.