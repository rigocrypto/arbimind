"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = exports.rateLimiterMiddleware = void 0;
const rate_limiter_flexible_1 = require("rate-limiter-flexible");
const rateLimiter = new rate_limiter_flexible_1.RateLimiterMemory({
    points: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '100'),
    duration: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000') / 1000,
});
exports.rateLimiter = rateLimiter;
const rateLimiterMiddleware = async (req, res, next) => {
    try {
        const clientId = req.ip || req.socket.remoteAddress || 'unknown';
        await rateLimiter.consume(clientId);
        next();
    }
    catch (error) {
        res.status(429).json({
            success: false,
            message: 'Too many requests, please try again later'
        });
    }
};
exports.rateLimiterMiddleware = rateLimiterMiddleware;
//# sourceMappingURL=rateLimiter.js.map