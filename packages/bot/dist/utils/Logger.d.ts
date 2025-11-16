import { LogLevel } from '../types';
export declare class Logger {
    private logger;
    private context;
    constructor(context: string);
    error(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    info(message: string, meta?: any): void;
    debug(message: string, meta?: any): void;
    log(level: LogLevel, message: string, meta?: any): void;
}
//# sourceMappingURL=Logger.d.ts.map