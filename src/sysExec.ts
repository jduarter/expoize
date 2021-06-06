import type { ChildProcess } from 'child_process';
import { getThrowableError } from 'throwable-error';
import type { ThrowableErrorConstructorArguments } from 'throwable-error';

export interface SysExecRetState<R> {
  stdErr: Buffer;
  stdOut: Buffer;
  exitCode: null | number;
  parsedStdOut: null | R;
}

export type SysExecParser<R> = (buf: Buffer) => R;
export type SysExecArgOptions = { quiet: boolean; readTimeout: number };

const { spawn } = require('child_process');

const TIME_CHECKS_INTERVAL_DEFAULT_MS = 1000;
const SUCCESS_EXIT_CODE = 0;

const SYS_EXEC_DEFAULT_OPTS = { quiet: false, readTimeout: 30000 };

export const SEPlaintextParser = (buf: Buffer): string => buf.toString();

export const SEJsonParser = <R = any>(buf: Buffer): R =>
  JSON.parse(buf.toString());

type ErrorDetails = {
  originalError?: Error;
  data?: any;
};

export const SysExecError = getThrowableError<
  'SysExecError',
  ThrowableErrorConstructorArguments | [string, ErrorDetails]
>('SysExecError', (userMessage: string, details?: ErrorDetails) => ({
  userMessage,
  originalError: details?.originalError || undefined,
  data: details?.data || undefined,
}));

const sysExec = async <P extends SysExecParser<any>>(
  cmdName: string,
  cmdArgs: string[],
  parser: P = SEPlaintextParser as P,
  opts: Partial<SysExecArgOptions> = {},
): Promise<null | SysExecRetState<ReturnType<P>>> => {
  const { quiet, readTimeout } = { ...SYS_EXEC_DEFAULT_OPTS, ...opts };

  const internalState: {
    stdErr: Uint8Array[];
    stdOut: Uint8Array[];
    lastReadTime: number;
    timeChecksInterval: null | NodeJS.Timeout;
    timeoutKilled: boolean;
  } = {
    stdErr: [],
    stdOut: [],
    lastReadTime: 0,
    timeChecksInterval: null,
    timeoutKilled: false,
  };

  if (quiet) {
    return Promise.resolve(null);
  }

  const childProcess: ChildProcess = spawn(cmdName, cmdArgs);

  if (readTimeout > 0) {
    internalState.lastReadTime = Date.now();

    internalState.timeChecksInterval = setInterval(() => {
      if (Date.now() - internalState.lastReadTime > readTimeout) {
        console.log(
          '[!] sending SIGABRT signal to child process (read timeout reached)',
        );
        internalState.timeoutKilled = true;
        childProcess.kill('SIGABRT');
      }
    }, TIME_CHECKS_INTERVAL_DEFAULT_MS);
  }

  return new Promise((resolve, reject) => {
    if (!childProcess.stdout || !childProcess.stderr) {
      return reject(
        new Error('sysExec: spawn() returned NULL std read handlers.'),
      );
    }

    childProcess.stdout.on('data', (data) => {
      internalState.lastReadTime = Date.now();
      internalState.stdOut.push(data);
    });

    childProcess.stderr.on('data', (data) => {
      internalState.lastReadTime = Date.now();
      internalState.stdErr.push(data);
    });

    childProcess.on('close', (processExitCode: number) => {
      if (internalState.timeChecksInterval) {
        clearInterval(internalState.timeChecksInterval);
      }

      const stdOut = Buffer.concat(internalState.stdOut);
      const stdErr = Buffer.concat(internalState.stdErr);

      const wasKilled = processExitCode === null;

      if (wasKilled) {
        const reason = internalState.timeoutKilled
          ? 'read timeout'
          : 'external signal';
        console.log({ stdOutS: stdOut.toString() });
        return reject(
          new SysExecError('spawned process was killed due to ' + reason),
        );
      }

      try {
        const parsedStdOut = parser(stdOut);

        if (processExitCode !== SUCCESS_EXIT_CODE) {
          return reject(
            new SysExecError(
              'spawned process returned non-success (' +
                processExitCode.toString() +
                ') exit code',
              { data: parsedStdOut },
            ),
          );
        }

        const state: SysExecRetState<ReturnType<P>> = {
          stdOut,
          stdErr,
          parsedStdOut,
          exitCode: processExitCode,
        };

        return resolve(state);
      } catch (err) {
        console.log('ERR:', err, { stdOutS: stdOut.toString() });
        if (err instanceof SyntaxError) {
          return reject(
            new SysExecError(
              'uncaught exception (probably parser has failed)',
              {
                originalError: err,
              },
            ),
          );
        } else {
          return reject(
            new SysExecError('uncaught exception', {
              originalError: err,
            }),
          );
        }
      }
    });
  });
};

export default sysExec;
