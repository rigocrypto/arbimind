import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';
import { IncomingMessage } from 'http';

export class WebSocketService {
  private wss: WebSocketServer;
  private connections: Set<WebSocket> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(wss: WebSocketServer) {
    this.wss = wss;
  }

  public handleConnection(ws: WebSocket, req: IncomingMessage): void {
    this.connections.add(ws);
    logger.info('New WebSocket connection', {
      totalConnections: this.connections.size,
      ip: req.socket.remoteAddress
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connection',
      message: 'Connected to ArbiMind AI Backend',
      timestamp: new Date().toISOString()
    }));

    // Handle messages
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        logger.debug('WebSocket message received', { message });
        this.handleMessage(ws, message);
      } catch (error) {
        logger.error('Failed to parse WebSocket message', { error });
      }
    });

    // Handle close
    ws.on('close', () => {
      this.connections.delete(ws);
      logger.info('WebSocket connection closed', {
        totalConnections: this.connections.size
      });
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error('WebSocket error', { error });
      this.connections.delete(ws);
    });

    // Start heartbeat if not already started
    if (!this.heartbeatInterval) {
      this.startHeartbeat();
    }
  }

  private handleMessage(ws: WebSocket, message: any): void {
    // Handle different message types
    switch (message.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        break;
      default:
        logger.debug('Unknown message type', { type: message.type });
    }
  }

  private startHeartbeat(): void {
    const interval = parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000');
    this.heartbeatInterval = setInterval(() => {
      this.connections.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'heartbeat',
            timestamp: new Date().toISOString()
          }));
        }
      });
    }, interval);
  }

  public broadcast(message: any): void {
    const data = JSON.stringify(message);
    this.connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  public shutdown(): void {
    logger.info('Shutting down WebSocket Service...');
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    this.connections.forEach((ws) => {
      ws.close();
    });
    this.connections.clear();

    logger.info('WebSocket Service shutdown complete');
  }
}

