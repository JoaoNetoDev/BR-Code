# Especificação de diagnóstico do instalador Windows

## Objetivo

Para as atualizações gerenciadas produzidas após esta versão, o usuário consegue ver, nos detalhes do instalador e no log de arquivos, estágios e processos localizáveis, e a atualização silenciosa continua registrando o mesmo conjunto de eventos de estágio. O instalador usa `.zcode-install-manifest` para determinar a capacidade do desinstalador da versão anterior, em vez de depender de números de versão: na ausência do manifest, trata o desinstalador antigo pelo risco de remoção total; na presença do manifest, trata o desinstalador novo pela limpeza seletiva.

## Eventos de estágio

Após o início do instalador, os eventos são registrados na ordem:

1. `installer-process-started`：registra o PID do processo do instalador e seu papel (`outer` ou `elevated-inner`).
2. `installer-initialized`：registra o modo de instalação (`interactive` ou `silent`).
3. `install-started`：entra na seção de instalação do electron-builder.
4. `cleanup-started` / `cleanup-completed`：chama o desinstalador da versão anterior e processa o resultado retornado.
5. `extract-started` / `extract-completed`：início/fim da extração dos arquivos da aplicação; entre os dois, cada entrada NSIS `File` é exibida individualmente na área de detalhes.
6. `shortcuts-started` / `shortcuts-completed`：processa os atalhos do menu Iniciar e da área de trabalho.
7. `install-finalization-started`：entra na finalização customizada do projeto (correção de alvos inválidos de atalhos, definição do alvo de inicialização).
8. `install-completed`：a seção de instalação retornou com sucesso.

```text
NSIS .onInit
   │
   ├─ 初始化日志路径并写入 installer-process-started(pid)
   └─ 判断静默/交互模式并写入 installer-initialized
          │
          └─ install-started
                  ├─ cleanup-started → cleanup-completed
                  ├─ extract-started → File 条目 → extract-completed
                  ├─ shortcuts-started → shortcuts-completed
                  └─ customInstall：install-finalization-started → install-completed
```

O instalador interativo sempre exibe a área NSIS Details e, no início da seção de instalação, altera o `SetDetailsPrint none` padrão do electron-builder para `listonly`. Por isso, cada entrada NSIS `File` da extração aparece continuamente na área de detalhes; os eventos de estágio são gravados simultaneamente na área de detalhes e no log de arquivos. Os eventos de início de processo e de inicialização ocorrem em `.onInit`; quando o controle de detalhes ainda não foi criado, não há promessa de preenchimento retroativo na página, e o log de arquivos é a única fonte.

O desinstalador antigo roda como um processo separado pelo electron-builder. A área de detalhes externa primeiro mostra o início/fim da limpeza e, após o retorno do processo, reproduz as entradas individuais do log deste desinstalador; o log original permanece em `%TEMP%\ZCode-uninstaller.log`, usado para conferir quais arquivos foram realmente tentados para remoção. O desinstalador de versões históricas ainda pode exibir apenas o texto nativo de nova tentativa.

## Caminhos de log e limites de segurança

- Log padrão: `%TEMP%\ZCode-installer.log`.
- O instalador externo pode especificar o caminho com `/LOG=<path>`, facilitando a coleta de logs pela equipe de suporte.
- O processo interno elevado via UAC não aceita o caminho `/LOG` herdado: ele tenta gravar diretamente em `%WINDIR%\Logs\ZCode-installer.log`, evitando que um chamador de baixo privilégio controle o caminho de um arquivo de alto privilégio. Atualmente não há promessa de copiar o log externo de `%TEMP%` para o Windir.
- Cada linha de log contém `pid=<PID decimal>`; a falha ao gravar o log afeta apenas o diagnóstico e não deve bloquear a instalação.
- O critério do processo interno do instalador oficial deve ser ligado ao `UAC_IsInnerInstance` usado pelo electron-builder; não pode ser escrito como sempre falso por padrão, e a simulação forçada de processo interno fica restrita ao smoke fixture. A substituição para testes só é permitida quando o fixture de isolamento a define explicitamente; o comportamento oficial padrão precisa usar o estado real do UAC.

## Determinação da capacidade do desinstalador

- Antes de chamar o desinstalador antigo, o instalador verifica o `$INSTDIR\.zcode-install-manifest` da versão anterior.
- Manifest presente: o desinstalador da versão anterior suporta limpeza por ownership, e a varredura de proteção do diretório `.zcode` é ignorada.
- Manifest ausente: a versão anterior pode ser um desinstalador antigo de remoção total; primeiro varrer o diretório de instalação e seus subdiretórios e, ao encontrar `.zcode`, impedir a continuidade da instalação.
- A ausência do manifest não equivale a uma versão numérica exata: pode ser uma versão histórica, uma remoção manual do manifesto ou uma instalação corrompida; adota-se uniformemente o caminho conservador.

## Limites de compatibilidade

- Somente quando a versão anterior já carregava `.zcode-install-manifest` a limpeza por ownership e a classificação `cleanup-failed` constituem forte garantia desta especificação; o caminho sem manifest adota a compatibilidade com o desinstalador antigo e a proteção de `.zcode`.
- Ao atualizar a partir de versões históricas sem manifest, são permitidos a nova tentativa nativa do desinstalador do electron-builder e o texto de erro nativo; esta rodada não assume o backup, a restauração nem a limpeza da árvore inteira.
- Em atualizações gerenciadas interativas, se o desinstalador antigo retornar valor diferente de zero, pode aparecer primeiro o aviso de nova tentativa `appCannotBeClosed` do electron-builder e, após o cancelamento do usuário, o erro de limpeza deste projeto; na atualização silenciosa, o código de saída e o log são a referência.
- O aviso de falha de limpeza usa `/SD IDOK`: no modo interativo exibe uma caixa de erro; no modo silencioso adota automaticamente a confirmação padrão e retorna o código de saída `2`, sem esperar por ação do usuário.

## Diagnósticos ainda não cobertos

- Rejeição de reparse point/junction na varredura de proteção de diretório, orçamento de acessos, detecção de ciclos e reconhecimento de `.zcode-dev`.
- Códigos de erro Win32 de cada Copy/Extract na fase de extração do electron-builder (os estágios e as entradas de arquivo já são cobertos).

## Instalação silenciosa

O modo silencioso não tem página visível, mas ainda deve registrar `installer-initialized mode=silent` em `.onInit`, além dos eventos de início e conclusão na seção de instalação. A classificação posterior de erros pode correlacionar o processo do instalador e o estágio com base nisso.

## Aceitação

- Ordem de compilação: quando `installer.nsh` é carregado, apenas declara a macro de inicialização de log que depende do plugin de extensões; após o electron-builder registrar o diretório de plugins, a função de expansão do `customHeader` é usada, e o `preInit` de `.onInit` continua chamando a mesma função. Não é permitido depender da ordem de conclusão entre `!addplugindir` e o include customizado na geração assíncrona do header.
- A regressão de compilação deve registrar o diretório de plugins de extensão do NSIS após o include customizado, usar o `UAC_IsInnerInstance` real e cobrir tanto o instalador quanto o desinstalador; o smoke comum não substitui mais a verificação externa por sempre falso, e apenas o cenário isolado de processo interno elevado mantém a simulação explícita.
- O smoke fixture de NSIS no Windows consegue compilar e executar a instalação interativa/silenciosa.
- O log contém os estágios acima e o PID é um inteiro positivo; `/LOG` sobrescreve o caminho padrão.
- O teste do processo interno elevado prova que o caminho de log fornecido pelo chamador não é modificado.