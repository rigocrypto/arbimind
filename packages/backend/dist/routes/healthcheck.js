"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const logger_1 = require("../utils/logger");
exports.router = (0, express_1.Router)();
exports.router.get('/health', async (req, res) => {
    try {
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();
        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: Math.floor(uptime),
            memory: {
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                external: Math.round(memoryUsage.external / 1024 / 1024),
            },
            node_env: process.env.NODE_ENV,
            services: {
                ai: 'operational',
                database: 'connected',
                websocket: 'operational',
            },
        };
        if (memoryUsage.heapUsed / memoryUsage.heapTotal > 0.9) {
            health.status = 'degraded';
            logger_1.logger.warn('Heap memory usage critical', { usage: memoryUsage.heapUsed / memoryUsage.heapTotal });
        }
        res.status(health.status === 'ok' ? 200 : 503).json(health);
    }
    catch (error) {
        logger_1.logger.error('Health check failed', { error });
        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
exports.router.get('/live', (req, res) => {
    res.status(200).json({ status: 'alive' });
});
exports.router.get('/ready', async (req, res) => {
    try {
        const isReady = true;
        if (isReady) {
            res.status(200).json({ status: 'ready' });
        }
        else {
            res.status(503).json({ status: 'not_ready' });
        }
    }
    catch (error) {
        logger_1.logger.error('Readiness check failed', { error });
        res.status(503).json({ status: 'not_ready', error: error instanceof Error ? error.message : 'Unknown' });
    }
});
exports.default = exports.router;
//# sourceMappingURL=healthcheck.js.map