# Especificação de geração de idioma da mensagem de commit do Git

Data de atualização: 2026-07-07

## Contexto

Ao gerar a mensagem de commit do Git por IA, é preciso seguir o idioma atual da interface. Quando o usuário escolhe um
idioma fixo, esse idioma é usado diretamente; quando o usuário escolhe "padrão do sistema", o lado chamador precisa
passar o idioma real já resolvido.

## Regras

- Atualmente há suporte a apenas dois idiomas de geração: chinês e inglês.
- `zh-CN` gera subject / body em chinês.
- `en-US` gera subject / body em inglês.
- Quando não for possível obter o idioma atual, ou o idioma não for chinês, o fallback é sempre o inglês.
- A sintaxe de type / scope do Conventional Commit permanece em inglês, por exemplo `fix(git): 修复提交消息语言`.

## Fluxo de dados

- A UI lê o `locale` atual já resolvido por meio de `useZCodeIntl()`.
- A requisição de geração da mensagem de commit do Git passa o `locale` para a camada de services.
- A mesma requisição também carrega o contexto textual recente da sessão atual; as regras de idioma continuam tendo como
  base o `locale`, e o contexto da sessão serve apenas para entender a intenção da alteração.
- Se a sessão atual já tiver um resumo das alterações de arquivos, a UI passa também `currentSessionFilePaths`; a camada
  de services usa esses arquivos para gerar a mensagem de commit apenas a partir das changes staged/unstaged e do diff
  correspondentes, evitando que outras alterações da área de trabalho poluam o subject.
- A lista de arquivos staged/unstaged do diálogo de commit também é filtrada com o mesmo resumo de arquivos da sessão
  atual; ao marcar "incluir alterações não staged", apenas as mudanças não staged dos arquivos da sessão atual são
  colocadas em stage e commitadas.
- A área de ações do rodapé do diálogo de commit usa a lista de Command para hospedar "commitar / commitar e enviar /
  enviar"; a ação selecionada no momento pode ser acionada pelo atalho principal mais Enter: no macOS usa-se Command, no
  Windows/Linux usa-se Ctrl.
- A camada de services normaliza o idioma antes de escrevê-lo no prompt do modelo.
- Quando chamadas antigas não passam `locale`, a camada de services tenta ler o locale de Intl do runtime; se ainda não
  estiver disponível, usa o inglês.

## Aceitação

- Na interface em chinês, o prompt gerado contém `Current language: Chinese`.
- Na interface em inglês ou em idioma desconhecido, o prompt gerado contém `Current language: English`.
- Quando a sessão atual tem um resumo de alterações de arquivos, o `Changed files` / `Diff excerpts` do prompt gerado
  vem apenas dos arquivos da sessão atual.
- Quando a sessão atual tem um resumo de alterações de arquivos e "incluir alterações não staged" está marcado, os paths
  da requisição de commit contêm apenas os arquivos da sessão atual.
- Depois de alternar a ação de rodapé selecionada no diálogo de commit, o atalho principal mais Enter aciona a ação
  correspondente.
- A saída do modelo continua devendo passar pela validação da primeira linha do Conventional Commit.