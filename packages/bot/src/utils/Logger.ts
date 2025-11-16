import winston from 'winston';
import { LogLevel } from '../types';

export class Logger {
  private logger: winston.Logger;
  private context: string;

  constructor(context: string) {
    this.context = context;
    
    this.logger = winston.createLogger({
      level: process.env['LOG_LEVEL'] || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'arbimind-bot', context },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        new winston.transports.File({ 
          filename: 'logs/error.log', 
          level: 'error' 
        }),
        new winston.transports.File({ 
          filename: 'logs/combined.log' 
        })
      ]
    });
  }

  public error(message: string, meta?: any): void {
    this.logger.error(message, { ...meta, context: this.context });
  }

  public warn(message: string, meta?: any): void {
    this.logger.warn(message, { ...meta, context: this.context });
  }

  public info(message: string, meta?: any): void {
    this.logger.info(message, { ...meta, context: this.context });
  }

  public debug(message: string, meta?: any): void {
    this.logger.debug(message, { ...meta, context: this.context });
  }

  public log(level: LogLevel, message: string, meta?: any): void {
    this.logger.log(level, message, { ...meta, context: this.context });
  }
}
