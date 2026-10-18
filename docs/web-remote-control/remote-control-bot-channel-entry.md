# Entrada de Canal de Bot do Remote Control

O modal de controle remoto agora abriga dois tipos de entrada:

- Web no celular: continua usando o estado de conexão da sessão Web remote control atual, o QR code e o link para cópia.
- Bot Channel: oferece três entradas — WeChat, Feishu e Telegram — voltadas ao controle remoto em ferramentas de comunicação de longo prazo ou de uso frequente.

A lógica de clique do card de Bot Channel abre de forma unificada `packages/ui/src/BotsDialog.tsx`:

- Se já existir um robô do canal correspondente, seleciona o primeiro robô desse canal.
- Se não existir um robô do canal correspondente, cria diretamente um novo robô para esse canal e entra no fluxo de configuração desse robô.

A lógica de seleção da entrada está centralizada em `resolveBotProviderEntry()`, evitando que o modal de controle remoto entenda diretamente a estrutura de estado interna do BotsDialog.