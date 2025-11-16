import { AIService } from './services/AIService';
import { DataService } from './services/DataService';
import { WebSocketService } from './services/WebSocketService';
declare const app: import("express-serve-static-core").Express;
declare const server: import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>;
declare const aiService: AIService;
declare const dataService: DataService;
declare const wsService: WebSocketService;
export { app, server, aiService, dataService, wsService };
//# sourceMappingURL=index.d.ts.map