"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wsService = exports.dataService = exports.aiService = exports.server = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = require("http");
const ws_1 = require("ws");
const logger_1 = require("./utils/logger");
const errorHandler_1 = require("./middleware/errorHandler");
const rateLimiter_1 = require("./middleware/rateLimiter");
const auth_1 = require("./middleware/auth");
const ai_1 = __importStar(require("./routes/ai"));
const health_1 = __importDefault(require("./routes/health"));
const metrics_1 = __importDefault(require("./routes/metrics"));
const AIService_1 = require("./services/AIService");
const DataService_1 = require("./services/DataService");
const WebSocketService_1 = require("./services/WebSocketService");
dotenv_1.default.config();
const app = (0, express_1.default)();
exports.app = app;
const server = (0, http_1.createServer)(app);
exports.server = server;
const wss = new ws_1.WebSocketServer({ server });
const aiService = new AIService_1.AIService();
exports.aiService = aiService;
const dataService = new DataService_1.DataService();
exports.dataService = dataService;
const wsService = new WebSocketService_1.WebSocketService(wss);
exports.wsService = wsService;
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use((0, compression_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use('/api/', rateLimiter_1.rateLimiterMiddleware);
app.use('/api/ai', auth_1.authMiddleware);
app.use('/api/health', health_1.default);
(0, ai_1.setAIService)(aiService);
app.use('/api/ai', ai_1.default);
app.use('/api/metrics', metrics_1.default);
wss.on('connection', (ws, req) => {
    wsService.handleConnection(ws, req);
});
app.use(errorHandler_1.errorHandler);
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        path: req.originalUrl
    });
});
async function initializeServices() {
    try {
        logger_1.logger.info('Initializing ArbiMind AI Backend...');
        await aiService.initialize();
        logger_1.logger.info('AI Service initialized');
        await dataService.initialize();
        logger_1.logger.info('Data Service initialized');
        await startBackgroundTasks();
        logger_1.logger.info('All services initialized successfully');
    }
    catch (error) {
        logger_1.logger.error('Failed to initialize services', { error });
        process.exit(1);
    }
}
async function startBackgroundTasks() {
    dataService.startDataCollection();
    aiService.startModelRetraining();
    logger_1.logger.info('Background tasks started');
}
process.on('SIGTERM', async () => {
    logger_1.logger.info('SIGTERM received, shutting down gracefully...');
    await aiService.shutdown();
    await dataService.shutdown();
    wsService.shutdown();
    server.close(() => {
        logger_1.logger.info('Server closed');
        process.exit(0);
    });
});
process.on('SIGINT', async () => {
    logger_1.logger.info('SIGINT received, shutting down gracefully...');
    await aiService.shutdown();
    await dataService.shutdown();
    wsService.shutdown();
    server.close(() => {
        logger_1.logger.info('Server closed');
        process.exit(0);
    });
});
const PORT = parseInt(process.env.PORT || '8000', 10);
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, async () => {
    logger_1.logger.info(`🚀 ArbiMind AI Backend running on ${HOST}:${PORT}`);
    logger_1.logger.info(`📊 WebSocket server running on ws://${HOST}:${PORT}`);
    await initializeServices();
});
//# sourceMappingURL=index.js.map