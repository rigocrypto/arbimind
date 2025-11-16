import axios, { AxiosInstance } from 'axios';
import io, { Socket } from 'socket.io-client';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3002';
const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:3002';

/**
 * REST API Client
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor (add auth token if available)
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor (handle errors)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/**
 * REST Endpoints
 */
export const metricsAPI = {
  // Get current metrics (profit, opportunities, etc.)
  getMetrics: () => apiClient.get('/api/metrics'),

  // Get historical metrics for dashboard
  getMetricsHistory: (timeframe: '24h' | '7d' | '30d' = '24h') =>
    apiClient.get(`/api/metrics/history?timeframe=${timeframe}`),

  // Get analytics data
  getAnalytics: (timeframe: string) => apiClient.get(`/api/analytics/${timeframe}`),
};

export const transactionsAPI = {
  // Get recent transactions
  getTransactions: (limit: number = 50, offset: number = 0) =>
    apiClient.get(`/api/transactions?limit=${limit}&offset=${offset}`),

  // Get transaction by hash
  getTransaction: (hash: string) => apiClient.get(`/api/transactions/${hash}`),

  // Get transaction stats
  getStats: () => apiClient.get('/api/transactions/stats'),
};

export const alertsAPI = {
  // Get recent alerts
  getAlerts: (limit: number = 20) => apiClient.get(`/api/alerts?limit=${limit}`),

  // Mark alert as read
  markAsRead: (alertId: string) => apiClient.put(`/api/alerts/${alertId}/read`),

  // Set alert preferences
  setPreferences: (preferences: Record<string, boolean>) =>
    apiClient.put('/api/alerts/preferences', preferences),

  // Get alert preferences
  getPreferences: () => apiClient.get('/api/alerts/preferences'),
};

export const botStatusAPI = {
  // Get bot status
  getStatus: () => apiClient.get('/api/bot/status'),

  // Get RPC provider health
  getRPCHealth: () => apiClient.get('/api/bot/rpc-health'),

  // Get opportunities scan status
  getScanStatus: () => apiClient.get('/api/bot/scan-status'),
};

/**
 * WebSocket Connection for Real-time Updates
 */
export class RealTimeClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(WS_URL, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: this.maxReconnectAttempts,
        autoConnect: true,
      });

      this.socket.on('connect', () => {
        console.log('Connected to WebSocket');
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on('disconnect', () => {
        console.log('Disconnected from WebSocket');
      });

      this.socket.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.reconnectAttempts++;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(error);
        }
      });

      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
      });
    });
  }

  // Subscribe to real-time metrics
  onMetricsUpdate(callback: (data: any) => void): void {
    if (!this.socket) return;
    this.socket.on('metrics_update', callback);
  }

  // Subscribe to transaction alerts
  onTransactionExecuted(callback: (data: any) => void): void {
    if (!this.socket) return;
    this.socket.on('transaction_executed', callback);
  }

  // Subscribe to general alerts
  onAlert(callback: (data: any) => void): void {
    if (!this.socket) return;
    this.socket.on('alert', callback);
  }

  // Subscribe to RPC provider changes
  onRPCChange(callback: (data: any) => void): void {
    if (!this.socket) return;
    this.socket.on('rpc_provider_changed', callback);
  }

  // Unsubscribe from an event
  offEvent(event: string): void {
    if (!this.socket) return;
    this.socket.off(event);
  }

  // Disconnect
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Check connection status
  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export const realTimeClient = new RealTimeClient();

/**
 * Utility: Retry failed requests
 */
export async function retryRequest<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Type definitions for API responses
 */
export interface MetricsData {
  profit24h: number;
  profitAllTime: number;
  opportunitiesCount: number;
  successRate: number;
  gasAverage: number;
  rpcStatus: 'healthy' | 'degraded' | 'down';
  timestamp: string;
}

export interface Transaction {
  hash: string;
  tokenA: string;
  tokenB: string;
  dex1: string;
  dex2: string;
  profit: number;
  gas: number;
  slippage: number;
  timestamp: string;
  status: 'success' | 'failed';
}

export interface Alert {
  id: string;
  type: 'opportunity' | 'transaction' | 'rpc_failure' | 'gas_spike' | 'milestone';
  title: string;
  message: string;
  data: Record<string, any>;
  timestamp: string;
  read: boolean;
}

export interface BotStatus {
  running: boolean;
  uptime: number;
  opportunities_scanned: number;
  transactions_executed: number;
  current_rpc: string;
  gas_price: number;
}
