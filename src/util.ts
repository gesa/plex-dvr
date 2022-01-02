import { spawn } from "child_process";
import { loggers } from "winston";
import { basename } from "path";

export function spawnBinary(
  cmd: string,
  args: string[]
): Promise<void | number> {
  return new Promise((resolve, reject) => {
    let currentStdOut = "";
    let currentStdErr = "";
    let lastStdOut = "";
    let lastStdErr = "";
    const command = basename(cmd);
    const binLogger = loggers.get("plex-dvr").child({ command });
    const spawnedProcess = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    binLogger.verbose(`${command} ${args.join(" ")}`);

    spawnedProcess.stdout.setEncoding("utf8");

    /**
     * When logging verbosely, update the log every minute with the latest
     * update from the current command
     * */
    const processCheckIn = setInterval(() => {
      if (currentStdErr.length > 0 && currentStdErr !== lastStdErr)
        binLogger.verbose(currentStdErr);

      lastStdErr = currentStdErr;

      if (currentStdOut.length > 0 && currentStdOut !== lastStdOut)
        binLogger.verbose(currentStdOut);

      lastStdOut = currentStdOut;
    }, 60000);

    spawnedProcess.stderr.on("data", (data) => {
      currentStdErr = data.toString();
      binLogger.silly(currentStdErr);
    });

    spawnedProcess.stdout.on("data", (data) => {
      currentStdOut = data;
      binLogger.silly(currentStdOut);
    });

    spawnedProcess.on("error", (err) => {
      binLogger.error(err.toString());

      clearInterval(processCheckIn);

      reject(err);
    });

    spawnedProcess.on("close", (code) => {
      clearInterval(processCheckIn);

      if (currentStdErr.length > 0 && currentStdErr !== lastStdErr)
        binLogger.verbose(currentStdErr);
      if (currentStdOut.length > 0 && currentStdOut !== lastStdOut)
        binLogger.verbose(currentStdOut);

      if (code === 0) {
        resolve(code);
      } else {
        reject(code);
      }
    });
  });
}
