import { createLogger, format, transports } from "winston";
import { IConfig } from "@oclif/config";
import { promises } from "fs";
import { join, dirname } from "path";

const { combine, timestamp, printf, errors, colorize, label } = format;
const { mkdir } = promises;
const defaultFormat = [
  timestamp({ format: "MM/DD HH:mm:ss" }),
  label({ label: "PLEXDVR" }),
  printf(
    ({ level, message, label, timestamp }) =>
      `${timestamp} [${label}] ${level}: ${message}`
  ),
];

export default function setUpLogger(config: IConfig, level: string) {
  const logger = createLogger({
    format: combine(
      ...defaultFormat,
      colorize({ message: true }),
      errors({ stack: true })
    ),
    transports: [
      new transports.Console({
        consoleWarnLevels: ["warn"],
        level,
        stderrLevels: ["error"],
      }),
    ],
  });

  return mkdir(dirname(config.errlog), { recursive: true })
    .then(() =>
      logger.add(
        new transports.File({
          filename: config.errlog,
          format: combine(...defaultFormat),
          level: "error",
          handleExceptions: true,
          maxFiles: 10,
          maxsize: 1000000,
          tailable: true,
          zippedArchive: true,
        })
      )
    )
    .then(() => mkdir(config.cacheDir, { recursive: true }))
    .then(() =>
      logger.add(
        new transports.File({
          filename: join(config.cacheDir, `${config.dirname}.log`),
          maxsize: 1000000,
          maxFiles: 10,
          tailable: true,
          zippedArchive: true,
          level,
        })
      )
    );
}
