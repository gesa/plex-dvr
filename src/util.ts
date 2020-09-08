import logger from "./logger";
import { spawn } from "child_process";

function reportErrorAndBail(message: string) {
  return (error: Error) => {
    logger.error(message);

    if (error) logger.error(`${error.message}`);

    process.exit(1);
  };
}

function spawnBinary(cmd: string, args: string[]): Promise<void | number> {
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

export { reportErrorAndBail, spawnBinary };
