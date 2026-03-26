"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const winston_1 = __importDefault(require("winston"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class Logger {
    logger;
    context;
    withContext(meta) {
        if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
            return { ...meta, context: this.context };
        }
        return { context: this.context, meta };
    }
    constructor(context) {
        this.context = context;
        const fileTransports = [];
        try {
            const logsDir = path_1.default.resolve(process.cwd(), 'logs');
            fs_1.default.mkdirSync(logsDir, { recursive: true });
            fileTransports.push(new winston_1.default.transports.File({
                filename: path_1.default.join(logsDir, 'error.log'),
                level: 'error'
            }), new winston_1.default.transports.File({
                filename: path_1.default.join(logsDir, 'combined.log')
            }));
        }
        catch (error) {
            console.warn(`Logger file transport disabled: ${error instanceof Error ? error.message : String(error)}`);
        }
        this.logger = winston_1.default.createLogger({
            level: process.env['LOG_LEVEL'] || 'info',
            format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
            defaultMeta: { service: 'arbimind-bot', context },
            transports: [
                new winston_1.default.transports.Console({
                    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple())
                }),
                ...fileTransports
            ]
        });
    }
    error(message, meta) {
        this.logger.error(message, this.withContext(meta));
    }
    warn(message, meta) {
        this.logger.warn(message, this.withContext(meta));
    }
    info(message, meta) {
        this.logger.info(message, this.withContext(meta));
    }
    debug(message, meta) {
        this.logger.debug(message, this.withContext(meta));
    }
    log(level, message, meta) {
        this.logger.log(level, message, this.withContext(meta));
    }
}
exports.Logger = Logger;
