# Performance Dashboard Configuration (Grafana / Datadog)

## Option 1: Grafana Dashboard (Self-Hosted)

### Setup

```bash
# Docker Compose for Grafana + Prometheus
cd packages
mkdir monitoring
cd monitoring
cat > docker-compose.yml << 'EOF'
version: '3'
services:
  prometheus:
    image: prom/prometheus:latest
    ports: ["9090:9090"]
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - ./rules.yml:/etc/prometheus/rules.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
  
  grafana:
    image: grafana/grafana:latest
    ports: ["3000:3000"]
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - grafana-storage:/var/lib/grafana

volumes:
  grafana-storage:
EOF

# Start services
docker-compose up -d

# Access: http://localhost:3000 (admin/admin)
```

### prometheus.yml

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'arbimind-backend'
    static_configs:
      - targets: ['backend:8000/metrics']
  
  - job_name: 'arbimind-bot'
    static_configs:
      - targets: ['bot:3001/metrics']
  
  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']
```

### Grafana Dashboard JSON

```json
{
  "dashboard": {
    "title": "ArbiMind Production Monitoring",
    "panels": [
      {
        "title": "Arbitrage Opportunities (24h)",
        "targets": [
          {
            "expr": "rate(arbimind_bot_opportunities_found[24h])"
          }
        ]
      },
      {
        "title": "Transaction Success Rate",
        "targets": [
          {
            "expr": "(arbimind_bot_transactions_executed / (arbimind_bot_transactions_executed + arbimind_bot_transactions_failed)) * 100"
          }
        ]
      },
      {
        "title": "Profit (24h)",
        "targets": [
          {
            "expr": "sum(arbimind_bot_profit_eth)"
          }
        ]
      },
      {
        "title": "API Response Time (p99)",
        "targets": [
          {
            "expr": "histogram_quantile(0.99, arbimind_backend_http_request_duration_ms)"
          }
        ]
      },
      {
        "title": "Memory Usage",
        "targets": [
          {
            "expr": "arbimind_backend_memory_heap_used_bytes / 1024 / 1024"
          }
        ]
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "rate(arbimind_backend_errors_total[5m])"
          }
        ]
      },
      {
        "title": "RPC Provider Health",
        "targets": [
          {
            "expr": "arbimind_bot_rpc_provider_healthy"
          }
        ]
      },
      {
        "title": "Gas Price (Gwei)",
        "targets": [
          {
            "expr": "arbimind_bot_gas_price_gwei"
          }
        ]
      }
    ]
  }
}
```

---

## Option 2: Datadog Dashboard (SaaS)

### Setup

```bash
# Install Datadog agent
# https://docs.datadoghq.com/getting_started/agent/

# Add to packages/backend/.env
DD_API_KEY=your_datadog_api_key
DD_APP_KEY=your_datadog_app_key
```

### Send Metrics from Backend

```typescript
// packages/backend/src/utils/metrics.ts
import { StatsD } from 'node-dogstatistics';

export const statsd = new StatsD({
  host: process.env.DD_AGENT_HOST || 'localhost',
  port: 8125,
  prefix: 'arbimind.',
});

// In routes, track metrics:
statsd.gauge('api.response_time', responseTime);
statsd.increment('api.requests', { endpoint: req.path });
```

### Datadog Dashboard Template

```json
{
  "title": "ArbiMind Production Metrics",
  "widgets": [
    {
      "type": "timeseries",
      "title": "Profit per Transaction",
      "requests": [
        {
          "query": "avg:arbimind.bot.profit_eth{*}"
        }
      ]
    },
    {
      "type": "gauge",
      "title": "Success Rate (%)",
      "requests": [
        {
          "query": "(sum:arbimind.bot.transactions_executed{*} / (sum:arbimind.bot.transactions_executed{*} + sum:arbimind.bot.transactions_failed{*})) * 100"
        }
      ]
    },
    {
      "type": "heatmap",
      "title": "Response Time Distribution",
      "requests": [
        {
          "query": "avg:arbimind.backend.api_response_time{*}"
        }
      ]
    },
    {
      "type": "number",
      "title": "Total Opportunities (24h)",
      "requests": [
        {
          "query": "sum:arbimind.bot.opportunities_found{*}"
        }
      ]
    },
    {
      "type": "timeseries",
      "title": "Memory Usage",
      "requests": [
        {
          "query": "avg:arbimind.backend.memory_usage_mb{*}"
        }
      ]
    },
    {
      "type": "timeseries",
      "title": "Error Rate",
      "requests": [
        {
          "query": "sum:arbimind.backend.error_count{*}.as_rate()"
        }
      ]
    }
  ]
}
```

---

## Prometheus Metrics to Instrument

### Backend Metrics

```typescript
// packages/backend/src/middleware/metrics.ts
import promClient from 'prom-client';

