# Comando Bootstrap

`pnpm bootstrap` é a entrada padrão de inicialização local. Ele primeiro obtém o submodule `apps/zcode-cli`, depois instala as dependências, prepara os recursos de runtime local do desktop e executa o build de bootstrap; por padrão não prepara os recursos remotos `mock-cdn`.

`pnpm bootstrap:with-remote` mantém o fluxo completo de inicialização necessário para a depuração remota. Ele primeiro obtém o submodule `apps/zcode-cli`, depois instala as dependências, prepara os recursos de runtime local do desktop, prepara os recursos remotos `mock-cdn` e executa o build de bootstrap.

Se for necessário apenas preparar os recursos remotos separadamente, execute `pnpm prepare:remote-assets`.