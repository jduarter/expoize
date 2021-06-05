/* eslint @typescript-eslint/no-var-requires:0, dot-notation:0 */

const jsonpatch = require('jsonpatch');

const origPackageJson = require('./package.json');
const origAppJson = require('./app.json');
const origTsconfigJson = require('./tsconfig.json');
const origBabelConfigJs = require('./babel.config.js');

const { readFile: fsReadFile, writeFile: fsWriteFile } = require('fs/promises');
// eslint-disable-next-line security/detect-child-process
const { execSync } = require('child_process');
//npx ts-node -O '{"isolatedModules":false}' expoize.ts
const BANNER =
  '                             o              ' +
  '\n' +
  '                                             ' +
  '\n' +
  ".oPYo. `o  o' .oPYo. .oPYo. o8 .oooo. .oPYo. " +
  '\n' +
  "8oooo8  `bd'  8    8 8    8  8   .dP  8oooo8 " +
  '\n' +
  "8.      d'`b  8    8 8    8  8  oP'   8.     " +
  '\n' +
  "`Yooo' o'  `o 8YooP' `YooP'  8 `Yooo' `Yooo' " +
  '\n' +
  ':.....:..:::..8 ....::.....::..:.....::.....:' +
  '\n' +
  '::::::::::::::8 :::::::::::::::::::::::::::::' +
  '\n' +
  '::::::::::::::..:::::::::::::::::::::::::::::';

console.log(BANNER);

const readFile = async (fileName: string) => {
  const buf = await fsReadFile(fileName);
  return buf.toString();
};
const writeFile = async (
  fileName: string,
  bufToWrite: Buffer,
  quiet = false,
) => {
  let logOpResult = '[ERROR]';
  let bytesWritten = -1;
  try {
    bytesWritten = quiet
      ? bufToWrite.length
      : await fsWriteFile(fileName, bufToWrite);
    logOpResult = '[OK] bytesWritten=' + bytesWritten;
  } catch (err) {
    logOpResult = '[ERROR] ' + err.name + ': ' + err.message;
  }
  console.log('*** patching file: ' + fileName + '...\t\t\t ' + logOpResult);

  return bytesWritten;
};

const sysExec = async (cmd: string, isJson = true, quiet = false) => {
  console.log('' + '> ' + cmd + '\n\n');

  if (quiet) {
    return null;
  }

  const x = execSync(cmd);

  return isJson ? JSON.parse(x.toString('utf-8')) : x.toString('utf-8');
};

interface TargetVersions {
  expo: string;
  'react-native': string;
  react: string;
}

type PatchFunc<OT> = ({ orig }: { orig: OT }) => string;

type AppJsonPatchFunc = (
  input: Record<'app.json' | 'package.json', Record<string, any>>,
) => [Record<string, any>];

const detectVersions = async (
  forceExpoVersion: null | string = null,
): Promise<TargetVersions> => {
  const expoPackageJson = await sysExec(
    'npm view --json ' +
      (forceExpoVersion ? 'expo@' + forceExpoVersion : 'expo@latest'),
  );
  const targetVersions: TargetVersions = {} as TargetVersions;
  targetVersions['expo'] = expoPackageJson['dist-tags'].latest;
  const expoDevDeps = expoPackageJson.devDependencies;

  targetVersions['react-native'] = expoDevDeps['react-native'];
  targetVersions['react'] = expoDevDeps.react;

  console.log(
    '[i] Using expo version=' + targetVersions['expo'] + ' as target',
  );
  console.log('    Main dependency versions: ');
  console.log('    React: ' + targetVersions['react']);
  console.log('    React Native: ' + targetVersions['react-native']);

  console.log('');

  return targetVersions;
};

const simplePatch = async <OT = string>(
  fileName: string,
  patchFunc: PatchFunc<OT>,
  input: OT,
): Promise<number> =>
  writeFile(
    fileName,
    Buffer.from(
      patchFunc({
        orig: input,
      }),
    ),
  );

const APP_JSON_PATCH: AppJsonPatchFunc = ({
  'app.json': appJson,
  'package.json': packageJson,
}) => [
  {
    op: 'add',
    path: '/expo',
    value: {
      name: appJson.name,
      slug: appJson.name,
      assetBundlePatterns: ['**/*'],
      version: packageJson.version,
    },
  },
];

