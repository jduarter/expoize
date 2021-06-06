const ora = require('ora');

export interface RunWithLogOptions<T> {
  quiet: boolean;
  mainMessage: string;
  successMessage: string;
  successCondition?: (res: T) => boolean;
  propagateErrors?: boolean;
}

/**
 * executes a Promise in a log-aware fashion
 *
 * @param {string} promise Promise to be run
 * @options {RunWithLogOptions} opts Options
 */
export const runWithLog = async <T>(
  promise: Promise<T>,
  {
    quiet,
    mainMessage,
    successMessage,
    successCondition = () => true,
    propagateErrors = true,
  }: RunWithLogOptions<T>,
): Promise<T | null> => {
  let promiseResolved: T | null = null;

  const spinner = ora(mainMessage).start();

  try {
    if (!quiet) {
      promiseResolved = await promise;
    }

    if (promiseResolved && successCondition(promiseResolved) === false) {
      throw new Error('Unknown error (result condition was not met)');
    }

    spinner.succeed(mainMessage + ': ' + successMessage);

    return Promise.resolve(promiseResolved);
  } catch (err) {
    spinner.fail(mainMessage + ': ' + err.name + ': ' + err.message);
    if (propagateErrors) {
      throw err;
    }
    return Promise.resolve(null);
  }
};
