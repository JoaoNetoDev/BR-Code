# Welcome Screen Provider Region Tags

Quando o usuário ainda não está autenticado, a entrada de providers OAuth da Welcome Screen exibe Z.AI e BigModel simultaneamente. Para ajudar o usuário a distinguir a região de serviço das duas entradas, um rótulo fixo de região é exibido após o texto do botão:

- Z.AI: `全球` em chinês, `Global` em inglês
- BigModel: `中国` em chinês, `CN` em inglês

O texto dos rótulos deve vir de `packages/ui/src/i18n/locales/*`, mantendo no componente apenas o mapeamento de provider id para message id. Os rótulos expressam apenas a diferença de região da entrada e não participam da seleção, ordenação, disponibilidade dos OAuth providers nem da verificação de domínio do provider family. O tamanho usa um pill compacto: `h-5 px-2 text-ui-xs`.

Os botões de OAuth provider usam `Button variant="default"`, com fundo vindo de `bg-primary`. No tema ZAI, a cor clara é `#000000` e a escura é `#ffffff`, e o texto usa `text-primary-foreground`. Os rótulos de região funcionam como informação anexa dentro do botão e não usam mais o emblema de gradiente independente do Coding Plan; o estilo deve acompanhar a cor de frente do botão, usando `border-primary-foreground/30 text-primary-foreground/60`, para garantir apenas uma ênfase fraca tanto no tema claro quanto no escuro.