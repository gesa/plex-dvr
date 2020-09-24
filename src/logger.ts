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
    transports: [
      new transports.Console({
        consoleWarnLevels: ["warn"],
        level,
        stderrLevels: ["error"],
        format: combine(
          ...defaultFormat,
          colorize({ all: true }),
          errors({ stack: true })
        ),
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
          filename: join(config.cacheDir, "process.log"),
          format: combine(...defaultFormat),
          maxsize: 1000000,
          maxFiles: 10,
          tailable: true,
          zippedArchive: true,
          level: level === "silly" ? "silly" : "verbose",
        })
      )
    )
    .then((logger) => {
      Object.keys(process.env).forEach((envVar) => {
        if (envVar.match(/plex/i)) {
          logger.log({
            level: "silly",
            message: `
${envVar} = ${process.env[envVar]}`,
          });
        }
      });

      return logger;
    });
}
