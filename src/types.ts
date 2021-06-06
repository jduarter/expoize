import type { SysExecParser } from './sysExec';
import type { default as PackageInfoTypes } from 'package-info';

export interface TargetVersions {
  expo: string;
  'react-native': string;
  react: string;
}

export type PatchFunc<OT> = ({ orig }: { orig: OT }) => string;

export type AppJsonPatchFunc = (
  input: Record<'app.json' | 'package.json', Record<string, any>>,
) => [Record<string, any>];

export type PackageJson = PackageInfoTypes.Package & {
  'dist-tags': { latest: string };
  devDependencies: Record<string, string>;
};

export type PackageInfoParser = SysExecParser<PackageJson>;

export type BabelInputValue = Record<string, any> & { presets: string[] };

export type TsconfigInputValue = Record<string, any> & {
  compilerOptions: { lib: string[] };
};

type PackageActionDetail = {
  action: string;
  name: string;
  version: string;
  path: string;
  previousVersion: string;
};

export interface PackageAuditRecord {
  actions: any[]; //@todo
  advisories: Record<
    string,
    {
      findings: {
        version: string;
        paths: string[];
      }[];

      id: number;
      created: string;
      updated: null | string;
      deleted: null | string;
      title: string;
      found_by: { link: string; name: string; email: string };
      reported_by: { link: string; name: string; email: string };
      module_name: string;
      cves: string[];
      vulnerable_versions: string;
      patched_versions: string;
      overview: string;
      recommendation: string;
      references: string;
      access: string;
      severity: string;
      cwe: string;
      metadata: {
        module_type: string;
        exploitability: number;
        affected_components: string;
      };
      url: string;
    }
  >;
  muted: any[]; // @todo
  metadata: {
    vulnerabilities: {
      info: number;
      low: number;
      moderate: number;
      high: number;
      critical: number;
    };
    dependencies: number;
    devDependencies: number;
    optionalDependencies: number;
    totalDependencies: number;
  };
}

export interface PackageInstallResult {
  added: Array<PackageActionDetail>;
  removed: Array<PackageActionDetail>;
  updated: Array<PackageActionDetail>;
  moved: Array<PackageActionDetail>;
  failed: Array<PackageActionDetail>;
  warnings: Array<string>;
  audit: PackageAuditRecord;
  funding: string;
  elapsed: number;
}

export interface PackageInstallErrorResult {
  error: {
    summary: string;
    code: string;
    detail: string;
  };
}
