# Cores dos subagentes integrados

Os subagentes integrados devem fornecer uma cor explícita nos dados do profile, sem depender do fallback da UI que faz hash do nome.

- `general-purpose` usa `blue`.
- `Explore` usa `cyan`.
- A UI ainda mantém o fallback de hash por nome, usado apenas para eventos antigos, agentes externos ou subagentes personalizados sem cor configurada.
- As cores integradas são apenas identificação de identidade e não expressam semântica de estado, como sucesso, falha ou perigo.

Dessa forma evita-se que o `general-purpose` integrado apareça como `red` por resultado do hash do nome, fazendo o usuário acreditar que se trata de um estado de erro ou perigo.