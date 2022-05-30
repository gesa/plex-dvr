import { spawn } from "child_process";
import { loggers } from "winston";
import path from "path";

export function spawnBinary(
  cmd: string,
  args: string[]
): Promise<void | number> {
  return new Promise((resolve, reject) => {
    let currentStdOut = "";
    let currentStdErr = "";
    let lastStdOut = "";
    let lastStdErr = "";
    const command = path.basename(cmd);
    const binLogger = loggers.get("plex-dvr").child({ command });
    const spawnedProcess = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    binLogger.verbose(`${command} ${args.join(" ")}`);

    spawnedProcess.stdout.setEncoding("utf8");

    /**
     * When logging verbosely, update the log every minute with the latest
     * update from the current command. (don't do this when logging at silly
     * level, then you just wind up with duplicates.)
     * */
    const processCheckIn = setInterval(() => {
      if (
        binLogger.level !== "silly" && // silly already output it
        currentStdErr.length > 0 &&
        currentStdErr !== lastStdErr
      )
        binLogger.verbose(currentStdErr);

      lastStdErr = currentStdErr;

      if (
        binLogger.level !== "silly" &&
        currentStdOut.length > 0 &&
        currentStdOut !== lastStdOut
      )
        binLogger.verbose(currentStdOut);

      lastStdOut = currentStdOut;
    }, 60_000);

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

      if (binLogger.level !== "silly") {
        if (currentStdErr.length > 0 && currentStdErr !== lastStdErr)
          binLogger.verbose(currentStdErr);
        if (currentStdOut.length > 0 && currentStdOut !== lastStdOut)
          binLogger.verbose(currentStdOut);
      }

      switch (code) {
        case 0:
          return resolve(0);
        case 1:
          // Comskip returns 1 if it didn't find any commercials
          if (
            cmd === "comskip" &&
            (currentStdOut.includes("Commercials were not found") ||
              lastStdOut.includes("Commercials were not found"))
          ) {
            return resolve(0);
          }

        // falls through

        default:
          return reject(code);
      }
    });
  });
}
