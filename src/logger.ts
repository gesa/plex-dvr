import { createLogger, format, transports } from "winston";
import { IConfig } from "@oclif/config";
import { existsSync } from "fs";
import { join, dirname } from "path";

const { combine, timestamp, printf, errors, colorize, label } = format;

/*
* cache directory to use for CLI
* example ~/Library/Caches/mycli or ~/.cache/mycli
cacheDir: string;

* config directory to use for CLI
* example: ~/.config/mycli
configDir: string;

* data directory to use for CLI
* example: ~/.local/share/mycli
dataDir: string;

* base dirname to use in cacheDir/configDir/dataDir
dirname: string;

* points to a file that should be appended to for error logs
* example: ~/Library/Caches/mycli/error.log
errlog: string;
* */
const defaultFormat = [
  timestamp({ format: "MM/DD HH:mm:ss" }),
  label({ label: "VIDS" }),
  printf(
    ({ level, message, label, timestamp }) =>
      `${timestamp} [${label}] ${level}: ${message}`
  ),
];

export default function setUpLogger(config: IConfig, logLevel: string) {
  const logger = createLogger({
    format: combine(
      ...defaultFormat,
      colorize({ message: true }),
      errors({ stack: true })
    ),
    transports: [
      new transports.Console({
        consoleWarnLevels: ["warn"],
        handleExceptions: true,
        level: logLevel,
        stderrLevels: ["error"],
      }),
    ],
  });

  if (existsSync(config.dirname) && existsSync(config.cacheDir)) {
    logger.add(
      new transports.File({
        filename: join(config.cacheDir, "PlexDvrProcessing.log"),
        maxsize: 1000000,
        maxFiles: 10,
        tailable: true,
        zippedArchive: true,
        level: logLevel,
      })
    );
  }

  if (existsSync(dirname(config.errlog))) {
    logger.add(
      new transports.File({
        level: "error",
        format: combine(...defaultFormat),
        filename: config.errlog,
        maxsize: 1000000,
        maxFiles: 10,
        tailable: true,
        zippedArchive: true,
      })
    );
  }

  return logger;
}
