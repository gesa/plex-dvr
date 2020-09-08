import { createLogger, format, transports } from 'winston';

const { combine, timestamp, printf, errors, colorize, label } = format;

export default createLogger({
  format: combine(
    colorize({ message: true }),
    timestamp({ format: 'MM/DD HH:mm:ss' }),
    label({ label: 'VIDS' }),
    printf(
      ({ level, message, label, timestamp }) =>
        `${timestamp} [${label}] ${level}: ${message}`
    ),
    errors({ stack: true })
  ),
  transports: [
    new transports.Console({
      level: 'verbose',
      stderrLevels: ['error'],
      consoleWarnLevels: ['warn']
    })
  ]
});
