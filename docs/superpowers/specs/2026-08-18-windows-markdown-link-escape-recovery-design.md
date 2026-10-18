# Design de recuperação de escapes em links markdown de caminhos do Windows

Data: 2026-08-18
Estado: design → implementação
Superfície afetada: `packages/ui/src/lib/windowsFileLinkEscapeRemarkPlugin.ts` (novo),
`packages/ui/src/components/ai-elements/message.tsx` (monta o plugin remark).
Sem alteração na cadeia de abertura de arquivos, sem alteração na reescrita rehype, sem alteração no plugin de citation.

## Contexto

No mesmo log de campo de «falha na captura de tela», além do bloqueio do gateway de DPI do Helper (já corrigido do lado do producer),
existia um segundo defeito visível ao usuário: o modelo, pelo fallback de captura via PowerShell, gravou a imagem com sucesso em disco

```text
C:\Users\dev\.zcode\workspace\default\screenshot.png   518252 bytes
```

mas a pré-visualização na área da conversa não abria, e `file.stat` / `file.readMediaPreview` reportavam ENOENT,
com o pedido na verdade sendo para

```text
C:/Users/dev.zcode/workspace/default/screenshot.png
```

`\.zcode` virou `.zcode` — faltou uma barra invertida.

## Causa raiz

O CommonMark determina que o escape de barras invertidas no destino de um link **vale apenas para pontuação ASCII**: em `\X`, quando X é pontuação o resultado é o próprio X; caso contrário a barra invertida é mantida como está. Caminhos do Windows atravessam exatamente as duas categorias:

```text
Fonte   [screenshot.png](C:\Users\dev\.zcode\workspace\default\screenshot.png)
                          ↑U    ↑z   ↑.      ↑w        ↑d       ↑s
                          fica fica come   fica      fica     fica
mdast  url = C:\Users\dev.zcode\workspace\default\screenshot.png
```

Teste real (`remark-parse`) confirma: apenas `\.` collapses; todas as demais barras invertidas sobrevivem.

A perda ocorre na **etapa de parsing do mdast**. O `rewriteLocalFileMarkdownTargetsRehypePlugin` existente roda na etapa rehype, onde o `node.properties.href` já é a string após a perda; trocar `\` por `/` ali apenas reescreve o caminho errado de outra forma, sem como recuperá-lo.

Este é um **descasamento de etapa em nível de design**, não um bug de implementação daquele plugin rehype: qualquer plugin rehype é incapaz de ver o texto de destination original. A correção precisa ser antecipada para a etapa remark, onde `node.position` ainda aponta para o texto original do VFile.

## Objetivos

1. Para links/imagens com caminhos absolutos do Windows na saída do modelo (letra de unidade e UNC), restaurar `node.url` à forma original do texto.
2. A restauração precisa ser **verificável**: só substituir quando «aplicar as regras de remoção de escape do CommonMark ao texto original resultar exatamente em `node.url`»; caso contrário, manter como está. Melhor não corrigir do que corrigir errado.
3. Não afetará caminhos não-Windows, nem `http(s)`, nem caminhos relativos nem citations.

## Não objetivos

- Não alterar a saída do lado do modelo (deixar o modelo escapar as barras invertidas é incontrolável, e mensagens antigas já estão persistidas).
- Não alterar a cadeia da etapa rehype, que continua funcionando normalmente para URLs já corretas.
- Não tratar a forma com colchetes angulares `<...>` nem links com title: esses dois não ocorrem neste cenário e são tratados uniformemente como «não restaurar», mantendo o fail closed.

## Design

### Etapas

```text
texto markdown de origem
    │
    ├─ remark-parse ──────────► mdast (neste ponto o destination já foi re-escapeado, as informações de posição ainda existem)
    │
    ├─ ✦ windowsFileLinkEscapeRemarkPlugin  ← novo, restaura node.url aqui
    │
    ├─ demais plugins remark (GFM / citation)
    │
    ├─ mdast → hast
    │
    ├─ rewriteLocalFileMarkdownTargetsRehypePlugin (existente, normaliza para /C:/… para a camada de segurança liberar)
    │
    └─ rehype-harden → render
