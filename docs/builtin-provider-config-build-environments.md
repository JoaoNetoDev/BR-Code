# Empacotamento da Configuração de Built-in Provider em Dois Ambientes

## Propriedade e Limites

A ferramenta de build possui sozinha a responsabilidade de seleção de configuração, lendo o `ZCODE_ENV=test|production` já existente.
Variável de ambiente explícita tem prioridade; quando não definida, lê o arquivo de ambiente .env já existente no repositório e, por padrão, usa test.
`NODE_ENV` afeta apenas qual grupo de arquivos .env é lido e não determina diretamente o ambiente do produto. Um ZCODE_ENV não vazio e inválido gera erro.

| Ambiente de produto | Arquivo-fonte no repositório                    |
| ---------- | --------------------------------------- |
| production | config/provider/zcode-builtin.json      |
| test       | config/provider/zcode-builtin.test.json |

Ambas são Releases completas. O arquivo de produção é a única fonte de edição; o arquivo de teste é gerado e versionado por `pnpm provider:config:sync-test`, e a revision acompanha o arquivo de produção.
`pnpm provider:config:check-test` apenas verifica se o resultado gerado está desatualizado, sem escrever arquivos; está incluído nos testes unitários.
Não alterar o Release Schema, o Overlay pessoal, o Registry ou a seleção de conta/modelo.

## Regras de Geração da Configuração de Teste (Todo147)

Comparando com `staging_backup@790884b1ce`, apenas os endereços de modelo do Provider `zhipu-account` são convertidos:

| Base URL de produção                                 | Base URL de teste                                          |
| ---------------------------------------------- | ------------------------------------------------------ |
| https://api.z.ai/api/anthropic                 | https://api.z.ai/api/anthropic                 |
| https://open.bigmodel.cn/api/anthropic         | https://open.bigmodel.cn/api/anthropic                  |
| https://zcode.z.ai/api/v1/zcode-plan/anthropic | https://zcode.z.ai/api/v1/zcode-plan/anthropic |
| https://zcode.z.ai/api/v1/off-peak/anthropic   | https://zcode.z.ai/api/v1/off-peak/anthropic   |

- Cada geração parte novamente da configuração de produção completa, sem modificação incremental da configuração de teste antiga e sem manter uma segunda cópia das capacidades de modelo.
- Templates manuais, endereços de terceiros, links de gerenciamento de Key etc. são preservados como estão; ao encontrar um endereço de conta desconhecido, a geração falha explicitamente e exige o mapeamento correspondente, sem fazer request silenciosamente em produção.
- Para as regras de site que atingem os endereços de produção acima, a regra original é preservada e depois dela é gerada a regra correspondente à URL de teste.
  Uma regra descreve apenas um site; o casamento de modelo, tipo de API, capacidades, Map e a ordem relativa são todos herdados.
  A regra de produção é preservada porque os templates manuais de API no pacote de teste ainda apontam para a entrada oficial de produção.
- O arquivo gerado só é escrito depois da validação completa do Release; sem rede, sem migração de dados de usuário e sem publicação online.
- O build continua lendo apenas o arquivo selecionado, sem reescrever implicitamente o arquivo-fonte durante builds paralelos; sincronizar antes e depois construir, mantendo as entradas de cache do Todo146.

```text
编辑生产 JSON → 同步脚本（账号 URL 映射 + 派生站点规则）→ 测试 JSON
                       ↓ 校验生成结果
                  原双环境打包流程
```

A admissão de assinatura adiciona separadamente no Adapter existente os hostnames exatos `api.z.ai` e `zcode.z.ai`;
`bigmodel.cn` já é coberto pelo `*.bigmodel.cn` existente. Não expandir para todo o `*.z.ai`,
nem alterar os outros consumidores da ferramenta pública de classificação de Family. Independente do switch de ambiente de produto, apenas de acordo com a URL real.
A exceção de não assinar Start／Off-Peak da conta tem prioridade sobre o domínio; contas pessoais／de equipe e Keys de plano explícito continuam usando a entrada original.

