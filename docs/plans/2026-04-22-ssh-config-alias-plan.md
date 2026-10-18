# Plano de Conexão por Alias do SSH Config

## Contexto

Atualmente o diálogo SSH só permite que o usuário preencha manualmente `host / port / username / password / privateKeyPath`.
Para usuários que já mantêm vários alias SSH em `~/.ssh/config`, esse fluxo é pouco eficiente e sujeito a entrada repetida e erros de digitação.

O objetivo é permitir que o usuário selecione diretamente um alias de `~/.ssh/config` da máquina local no diálogo SSH, que a configuração correspondente ao alias seja preenchida automaticamente no formulário existente e que a conexão prossiga pelo fluxo de conexão remota já existente.

## Objetivos

- Adicionar um menu suspenso de alias na seção de configuração SSH do diálogo SSH.
- O menu suspenso exibe os aliases do SSH config local que podem ser conectados diretamente.
- Após o usuário selecionar um alias, preencher automaticamente nos campos correspondentes todos os campos mapeáveis para o formulário atual.
- Depois do preenchimento automático, o usuário ainda pode modificar manualmente os campos e então iniciar a conexão.
- Não quebrar `RemoteTarget`, o histórico de conexões remotas, a reconexão automática nem a fronteira de compatibilidade desktop / web.

## Não objetivos

- Na v1, não implementar a capacidade de "passar o nome do alias diretamente ao backend e executar com a semântica completa de runtime do OpenSSH".
- A v1 não garante suporte completo a recursos avançados do OpenSSH como `ProxyJump`, `ProxyCommand`, `Match exec` e `IdentityAgent`.
- A v1 não lê nem preenche senhas a partir do SSH config.
- A v1 não usa o próprio nome do alias como chave primária persistida do histórico de conexões remotas e da reconexão automática.

## Experiência do usuário

### Local da interação

- A entrada fica no segundo passo do diálogo SSH, `Preencher configuração de conexão`.
- Exibida apenas quando o método de conexão for `SSH`.
- O menu suspenso fica no topo da seção de configuração SSH, antes de `Host / Port`, funcionando semanticamente como uma entrada de "preenchimento rápido do formulário".

### Comportamento da interação

- Quando o formulário SSH é exibido pela primeira vez, carregar preguiçosamente a lista de alias do SSH config local.
- Se a leitura dos alias for bem-sucedida:
  - Exibir uma caixa de seleção com valor padrão vazio.
  - Cada opção exibe o nome do alias, complementado por um resumo quando necessário, por exemplo `user@host:port`.
- Se nenhum alias for lido:
  - A caixa de seleção pode não ser exibida, ou exibir um estado vazio desabilitado com uma dica.
- Após o usuário selecionar um alias:
  - `HostName -> host`
  - `Port -> port`
  - `User -> username`
  - `IdentityFile -> privateKeyPath`
  - Se `IdentityFile` existir, alternar automaticamente o método de autenticação para `Private Key`
- Após o preenchimento automático, o usuário ainda pode modificar manualmente qualquer campo.
- Se o usuário modificar manualmente um campo-chave que o alias já preencheu, limpar o estado de seleção do alias, evitando que a UI sugira indevidamente que a configuração ainda é estritamente igual à do alias.

### Erros e degradação

- Em caso de falha na leitura do SSH config, não bloquear o usuário de continuar preencher o formulário manualmente.
- A UI exibe apenas um aviso leve, por exemplo "Falha ao ler o SSH config, ainda é possível inserir as informações de conexão manualmente".
- O lado web não lê o `~/.ssh/config` local e sempre retorna uma lista vazia.

## Definição do escopo da solução

Esta capacidade é definida como:

> Pré-preencher rapidamente o formulário SSH existente por meio de um alias SSH e então concluir a conexão pela cadeia `connectRemote()` já existente.

Isso significa que:

- O alias é apenas uma "fonte de configuração", não um novo protocolo de conexão.
- O backend continua consumindo os campos concretos já expandidos, e não o nome do alias.
- Se um alias depender de recursos de runtime exclusivos do OpenSSH, a v1 apenas extrai os campos estáticos mapeáveis para o formulário atual e não promete reproduzir todo o comportamento do comando `ssh alias` na linha de comando.

Essa fronteira precisa ser mantida consistente na implementação e na documentação, para evitar que o "preenchimento automático por alias" seja implementado por engano como "compatibilidade completa com conexão direta por alias do OpenSSH".

