import { spawn } from "child_process";
import { Logger } from "winston";

export function spawnBinary(
  cmd: string,
  args: string[],
  logger: Logger
): Promise<void | number> {
  return new Promise((resolve, reject) => {
    const spawnedProcess = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    spawnedProcess.stdout.setEncoding("utf8");

    spawnedProcess.stderr.on("data", (data) => {
      logger.silly(data.toString());
    });

    spawnedProcess.stdout.on("data", (data) => {
      logger.silly(data);
    });

    spawnedProcess.on("error", (err) => {
      logger.error(`${cmd} threw an error ${err}`);
      reject(err);
    });

    spawnedProcess.on("close", (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(code);
      }
    });
  });
}
