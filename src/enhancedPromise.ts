const {
  AbortController,
} = require('abortcontroller-polyfill/dist/cjs-ponyfill');

import { getThrowableError } from 'throwable-error';
import type { ThrowableError } from 'throwable-error';

export interface SysExecRetState<R> {
  stdErr: Buffer;
  stdOut: Buffer;
  exitCode: null | number;
  parsedStdOut: null | R;
}

export type SysExecParser<R> = (buf: Buffer) => R;
export type SysExecArgOptions = { quiet: boolean; readTimeout: number };

type AbortSignalType = AbortSignal & {
  addEventListener: (n: string, f: () => void) => void;
  removeEventListener: (n: string, f: () => void) => void;
};

export const SysExecAbortedOp = getThrowableError('AbortedOp');

type RejectFnType = (
  ...args: any[] //@todo-type
) => void;

type RejectIfFnType = (
  cond: boolean,
  message: string | (() => string),
  options?: {
    post?: null | (() => void);
    details?: Record<string, any>; //@todo-type
  },
) => void;

export interface EnhancedPromiseHandlersObjType<R> {
  rejectIf: RejectIfFnType;
  reject: RejectFnType;
  resolve: (r: R) => void;
}
type EnhancedPromiseHandler<R> = (h: EnhancedPromiseHandlersObjType<R>) => void;

// @todo: check if there is any way to extract type from arguments of Promise<X>.resolve
type PromiseExecutorResolveTypeLikeGlobal<R> = (
  v: R | PromiseLike<R>,
  e?: Error,
) => void;

type PromiseExecutorRejectTypeLikeGlobal = (e?: Error) => void;

type ExecutorType<R> = (
  promiseResolve: PromiseExecutorResolveTypeLikeGlobal<R>,
  promiseReject: PromiseExecutorRejectTypeLikeGlobal,
) => ReturnType<EnhancedPromiseHandler<R>>;

const getNewAbortController = () => {
  const controller = new AbortController();
  const signal = controller.signal as AbortSignalType;
  return { controller, signal };
};

const genReject =
  (
    reject: PromiseExecutorRejectTypeLikeGlobal,
    abortController: any,
    RejectDefaultErrorClass:
      | (new (...args: any[]) => ThrowableError)
      | undefined = undefined,
  ) =>
  (...args: any[]) => {
    const [firstArg, ...restOfArgs] = args;
    // console.log('----> REJECT executed');

    if (RejectDefaultErrorClass) {
      reject(
        new RejectDefaultErrorClass(
          typeof firstArg === 'function' ? firstArg() : firstArg,
          ...restOfArgs,
        ),
      );
    } else {
      reject(firstArg);
    }

    abortController.abort();
  };

const genRejectIf =
  (reject: RejectFnType): RejectIfFnType =>
  (cond, message, options) => {
    setImmediate(() => {
      if (!cond) return;

      reject(message, options?.details);
      if (options?.post) options.post();
    });
  };

export const hoc = <R>(
  enhancedHandler: EnhancedPromiseHandler<R>,
  onUncaughtError: (e: Error, handlers: { reject: RejectFnType }) => void,
  rejectDefaultErrorClass:
    | (new (...args: any[]) => ThrowableError)
    | undefined = undefined,
): ExecutorType<R> => {
  const { controller, signal } = getNewAbortController();

  const pExecutor: ExecutorType<R> = async (promiseResolve, promiseReject) => {
    const abortHandler = () =>
      promiseReject(new SysExecAbortedOp('Operation has been aborted'));

    signal.addEventListener('abort', abortHandler);

    if (signal.aborted) {
      return promiseReject(new SysExecAbortedOp('Operation has been aborted.'));
    }

    const reject = genReject(
      promiseReject,
      controller,
      rejectDefaultErrorClass,
    );

    try {
      await enhancedHandler({
        resolve: promiseResolve,
        reject,
        rejectIf: genRejectIf(reject),
      });
    } catch (err) {
      //   console.log('IN CATCH: ', err);
      onUncaughtError(err, { reject });
    }
  };

  return pExecutor;
};

export const getNewEnhancedPromise = <T>(
  promiseBodyFn: EnhancedPromiseHandler<T>,
  onUncaughtError: (
    err: Error,
    handlers: Pick<EnhancedPromiseHandlersObjType<T>, 'reject'>,
  ) => void,
) => {
  return new Promise<T>(hoc(promiseBodyFn, onUncaughtError));
};
