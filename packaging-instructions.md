# Packaging and side loading

## Install extension packager

`npm install -g @vscode/vsce`

## Create the vsix package

`npx vsce package`

## Side load the extension

`code --install-extension devstories-0.0.1.vsix`
