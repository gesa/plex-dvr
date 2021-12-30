import { spawn } from "child_process";
import { Logger } from "winston";

export function spawnBinary(
  cmd: string,
  args: string[],
  logger: Logger
): Promise<void | number> {
  return new Promise((resolve, reject) => {
    let currentStdOut = "";
    let currentStdErr = "";
    const spawnedProcess = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    spawnedProcess.stdout.setEncoding("utf8");

    /**
     * When logging verbosely, update the log every minute with the latest
     * update from the current command
     * */
    const processCheckIn = setInterval(() => {
      if (currentStdErr.length > 0)
        logger.verbose(`${cmd} check-in: ${currentStdErr}`);
      if (currentStdOut.length > 0)
        logger.verbose(`${cmd} check-in: ${currentStdOut}`);
    }, 60000);

    spawnedProcess.stderr.on("data", (data) => {
      currentStdErr = data.toString();
      logger.silly(currentStdErr);
    });

    spawnedProcess.stdout.on("data", (data) => {
      currentStdOut = data;
      logger.silly(currentStdOut);
    });

    spawnedProcess.on("error", (err) => {
      logger.error(`${cmd} threw an error ${err}`);

      clearInterval(processCheckIn);

      reject(err);
    });

    spawnedProcess.on("close", (code) => {
      clearInterval(processCheckIn);

      if (currentStdErr.length > 0) logger.verbose(currentStdErr);
      if (currentStdOut.length > 0) logger.verbose(currentStdOut);

      if (code === 0) {
        resolve(code);
      } else {
        reject(code);
      }
    });
  });
}
