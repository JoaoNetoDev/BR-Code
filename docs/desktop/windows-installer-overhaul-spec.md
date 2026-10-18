# Spec da reformulação do instalador Windows

## Objetivo

Este spec restringe quatro problemas de usuário da instalação por sobrescrita com NSIS no Windows:

1. A atualização gerenciada não pode apagar arquivos não relacionados no diretório de instalação por causa da limpeza padrão de árvore completa do NSIS; upgrades históricos sem manifest não estão no escopo de garantia desta rodada.
2. Para a cadeia de atualização com ownership manifest gerada após esta versão, falta de espaço em disco, falta de permissão e falha na limpeza de arquivos precisam mostrar a fase e a causa reais, e não podem ser disfarçados uniformemente como "o ZCode está em execução". O desinstalador das versões antigas não entra na promessa de compatibilidade desta rodada.
3. O instalador precisa exibir etapas verificáveis e manter logs offline.
4. Após a atualização, o menu Iniciar, os atalhos da área de trabalho e o Windows AUMID precisam permanecer consistentes; atalhos apagados pelo usuário não podem ser recriados às escondidas.

## Escopo e invariantes

- Continua-se usando `electron-updater` para download/verificação, e o alvo Windows continua sendo NSIS; esta rodada não migra para Squirrel nem MSIX.
- O diretório de instalação é o diretório de execução dos arquivos do aplicativo, não o de dados; só quando se detecta que a versão anterior não tem ownership manifest e ainda pode ter todos os arquivos apagados pelo desinstalador antigo, os dados `.zcode` que atingem o diretório de instalação ou seus subdiretórios bloqueiam a instalação por sobrescrita. O novo desinstalador com suporte a manifest apaga apenas os arquivos declarados e não bloqueia mais por causa de `.zcode`.
- Só é permitido apagar arquivos que a versão atual declare explicitamente como pertencentes ao aplicativo; arquivos desconhecidos são preservados por padrão e, em caso de conflito, prevalece o arquivo do aplicativo da nova versão.
- O cleanup por manifest precisa rejeitar caminhos absolutos, travessia `..` e a própria entrada do desinstalador; o reforço contra reparse point/junction na varredura interativa de proteção de diretórios e o orçamento de acesso são itens de convergência posterior.
- O instalador se esforça para deixar logs das fases já implementadas; falha na escrita do log não pode bloquear a instalação, e o log não pode registrar a linha de comando original completa, conteúdo de dados do usuário nem credenciais.
- Atalhos só são reparados no lugar quando "existem, mas o destino está inválido/inconsistente"; atalhos inexistentes continuam respeitando o comportamento de exclusão do usuário.
- O AUMID do processo principal no estado empacotado precisa ser igual ao `appId` do electron-builder; o estado de desenvolvimento mantém um AUMID próprio.
- macOS/Linux não entram nos ramos de instalação do Windows; as cadeias de estado desktop continuous e web-remote replayable do celular não se espalham uma para a outra.

## Fronteira de versão e convergência para a frente

- `.zcode-install-manifest` é um marcador de capacidade entre o desinstalador antigo e o novo, e não exige comparar versões numéricas. Antes de chamar o desinstalador antigo, o instalador verifica se o diretório de instalação antigo tem esse arquivo: se existir, faz cleanup por manifest e não dispara a varredura de proteção de `.zcode`; se faltar, trata como risco de legacy full-cleanup e executa primeiro a varredura de proteção de `.zcode`.
- No primeiro upgrade a partir de uma versão histórica sem manifest, continuar usando o fluxo antigo de desinstalador do electron-builder é uma limitação conhecida: o desinstalador antigo pode limpar todo o diretório de instalação, usar textos nativos de retry ou não conseguir retornar uma causa de erro classificável. Esta rodada não adiciona backup, restauração, rollback ou camada de compatibilidade de desinstalador para esse caminho.
- Quando um upgrade a partir de uma versão histórica falha, o usuário pode concluir o upgrade desinstalando e reinstalando ou migrando arquivos manualmente; isso não altera o objetivo de confiabilidade das atualizações entre versões novas.
- Cada versão posterior apenas converge as falhas que ainda podem ser observadas na versão atual, sem buscar compatibilizar de uma vez todos os estados de instalação históricos. Novas garantias só podem ser escritas neste spec depois de cobertas por um smoke test real de instalador/desinstalador.

