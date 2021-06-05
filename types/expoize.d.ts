/// <reference types="node" />
declare const jsonpatch: any;
declare const origPackageJson: any;
declare const origAppJson: any;
declare const origTsconfigJson: any;
declare const origBabelConfigJs: any;
declare const fsReadFile: any, fsWriteFile: any;
declare const execSync: any;
declare const BANNER: string;
declare const readFile: (fileName: string) => Promise<any>;
declare const writeFile: (fileName: string, bufToWrite: Buffer, quiet?: boolean) => Promise<number>;
declare const sysExec: (cmd: string, isJson?: boolean, quiet?: boolean) => Promise<any>;
interface TargetVersions {
    expo: string;
    'react-native': string;
    react: string;
}
declare type PatchFunc<OT> = ({ orig }: {
    orig: OT;
}) => string;
declare type AppJsonPatchFunc = (input: Record<'app.json' | 'package.json', Record<string, any>>) => [Record<string, any>];
declare const detectVersions: (forceExpoVersion?: null | string) => Promise<TargetVersions>;
declare const simplePatch: <OT = string>(fileName: string, patchFunc: PatchFunc<OT>, input: OT) => Promise<number>;
declare const APP_JSON_PATCH: AppJsonPatchFunc;
declare const patchAppJson: (inputs: Record<'app.json', Record<'name', string>> & Record<'package.json', Record<'version', string>>) => Promise<number>;
declare type TsconfigInputValue = Record<string, any> & {
    compilerOptions: {
        lib: string[];
    };
};
declare const TSCONFIG_JSON_PATCH: PatchFunc<TsconfigInputValue>;
declare const patchTsconfigJson: (inputs: Record<'tsconfig.json', TsconfigInputValue>) => Promise<number>;
declare type BabelInputValue = Record<string, any> & {
    presets: string[];
};
declare const BABEL_CONFIG_JS_PATCH: PatchFunc<BabelInputValue>;
declare const patchBabelConfigJs: (inputs: Record<'babel.config.js', BabelInputValue>) => Promise<number>;
declare const main: () => Promise<boolean>;
