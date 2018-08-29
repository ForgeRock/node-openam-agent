import { LoggerInstance } from 'winston';
import { AmClient } from './am-client';
import { Cache } from './cache/cache';

export interface EvaluationErrorDetails {
  status: number;
  message: string;
  details?: string;
  pkg?: any;
}

/**
 * Constructor options for PolicyAgent
 */
export interface PolicyAgentOptions {
  /**
   * The deployment URI of the OpenAM server, e.g. http://openam.example.com:8080/openam
   */
  serverUrl: string;

  /**
   * The deployment IP of the OpenAM server, e.g. 127.0.0.1
   */
  privateIP?: string;

  /**
   * Agent username (needed for certain operations, e.g. policy decision requests)
   */
  username?: string;

  /**
   * Agent password (needed for certain operations, e.g. policy decision requests)
   */
  password?: string;

  /**
   * Agent realm (needed for certain operations, e.g. policy decision requests)
   */
  realm?: string;

  /**
   * The root URL of the application, e.g. http://app.example.com:8080 (required for notifications)
   */
  appUrl?: string;

  /**
   * Callback function. If present, the function's return value will be sent as an
   * error page, otherwise the default error template will be used. The function will be called with a context object as
   * the argument.
   */
  errorPage?: (details: EvaluationErrorDetails) => string;

  /**
   * A Winston.js logger instance. If undefined, a new Console logger
   * is created.
   */
  logger?: LoggerInstance;

  /**
   * Logging level: see winston's documentation; only used when logger is undefined.
   */
  logLevel?: string;

  /**
   * Custom session cache object (if undefined, a SimpleCache instance will be
   * created with an expiry time of 5 minutes)
   */
  sessionCache?: Cache;

  /**
   * When set to true if an error arises then next() will be called, allowing the client application to handle the
   * errors. When set to false then a text/html response is made on behalf of the client.
   */
  letClientHandleErrors?: boolean;

  /**
   * Custom OpenAMClient object (mostly for testing purposes)
   */
  openAMClient?: AmClient;

  /**
   * If true, the agent will not fetch the AM server info on instantiation (default: false)
   */
  noInit?: boolean;

  /**
   * Enables session notifications; AM must be able to reach this agent via HTTP to send the notification
   */
  notificationsEnabled?: boolean;
}