## Estado de instalação e sequenciamento

```text
update-downloaded
      |
      v
prepare app exit ----(失败/超时)----> updater error (保留按钮可重试)
      |
      v
launch NSIS
  CHECK_APP_RUNNING
      |
      v
  检查旧安装目录 manifest 能力
      |
      +----(无 manifest)----> `.zcode` 保护扫描
      |                           |
      |                           +----(data)----> blocked
      |                           |
      |                           v
      |                      legacy best-effort（允许原生重试/错误文案）
      |
      +----(有 manifest)----> ownership cleanup（跳过 `.zcode` 扫描）
                                  |
                                  +----(lock/ACL/space)----> typed failure + cleanup log
      |
      v
extract new files -> repair existing shortcuts -> write AUMID/notify Shell
      |
      v
installer-completed (日志可查，完成页直接启动 `$INSTDIR\\ZCode.exe`)
```

## Propriedade de arquivos e migração

### Nova versão

A fase de empacotamento gera um ownership manifest legível pelo instalador, registrando os arquivos do aplicativo relativos a `$INSTDIR` (diretórios não são listados separadamente). A lista é gravada em disco junto com o pacote de instalação, para uso na próxima atualização; não há promessa adicional de transação de sistema de arquivos nem de rollback. `customRemoveFiles` processa apenas as entradas declaradas no manifest; entradas desconhecidas não são apagadas.

### Upgrade a partir de uma versão antiga (design incremental posterior)

Quando a versão antiga não tem manifest, o plano alvo é mover, antes de chamar o desinstalador antigo, para um backup temporário separado as entradas que não foi possível provar como pertencentes ao aplicativo; após a instalação da nova versão, restaura-se apenas as entradas que não existem na nova versão. O diretório de backup não fica em `$PLUGINSDIR`, e, se o rollback falhar, o caminho é preservado e registrado no log. Esta rodada ainda não assumiu a chamada `uninstallOldVersion` da camada externa do electron-builder e, portanto, não consegue mudar o comportamento de limpeza de árvore completa do desinstalador antigo no "primeiro upgrade a partir de uma versão sem manifest"; a implementação atual vale para atualizações subsequentes entre versões novas, conforme detalhado em 《Windows 更新：安装目录文件保留规范》.

### Falhas e rollback

- Uma falha de Delete no cleanup por manifest precisa registrar a fase de cleanup, o motivo da falha e o PID do desinstalador, e retornar com código de saída diferente de zero; arquivos não tratados permanecem como estão.
- Em atualizações entre versões gerenciadas, um retorno não zero do desinstalador antigo tanto em SHELL_CONTEXT quanto em caminhos HKCU é exibido pelo instalador externo como mensagem de falha de limpeza; a ordem de retry interativo do electron-builder é um comportamento conhecido atual e não é reescrita nesta rodada.
- O desinstalador histórico sem manifest não precisa retornar erros classificáveis nem executar backup/restauração/rollback.
- A cadeia detalhada de erros Win32 de extração, cópia e proteção de diretórios é um item de convergência posterior; no momento não se pode escrever isso como uma garantia forte já implementada.

## Diagnóstico e exibição de etapas

