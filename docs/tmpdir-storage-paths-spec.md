# Especificação de Consolidação de Escritas em TMPDIR

## Contexto

O diretório temporário do sistema pode ter as permissões restritas pelo ambiente do host, por sandbox ou por políticas
corporativas de segurança. Se o caminho principal do produto ZCode depender de escrita em `TMPDIR` / `os.tmpdir()`,
isso faz a exportação de logs, o envio de feedback, a leitura de imagens da área de transferência, a construção de
checkpoints ou a persistência da saída de comandos falharem em alguns ambientes.

## Objetivos

- o runtime do produto não grava mais no `TMPDIR` do sistema arquivos temporários ou de persistência controlados pelo
  ZCode.
- os novos paths ficam unificados sob a raiz de dados do ZCode, por padrão `~/.zcode`.
- não há migração, leitura nem compatibilidade com dados residuais antigos em `TMPDIR`.
- desta vez não se altera o fallback de remote asset nem os caminhos dos plugins oficiais de simulador iOS / Android.

## Especificação de paths

| Cenário                            | Novo path                        | Ciclo de vida                                      |
| ---------------------------------- | -------------------------------- | -------------------------------------------------- |
| Saída persistente do Bash zcode-cli | `~/.zcode/cli/exec`              | Mantida conforme a saída de session/task           |
| Imagens da área de transferência do zcode-cli | `~/.zcode/clipboard` | Excluída após uma única leitura |
| Staging da exportação de logs      | `~/.zcode/export-log-stage`      | Excluído após a compactação; saída anormal pode deixar resíduo |
| Resultado da exportação de logs    | `~/.zcode/export-log`            | Resultado de exportação visível ao usuário, mantido por padrão |
| Anexos de feedback e pacote de logs | `~/.zcode/feedback`              | Excluído após a conclusão do upload                |
| Index temporário de checkpoint Git | `~/.zcode/git-checkpoint-index`  | Excluído após a construção do checkpoint            |
| Conversão de ícones do editor desktop | `~/.zcode/editor-icon`       | Excluído após uma única conversão                  |

## Restrições

- antes de escrever, é preciso garantir que o diretório pai existe; não se pode depender de `mkdtemp` para criar o
  diretório pai automaticamente.
- diretórios de ciclo de vida curto devem usar um subdiretório único por operação e ser limpos em um `finally` ao
  final.
- uma limpeza com falha não pode afetar o resultado do fluxo principal, mas os resíduos devem permanecer nos
  diretórios controlados acima, para que a futura funcionalidade de "limpeza total" possa removê-los.
- o fluxo principal do zcode-cli continua priorizando o `storageRoot` resolvido pela configuração; apenas o fallback
  padrão do adapter usa `~/.zcode/cli/exec`.
- o lado de service / desktop usa a semântica existente de data base dir, com padrão em `~/.zcode` e, quando
  `ZCODE_DATA_BASE_DIR` está configurado, em `{dataBaseDir}/.zcode`.

## Não objetivos

- não limpar resíduos existentes de `$TMPDIR/zcode-*`.
- não modificar o fallback do cache de remote assets.
- não modificar os diretórios de dados de `apps/zcode-cli/packages/ios-simulator-plugin` e
  `apps/zcode-cli/packages/android-emulator-plugin`.
