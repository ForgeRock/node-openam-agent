import * as winston from 'winston';
import { format, transports } from 'winston';

export interface LoggerOptions {
  json?: boolean;
  prettyPrint?: boolean;
  format?: any;
}

/**
 * Creates a new winston Logger with specific formatting
 * @example
 * var logger = createLogger('info', 'myLogger');
 * logger.info('hello world!');
 */
export function createLogger(level = 'error', id?: string, options: LoggerOptions = {}) {
  let formats = [
    format.timestamp()
  ];

  if (options.prettyPrint) {
    formats = [ ...formats, format.prettyPrint() ];
  }

  if (options.json) {
    formats = [ ...formats, format.label({ label: id }), format.json() ];
  } else {
    formats = [
      ...formats,
      format.label({ label: id, message: true }),
      format.align(),
      format.colorize(),
      format.simple()
    ];
  }

  return winston.createLogger({
    transports: [ new transports.Console({ level }) ],
    format: options.format || format.combine(...formats)
  });
}
