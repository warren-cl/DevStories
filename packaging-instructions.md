# Packaging and side loading

## Install extension packager

`npm install -g @vscode/vsce`

## Create the vsix package

`npx vsce package`

## Side load the extension

`code --install-extension devstories-2.3.2.vsix`

## If you encounter issues:

Do not run the install from within code's terminal. Close VS Code and install from Windows Terminal or bash.

try `code --install-extension devstories-2.3.2.vsix --force`
