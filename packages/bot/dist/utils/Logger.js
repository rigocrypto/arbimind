"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const winston_1 = __importDefault(require("winston"));
class Logger {
    logger;
    context;
    constructor(context) {
        this.context = context;
        this.logger = winston_1.default.createLogger({
            level: process.env['LOG_LEVEL'] || 'info',
            format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
            defaultMeta: { service: 'arbimind-bot', context },
            transports: [
                new winston_1.default.transports.Console({
                    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple())
                }),
                new winston_1.default.transports.File({
                    filename: 'logs/error.log',
                    level: 'error'
                }),
                new winston_1.default.transports.File({
                    filename: 'logs/combined.log'
                })
            ]
        });
    }
    error(message, meta) {
        this.logger.error(message, { ...meta, context: this.context });
    }
    warn(message, meta) {
        this.logger.warn(message, { ...meta, context: this.context });
    }
    info(message, meta) {
        this.logger.info(message, { ...meta, context: this.context });
    }
    debug(message, meta) {
        this.logger.debug(message, { ...meta, context: this.context });
    }
    log(level, message, meta) {
        this.logger.log(level, message, { ...meta, context: this.context });
    }
}
exports.Logger = Logger;
