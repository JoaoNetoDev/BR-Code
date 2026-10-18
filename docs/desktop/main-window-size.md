# Tamanho da janela principal do desktop

## Spec

- A janela principal do desktop é criada de forma unificada por `createBrowserWindow` em `packages/desktop/src/main/desktopWindowChrome.ts`.
- Na primeira inicialização ou sem estado histórico válido, o tamanho padrão da janela permanece `1200x800`.
- Depois que o usuário redimensiona a janela principal, o desktop salva a largura e a altura da última janela não maximizada ao final de um curto debounce; após uma saída completa e reinício, o tamanho mais recente que já foi persistido é restaurado.
- O estado maximizado e o tamanho normal da janela são salvos separadamente: após sair de maximizado, o próximo start cria a janela primeiro com o tamanho normal mais recente e só então restaura o maximizado, evitando que o tamanho da tela após maximização contamine o tamanho da janela normal.
- O tamanho restaurado precisa ser um inteiro positivo finito e ser limitado à área de trabalho disponível do monitor principal atual; quando o valor histórico está ausente, corrompido ou é menor que o tamanho mínimo da janela, volta-se ao tamanho padrão. Após mudanças de monitor, resolução ou escala, não se pode criar uma janela principal maior que a área de trabalho atual.
- O usuário pode arrastar para ajustar a largura, mas a altura não pode ficar abaixo de `640px`, evitando que em ambientes desktop 1280x720, cuja altura disponível é menor que 768px, a janela não possa ser redimensionada, e preservando o espaço básico utilizável da área de trabalho principal, da barra superior e da área de entrada inferior.
- A largura mínima permanece `480px`, para compatibilidade com janelas de desktop mais estreitas; o Web mobile não reaproveita as restrições de `BrowserWindow` do Electron.
- O estado do tamanho da janela é uma configuração de desktop de escopo app-global, não isolada por workspace, remote session ou ID de janela; o Web, o `/remote` do celular, as janelas auxiliares e o estado de restauração de tarefas não leem nem escrevem esse campo.

## Implementation

- O limite inferior de resize da janela principal do desktop é restringido pelo parâmetro de construtor do Electron `BrowserWindow` `minHeight: 640`.
- Na inicialização do processo principal, `desktopWindowSize` é lido e validado de `setting.json`; após a criação da janela, são escutados os eventos resize/maximize/unmaximize, e o estado estável é gravado de volta de forma assíncrona no serviço de configurações; resizes consecutivos usam um debounce curto e mudanças de estado maximizado são atualizadas imediatamente. O close da janela apenas cancela o debounce de resize que ainda não disparou e não inicia uma nova gravação de tamanho; o estágio de saída completa da aplicação também não cria gravações de tamanho, evitando que tarefas assíncronas ainda mantendo `setting.json.lock` fiquem pendentes depois de concluída a barreira de saída. Se o usuário sair imediatamente antes de o debounce de resize concluir, é permitido descartar o último tamanho ainda não persistido.
- Essa restrição se aplica apenas à janela principal do desktop e não afeta o Web, o `/remote` do celular nem os diálogos auxiliares sem resize.

## Impact Brief

| Field | Value |
| --- | --- |
| Developer intent | Restaurar, após reiniciar completamente o ZCode, o tamanho da janela principal ajustados pelo usuário na última vez |
| Capability | Persistência do tamanho da janela principal do desktop |
| Change layer | persistence / recovery |
| Operating mode | planning |
| Primary seeds | `createWindow`, `createBrowserWindow`, `AppSettings`, `createSettingService` |
| Out of scope | Posição da janela, tamanho independente por janela, janelas auxiliares, Web/mobile |

| User scenario | UI entry | Display owner | Commit action | Authority/persistence | Mode boundary |
| --- | --- | --- | --- | --- | --- |
| Reiniciar o app após o ajuste | Borda da janela principal do Electron / controle de maximização do sistema | Electron `BrowserWindow` | Atualiza as configurações após resize/maximize/unmaximize | Campo app-global de `~/.zcode/v2/setting.json` | Apenas Desktop main packaged/dev; Web/mobile não participam |

### Must-preserve invariants

- Restaurar o tamanho não pode alongar o caminho crítico de restauração do Local Host, do renderer ou do workspace; se a leitura das configurações falhar, continua-se usando `1200x800`.
- A notificação de chrome de maximização no Windows continua sendo tratada pelos listeners maximize/unmaximize existentes; a persistência de tamanho não altera o protocolo do renderer.
- A cadeia desktop continuous e a cadeia mobile replayable, a identidade de workspace e os snapshots de task/session não são afetados.
- Todo IO de arquivos continua sendo feito pelo serviço de configurações assíncrono; não se usa API de arquivos síncrona no callback de resize do Electron.

## Accepted Cases

| Case | Setup | Action | Assertion |
| --- | --- | --- | --- |
| WINDOW-SIZE-01 | Sem tamanho histórico | Criar a janela principal | Usa `1200x800` |
| WINDOW-SIZE-02 | Tamanho normal histórico válido | Reiniciar e criar a janela principal | Os parâmetros de construtor restauram a largura e a altura históricas |
| WINDOW-SIZE-03 | Tamanho histórico maior que a área de trabalho do monitor principal atual | Reiniciar e criar a janela principal | Largura e altura são limitadas à área de trabalho, sem ficar abaixo do valor mínimo da janela |
| WINDOW-SIZE-04 | Sai de maximizado depois do tamanho normal | Reiniciar e criar a janela principal | Cria com o tamanho normal e depois chama maximize |
| WINDOW-SIZE-05 | resize/maximize/unmaximize | Aguardar o callback de persistência | Salva a largura e a altura não maximizadas e o estado maximized separado |
| WINDOW-SIZE-06 | Janela principal já criada | Disparar o close da janela ou a preparação de saída do app | Não inicia nova gravação de tamanho nas configurações da janela |