const patchAppJson = async (
  inputs: Record<'app.json', Record<'name', string>> &
    Record<'package.json', Record<'version', string>>,
): Promise<number> => {
  const patchedAppJson = jsonpatch.apply_patch(
    inputs['app.json'],
    APP_JSON_PATCH({
      'app.json': inputs['app.json'],
      'package.json': inputs['package.json'],
    }),
  );

  return writeFile('./app.json', Buffer.from(JSON.stringify(patchedAppJson)));
};

type TsconfigInputValue = Record<string, any> & {
  compilerOptions: { lib: string[] };
};

const TSCONFIG_JSON_PATCH: PatchFunc<TsconfigInputValue> = ({ orig }) =>
  JSON.stringify({
    ...orig,
    compilerOptions: {
      ...orig.compilerOptions,
      ...(orig.compilerOptions.lib
        ? {
            lib: [
              ...new Set([
                ...orig.compilerOptions.lib,
                'dom',
                'es6',
                'es2016.array.include',
                'es2017.object',
              ]),
            ],
          }
        : {}),
    },
    ...(orig.extends
      ? { extends: [...new Set([orig.extends])] }
      : { extends: 'expo/tsconfig.base' }),
  });

const patchTsconfigJson = async (
  inputs: Record<'tsconfig.json', TsconfigInputValue>,
): Promise<number> =>
  simplePatch<TsconfigInputValue>(
    './tsconfig.json',
    TSCONFIG_JSON_PATCH,
    inputs['tsconfig.json'],
  );

type BabelInputValue = Record<string, any> & { presets: string[] };

const BABEL_CONFIG_JS_PATCH: PatchFunc<BabelInputValue> = ({ orig }) =>
  'module.exports = ' +
  JSON.stringify({
    ...orig,
    presets: [
      ...(orig.presets
        ? [
            'babel-preset-expo',
            ...orig.presets.filter(
              (p: string) =>
                [
                  'module:metro-react-native-babel-preset',
                  'babel-preset-expo',
                ].indexOf(p) === -1,
            ),
          ]
        : []),
    ],
  }) +
  ';';

const patchBabelConfigJs = async (
  inputs: Record<'babel.config.js', BabelInputValue>,
): Promise<number> =>
  simplePatch(
    './babel.config.js',
    BABEL_CONFIG_JS_PATCH,
    inputs['babel.config.js'],
  );

const main = async (): Promise<boolean> => {
  const versions = await detectVersions();

  await patchAppJson({
    'package.json': origPackageJson,
    'app.json': origAppJson,
  });

  await patchTsconfigJson({ 'tsconfig.json': origTsconfigJson });

  const origIndexJs = await readFile('./index.js');

  await patchBabelConfigJs({ 'babel.config.js': origBabelConfigJs });

  // @todo: convert this to regexps having in consideration the
  // appName and the kind of quotes.

  const patchedIndexJs = origIndexJs
    .replace(
      'AppRegistry.registerComponent(appName, () => App);',
      'registerRootComponent(App);',
    )
    .replace(
      "import { AppRegistry } from 'react-native';",
      "import { registerRootComponent } from 'expo';",
    );
  await writeFile('./index.js', patchedIndexJs);

  const patchedWebpackJsConf = await readFile(
    './expoize-template.webpack.config.js',
  );
  await writeFile('./webpack.config.js', patchedWebpackJsConf);

  const patchedMetroJsConf = await readFile(
    './expoize-template.metro.config.js',
  );

  await writeFile('./metro.config.js', patchedMetroJsConf);

  console.log('');

  console.log('*** installing needed packages...');

  await sysExec(
    'npm --json install react-native@' +
      versions['react-native'] +
      ' react@' +
      versions['react'] +
      ' react-dom@' +
      versions['react'] +
      ' expo@' +
      versions['expo'] +
      ' @expo/webpack-config babel-preset-expo react-native-gesture-handler react-native-reanimated react-native-screens react-native-web',
    true,
  );

  return true;
};

main();
