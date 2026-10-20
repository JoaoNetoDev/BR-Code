# Especificação de Consolidação de Escritas em TMPDIR

## Contexto

O diretório temporário do sistema pode ter as permissões restritas pelo ambiente do host, por sandbox ou por políticas
corporativas de segurança. Se o caminho principal do produto ZCode depender de escrita em `TMPDIR` / `os.tmpdir()`,
isso faz a exportação de logs, o envio de feedback, a leitura de imagens da área de transferência, a construção de
checkpoints ou a persistência da saída de comandos falharem em alguns ambientes.

## Objetivos

- exceto pela exceção da saída do Bash descrita abaixo, os arquivos temporários ou de persistência controlados pelo
  ZCode ficam sob a raiz de dados do ZCode, por padrão `~/.zcode`.
- a saída do Bash usa preferencialmente o diretório temporário do sistema e, quando ele não está disponível, reaproveita a
  implementação de saída já existente sob a raiz de dados.
- não há migração de arquivos históricos nem varredura extra do layout antigo em `TMPDIR`; as referências de saída já
  existentes continuam sendo lidas pelo caminho real.
- desta vez não se altera o fallback de remote asset nem os caminhos dos plugins oficiais de simulador iOS / Android.

## Especificação de paths

| Cenário                            | Novo path                                                                                           | Ciclo de vida                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Saída persistente do Bash zcode-cli | `<os.tmpdir()>/zcode-bash-<identificador aleatório>/<session>/<tool>-stdout.log`; com fallback para `<storageRoot>/cli/exec` | Arquivo temporário nomeado, seguindo as regras de retenção antes/depois e aceitando a limpeza do sistema |
| Imagens da área de transferência do zcode-cli | `~/.zcode/clipboard`                                                                  | Excluída após uma única leitura                                     |
| Staging da exportação de logs      | `~/.zcode/export-log-stage`                                                                   | Excluído após a compactação; saída anormal pode deixar resíduo       |
| Resultado da exportação de logs    | `~/.zcode/export-log`                                                                             | Resultado de exportação visível ao usuário, mantido por padrão       |
| Anexos de feedback e pacote de logs | `~/.zcode/feedback`                                                                               | Excluído após a conclusão do upload                                  |
| Index temporário de checkpoint Git | `~/.zcode/git-checkpoint-index`                                                                   | Excluído após a construção do checkpoint                              |
| Conversão de ícones do editor desktop | `~/.zcode/editor-icon`                                                                            | Excluído após uma única conversão                                    |

## Restrições

- antes de escrever, é preciso preparar o subdiretório de negócio; não se pode depender de `mkdtemp` para criar o
  diretório pai automaticamente. Quando o diretório tmp do sistema para o Bash não existe, o fallback ocorre por
  `ENOENT`, sem criar a raiz tmp do sistema por conta própria.
- diretórios de ciclo de vida curto devem usar um subdiretório único por operação e ser limpos em um `finally` ao
  final; a saída retained do Bash não é removida com o fechamento do adapter.
- uma limpeza com falha não pode afetar o resultado do fluxo principal. A saída do Bash em tmp ainda não entra na
  contagem de espaço ocupado pelo App nem na limpeza automática; os demais diretórios mantêm o escopo de gerenciamento
  atual.
- o `ZCODE_STORAGE_DIR` / `storageRoot` custom do Bash também servem apenas como posição de fallback; os demais
  arquivos continuam priorizando o `storageRoot` resolvido.
- o lado de service / desktop usa a semântica existente de data base dir, com padrão em `~/.zcode` e, quando
  `ZCODE_DATA_BASE_DIR` está configurado, em `{dataBaseDir}/.zcode`.

## Exceção da Saída do Bash

A busca recursiva no diretório de dados lê os arquivos de saída que estão sendo escritos; o resultado da busca é
escrito de volta no mesmo arquivo, criando uma autorreferência.
O aplicativo principal e o subruntime de workflow injetam `bashOutputTempDir = os.tmpdir()` no execution adapter.
Cada adapter cria assincronamente um diretório privado com `mkdtemp` conforme a necessidade, reutilizando apenas o
resultado de criação bem-sucedido; chamadas diretas sem essa opção mantêm o comportamento original.
O snapshot de inicialização do shell, os scripts de inicialização e as saídas que não são de Bash continuam usando o
`outputRootDir` original.

É preciso criar e abrir de fato o arquivo de saída, sem pré-verificação com `access`. Apenas `EACCES`, `EPERM`,
`EROFS`, `ENOENT`, `ENOTDIR`, `ENOSPC` e `EDQUOT` na fase de preparação do tmp permitem o fallback.
O fallback chama a lógica original de preparação do arquivo `<storageRoot>/cli/exec`; outros erros e a falha do
fallback seguem a cadeia de falha já existente.
Depois que o comando é iniciado, o caminho não muda e o comando não é reexecutado. O fallback ou a busca direta no tmp
ainda podem gerar autorreferência, e esse risco não faz parte da garantia desta correção.

O caminho real só é publicado depois que a preparação do arquivo é concluída. Os modos foreground/background, de
monitoramento, de resultado e de entrada de arquivo compartilham esse caminho e o fd já aberto,
e stdout/stderr continuam escrevendo direto no mesmo arquivo, com a codificação da saída interpretada uma única vez.
Cancelamento ou fechamento durante a preparação precisa liberar o handle e proibir o spawn.
Saídas pequenas em foreground e arquivos acima do limite mantêm a limpeza best-effort, e saídas grandes e arquivos de
background mantêm as regras de retenção; não há unlink, não há saída do arquivo do archive,
não se garante limpeza pelo sistema nem legibilidade após reinício, e os limites suaves de 5 GiB / 5 segundos não
mudam.

## Não objetivos

- não limpar resíduos existentes de `$TMPDIR/zcode-*`.
- não modificar o fallback do cache de remote assets.
- não modificar os diretórios de dados de `apps/zcode-cli/packages/ios-simulator-plugin` e
  `apps/zcode-cli/packages/android-emulator-plugin`.
