export declare function initializeSentry(): void;
export declare function sentryRequestHandler(): any;
export declare function sentryErrorHandler(): any;
export declare function captureException(error: Error, context?: Record<string, unknown>): void;
export declare function captureMessage(message: string, level?: 'fatal' | 'error' | 'warning' | 'info'): void;
//# sourceMappingURL=monitoring.d.ts.map