## Ponto de integração na arquitetura

### Princípio de camadas

Esta capacidade deve reutilizar a cadeia existente de injeção de capacidades de plataforma; não é permitido que a UI leia arquivos locais diretamente:

```text
Desktop main / runtime
  -> preload
    -> IPlatformService
      -> useRemoteConnectionForm
        -> SSH dialog UI
```

Motivo:

- `~/.ssh/config` é um arquivo local da máquina host e só pode ser lido pela camada de plataforma desktop.
- A camada de UI é responsável apenas por exibição e estado do formulário, não por acessar o sistema de arquivos local.
- Isso é consistente com a forma como a detecção atual de Docker / WSL passa por `IPlatformService`.
- O modo web pode degradar naturalmente para uma capacidade vazia, sem poluir a camada de serviço de conexão remota existente.

### Abordagens não recomendadas

- Não ler `~/.ssh/config` diretamente em `packages/ui`
- Não colocar a lógica de resolução de alias dentro de componentes React
- Não modificar o `RemoteTarget` existente para transformá-lo em `alias | host`
- Não fazer o histórico remoto salvar apenas o nome do alias, pois assim a semântica de reconexão mudaria sempre que o SSH config mudasse

## Modelo de dados

Sugere-se adicionar em `packages/shared` um tipo retornado pela plataforma, por exemplo:

```ts
export interface SSHConfigAliasOption {
  alias: string;
  host?: string;
  port?: number;
  username?: string;
  privateKeyPath?: string;
  source?: string;
}
```

Descrição:

- `alias`: nome de exibição, que também é o valor selecionado
- `host / port / username / privateKeyPath`: campos que a UI atual pode consumir diretamente
- `source`: opcional, indica o caminho do arquivo de config encontrado, facilitando depuração e logs posteriores

Esse tipo expressa apenas o "resultado estático expandido, utilizável para pré-preencher o formulário" e não tenta representar o conjunto completo da configuração do OpenSSH.

## Design da interface de plataforma

### Shared

Adicionar em `IPlatformService`, em `packages/shared/src/platform.ts`:

```ts
listSSHConfigAliases(): Promise<SSHConfigAliasOption[]>;
```

Também é preciso sincronizar:

- `packages/shared/src/channels.ts`
- `packages/client/src/globals.d.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/src/main.tsx`
- `packages/web/src/main.tsx`
- `packages/shared/src/web-remote-control.ts`
- o arquivo de proxy de plataforma do relay no repositório antigo (já removido; atualmente o relay externo não hospeda esse negócio)
- `packages/desktop/src/main/webRemoteControlManager.ts`

### Desktop

Adicionar no main do desktop o IPC handler correspondente, responsável apenas por encaminhamento e orquestração, sem hospedar a lógica de parsing:

- Receber a requisição `listSSHConfigAliases` do renderer
- Encaminhar ao host process / camada de service para executar a leitura do SSH config e a resolução dos alias
- Retornar o resultado com os campos adequados ao pré-preenchimento da UI
- Em caso de exceção, registrar log `warn` e retornar `[]`

Ao mesmo tempo, deixar explícita a fronteira de responsabilidades:

- O processo main permanece como "camada de agendamento", sem embutir a lógica de parsing do SSH config
- A implementação do parsing fica no host process / service, facilitando testes e reuso
- Futuras extensões para repasse via remote control também reutilizam a mesma capacidade de service

### Web

- No modo web comum, retorna `[]`
- No modo web remote control, o repasse da lista de alias da máquina desktop pode ser adicionado depois conforme a necessidade
- Mesmo que a v1 não faça o repasse no web remote control, a compatibilidade da cadeia de tipos precisa ser mantida; a interface não pode existir apenas no desktop

## Estratégia de parsing

### Restrições entre plataformas (obrigatórias)

Esta capacidade precisa ser compatível com macOS / Linux / Windows e não pode ser implementada assumindo apenas um ambiente parecido com Unix:

