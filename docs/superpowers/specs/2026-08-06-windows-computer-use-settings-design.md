# Design das configurações de Controle do Computador no Windows

> Atualizado em 2026-08-17: a superfície de configurações no macOS foi enxugada (ver
> `2026-08-17-cua-settings-surface-minimization.md`) — picture-in-picture / modo em segundo plano / estado do Helper /
> linhas de Input controller foram todas desativadas; macOS e Windows agora têm a mesma forma enxuta de «interruptor geral + linhas de permissão do macOS».

## Objetivo

Exibir a seção «Controle do Computador» na página de configurações do desktop Windows e reutilizar o interruptor geral do plugin oficial `zcode-cua` que já existe no macOS. A seção do Windows exibe apenas o interruptor geral, sem conteúdo relacionado a autorização do sistema (o Windows não tem o modelo de permissões TCC do macOS).

## Limites do produto

- O desktop macOS exibe o interruptor geral + as duas linhas de permissão Accessibility / Screen Recording (a partir de 2026-08-17 sem picture-in-picture, modo em segundo plano, estado do Helper ou Input controller).
- O desktop Windows exibe a mesma entrada de navegação «Controle do Computador», mas o conteúdo contém apenas o interruptor geral.
- O interruptor geral do Windows compartilha com o macOS o estado de gerenciamento de plugins e a lógica de ligar/desligar; ao alternar, habilita ou desabilita em sincronia o plugin oficial `zcode-cua` e seu MCP e Skill.
- Linux, Web comum e controle remoto do celular não exibem a entrada de navegação «Controle do Computador».
- Nenhum campo, texto, protocolo ou ciclo de vida de runtime exclusivo do Windows será adicionado.
- Não alterar a semântica de workspace remoto, `/remote` do celular, fluxo de mensagens replayable, owner, queue, snapshot ou `workspaceIdentity`.

## Limites de página e de estado

A navegação da página de configurações é gerada por props explícitos de plataforma desktop, evitando depender apenas do user agent e deixar um navegador no Windows exibindo capacidades de desktop. O componente `ComputerUseSection` continua sendo a implementação compartilhada pelas duas pontas, separando internamente a «capacidade de interruptor do plugin» da «capacidade de configurações avançadas do macOS».

```text
SettingsPage(isMacDesktop, isWindowsDesktop)
  |
  +-- macOS Desktop ------> Navegação Controle do Computador ------> Interruptor geral compartilhado do zcode-cua
  |                                                |
  |                                                +--> Linhas de permissão do macOS (Accessibility / Screen Recording)
  |
  +-- Windows Desktop ----> Navegação Controle do Computador ------> Interruptor geral compartilhado do zcode-cua
  |
  +-- Linux / Web / Celular -> Não gera a navegação de Controle do Computador

Interruptor geral compartilhado
  -> pluginManagementStore.setEnabled(zcode-cua, next)
     -> sucesso: o store confirma o novo estado; o MCP e o Skill do plugin ligam/desligam em sincronia
     -> falha: mantém o estado anterior e reaproveita o toast de erro existente
```

Um workspace local no Windows permite inicializar o estado de gerenciamento de plugins e alternar o interruptor geral, mas não inicia a consulta de permissões TCC do macOS nem o fluxo de autorização. Workspaces remotos continuam sendo recusados pela fronteira de capacidade local existente.

## Escopo de implementação

### Configuração da página de configurações

Mudar a configuração das seções de configurações para que seja gerada pelas capacidades de plataforma desktop passadas pelo chamador: macOS ou Windows desktop incluem `computerUse`, e as demais plataformas filtram essa seção. Tanto o destino inicial da página quanto a intenção de navegação em runtime devem fazer fallback para a seção realmente visível na plataforma atual, sem renderizar uma página em branco por causa de uma preferência de `computerUse` invisível.

### Seção de Controle do Computador

`ComputerUseSection` recebe a marcação de desktop Windows:

- Workspace local no macOS: renderiza o interruptor geral + as linhas de permissão (reaproveitando a verificação existente de capacidade de permissão).
- Workspace local no Windows: inicializa o estado do plugin oficial e renderiza apenas o cartão do interruptor geral.
- Plataforma não local ou sem suporte: não renderiza conteúdo.

O Windows não oculta as configurações avançadas por CSS; a própria renderização do componente e seus efeitos precisam estar sujeitos à fronteira de capacidade da plataforma, evitando executar refresh de permissões do macOS sem sentido.

## Interação e tratamento de erros

- Sem workspace, o interruptor permanece desabilitado, consistente com o comportamento existente do macOS.
- Enquanto o plugin está alternando, o interruptor permanece desabilitado, evitando habilitação e desabilitação concorrentes.
- Em caso de falha do serviço de gerenciamento de plugins, reaproveitar o erro de store e o toast existentes, sem adicionar um fallback exclusivo do Windows.
- O Windows não exibe contêineres vazios de configurações avançadas nem textos explicativos de placeholder.
- Reaproveitar `SettingsGroupCard`, `SettingsRow` e `Switch` existentes, sem novos estilos visuais ou textos.

## Testes e aceitação

Os testes automatizados devem cobrir pelo menos:

1. As configurações de desktop macOS e Windows contêm `computerUse`; as de Linux/Web/celular não contêm.
2. `ComputerUseSection` no Windows renderiza apenas o interruptor geral, sem conteúdo de autorização; o macOS não renderiza mais as linhas já desativadas de picture-in-picture / modo em segundo plano / Helper / controller.
3. O interruptor geral do Windows aciona o fluxo `setEnabled` existente do plugin oficial `zcode-cua`.
4. As condições de renderização das linhas de permissão do macOS permanecem inalteradas.
5. A preferência inicial ou a intenção de navegação de uma seção invisível faz fallback para `general`, e a página de configurações não fica em branco.
6. Os testes unitários relacionados, `pnpm typecheck` e `pnpm lint` passam em sua totalidade.

## Não objetivos

- Adicionar UI de autorização ao Windows ou qualquer linha de configuração exclusiva de CUA.
- Modificar o runtime CUA do Windows, a instalação, a assinatura, o broker ou as capacidades de ferramentas.
- Expor as configurações de CUA no Linux ou na Web.
- Alterar o comportamento de gerenciamento de `zcode-cua` na página de plugins.