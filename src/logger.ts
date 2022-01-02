import { format, transports, loggers } from "winston";
import { IConfig } from "@oclif/config";
import { mkdirSync } from "fs";
import { join, dirname } from "path";

const { combine, timestamp, printf, errors, colorize } = format;
const defaultFormat = [
  timestamp({ format: "MM/DD HH:mm:ss" }),
  printf(
    ({ level, message, command, timestamp }) =>
      `${timestamp} [${
        command || "plex-dvr"
      }] ${level.toUpperCase()} - ${message}`
  ),
];

export default function setUpLogger(
  { errlog, cacheDir }: IConfig,
  level: string
) {
  mkdirSync(dirname(errlog), { recursive: true });
  mkdirSync(cacheDir, { recursive: true });

  loggers.add("plex-dvr", {
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
        filename: errlog,
        format: combine(...defaultFormat, errors({ stack: true })),
        level: "error",
        handleExceptions: true,
        maxFiles: 10,
        maxsize: 1000000,
        tailable: true,
        zippedArchive: true,
      }),
      new transports.File({
        filename: join(cacheDir, "process.log"),
        format: combine(...defaultFormat),
        maxsize: 1000000,
        maxFiles: 10,
        tailable: true,
        zippedArchive: true,
        level: level === "silly" ? "silly" : "verbose",
      }),
    ],
  });
}
