import { createLogger, format, transports } from "winston";
import { IConfig } from "@oclif/config";
import { promises } from "fs";
import { join, dirname } from "path";

const { combine, timestamp, printf, errors, colorize } = format;
const { mkdir } = promises;
const timestampFormat = "MM/DD HH:mm:ss";
const defaultFormat = [
  timestamp({ format: timestampFormat }),
  printf(
    ({ level, message, command, timestamp }) =>
      `${timestamp} [${command}] ${level.toUpperCase()} - ${message}`
  ),
];

export default function setUpLogger(config: IConfig, level: string) {
  return mkdir(dirname(config.errlog), { recursive: true })
    .then(() => mkdir(config.cacheDir, { recursive: true }))
    .then(() =>
      createLogger({
        defaultMeta: { command: "plex-dvr" },
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
          new transports.File({
            filename: config.errlog,
            format: combine(...defaultFormat, errors({ stack: true })),
            level: "error",
            handleExceptions: true,
            maxFiles: 10,
            maxsize: 1000000,
            tailable: true,
            zippedArchive: true,
          }),
          new transports.File({
            filename: join(config.cacheDir, "process.log"),
            format: combine(...defaultFormat),
            maxsize: 1000000,
            maxFiles: 10,
            tailable: true,
            zippedArchive: true,
            level: level === "silly" ? "silly" : "verbose",
          }),
        ],
      })
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
