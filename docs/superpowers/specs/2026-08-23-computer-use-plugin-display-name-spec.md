# Especificação do nome de exibição do plugin Computer Use

## Contexto

O nome histórico do manifest do plugin CUA é `zcode-cua`, enquanto o slug interno do Browser Use
é `browser-use`. O diretório oficial atual já define o nome de exibição do CUA como
`Computer Use`, mas plugins já instalados, agrupamentos de capacidade e alguns textos de
confirmação ainda formatam diretamente o antigo nome de manifest como `Zcode Cua`, fazendo com
que os dois plugins oficiais tenham um estilo de nomenclatura visível ao usuário inconsistente.

## Objetivo

- Todos os nomes do plugin CUA visíveis ao usuário usam uniformemente `Computer Use`; em
  chinês, `电脑控制`.
- Os contextos visíveis ao usuário que precisam de slug usam `computer-use` (por exemplo, o nome
  do MCP server), sem exibir mais `zcode-cua` como nome de produto.
- O canonical name da Skill voltada ao modelo usa `computer-use`, com qualified name
  `computer-use:computer-use`; o diretório de Skills do producer e do consumer, os scripts de
  sincronização e o provenance devem manter o mesmo nome.
- Manter inalterados o nome do pacote `@zcode/zcode-cua`, o repositório do producer, o pin do
  producer, os caminhos de código-fonte e a identidade do bundle do Helper no macOS; esta
  rodada não fornece aliases de compatibilidade para IDs antigos de plugin ou nomes antigos de
  Skill.

## Solução

1. Continuar usando o `displayName`/`displayNameI18n` do official marketplace listing como
   fonte autoritativa do nome de exibição, sem duplicar no manifest um conjunto de campos de
   exibição que possa divergir do diretório.
2. A lista de plugins instalados na página de configurações, o breadcrumb, a confirmação de
   desinstalação e os agrupamentos de capacidade de Skills/Commands/Subagents/Hooks/MCP exibem
   todos pela mesma lógica de resolução do listing display-name; plugins de terceiros sem
   listing continuam degradando para a formatação pelo slug original.
3. O repositório CUA ajusta apenas o título do plugin voltado ao usuário, textos como README e
   logs do launcher, e renomeia a Skill voltada ao modelo de `zcode-computer-use` para
   `computer-use`; `name: computer-use`, `mcpServers.computer-use`, o nome do pacote e os campos
   de protocolo de runtime no manifest permanecem inalterados.

## Invariantes

- Instalação, início/parada, desinstalação, atualização, injeção do permission broker e o
  namespace de runtime MCP continuam associados por `computer-use@zcode-plugins-official` e
  `plugin:computer-use:computer-use`.
- A Skill oficial descoberta pelo SkillPort deve ser `computer-use:computer-use`; não se deve
  continuar publicando `zcode-cua:zcode-computer-use`, nem expor duas Skills oficiais ao mesmo
  tempo.
- A mudança do nome de exibição não pode alterar a cadeia de execução replayable do desktop
  continuous ou do Web remote, nem alterar os julgamentos de provenance/permissão de skills,
  comandos e subagents.
- Quando o marketplace listing estiver ausente ou não puder ser resolvido, a UI deve caer com
  segurança no canonical slug original, sem forjar nem codificar outros nomes de plugin.

## Verificação

- Testes unitários cobrem a resolução dos nomes de exibição em chinês e inglês do listing CUA,
  bem como o uso dos nomes do listing na lista de plugins instalados.
- O z-code executa `pnpm typecheck`, `pnpm lint` e os testes unitários de UI/plugin afetados.
- O CUA executa `pnpm typecheck`, `pnpm lint` e os testes de contrato de scripts/textos afetados.