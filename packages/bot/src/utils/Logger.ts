import winston from 'winston';
import fs from 'fs';
import path from 'path';
import { LogLevel } from '../types';

export class Logger {
  private logger: winston.Logger;
  private context: string;

  private withContext(meta?: unknown): Record<string, unknown> {
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
      return { ...(meta as Record<string, unknown>), context: this.context };
    }
    return { context: this.context, meta };
  }

  constructor(context: string) {
    this.context = context;

    const fileTransports: winston.transport[] = [];
    try {
      const logsDir = path.resolve(process.cwd(), 'logs');
      fs.mkdirSync(logsDir, { recursive: true });
      fileTransports.push(
        new winston.transports.File({
          filename: path.join(logsDir, 'error.log'),
          level: 'error'
        }),
        new winston.transports.File({
          filename: path.join(logsDir, 'combined.log')
        })
      );
    } catch (error) {
      console.warn(`Logger file transport disabled: ${error instanceof Error ? error.message : String(error)}`);
    }

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
        ...fileTransports
      ]
    });
  }

  public error(message: string, meta?: unknown): void {
    this.logger.error(message, this.withContext(meta));
  }

  public warn(message: string, meta?: unknown): void {
    this.logger.warn(message, this.withContext(meta));
  }

  public info(message: string, meta?: unknown): void {
    this.logger.info(message, this.withContext(meta));
  }

  public debug(message: string, meta?: unknown): void {
    this.logger.debug(message, this.withContext(meta));
  }

  public log(level: LogLevel, message: string, meta?: unknown): void {
    this.logger.log(level, message, this.withContext(meta));
  }
}