- O instalador interativo desta versão sempre exibe a área Details (substituindo o `nevershow` padrão do electron-builder) e muda o `SetDetailsPrint none` do trecho de instalação para `listonly`. Os detalhes da instalação exibem em ordem o início da instalação, a fase de limpeza, a fase de extração, cada entrada `File` do NSIS, a fase de atalhos e o fechamento final; o início do processo e os eventos de inicialização acontecem em `.onInit` e valem o log de arquivo.
- O desinstalador da versão anterior é um processo separado: os detalhes externos exibem primeiro o início/conclusão do cleanup e, depois que o processo retorna, reproduzem o log deste desinstalador; o desinstalador da versão atual grava em `%TEMP%\\ZCode-uninstaller.log` os caminhos relativos que realmente tentou apagar a partir do manifest, item a item.
- A atualização silenciosa não exibe UI, mas escreve `%TEMP%\\ZCode-installer.log`; a camada interna de elevação UAC tenta escrever diretamente em `%WINDIR%\\Logs\\ZCode-installer.log`. Hoje não existe implementação de "cópia do log temporário externo para o Windir conforme as permissões", e um log não gravável não deve bloquear a instalação.
- Os markers do log usam PID numérico e enumeração de fases, e não escrevem `$CMDLINE`. As fases de instalação já implementadas são `install-started`, `cleanup-started/completed`, `extract-started/completed`, `shortcuts-started/completed`, `install-finalization-started` e `install-completed`; a classificação de falhas do cleanup gerenciado se limita a `permission-or-disk-space` e ao retorno não zero do desinstalador antigo, e os códigos de erro Win32 de `reparse-point` e `extract` são itens de convergência posterior.
- Na atualização interativa, quando o desinstalador antigo retorna não zero, pode haver antes as até 5 tentativas embutidas do electron-builder e a mensagem `appCannotBeClosed`; só após o cancelamento entra o aviso preciso de erro de limpeza deste projeto. O caminho silencioso se orienta pelo código de saída e pelo log.
- A caixa de erro de falha de limpeza traz `/SD IDOK`: no modo interativo exibe o aviso e, no modo silencioso, confirma automaticamente e retorna o código de saída `2`, sem bloquear atualizações não assistidas.

## Atalhos e AUMID

- Atalhos `.lnk` do menu Iniciar/Área de Trabalho cujo destino está correto são preservados como estão (inclusive os argumentos).
- Quando o destino está errado mas o `.lnk` existe, ele é reparado no lugar e, em seguida, define-se o AUMID estável e envia-se `SHChangeNotify(SHCNE_UPDATEITEM)`.
- Um `.lnk` apagado pelo usuário não é recriado; a página de conclusão inicia diretamente o exe do novo diretório de instalação.
- `app.setAppUserModelId()` usa o `appId` correspondente a produção/Preview no estado empacotado e `cn.aminer.zcode` no estado de desenvolvimento.

## Casos de aceite

| Case | Cenário | O que precisa ser observado |
| --- | --- | --- |
| WIN-INSTALL-OWNERSHIP-001 | Existe `notes.txt`/diretório personalizado antes da atualização | O arquivo continua depois da atualização e os arquivos do aplicativo foram substituídos |
| WIN-INSTALL-OWNERSHIP-002 | Versão antiga sem manifest | Fora do escopo desta rodada; permite que o desinstalador antigo mantenha o comportamento nativo, e suporte à migração só é adicionado depois quando houver benefício claro |
| WIN-INSTALL-DIAG-001 | O cleanup gerenciado encontra bloqueio/permissão/erro de disco | O log de cleanup tem fase, classificação e PID numérico; a camada externa retorna não zero e exibe falha de limpeza |
| WIN-INSTALL-DIAG-003 | Versão antiga sem manifest ou falha na fase de extração | Não é garantia de diagnóstico granular desta rodada; preserva-se o resultado do instalador nativo e a granularidade converge depois conforme os problemas reais |
| WIN-INSTALL-DIAG-002 | Atualização silenciosa `/S` | Sem UI, mas com log de fases; o PID do log é numérico e sem linha de comando original |
| WIN-INSTALL-SHORTCUT-001 | Atalhos corretos/inválidos/apagados | Os corretos preservam os argumentos, os inválidos são reparados e os apagados não são recriados |
| WIN-INSTALL-AUMID-001 | Execução empacotada de produção e Preview | O AUMID do processo principal é igual ao `appId` do NSIS e pode ser indexado/pinado corretamente pelo Shell |

## Limites de implementação desta rodada

Esta rodada garante ownership cleanup, as fases e a lista de arquivos extraídos nos detalhes da instalação, o registro de limpeza arquivo a arquivo no log do desinstalador e a consistência de atalhos/AUMID, cobrindo tudo isso com um smoke NSIS real. O retorno completo do resultado do desinstalador antigo, a substituição do template de retry da camada externa do electron-builder, a varredura de diretórios reparse-safe, os códigos de erro Win32 de extração, a cópia do log para o Windir e a migração de manifest entre versões são itens de convergência posterior; essas capacidades ainda não implementadas não podem ser escritas como garantia da versão atual.