```

### Algoritmo de restauração

Para cada nó `link` / `image` / `definition`:

1. Portão: `node.url` precisa ter a forma `X:\…` / `X:/…` (letra de unidade) ou começar com uma única `\` (UNC).
   Todo o resto é pulado; URLs comuns não entram na superfície de reescrita deste plugin.

   Para UNC exige-se apenas **uma** barra invertida inicial: no texto-fonte, em `\\host`, o próprio `\\` já é um escape de pontuação, e após o parsing sobra uma única barra invertida (medido: `[log](\\build01\share\.logs\run.txt)` →
   `\build01\share.logs\run.txt`). Exigir duas acabaria descartando todos os UNC que realmente precisam de restauração.
2. Se `node.title` não for vazio, pular (a sintaxe de title não é interpretada).
3. Usar os offsets start/end de `node.position` para recortar da origem no VFile o trecho inteiro, obtendo o destination conforme a forma do nó:
   - `link` / `image`: `[label](dest)` / `![alt](dest)`, exige terminação em `)`, tomando o trecho após o último `](` até o `)` final. Caminhos do Windows não contêm `](`, portanto, dentro do portão, «pegar o último» é seguro, e colchetes dentro do label/alt não deslocam o corte.
   - `definition`: `[ref]: dest`, tomando o trecho após `]:`. A URL de um link por referência é fornecida pela definition, e a mesma perda ocorre igualmente nesse caminho.
4. Forma com colchetes angulares (`<…>`): pular.
5. **Verificação**: só se considera que o corte está correto e a restauração é inequívoca quando `unescapeCommonMarkPunctuation(raw) === node.url`; nesse caso `node.url = raw`; caso contrário, manter sem alteração.

As regras de reversão de escape são idênticas às do CommonMark:

```text
\ seguido de pontuação ASCII (! " # $ % & ' ( ) * + , - . / : ; < = > ? @ [ \ ] ^ _ ` { | } ~)
  → remover a barra invertida
outros casos → manter como está
```

O passo 5 é a válvula de segurança de todo o design: um corte errado, um texto original contendo referência de entidade (`&amp;`) ou qualquer sintaxe inesperada faz a igualdade falhar, e então a restauração é abandonada em vez de gravar um caminho errado.

### Montagem

Em `message.tsx`, o `messageRemarkPlugins` hoje só é fornecido explicitamente quando
`renderZCodeFileCitations && workspacePath`, e caso contrário recebe `undefined`
(seguindo o padrão do Streamdown). Este plugin precisa ter efeito **incondicionalmente**, portanto passou-se a sempre fornecer explicitamente
`defaultRemarkPlugins + windowsFileLinkEscapeRemarkPlugin`, mantendo o plugin de citation anexado pela condição original. Passar os plugins padrão explicitamente é a convenção já existente (ver o comentário já presente no local: sem os plugins padrão as tabelas degradam).

## Impacto e riscos

- **Multiplataforma**: o portão só reconhece letra de unidade/UNC; no macOS/Linux o modelo não produz essa URL, então o plugin custa uma verificação por regex.
- **Desempenho**: o recorte do texto original só ocorre quando o portão é atingido, e a taxa de acerto em conversas normais é baixíssima.
- **Dano colateral**: coberto pela verificação de igualdade do passo 5; se não fechar, a restauração é abandonada.
- **Mensagens antigas**: a restauração ocorre no momento da renderização, então basta re-renderizar as mensagens antigas, sem migração de dados.

## Aceitação

1. Novos testes unitários cobrindo: restauração de `\.zcode`, nó image, colapso da barra invertida inicial de UNC, definition por referência, nada muda quando não é preciso restaurar, URLs não-Windows intactas, pulo quando há title, pulo no formato com colchetes angulares e manutenção do valor original quando a verificação falha (referência de entidade).
2. `pnpm exec vitest run packages/ui/test/windowsFileLinkEscapeRemarkPlugin.test.ts` passa, e os 11 arquivos de teste existentes dos quais message.tsx depende ficam todos verdes.
3. Ponta a ponta: na conversa, a pré-visualização de `[x](C:\Users\dev\.zcode\...\screenshot.png)` abre.