# expoize
[![type-coverage](https://img.shields.io/badge/dynamic/json.svg?label=type-coverage&prefix=%E2%89%A5&suffix=%&query=$.typeCoverage.atLeast&uri=https%3A%2F%2Fraw.githubusercontent.com%2Fjduarter%2Fexpoize%2Fmaster%2Fpackage.json)](https://github.com/jduarter/expoize)
[![NPM](https://img.shields.io/npm/v/expoize)](https://github.com/jduarter/expoize)

💫 convert React Native projects into Expo environments.

Warning: This project is on pre-release stage. It's not stable for production yet.

![demo](https://user-images.githubusercontent.com/18369833/120942021-5d201380-c726-11eb-9b54-97ea22917ec0.jpg)

## Usage

### Important!

You **MUST**:
1. perform a backup of your code before executing this script.
2. use versioning control and commit your pending changes **before** executing this script. 

### 1. Run with no install (via `npx`)

You don't need to install the package if you already have the `npx` command in your system:

Run:
```
npx expoize
```

### 2. Install as `devDepedency`

Install: 
```
npm install --save-dev expoize
```

Run:
```
./node_modules/.bin/expoize
```

## Requirements

This project has been tested exclusively in Node 14 enviroments. There are plans to support Node 12 and verify Node 16.
