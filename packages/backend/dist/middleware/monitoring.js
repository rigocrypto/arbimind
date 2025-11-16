"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeSentry = initializeSentry;
exports.sentryRequestHandler = sentryRequestHandler;
exports.sentryErrorHandler = sentryErrorHandler;
exports.captureException = captureException;
exports.captureMessage = captureMessage;
const logger_1 = require("../utils/logger");
let Sentry;
try {
    Sentry = require('@sentry/node');
}
catch (err) {
    Sentry = null;
}
function initializeSentry() {
    if (!process.env.SENTRY_DSN) {
        logger_1.logger.warn('SENTRY_DSN not set; error tracking disabled');
        return;
    }
    if (!Sentry) {
        logger_1.logger.warn('Sentry module not available; skipping initialization');
        return;
    }
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    });
    logger_1.logger.info('Sentry initialized', {
        dsn: process.env.SENTRY_DSN.slice(0, 20) + '...',
        environment: process.env.NODE_ENV,
    });
}
function sentryRequestHandler() {
    return Sentry && Sentry.Handlers ? Sentry.Handlers.requestHandler() : (_req, _res, next) => next();
}
function sentryErrorHandler() {
    return Sentry && Sentry.Handlers ? Sentry.Handlers.errorHandler() : (_err, _req, _res, next) => next();
}
function captureException(error, context) {
    if (Sentry && Sentry.captureException) {
        try {
            Sentry.captureException(error, { contexts: context ? { custom: context } : undefined });
        }
        catch (e) {
        }
    }
    logger_1.logger.error('Exception captured to Sentry', { error: error.message, context });
}
function captureMessage(message, level = 'info') {
    Sentry.captureMessage(message, level);
}
//# sourceMappingURL=monitoring.js.map