```text
ZCODE_ENV + 对应完整 JSON
             |
             v
共同构建入口：选文件、完整 Release 解码校验
             |
       +-----+--------------------+
       |                          |
       v                          v
Desktop / CLI / SEA 资源     HTTP / Remote / Server CLI 嵌入常量
       |                          |
       +------------+-------------+
                    v
          原有 Built-in Source / Registry
```

O recurso do Desktop continua sendo `resources/config/provider/zcode-builtin.json`; a CLI usa
`dist/provider/zcode-builtin.json`; a key SEA continua sendo `zcode-provider/zcode-builtin.json`.
O Server mantém a constante JSON compilada original. Em modo de desenvolvimento, o Desktop localiza o arquivo-fonte do repositório conforme o mesmo ambiente compilado.
A prioridade de injeção de caminho de configuração explícita não muda.

Falha de leitura/parsing aborta diretamente o build, com fallback entre ambientes proibido. Reutilizar o decodificador de Release existente,
sem manter uma segunda Schema. A ferramenta de build apenas lê arquivos locais e não baixa configuração pela rede.

Ao carregar o decodificador de Release entre plataformas, é obrigatório converter o caminho do sistema de arquivos em uma URL `file:` antes de entregá-la ao
`tsImport`, evitando que a letra de unidade do Windows seja interpretada pelo loader ESM como um protocolo. Os dois ambientes compartilham esta entrada,
sem alterar a política de seleção de configuração, validação e proibição de fallback entre ambientes.

## Cache e Timing

- Builds comuns de CLI, Desktop e Server seguem o fluxo original, sem nova camada de cache.
- O JS já presente no bootstrap pode continuar sendo reutilizado, mas o recurso de configuração ao lado dele continua sendo validado e atualizado.
- O CLI build e o build:desktop-agent do Turbo incluem ZCODE_ENV, os .env relevantes, as duas configurações e a ferramenta de build compartilhada.
- O fingerprint de build do Desktop E2E inclui a ferramenta compartilhada e as entradas de configuração; o fingerprint de ambiente existente continua sendo reutilizado.
- O Server remoto já embute a configuração no JS; o source hash / artifact hash existentes fazem naturalmente uma mudança de configuração disparar um novo empacotamento.
- Não escolher o ambiente sobrescrevendo o arquivo-fonte do repositório; builds paralelos de ambientes diferentes devem usar worktrees/diretórios de saída próprios,
  sem nova garantia de escrita concorrente no mesmo dist.

A publicação da configuração online, a escolha de revision/LKG e o isolamento de endpoint não mudam: desta vez só decidimos a configuração inicial dentro do pacote.
Os links de continuous do desktop e as cadeias shared-host/replayable do celular não têm mudança de estado, protocolo ou poder de execução.

## Verificação

Usar Releases temporários com conteúdos diferentes para distinguir os ambientes, cobrindo JSON ausente/inválido/Schema inválido, prioridade de ambiente,
atualização após reutilizar JS, atualização de conteúdo no mesmo ambiente, recurso SEA e o artefato final embutido. As duas configurações reais são decodificadas separadamente.
Não substituir as asserções de seleção de ambiente por "o teste passa porque hoje as duas configurações são iguais", e não exigir requisições reais a modelos.

Os testes do entrypoint de build compartilhado e do teste de sync da configuração de ambiente de teste são mantidos em arquivos separados: `builtin-provider-build.test.ts`
executa apenas o contrato de build compartilhado; `builtin-provider-test-config-sync.test.ts` executa os testes Node do script interno de sync.
O segundo é excluído por arquivo junto com o script de sync e seus testes de script; os testes de build compartilhado são mantidos como estão na exportação open source,
sem remover casos parametrizados via patch e sem substituir a verificação do lado closed source por pular quando o arquivo está ausente.
