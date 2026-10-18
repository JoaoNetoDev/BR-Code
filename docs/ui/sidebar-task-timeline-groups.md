# Grupos da Timeline de Tarefas na Barra Lateral

A visualização timeline da barra lateral agrupa os tarefas por tempo de acordo com o campo de ordenação atual:

- `updatedAt`: usado quando a ordenação é por hora de atualização.
- `createdAt`: usado quando a ordenação é por hora de criação.

A ordem dos grupos vai do mais específico ao mais geral:

1. Hoje
2. Ontem
3. Há 2 dias / Há 3 dias
4. Esta semana
5. Semana passada
6. Este mês
7. Mês passado
8. Mais antigos

Os agrupamentos semanais definem o início da semana natural conforme o idioma atual da UI: domingo para inglês, segunda-feira para chinês. A lógica de agrupamento é usada apenas na camada de UI; o service continua fornecendo apenas os timestamps das tarefas, evitando empurrar textos de exibição ou regras de locale para baixo até a camada de dados das tarefas.