# Restrições de interação de ponteiro da prévia de imagem

## Problema

A prévia de imagem em tela cheia no desktop usa um Dialog modal. Quando o Dialog é aberto, ele define a camada de interação da raiz da página como `pointer-events: none`, a região superior do Electron pode participar ao mesmo tempo do hit test de arraste da janela, e o viewport da imagem também captura o pointer durante o arraste. Se a prévia não restaurar explicitamente o hit de ponteiro, não sair da região de arraste, ou deixar pointer capture residual após o arraste, ações como download e fechar no canto superior direito exibirão hover e clique do mouse sem resposta.

## Limites de interação

```text
Eventos nativos de mouse do Electron
        │
        ▼
Dialog de prévia de imagem (pointer-events-auto + app-region:no-drag)
        │
        ├── Botões de ação superiores (não podem ser capturados pelo viewport da imagem)
        ├── Imagem anterior / próxima
        ├── Arraste e zoom da imagem (liberados em pointerup/cancel/lostcapture)
        └── Botão de zoom inferior
```

- O Dialog de prévia deve usar explicitamente `pointer-events-auto` e `[app-region:no-drag]`.
- Todos os botões clicáveis devem manter o visual de hover existente, sem alteração de estilo por causa da correção de interação.
- O arraste da imagem é tratado apenas pelo viewport da prévia e não pode sobrescrever a área de hit dos botões da camada flutuante.
- O viewport da imagem deve limpar o estado de arraste em `pointerup`, `pointercancel` e `lostpointercapture`; ao redefinir a prévia, o pointer capture ainda existente deve ser liberado ativamente.
- A área de ações no canto superior direito, dentro da faixa da barra de título do Electron, deve declarar uniformemente `[app-region:no-drag]` e envolver simultaneamente os botões de download e de fechar, evitando que duas ações adjacentes formem regiões nativas de hit descontinuas.
- O desktop macOS usa `titleBarStyle: hidden`, e o hit da barra de título nativa não pode ser neutralizado apenas pelo `no-drag` de CSS; a área de ações no canto superior direito deve ser colocada inteiramente abaixo da barra de título. Web, celular, Windows e Linux usam seus respectivos layouts e não herdam as margens de segurança do macOS.
- Desktop e Web compartilham este limite de interação; os atributos específicos do Electron devem ser sem efeito colateral na Web.