# Overflow do Título do Item de Task

Quando o título de uma task item do workspace ou de uma timeline task item ultrapassa a largura disponível, não deve ser exibida a reticência `...`.

Regras de implementação:

- O título permanece em uma única linha, evitando que títulos longos aumentem a altura da lista de tasks da barra lateral.
- A máscara de esmaecimento à direita só é aplicada quando o resultado real de layout do navegador satisfaz `scrollWidth > clientWidth`; títulos curtos totalmente visíveis não recebem máscara.
- A medição é refeita após mudanças no título ou nas dimensões do contêiner: ao passar de sem overflow para com overflow, a máscara é adicionada; ao voltar de overflow para totalmente visível, a máscara é removida.
- A parte excedente usa o mesmo efeito de esmaecimento à direita das grouped task rows, preservando a continuidade do texto.
- Quando o mouse passa 1 segundo inteiro sobre o item de task, o título com overflow muda para uma marquee (letreiro rolante) unidirecional e sem emenda: o conteúdo da trilha é "título completo + espaçamento fixo + cópia do título". O scroll também deve ser mantido quando o mouse está sobre as áreas de tempo, status ou ações dentro da linha; sair da linha inteira durante a espera ou durante o scroll deve cancelar a espera e voltar imediatamente ao estado parado.
- Depois que a marquee percorre uma "largura do título completo + espaçamento", a cópia do título retorna exatamente ao ponto de partida do título original; esse quadro é mantido por 2 segundos e então reiniciado diretamente no quadro inicial para continuar a próxima volta. Como os dois textos são idênticos, visualmente não há inversão nem salto.
- A velocidade da marquee é calculada com base na largura do título completo, evitando que títulos de comprimentos diferentes, usando uma duração fixa, tenham velocidades muito diferentes; ao retirar o mouse, o título volta imediatamente à posição inicial e ao esmaecimento à direita.
- No estado parado há esmaecimento apenas à direita; nos 150ms seguintes ao início do movimento da marquee, o esmaecimento à esquerda é restaurado, para que o texto que sai pela esquerda e entra pela direita não tenha bordas com corte duro.
- Quando a cauda da primeira cópia do título chega à borda esquerda, o esmaecimento à esquerda desaparece imediatamente, sem transição de fade dentro do espaçamento de 24px entre o título e a cópia. Durante a entrada e o alinhamento da cópia e nos 2 segundos de permanência, mantém-se apenas o esmaecimento à direita, garantindo que o início do título fique totalmente visível. Após o reset do ciclo, o esmaecimento à esquerda é restaurado junto com o movimento da próxima volta.
- A cópia do título deve ter `aria-hidden`, para evitar que tecnologias assistivas leiam o nome da task duas vezes.
- Com `prefers-reduced-motion: reduce`, a marquee é desabilitada e apenas o esmaecimento estático é mantido.
- O nome da task não renderiza o atributo nativo `title`; no hover, apenas a marquee é usada para mostrar o conteúdo completo, evitando que a caixa de dica do navegador cubra o título.
- O esmaecimento atua somente no próprio texto do título da task, sem afetar o tempo à direita, o resumo de alterações, os rótulos de permissão e os botões de ação do hover.
- O task name do header do Workspace não segue esta regra e mantém a solução de truncamento original com `truncate` / `...`.

Essa restrição vale tanto para a barra lateral do desktop quanto para as listas de tasks do controle remoto Web em dispositivos móveis, porque as duas pontas reutilizam o mesmo componente de UI `TaskListItem`.

A grouped task row reutiliza o mesmo conjunto de medição de overflow e componente de esmaecimento, evitando que a lista padrão, a timeline e a grouped view tenham semânticas de truncamento de título diferentes.