import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
export declare class WebSocketService {
    private wss;
    private connections;
    private heartbeatInterval;
    constructor(wss: WebSocketServer);
    handleConnection(ws: WebSocket, req: IncomingMessage): void;
    private handleMessage;
    private startHeartbeat;
    broadcast(message: any): void;
    shutdown(): void;
}
//# sourceMappingURL=WebSocketService.d.ts.map