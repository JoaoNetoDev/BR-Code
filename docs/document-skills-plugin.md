# Plugins oficiais de documentos

O antigo `document-skills` foi dividido por formato em quatro plugins de conteúdo independentes, além do plugin de busca de imagens `image-search`, habilitado por padrão no cliente:

| Plugin        | Skill | Diretório de código-fonte                       |
| ------------- | ----- | ------------------------------------------------ |
| documents     | docx  | `apps/zcode-cli/packages/documents-plugin`        |
| pdf           | pdf   | `apps/zcode-cli/packages/pdf-plugin`              |
| presentations | pptx  | `apps/zcode-cli/packages/presentations-plugin`    |
| spreadsheets  | xlsx  | `apps/zcode-cli/packages/spreadsheets-plugin`     |

A origem da sincronização é o repositório interno de plugins `zcode-marketplace/zcode-plugins-test`,
os diretórios `plugins/<nome-do-plugin>` correspondentes ao commit `e19dca8be86cf981ed2e0c2b4855c6ee6ee15265` de `origin/main`.
As quatro versões integradas publicadas são todas `0.1.8` (superior à `0.1.5` do antigo plugin agregado). Os diretórios importados são alinhados byte a byte com o upstream,
permitindo apenas diferenças nos campos de versão interna de package.json e .zcode-plugin/plugin.json; todas as diferenças de conteúdo desta vez vêm da exportação do upstream, e os campos de versão seguem a sequência de publicação interna.

Licença: os quatro plugins de documentos e o plugin de busca de imagens são Apache-2.0 (a partir de 2026-10-08; os plugins de documentos antes eram de licença não comercial e passaram a Apache-2.0 com a abertura do código, válido a partir de 0.1.8; o repositório de plugins upstream precisa sincronizar a licença, caso contrário a próxima sincronização trará a licença antiga de volta).

Nomes de exibição correspondentes: Documents / documentos Word, Presentations / documentos de apresentação, PDF / PDF, Spreadsheets / planilhas, Image Search / busca de imagens.

## Descoberta, habilitação e atualização

A definition oficial do Bootstrap é a fonte autoritativa do catálogo interno e da habilitação por padrão; a lista padrão de Settings deve corresponder a ela.
Inicialização → seed de quatro caches independentes → reconstrução do shard do mercado interno → descoberta de plugins existentes lê o shard → exposição de skills/agents.
Os caches são, respectivamente, `~/.zcode/cli/plugins/cache/zcode-plugins-official/<nome-do-plugin>/0.1.8/`.
Cada plugin pode ser habilitado, desabilitado, desinstalado e restaurado de forma independente; o item interno `document-skills` não é mais publicado.
O cache do antigo plugin agregado e a configuração do usuário não são removidos; o shard interno reconstruído não referencia mais o diretório antigo.
Plugins de mercado instalados separadamente pelo usuário continuam sendo tratados conforme a configuração de instalação e habilitação existente, sem reescrita ou desinstalação automática.

Cada plugin fornece `agents/visual-judge.md`, usando o nome qualificado `<nome-do-plugin>:visual-judge`.
O antigo nome `judge` não é mais fornecido pelos plugins internos. Cada plugin carrega apenas o skill do seu formato; os quatro plugins não declaram mais
o MCP `image_search` — a busca de imagens é fornecida pelo plugin `image-search`, habilitado por padrão, versão `0.1.1`, acessando `${ZCODE_BASE_URL}/api/v1/mcp/server/image_search` pela autenticação JWT oficial já existente; não há novo runtime MCP local.
O caminho do cache de `image-search` é `~/.zcode/cli/plugins/cache/zcode-plugins-official/image-search/0.1.1/`.

## Empacotamento e aceitação

O seed de filesystem, SEA, o bundle Node do Electron, o prebuild remoto, a implantação remota no servidor e a avaliação em contêiner
devem usar os cinco diretórios, preservando `agents/`. Cada unidade de publicação deve validar seu próprio `skills/<formato>/SKILL.md`
e `agents/visual-judge.md`; a ausência de qualquer asset obrigatório impede marcar o cache como completo.
Todas as autoridades de versão (package, manifest, Bootstrap, SEA) e os caminhos de cache devem ser consistentes; qualquer mudança de conteúdo exige aumento de versão.

A aceitação cobre: os quatro plugins descobertos por padrão e desativáveis de forma independente; o antigo item agregado não é mais interno; as quatro categorias de skill e o nome qualificado do Agent
descobertos separadamente; integridade de filesystem/SEA rejeitando a ausência do Agent de revisão; as listas de empacotamento desktop e remoto sem omitir nenhum dos plugins.
Esta alteração modifica apenas o conteúdo dos plugins e os manifestos de distribuição, sem mudar a semântica das sessões continuous do desktop ou replayable do celular.

## Limites de dependência

Skill interno não equivale a dependência de sistema interna. LibreOffice, Poppler, Playwright, ReportLab, Tectonic,
python-pptx, openpyxl etc. são fornecidos pelo ambiente de execução ou instalados conforme a verificação de ambiente do skill upstream.
Caminhos relativos de scripts têm como base o base directory devolvido pela ferramenta Skill.