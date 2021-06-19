#!/usr/bin/env node
/* eslint @typescript-eslint/no-var-requires:0, dot-notation:0 */
import { runWithLog } from './runWithLog';
import { banner as BANNER } from './banner';
import { sysExec, SEJsonParser, SEPlaintextParser } from '@jduarter/sysexec';
import type { SysExecParser, SysExecRetState } from '@jduarter/sysexec';
import type {
  PackageInfoParser,
  PackageJson,
  TargetVersions,
  PatchFunc,
  AppJsonPatchFunc,
  BabelInputValue,
  TsconfigInputValue,
  PackageInstallResult,
  PackageInstallErrorResult,
  AppJson,
  Settings,
  SettingHookCommandDefinition,
} from './types';

const jsonpatch = require('jsonpatch');

const TEMPLATES_PATH = __dirname + '/../templates';
const PROJECT_PATH = process.cwd();

const origPackageJson = require(PROJECT_PATH + '/package.json');
const origAppJson = require(PROJECT_PATH + '/app.json');
const origTsconfigJson = require(PROJECT_PATH + '/tsconfig.json');
const origBabelConfigJs = require(PROJECT_PATH + '/babel.config.js');

const NPM_INSTALL_READ_TIMEOUT = 60 * 5 * 1000;

const DEFAULT_SETTINGS: Settings = {
  preCmds: [],
  postCmds: [],
};

const {
  readFile: fsReadFile,
  writeFile: fsWriteFile,
  exists: fsExists,
} = require('fs/promises');

console.log(BANNER);

const readFile = async (fileName: string) => {
  const buf = await fsReadFile(fileName);
  return buf.toString();
};

const writeFile = async (
  fileName: string,
  bufToWrite: Buffer,
  quiet = false,
): Promise<boolean> =>
  undefined ===
  (await runWithLog<undefined>(fsWriteFile(fileName, bufToWrite), {
    quiet,
    successCondition: (res: unknown) => res === undefined,
    mainMessage: 'patch file: ' + fileName,
    successMessage: bufToWrite.length + ' bytes written',
  }));

const getNPMPackageInfo = async (pkgName: string): Promise<PackageJson> => {
  const result = await sysExec<PackageInfoParser>(
    'npm',
    ['view', '--json', pkgName],
    SEJsonParser as PackageInfoParser,
  );

  if (!result || !result.parsedStdOut) {
    throw new Error('getNPMPackageInfo: result in stdOut was null.');
  }

  return result.parsedStdOut;
};

const detectVersions = async (
  forceExpoVersion: null | string = null,
): Promise<TargetVersions> => {
  const targetVersions: TargetVersions = {} as TargetVersions;
  const expoPackageJson = await getNPMPackageInfo(
    'expo@' + (forceExpoVersion || 'latest'),
  );

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
): Promise<boolean> =>
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

const patchAppJson = async (inputs: {
  'app.json': AppJson;
  'package.json': PackageJson;
}): Promise<boolean> => {
  const patchedAppJson: AppJson = jsonpatch.apply_patch(
    inputs['app.json'],
    APP_JSON_PATCH({
      'app.json': inputs['app.json'],
      'package.json': inputs['package.json'],
    }),
  );

  return writeFile(
    PROJECT_PATH + '/app.json',
    Buffer.from(JSON.stringify(patchedAppJson)),
  );
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
      ? { extends: [...new Set([orig.extends, 'expo/tsconfig.base'])] }
      : { extends: 'expo/tsconfig.base' }),
  });

const patchTsconfigJson = async (
  inputs: Record<'tsconfig.json', TsconfigInputValue>,
): Promise<boolean> =>
  simplePatch<TsconfigInputValue>(
    PROJECT_PATH + '/tsconfig.json',
    TSCONFIG_JSON_PATCH,
    inputs['tsconfig.json'],
  );

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
): Promise<boolean> =>
  simplePatch(
    PROJECT_PATH + '/babel.config.js',
    BABEL_CONFIG_JS_PATCH,
    inputs['babel.config.js'],
  );

const NPMParser = ((buf: Buffer) => {
  // sanitize JSON omiting installs, postinstalls verbose.
  const i = buf.indexOf('\n{');

  const bbuf = i > -1 ? buf.slice(i + 1) : buf;

  return SEJsonParser(bbuf);
}) as SysExecParser<PackageInstallResult>;

