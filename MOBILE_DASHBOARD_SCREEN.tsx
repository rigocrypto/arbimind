import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { fetchMetrics } from '../store/slices/metricsSlice';

// Metric Card Component
const MetricCard: React.FC<{ label: string; value: string; color: string }> = ({
  label,
  value,
  color,
}) => (
  <View style={[styles.metricCard, { borderLeftColor: color }]}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={[styles.metricValue, { color }]}>{value}</Text>
  </View>
);

// Main Dashboard Screen
export const DashboardScreen: React.FC = () => {
  const dispatch = useDispatch();
  const metrics = useSelector((state: RootState) => state.metrics);
  const [refreshing, setRefreshing] = React.useState(false);

  useEffect(() => {
    dispatch(fetchMetrics() as any);

    // Refresh every 10 seconds
    const interval = setInterval(() => {
      dispatch(fetchMetrics() as any);
    }, 10000);

    return () => clearInterval(interval);
  }, [dispatch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await dispatch(fetchMetrics() as any);
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>ArbiMind Dashboard</Text>
        <Text style={styles.subtitle}>Real-time Performance</Text>
      </View>

      {/* Primary Metrics */}
      <View style={styles.section}>
        <MetricCard
          label="Profit (24h)"
          value={`${metrics.profit24h.toFixed(4)} ETH`}
          color="#10B981"
        />
        <MetricCard
          label="Opportunities"
          value={metrics.opportunitiesCount.toString()}
          color="#3B82F6"
        />
      </View>

      {/* Secondary Metrics */}
      <View style={styles.section}>
        <MetricCard
          label="Success Rate"
          value={`${(metrics.successRate * 100).toFixed(1)}%`}
          color="#8B5CF6"
        />
        <MetricCard
          label="Avg Gas"
          value={`${metrics.gasAverage.toFixed(2)} gwei`}
          color="#F59E0B"
        />
      </View>

      {/* RPC Status */}
      <View style={styles.section}>
        <View
          style={[
            styles.statusCard,
            {
              backgroundColor:
                metrics.rpcStatus === 'healthy' ? '#ECFDF5' : '#FEF2F2',
            },
          ]}
        >
          <Text
            style={[
              styles.statusLabel,
              { color: metrics.rpcStatus === 'healthy' ? '#10B981' : '#EF4444' },
            ]}
          >
            RPC Provider {metrics.rpcStatus === 'healthy' ? '✅ Healthy' : '❌ Degraded'}
          </Text>
        </View>
      </View>

      {/* Loading State */}
      {metrics.loading && (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Updating metrics...</Text>
        </View>
      )}

      {/* Error State */}
      {metrics.error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️ {metrics.error}</Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    padding: 16,
  },
  header: {
    marginBottom: 24,
    marginTop: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  section: {
    marginBottom: 16,
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  metricLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statusCard: {
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
  },
});
