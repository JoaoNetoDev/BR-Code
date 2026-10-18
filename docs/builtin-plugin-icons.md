# Ícones dos plugins integrados

As informações da loja dos plugins integrados são definidas em
`apps/zcode-cli/packages/bootstrap/src/app/official-plugin-definitions.ts`. Cada
`listing.icon` usa a CDN de recursos dos plugins oficiais:

```
https://cdn-zcode.z.ai/zcode/official-plugin/assets/<plugin-name>/icon.png
```

`computer-use` reaproveita o `assets/zcode-cua/icon.png` já publicado. Depois que o identificador do plugin mudou de
`zcode-cua` para `computer-use`, o diretório de recursos na CDN manteve o nome antigo; não se pode concatenar o
identificador para produzir um `computer-use/icon.png` ainda não publicado (isso retornaria 404). O caminho do ícone e o
identificador do plugin podem ser mantidos de forma independente.

Os arquivos de recurso são fornecidos pelo repositório `zcode-plugins` em `assets/<plugin-name>/icon.png`; o pipeline de
publicação do branch `main` desse repositório sincroniza o diretório assets com a CDN. Os ícones usam URL HTTPS para atender
à validação de endereços de imagem confiáveis do cliente. O PNG precisa usar fundo transparente e preservar as cores
originais do Figma; a loja usa um contêiner semântico `bg-hover` para hospedar o ícone e não aplica mais inversão de tema
escuro à imagem inteira, evitando que cores de marca como as de Android, iOS e ZCode fiquem distorcidas no tema escuro. O
Installed Strip também não pode aplicar opacidade ao avatar inteiro conforme o estado de habilitação do plugin; o estado de
habilitação é expresso pela visão de gerenciamento. Se a requisição do recurso falhar ou não houver ícone configurado, a
loja de plugins continua exibindo o ícone padrão.

O Installed Strip do nó Figma `5080:5352` define o contrato visual dos ícones integrados: um contêiner de 36px com cantos
arredondados e um gráfico de 24px centralizado. A ordem das definições dos plugins integrados e a ordem dos ícones devem
permanecer consistentes:

1. `android-emulator` → `android`
2. `document-skills` → `dotpoints-01`
3. `ios-simulator` → `ios`
4. `restore-legacy-sessions` → `Frame` (seta para cima sobre uma caixa de arquivo)
5. `skill-creator` → `Frame` (cubo)
6. `zcode-guide` → logotipo do ZCode

Na ordenação do Installed Strip, os plugins integrados/inline devem vir inteiramente antes dos plugins instalados da
loja, ordenados de forma estável pelo nome de exibição no idioma atual; os demais plugins instalados da loja continuam
em ordem decrescente de data de instalação. A ordenação usa o `source` de runtime e não infere a identidade de plugin
integrado pela ausência de `installedAt`.

Plugins integrados atuais: `android-emulator`, `document-skills`, `ios-simulator`,
`restore-legacy-sessions`, `skill-creator`, `zcode-guide`.