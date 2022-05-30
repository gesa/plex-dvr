import { format, transports, loggers } from "winston";
import { Interfaces } from "@oclif/core";
import { mkdirSync } from "fs";
import path from "path";

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
  { errlog, cacheDir }: Interfaces.Config,
  level: string
) {
  mkdirSync(path.dirname(errlog), { recursive: true });
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
        maxsize: 1_000_000,
        tailable: true,
        zippedArchive: true,
      }),
      new transports.File({
        filename: path.join(cacheDir, "process.log"),
        format: combine(...defaultFormat),
        maxsize: 1_000_000,
        maxFiles: 10,
        tailable: true,
        zippedArchive: true,
        level: level === "silly" ? "silly" : "verbose",
      }),
    ],
  });
}
