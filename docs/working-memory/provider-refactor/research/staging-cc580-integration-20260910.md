# Registro de merge do staging cc580ba72a

## Baseline e escopo

- Antes do merge local: `cf6777b82d`, branch `provider-schema-refinement-20260910`, workspace limpo.
- Este fetch fixou o staging: `cc580ba72a`, com 17 commits upstream (9 commits sem merge), com incremento envolvendo 49 arquivos.
- O `merge --no-ff` normal preserva os commits dos dois lados, não usa ours/theirs de arquivo inteiro e não faz push automático; não executa os Todo105–113 ainda em desenvolvimento.

## Decisões funcionais e conflitos

| Origem upstream | Comportamento e tratamento |
| --- | --- |
| `758fc8568c`, `da708b7d4a`, `8108d4e4db` | Preservar a classificação de motivos de Account indisponível, o schema shared estrito e o retry de falta de Key nos dois planos pessoais. O motivo pertence ao runtime e o Host é o owner; a UI usa o resultado público, não consulta novamente os benefícios e não trata falta de Key como OAuth inválido. |
| `2e26360bc9` | Preservar a complementação da injeção do zcode JWT já existente no site oficial embutido no BigModel, sem alterar o sistema de login/autenticação. |
| `0fedd3c4a2` | Preservar a compatibilidade de replay de identidade histórica do Coding Plan do mesmo serviço no Adapter; afeta apenas a projeção de thinking local à requisição, sem mapear a seleção atual e sem alterar a identidade histórica. |
| `0aa4cc61ae` | Preservar o repasse de porta PDF no Runtime; não restaurar a antiga interface de conexão de modelo. |
| `f5a802f929` | Preservar os valores padrão do componente de compartilhamento e a estabilização da referência de callback, com a atribuição de Session inalterada. |
| `7ef23cfad3`, `12cddd0f87` | Preservar o pre-push sem imposição de mise e a reformulação do serviço de notificação Feishu; a verificação continua passando pelo gate original; não enviar notificações reais nem ajustar credenciais de CI externas. |

Conflitos explícitos existem apenas em `steps/steps.md`: preservar os registros adicionados pelos dois lados. O upstream Todo105 e o Todo105 de simplificação de modelos deste branch têm o mesmo número; o registro de estado de conta do upstream passou a Todo114, com as referências atualizadas; os casos e caminhos de evidência históricos do T105 não mudam.

Interseção implícita: o upstream `runtime-reasoning-provider-replay.test.ts` chama o `migrateLegacyModelSelection`, já removido pelo Todo109, e os primeiros 16 casos falharam com TypeError. O teste foi corrigido conforme a decisão formal de migration deste branch: semear temporariamente um banco vazio com o formato antigo, reabrir a frio executando 0020; afirmar que a migração preserva todos os membros antigos e as reasoning parts, e que as duas rodadas seguintes de requisição não reescrevem as linhas históricas já migradas. Não foi restaurada a antiga interface de runtime nem afrouxada a asserção sobre o conteúdo de pensamento.

## Verificação e revisão

- App/config compartilhado/conta/notificação/banco: 11 arquivos, 361 testes passando.
- Componente de compartilhamento: 4 arquivos, 48 testes passando.
- CLI Adapter/Runtime/PDF/migration de sessão/leitura de rollback: após corrigir os testes acima, 6 arquivos, 101 testes passando.
- Total de 21 arquivos, 510 testes passando; `pnpm typecheck` da raiz e `tsc --noEmit` dos Agent adapters/core passaram.
- `pnpm lint`: 0 error / 41 warning; verificação de arquitetura com 0 violation / 0 baseline / 0 new; verificação de formatação dos testes modificados e verificação de espaços em branco do diff passaram.
- Cada comportamento novo do upstream tem um destino de preservação; as fronteiras deste branch (migration, proteção do valor original do histórico, leitura normal sem nova migração, compatibilidade local à requisição, sincronização de fatos do Account) não restauraram a implementação antiga. Documentos de design mesclados automaticamente preservam as cláusulas dos dois lados.
- Reavaliação feita com architecture-governance e React best-practices; os módulos estão atualmente unmanaged, sem novo owner nem nova IO entre camadas.
- Nesta rodada não foram reexecutados Pro, Electron completo, aparelho real/SSH ou a validação de assinatura de rede de modelos oficiais; reutiliza-se a evidência de navegador em componente já registrada pelo upstream, sem contá-la entre as 510 verificações desta rodada e sem alegar regressão completa em todos os alvos.

## Entrega

Formado um merge commit com dois pais, com todos os commits do staging entrando no branch atual; as únicas correções adicionais foram a fiação dos testes de merge e a numeração/registro da documentação. Sem push para o remoto e sem alteração de dados reais de usuário.