import type { ChildProcess } from 'child_process';
import { getThrowableError } from 'throwable-error';

import { getNewEnhancedPromise } from './enhancedPromise';
import type { EnhancedPromiseHandlersObjType } from './enhancedPromise';

export interface SysExecRetState<R> {
  stdErr: Buffer;
  stdOut: Buffer;
  exitCode: null | number;
  parsedStdOut: null | R;
}

export type SysExecParser<R> = (buf: Buffer) => R;
export type SysExecArgOptions = { quiet: boolean; readTimeout: number };

const { spawn } = require('child_process');

type ErrorDetails = {
  originalError?: Error;
  data?: any;
};

type SysExecErrorArgs = [string, ErrorDetails];

type SysExecRetType<P extends (...args: any[]) => any> = null | SysExecRetState<
  ReturnType<P>
>;

type InternalStateType = {
  stderr: Uint8Array[];
  stdout: Uint8Array[];
  lastReadTime: number;
  timeChecksInterval: null | NodeJS.Timeout;
  timeoutKilled: boolean;
};

const TIME_CHECKS_INTERVAL_DEFAULT_MS = 1000;
const SUCCESS_EXIT_CODE = 0;
const SYS_EXEC_DEFAULT_OPTS = { quiet: false, readTimeout: 30000 };

export const SEPlaintextParser = (buf: Buffer): string => buf.toString();

export const SEJsonParser = <R = any>(buf: Buffer): R =>
  JSON.parse(buf.toString());

export const SysExecError = getThrowableError<SysExecErrorArgs>(
  'SysExecError',
  {
    mapperFn: (userMessage: string, details?: ErrorDetails) => ({
      userMessage,
      originalError: details?.originalError || undefined,
      data: details?.data || undefined,
    }),
  },
);

const bindInternalStateToChildProcess = (
  childProcess: ChildProcess,
  streamName: 'stderr' | 'stdout',
  internalStateRef: InternalStateType,
): void => {
  if (streamName in childProcess && childProcess[streamName] !== null) {
    const stream = childProcess[streamName];
    stream &&
      stream.on('data', (data: Buffer) => {
        internalStateRef.lastReadTime = Date.now();
        internalStateRef[streamName].push(data);
      });
  }
};

const onUncaughtErrorHandler = (
  err: Error,
  { reject }: Pick<EnhancedPromiseHandlersObjType<unknown>, 'reject'>,
) =>
  reject(
    err instanceof SyntaxError
      ? 'uncaught exception (probably parser has failed)'
      : 'uncaught exception',
    {
      originalError: err,
    },
  );

const getOnProcessClosedHandler =
  <T, S>(
    {
      rejectIf,
      resolve,
    }: Pick<EnhancedPromiseHandlersObjType<S>, 'rejectIf' | 'resolve'>,
    {
      parser,
      abortTimerFn,
      getInternalState,
    }: {
      parser: SysExecParser<T>;
      abortTimerFn: () => void;
      getInternalState: () => InternalStateType;
    },
  ) =>
  (processExitCode: number) => {
    abortTimerFn();

    const stdOut = Buffer.concat(getInternalState().stdout);
    const stdErr = Buffer.concat(getInternalState().stderr);

    const signalReceived = processExitCode === null;

    rejectIf(
      signalReceived,
      () =>
        'spawned process was killed due to ' + getInternalState().timeoutKilled
          ? 'read timeout'
          : 'external signal',
      {},
    );

    const parsedStdOut = parser(stdOut);

    rejectIf(
      processExitCode !== SUCCESS_EXIT_CODE,
      'spawned process returned non-success (' +
        processExitCode.toString() +
        ') exit code',
      { details: { data: parsedStdOut } },
    );

    const state = {
      exitCode: processExitCode,
      stdOut,
      stdErr,
      parsedStdOut,
    };

    resolve(state as any /* @todo */);
  };

const sysExec = async <P extends SysExecParser<any>>(
  cmdName: string,
  cmdArgs: string[],
  parser: P = SEPlaintextParser as P,
  opts: Partial<SysExecArgOptions> = {},
): Promise<SysExecRetType<P>> => {
  const { quiet, readTimeout } = { ...SYS_EXEC_DEFAULT_OPTS, ...opts };

  const internalState: InternalStateType = {
    stderr: [],
    stdout: [],
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
        // sending SIGABRT signal to child process (read timeout reached)
        internalState.timeoutKilled = true;
        childProcess.kill('SIGABRT');
      }
    }, TIME_CHECKS_INTERVAL_DEFAULT_MS);
  }

  const abortTimerFn = () => {
    if (internalState.timeChecksInterval) {
      clearInterval(internalState.timeChecksInterval);
    }
  };

  return getNewEnhancedPromise<SysExecRetType<P>>(({ rejectIf, resolve }) => {
    rejectIf(
      !childProcess.stdout || !childProcess.stderr,
      'sysExec: spawn() returned NULL std read handlers.',
      {
        post: abortTimerFn,
      },
    );

    bindInternalStateToChildProcess(childProcess, 'stdout', internalState);
    bindInternalStateToChildProcess(childProcess, 'stderr', internalState);

    childProcess.on(
      'close',
      getOnProcessClosedHandler<P, SysExecRetType<P>>(
        { rejectIf, resolve },
        { abortTimerFn, parser, getInternalState: () => internalState },
      ),
    );
  }, onUncaughtErrorHandler);
};

export default sysExec;