- O caminho do SSH config é resolvido uniformemente a partir de `os.homedir()`, concatenando `.ssh/config`
- No Windows, dar preferência ao `ssh.exe` no `PATH`, com detecção também das posições comuns do OpenSSH do sistema
- Se o ambiente de execução não tiver um `ssh` executável, voltar automaticamente para o parser leve embutido, sem erro bloqueante
- O tratamento de caminhos e separadores é normalizado de forma uniforme, evitando que a diferença entre `\` e `/` cause falhas de parsing

### Estratégia recomendada

Recomenda-se a "parsing em duas etapas":

1. Varrer `~/.ssh/config` e os arquivos expandidos por `Include`, coletando a lista de alias
2. Para cada alias, usar `ssh -G <alias>` de forma controlada para obter a resolução final e então extrair os campos necessários

Motivo:

- `ssh -G` é mais próximo do comportamento real do usuário na linha de comando
- Reduz o problema de divergência entre regras de parsing escritas à mão e o comportamento real do OpenSSH
- Tem maior compatibilidade com `Include`, valores padrão e ordem de sobrescrita

### Proteção de execução e limites de desempenho

Para evitar que `ssh -G` cause travamentos na interação do diálogo, é preciso adicionar proteções:

- Definir um timeout para cada `ssh -G` (por exemplo 1s~2s); em caso de timeout, considerar falha e fazer fallback
- Limitar o número de execuções concorrentes (por exemplo 2~4), evitando saturar CPU/IO instantaneamente quando houver muitos alias
- Definir um limite superior para a quantidade de alias que podem ser resolvidos; ao exceder, resolver apenas os N primeiros e exibir um aviso de degradação
- A falha na resolução de um alias afeta apenas esse item e não impede o retorno da lista completa
- Fazer cache de curto prazo (TTL) dos resultados de parsing, evitando varrer e executar repetidamente quando o diálogo é aberto várias vezes
- Desabilitar a entrada interativa ao executar `ssh -G`, evitando bloquear por senha/confirmação

### Estratégia de fallback

Se o ambiente atual não conseguir executar `ssh -G`, usar o parser leve embutido:

- Reconhecer `Host`
- Reconhecer `HostName`
- Reconhecer `Port`
- Reconhecer `User`
- Reconhecer `IdentityFile`
- Reconhecer `Include`

### Regras de filtragem de alias

Exibir apenas os alias que podem ser conectados com um clique direto, sem exibir os seguintes padrões:

- `*`
- padrões contendo `?`
- padrões negados contendo `!`
- itens de regra que misturam vários patterns e têm semântica instável

Isso evita apresentar "modelos de regra" como se fossem "nós conectáveis diretamente".

## Regras de mapeamento de campos

| Campo do SSH config | Campo do formulário | Descrição |
| --- | --- | --- |
| `HostName` | `host` | Se ausente, pode fazer fallback para o próprio alias |
| `Port` | `port` | Mantém a conversão de número para string |
| `User` | `username` | Preenchido diretamente |
| `IdentityFile` | `privateKeyPath` | Usa o primeiro valor disponível |

Regras complementares:

- Se o alias tiver apenas `Host` e nenhum `HostName`, é possível usar o próprio alias como `host` para o pré-preenchimento.
- Se `IdentityFile` existir, alternar automaticamente para o método de autenticação `Private Key`.
- Se `IdentityFile` não existir, não alternar automaticamente para `Password`; manter o método de autenticação atual, para não sobrescrever a senha já digitada pelo usuário.
- Não gravar o campo de senha ao preencher um alias automaticamente.

## Design do estado do formulário

Sugere-se adicionar em `useRemoteConnectionForm`:

- `sshConfigAliases`
- `sshConfigAliasesLoading`
- `sshConfigAliasesError`
- `selectedSshConfigAlias`
- `applySshConfigAlias(alias: SSHConfigAliasOption)`
- `clearSelectedSshConfigAlias()`

Responsabilidades de estado:

- `useRemoteConnectionForm` é responsável por carregar, cachear e aplicar o alias
- `RemoteConnectionFields` é responsável apenas por renderizar o menu suspenso e chamar o setter

Dessa forma, os dados da plataforma e a exibição da UI continuam dentro da fronteira de responsabilidades já existente entre hook e componente.

## Estratégia de histórico e reconexão

O histórico de conexões remotas deve continuar salvando o destino SSH expandido, e não o próprio nome do alias.

Motivo:

- A conexão remota atual e a reconexão automática funcionam com base nos campos concretos de `RemoteTarget`
- O nome do alias não é uma semântica de conexão estável; o usuário pode modificar `~/.ssh/config` a qualquer momento
- Se apenas o nome do alias for salvo, o comportamento da próxima reconexão mudaria implicitamente conforme o "conteúdo atual do SSH config", tornando o comportamento de persistência imprevisível

Portanto:

- Nesta entrega o alias serve apenas como fonte de "inicialização do formulário"
- O histórico continua sendo persistido conforme a lógica existente de `host / port / username / privateKeyPath / credential key`
- A deduplicação em nível de workspace, a associação de sessões e a chave de cache continuam seguindo `workspaceKey = workspaceIdentity?.trim() || workspacePath`
- A construção e o casamento da identidade do workspace remoto continuam reutilizando as utilidades unificadas (como `buildRemoteWorkspaceIdentity`), sem introduzir regras de identidade específicas para alias

## Sugestões de textos de UI

Novas chaves de i18n:

- `ssh.configAlias`
- `ssh.configAliasPlaceholder`
- `ssh.configAliasEmpty`
- `ssh.configAliasLoadFailed`
- `ssh.configAliasDescription`

Direção dos textos:

- Chinês: `SSH 配置别名（可选）`
- Inglês: `SSH Config Alias (Optional)`

## Passos de implementação

### Fase 1: conectar a capacidade de plataforma

- Adicionar `SSHConfigAliasOption` em shared
- Adicionar `listSSHConfigAliases()` em `IPlatformService`
- Conectar a cadeia de chamadas em desktop preload / renderer / main e o fallback web
- Completar a compatibilidade da cadeia de tipos do web remote control

### Fase 2: implementar o parser no desktop

- Adicionar uma utilidade de runtime do desktop responsável por ler e fazer o parsing do SSH config
- Implementar primeiro a extração da lista de alias e o mapeamento básico de campos
- Tentar `ssh -G` primeiro e, em caso de falha, recorrer ao parsing leve
- Adicionar testes unitários para `Include`, alias de padrão e `IdentityFile`

### Fase 3: integração com a UI

- Ler e usar como referência o `DESIGN.md` na raiz do projeto, garantindo que cores, hierarquia, raio de canto, tamanhos, responsividade, tema e regras de i18n não sejam quebrados
- Fazer `useRemoteConnectionForm` carregar a lista de alias e o estado de seleção
- Fazer `RemoteConnectionFields` renderizar o menu suspenso e as dicas
- Preencher o formulário após a seleção do alias
- Limpar o estado de seleção do alias quando o usuário editar manualmente um campo-chave

### Fase 4: testes e regressão

- Testes unitários de UI
- Testes unitários do main do desktop / do parser
- E2E cobrindo a seleção no menu suspenso do diálogo SSH e o preenchimento automático de campos
- Rodar `pnpm typecheck`
- Rodar `pnpm lint`

## Sugestões de teste

### Testes unitários

- Parsing do SSH config:
  - Um único alias
  - Vários alias
  - `Include`
  - Filtragem quando há itens de padrão
  - Extração de `IdentityFile`
- Estado do formulário:
  - Preenchimento correto após selecionar um alias
  - Troca para `privateKey` quando `IdentityFile` existe
  - Limpeza do estado de seleção do alias após edição manual

### E2E

- O menu de alias aparece após abrir o diálogo SSH
- Após selecionar um alias, `host / port / username / privateKeyPath` são atualizados automaticamente
- Sem alias, a conexão manual não é bloqueada

## Riscos e pontos de atenção

### Risco 1: o usuário esperar que o alias equivalha a compatibilidade completa com OpenSSH

Este é o maior risco de produto. É preciso informar claramente:

- A v1 oferece "preenchimento automático por alias"
- E não "reprodução completa de toda a semântica de `ssh alias`"

### Risco 2: resultado do parsing divergente do comportamento real do OpenSSH

Mitigação:

- Dar prioridade a `ssh -G`
- Extrair apenas os campos que a UI atual realmente consegue consumir
- Não fazer promessas falsas para configurações complexas não suportadas

### Risco 3: divergência de comportamento entre web / desktop

Mitigação:

- Manter a interface unificada
- O web retorna explicitamente um array vazio
- Não fazer a UI depender diretamente de objetos exclusivos do desktop

## Conclusão

Recomenda-se definir esta funcionalidade como:

> Adicionar ao diálogo SSH um menu suspenso de alias baseado no `~/.ssh/config` local; após a seleção, preencher automaticamente o formulário SSH atual e continuar usando o fluxo `connectRemote()` existente para conectar.

As vantagens desta abordagem são:

- Consistente com a camada atual
- Impacto mínimo sobre o `RemoteTarget` existente, o histórico remoto e a reconexão automática
- Valor claro para o usuário
- Permite entregar primeiro os cenários de alta frequência e depois, conforme o feedback, decidir se vale estender para o suporte completo à semântica de alias do OpenSSH
