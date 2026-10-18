# Resolução Automática de Proxy do Workspace Remoto WSL

## Contexto

A configuração de proxy de rede do desktop pertence ao Windows Host, enquanto o Agente no workspace remoto WSL é outro processo Linux.
No modo de rede WSL NAT, o Agente não pode tratar `localhost:porta` como endereço de proxy do Windows Host, o que faz com que
as requisições de rede de modelos, MCP ou ferramentas falhem após a conexão do workspace. O staging atual já conecta o download
de recursos remotos ao proxy do Host; este design apenas completa a fronteira de proxy em runtime do Agente dentro do WSL.

## Objetivos

- Reutilizar a configuração explícita existente `httpProxy` / `httpProxyNoProxy` da página de configurações.
- No modo WSL NAT, converter automaticamente o endereço de proxy loopback para o endereço de gateway do host alcançável a partir do WSL.
- No modo WSL mirrored, ou quando o proxy já for um endereço não loopback, manter o valor original.
- Quando a conversão automática falhar, não varrer a rede local, não adivinhar portas e manter a configuração original como fallback diagnosticável.
- As cadeias SSH, Docker, server remote, `desktop-continuous` do desktop e `web-remote-replayable` do mobile mantêm o comportamento original.

## Não Objetivos

- Não introduzir descoberta global de proxy nem varredura de portas da rede local.
- Não enviar para o remoto as credenciais do Windows, o proxy de ambiente do shell nem logs com a URL completa do proxy.
- Não modificar as semânticas de owner, lease, queue, snapshot ou delivery do remote workspace.
- desta rodada não trata a conversão do caminho de certificados do Windows para o caminho WSL; a CA customizada continua exigindo um design independente posterior.

## Cadeia e Fronteiras

```text
AppSettings.httpProxy (Windows Host)
              |
              v
      WSL remote connect
              |
              +-- Host/CDN fetch: 使用 Windows 原始代理 localhost:port
              |
              +-- WSL Agent env:
                    loopback + NAT -> 解析 WSL host gateway -> gateway:port
                    loopback + mirrored -> 保持 localhost:port
                    非 loopback -> 保持用户配置
```

A inicialização da conexão passa o proxy apenas como uma opção explícita de rede do remote runtime para o comando do WSL server;
`pickRemoteRuntimeEnv(process.env)` não é estendido, evitando herdar o `HTTP_PROXY` do shell do usuário além da fronteira
existente de limpeza do ambiente de runtime. O server remoto então usa essa configuração de rede explícita no próximo spawn do Agente.

## Regras de Resolução

1. Sem proxy explícito: nenhuma variável de ambiente de proxy é injetada.
2. Se o host do proxy não for `localhost`, `127.0.0.1` ou `::1`: manter a URL de proxy original.
3. Se o host do proxy for loopback:
   - primeiro, sondar dentro do WSL a porta TCP do loopback original; se tiver sucesso, considera-se mirrored/acessível diretamente e o valor original é mantido;
   - quando o endereço original é inacessível, prioriza-se a leitura do next hop de `ip route show default` como gateway do host; somente quando `ip` está indisponível ou não há default route é que se recorre a `/etc/resolv.conf`;
   - o candidato de route rejeita loopback; o candidato de resolv.conf ainda precisa ser um endereço privado ou link-local, evitando tomar um DNS público/empresarial como gateway do host; depois de encontrar um gateway válido, o hostname da URL é substituído, preservando scheme, porta, autenticação e caminho.
4. Se a resolução do gateway ou a sondagem falhar: manter o valor de proxy original e indicar nos logs de conexão que a resolução automática não foi confirmada; não bloquear o handshake do WSL server, para que uma diagnóstico de rede incorreto não impeça a abertura do workspace local.

O endereço após a resolução automática existe apenas no ambiente deste processo de server remoto e de seus subprocessos Agente, e não é gravado de volta no arquivo de configurações,
porque o endereço do gateway WSL pode mudar a cada reinício da distribuição.

## Segurança e Compatibilidade

- Apenas o host/porta já configurado pelo usuário é sondado, sem varredura de rede.
- Os logs registram somente o scheme, host, porta e resolution kind do resultado da resolução do proxy, ocultando usuário, senha e caminho.
- A capacidade é usada apenas com `target.kind === "wsl"`; SSH/Docker/server continuam usando o ambiente de runtime original.
- O Agente remoto continua pertencendo a um shared-host attachment; a cadeia do desktop permanece `desktop-continuous` e a do mobile permanece `web-remote-replayable`.

## Plano de Testes

- Funções puras: substituição e mascaramento para loopback, IPv4, IPv6, não loopback e URL com autenticação.
- Backend WSL: manter o valor original quando o loopback está acessível; substituir quando inacessível e o gateway pode ser resolvido; manter o valor original quando a resolução falha.
- connect: injetar ambiente de proxy explícito apenas no WSL; não repassar `HTTP_PROXY` da whitelist do ambiente do processo de chamada para SSH/Docker.
- Regressão: testes unitários existentes de remote asset, remote connect e ciclo de vida WSL; executar `pnpm typecheck` e `pnpm lint`.