const npmInstall = async (packageList: string[]) => {
  const action = sysExec(
    'npm',
    ['install', '--json', ...packageList],
    NPMParser,
    { readTimeout: NPM_INSTALL_READ_TIMEOUT },
  );

  return runWithLog<null | SysExecRetState<
    PackageInstallResult | PackageInstallErrorResult
  >>(action, {
    quiet: false,
    successCondition: (
      res: null | SysExecRetState<
        PackageInstallResult | PackageInstallErrorResult
      >,
    ) => {
      const isError =
        !res?.parsedStdOut ||
        res?.exitCode === 1 ||
        'error' in res.parsedStdOut;

      if (isError) {
        /*  const errorInfo = res?.parsedStdOut as PackageInstallErrorResult;
        console.log('ERROR: ', errorInfo);
        */
        return false;
      }

      return true;
    },
    mainMessage: 'install packages using npm: ' + packageList.join(', '),
    successMessage: packageList.length + ' packages added/updated',
  });
};

const expoInstall = async (packageList: string[]): Promise<any> => {
  const action = sysExec(
    'npx',
    ['expo-cli', 'install', ...packageList],
    SEPlaintextParser,
    {
      readTimeout: 60000,
    },
  );
  return runWithLog<null | SysExecRetState<string>>(action, {
    quiet: false,
    mainMessage: 'install packages using expo: ' + packageList.join(', '),
    successMessage: packageList.length + ' packages added/updated',
  });
};

const expoDoctor = async (): Promise<any> => {
  const action = sysExec('npx', ['expo-cli', 'doctor'], SEPlaintextParser, {
    readTimeout: 60000,
  });
  return runWithLog<null | SysExecRetState<string>>(action, {
    quiet: false,
    mainMessage: 'running expo doctor',
    successMessage: 'success',
  });
};

const getSettings = async (filename = 'expoize.conf.js'): Promise<Settings> => {
  const fileExists = await fsExists(filename);

  if (!fileExists) {
    return DEFAULT_SETTINGS;
  }

  return { ...DEFAULT_SETTINGS, ...require(filename) };
};

const executeSettingsHooks = async (
  cmds: SettingHookCommandDefinition[],
): Promise<boolean> => {
  if (cmds.length > 0) {
    for (const [cmdName, cmdArgs = []] of cmds) {
      await sysExec(cmdName, cmdArgs, SEPlaintextParser, {
        readTimeout: 60000,
      });
    }
  }

  return true;
};

const main = async (): Promise<boolean> => {
  const settings = await getSettings();

  await executeSettingsHooks(settings.preCmds);

  const versions = await detectVersions();

  await patchAppJson({
    'package.json': origPackageJson,
    'app.json': origAppJson,
  });

  await patchTsconfigJson({ 'tsconfig.json': origTsconfigJson });

  await patchBabelConfigJs({ 'babel.config.js': origBabelConfigJs });

  // @todo: convert this to regexps having in consideration the
  // appName and the kind of quotes.

  const origIndexJs = await readFile(PROJECT_PATH + '/index.js');

  const patchedIndexJs = origIndexJs
    .replace(
      'AppRegistry.registerComponent(appName, () => App);',
      'registerRootComponent(App);',
    )
    .replace(
      "import { AppRegistry } from 'react-native';",
      "import { registerRootComponent } from 'expo';",
    );
  await writeFile(PROJECT_PATH + '/index.js', patchedIndexJs);

  const patchedWebpackJsConf = await readFile(
    TEMPLATES_PATH + '/webpack.config.js',
  );
  await writeFile(PROJECT_PATH + '/webpack.config.js', patchedWebpackJsConf);

  const patchedMetroJsConf = await readFile(
    TEMPLATES_PATH + '/metro.config.js',
  );

  await writeFile(PROJECT_PATH + '/metro.config.js', patchedMetroJsConf);

  await npmInstall([
    'react-native@' + versions['react-native'],
    'react@' + versions['react'],
    'react-dom@' + versions['react'],
  ]);

  await npmInstall(['expo@' + versions['expo'], 'expo-cli']);

  await expoInstall([
    '@expo/webpack-config',
    'babel-preset-expo',
    'react-native-gesture-handler',
    'react-native-reanimated',
    'react-native-screens',
    'react-native-web',
  ]);

  await expoDoctor();

  return true;
};

(async () => {
  try {
    await main();
    process.exit(0);
  } catch (err) {
    console.log(err.message);
    process.exit(1);
  }
})();
