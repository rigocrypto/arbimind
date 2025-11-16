import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { metricsAPI } from '../../services/api';

/**
 * Redux Slice for Metrics State
 */

export interface MetricsState {
  profit24h: number;
  profitAllTime: number;
  opportunitiesCount: number;
  successRate: number;
  gasAverage: number;
  rpcStatus: 'healthy' | 'degraded' | 'down';
  history: {
    timestamp: string;
    profit: number;
    opportunities: number;
  }[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

const initialState: MetricsState = {
  profit24h: 0,
  profitAllTime: 0,
  opportunitiesCount: 0,
  successRate: 0.85,
  gasAverage: 2.5,
  rpcStatus: 'healthy',
  history: [],
  loading: false,
  error: null,
  lastUpdated: null,
};

/**
 * Async Thunks
 */
export const fetchMetrics = createAsyncThunk('metrics/fetchMetrics', async () => {
  const response = await metricsAPI.getMetrics();
  return response.data;
});

export const fetchMetricsHistory = createAsyncThunk(
  'metrics/fetchMetricsHistory',
  async (timeframe: '24h' | '7d' | '30d' = '24h') => {
    const response = await metricsAPI.getMetricsHistory(timeframe);
    return response.data;
  }
);

/**
 * Slice
 */
const metricsSlice = createSlice({
  name: 'metrics',
  initialState,
  reducers: {
    // Handle real-time metric updates from WebSocket
    updateMetrics: (state, action: PayloadAction<Partial<MetricsState>>) => {
      Object.assign(state, action.payload, { lastUpdated: new Date().toISOString() });
    },

    // Reset metrics
    resetMetrics: () => initialState,
  },
  extraReducers: (builder) => {
    // Fetch Metrics
    builder
      .addCase(fetchMetrics.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMetrics.fulfilled, (state, action) => {
        state.loading = false;
        state.profit24h = action.payload.profit24h;
        state.profitAllTime = action.payload.profitAllTime;
        state.opportunitiesCount = action.payload.opportunitiesCount;
        state.successRate = action.payload.successRate;
        state.gasAverage = action.payload.gasAverage;
        state.rpcStatus = action.payload.rpcStatus;
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(fetchMetrics.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch metrics';
      });

    // Fetch Metrics History
    builder
      .addCase(fetchMetricsHistory.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchMetricsHistory.fulfilled, (state, action) => {
        state.loading = false;
        state.history = action.payload.history;
      })
      .addCase(fetchMetricsHistory.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch history';
      });
  },
});

export const { updateMetrics, resetMetrics } = metricsSlice.actions;
export default metricsSlice.reducer;