const httpRequestDuration = new promClient.Histogram({
  name: 'arbimind_backend_http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [10, 50, 100, 500, 1000, 5000],
});

const errorCounter = new promClient.Counter({
  name: 'arbimind_backend_errors_total',
  help: 'Total errors',
  labelNames: ['error_type', 'service'],
});

const memoryGauge = new promClient.Gauge({
  name: 'arbimind_backend_memory_heap_used_bytes',
  help: 'Memory heap used in bytes',
});

// Expose metrics
app.get('/metrics', (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(promClient.register.metrics());
});
```

### Bot Metrics

```typescript
// packages/bot/src/services/MetricsService.ts
import promClient from 'prom-client';

export class BotMetrics {
  opportunitiesFound = new promClient.Counter({
    name: 'arbimind_bot_opportunities_found',
    help: 'Total opportunities found',
  });

  transactionsExecuted = new promClient.Counter({
    name: 'arbimind_bot_transactions_executed',
    help: 'Total transactions executed',
  });

  transactionsFailed = new promClient.Counter({
    name: 'arbimind_bot_transactions_failed',
    help: 'Total failed transactions',
  });

  profitEth = new promClient.Gauge({
    name: 'arbimind_bot_profit_eth',
    help: 'Total profit in ETH',
  });

  gasPriceGwei = new promClient.Gauge({
    name: 'arbimind_bot_gas_price_gwei',
    help: 'Current gas price in Gwei',
  });

  rpcProviderHealth = new promClient.Gauge({
    name: 'arbimind_bot_rpc_provider_healthy',
    help: 'RPC provider health (1=healthy, 0=unhealthy)',
    labelNames: ['provider'],
  });
}
```

---

## Alerting Rules (prometheus/rules.yml)

```yaml
groups:
  - name: arbimind
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: rate(arbimind_backend_errors_total[5m]) > 0.01
        for: 5m
        annotations:
          summary: "High error rate detected"
      
      # Memory leak
      - alert: MemoryLeak
        expr: |
          (arbimind_backend_memory_heap_used_bytes[5m] - 
           arbimind_backend_memory_heap_used_bytes[1h]) > 100000000
        for: 10m
        annotations:
          summary: "Potential memory leak detected"
      
      # Low profit
      - alert: LowProfitability
        expr: rate(arbimind_bot_profit_eth[24h]) < 0.1
        for: 1h
        annotations:
          summary: "Profitability below threshold"
      
      # RPC provider down
      - alert: RPCProviderDown
        expr: arbimind_bot_rpc_provider_healthy == 0
        for: 5m
        annotations:
          summary: "RPC provider is down"
```

---

## Local Development Dashboard

```bash
# Start local Prometheus + Grafana
docker-compose -f packages/monitoring/docker-compose.yml up -d

# Access Grafana: http://localhost:3000
# Add Prometheus datasource: http://prometheus:9090
# Import dashboard JSON above
# Metrics auto-scraped from backend and bot
```

---

## Production Deployment

For Railway deployment, use **Datadog** (SaaS, no infrastructure needed):

```bash
# 1. Create Datadog account
# 2. Get API key from: https://app.datadoghq.com/account/settings#api/overview
# 3. Add to .env.production
# 4. Datadog agent auto-scrapes metrics
```

---

## Dashboard URLs

- **Grafana (self-hosted)**: http://localhost:3000
- **Datadog (cloud)**: https://app.datadoghq.com/dashboard
- **Prometheus (self-hosted)**: http://localhost:9090

---

**All metrics are real-time and available immediately after deployment.**
