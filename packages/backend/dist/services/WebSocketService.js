"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketService = void 0;
const ws_1 = require("ws");
const logger_1 = require("../utils/logger");
class WebSocketService {
    constructor(wss) {
        this.connections = new Set();
        this.heartbeatInterval = null;
        this.wss = wss;
    }
    handleConnection(ws, req) {
        this.connections.add(ws);
        logger_1.logger.info('New WebSocket connection', {
            totalConnections: this.connections.size,
            ip: req.socket.remoteAddress
        });
        ws.send(JSON.stringify({
            type: 'connection',
            message: 'Connected to ArbiMind AI Backend',
            timestamp: new Date().toISOString()
        }));
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                logger_1.logger.debug('WebSocket message received', { message });
                this.handleMessage(ws, message);
            }
            catch (error) {
                logger_1.logger.error('Failed to parse WebSocket message', { error });
            }
        });
        ws.on('close', () => {
            this.connections.delete(ws);
            logger_1.logger.info('WebSocket connection closed', {
                totalConnections: this.connections.size
            });
        });
        ws.on('error', (error) => {
            logger_1.logger.error('WebSocket error', { error });
            this.connections.delete(ws);
        });
        if (!this.heartbeatInterval) {
            this.startHeartbeat();
        }
    }
    handleMessage(ws, message) {
        switch (message.type) {
            case 'ping':
                ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
                break;
            default:
                logger_1.logger.debug('Unknown message type', { type: message.type });
        }
    }
    startHeartbeat() {
        const interval = parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000');
        this.heartbeatInterval = setInterval(() => {
            this.connections.forEach((ws) => {
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'heartbeat',
                        timestamp: new Date().toISOString()
                    }));
                }
            });
        }, interval);
    }
    broadcast(message) {
        const data = JSON.stringify(message);
        this.connections.forEach((ws) => {
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.send(data);
            }
        });
    }
    shutdown() {
        logger_1.logger.info('Shutting down WebSocket Service...');
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        this.connections.forEach((ws) => {
            ws.close();
        });
        this.connections.clear();
        logger_1.logger.info('WebSocket Service shutdown complete');
    }
}
exports.WebSocketService = WebSocketService;
//# sourceMappingURL=WebSocketService.js.map