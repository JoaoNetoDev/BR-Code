# Configurações e dica na lista de plugins para ambientes não suportados do Computer Use

## Contexto

O Computer Use depende de um Helper local do desktop para acessar a tela e os dispositivos de
entrada da máquina atual. SSH, WSL, Docker, servidores remotos e desktop Linux hoje não têm um CUA
Helper disponível. Anteriormente a página de configurações usava `return null` para esconder o
bloco inteiro, o que deixava a página de configurações remota em branco; e a página de plugins lia
apenas o diretório de plugins de runtime do ambiente alvo, de modo que, sem CUA no diretório
remoto, o usuário também não via a entrada de capacidade.

## Objetivo

- Ao abrir as configurações em um workspace remoto ou em um desktop Linux, mostrar a entrada de
  configuração do Computer Use com uma explicação explícita de "não suportado no ambiente atual",
  sem mais página em branco.
- Ao abrir a lista de plugins nos mesmos ambientes alvo, exibir um item de placeholder somente
  leitura do CUA e o motivo da indisponibilidade.
- Não enviar requisições de habilitação, desabilitação, instalação, desinstalação ou atualização de
  CUA para alvos SSH, WSL, Docker, Server ou Linux.
- Manter inalterados o interruptor existente no macOS/Windows local, o fluxo de permissões no macOS e o
  comportamento do controle remoto Web no celular.

## Limite de capacidade

```text
Ambiente alvo                    Computer Use
macOS local                      Suportado: interruptor + permissões do macOS
Windows local                    Suportado: interruptor
Linux local                      Não suportado: aviso, sem controles de operação
Remoto SSH / WSL / Docker / Server  Não suportado: aviso, sem controles de operação
Controle remoto Web mobile       Segue o rollout de capacidade Web, sem iniciar o CUA Helper local
```

## Comportamento da UI

1. A página de configurações continua sendo controlada pelo interruptor de rollout para exibir o
   item de navegação do Computer Use. Com o rollout ativo, o desktop Linux também exibe essa
   entrada.
2. A página de configurações em ambiente não suportado exibe um card de informação explicando
   que o Computer Use ainda não suporta ambientes atuais como SSH e Linux; oculta o interruptor
   geral de plugins, o interruptor da entrada de input e as ações de permissão.
3. A lista de plugins ganha uma linha somente leitura "电脑控制" no scope de usuário, exibindo o
   badge "当前环境不可用" e o motivo; essa linha não entra na contagem de instalados/embutidos, não
   abre detalhes e não exibe ações de iniciar/parar, atualizar ou desinstalar.
4. A busca de plugins casa essa linha de aviso por "电脑控制", "Computer Use", "zcode-cua" e
   "cua".

## Restrições de dados e implementação

- Usar uma função unificada de detecção de capacidade da UI para distinguir macOS, Windows e Linux
  locais de alvos remotos; a identidade remota continua sendo determinada por
  `workspaceIdentity` / `remoteTarget`.
- O placeholder do CUA é uma projeção de UI e não forja dados de runtime de plugins remotos, nem
  modifica o protocolo de plugins ou as capacidades do Host remoto.
- Esta mudança ajusta apenas a exibição nas configurações e na lista de plugins, sem alterar a
  cadeia em tempo real `continuous` do desktop ou `replayable` do celular.

## Aceitação

- A página de configurações em SSH, WSL, Docker, Server remotos e Linux local não fica em branco e
  mostra a explicação de não suportado.
- Nessos ambientes, a lista de plugins permite buscar e ver a linha somente leitura "电脑控制", e
  clicar ou alternar não dispara nenhuma operação de escrita de gerenciamento de plugins.
- Os testes unitários existentes de macOS/Windows local continuam passando; são adicionados testes
  da matriz de capacidade, da entrada no Linux e do aviso de não suportado.