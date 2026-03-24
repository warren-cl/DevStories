# Packaging and side loading

## Install extension packager

`npm install -g @vscode/vsce`

## Create the vsix package

`npx vsce package`

## Side load the extension

Do not run the install from within code's terminal. Close VS Code and install from Windows Terminal or bash.

try `code --install-extension devstories-3.0.1.vsix --force`
