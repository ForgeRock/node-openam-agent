import {
  CLILoggingLevel,
  ConsoleTransportOptions,
  Logger as WinstonLogger,
  transports
} from 'winston';

/**
 * Extended logger that logs the ID as part of the message; this distinguishes the output from different loggers.
 */
export class Logger extends WinstonLogger {
  private superLog = this.log;

  constructor(level = 'error', private id?: string, options: ConsoleTransportOptions = {}) {
    super({
      transports: [ new transports.Console({
        level,
        timestamp: true, ...options,
        stringify: options.json
          ? obj => JSON.stringify(obj, null, options.prettyPrint ? 2 : 0)
          : null
      }) ]
    });
  }

  /**
   * Overriding the log method is a bit awkward because of the type syntax in Winston, hence the => form
   */
  log = (level: string, msg: string, ...meta: any[]): this => {
    if (this.id) {
      msg = `[${this.id}] ${msg}`;
    }

    return this.superLog(level, msg, ...meta);
  }
}

/**
 * Creates a new winston Logger
 * @example
 * var logger = logger('info', 'myLogger');
 * logger.info('hello world!');
 */
export function logger(level: CLILoggingLevel, id: string) {
  return new Logger(level, id);
}
