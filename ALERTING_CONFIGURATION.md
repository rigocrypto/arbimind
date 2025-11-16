# Alerting & Monitoring Configuration

## 1. Sentry Alert Rules

### Critical: High Error Rate
```
Condition: Error count > 10 in 5 minutes
Actions:
  - Create issue in Slack #alerts
  - Create PagerDuty incident
  - Email ops@arbimind.ai
```

### Warning: Memory Leak Detection
```
Condition: Heap memory growth > 100MB in 10 minutes
Actions:
  - Slack notification #monitoring
  - Log to Logtail
Threshold: Alert if heap > 512MB
```

### Critical: Failed Transactions
```
Condition: Tag[transaction_type]=arbitrage AND status=failed AND count > 5 in 10 min
Actions:
  - Create issue
  - PagerDuty critical
  - Trigger bot restart
```

### Warning: RPC Provider Failures
```
Condition: Tag[error_type]=RPC_CALL_FAILED AND count > 3 in 5 min
Actions:
  - Log to monitoring
  - Switch to failover RPC
  - Slack #infra notification
```

---

## 2. Railway Alerting

### Deploy in Railway UI → Observability → Alerts

#### Alert 1: Service Down
```
Service Down: arbimind-bot or arbimind-backend
Notify: Webhook → Slack #alerts
Webhook URL: https://hooks.slack.com/services/YOUR/WEBHOOK
```

#### Alert 2: High CPU/Memory
```
Memory Usage > 80% for 5 minutes
CPU Usage > 75% for 5 minutes
Notify: Webhook → Slack + Email
```

#### Alert 3: Deploy Failure
```
Deploy Status = Failed
Notify: Slack #deployments + PagerDuty
```

---

## 3. Logtail Integration

### Setup in packages/backend/src/index.ts

```typescript
import { Logtail } from "@logtail/node";

// Initialize Logtail
const logtail = new Logtail(process.env.LOGTAIL_TOKEN!);

// Log all errors automatically
logtail.setContext({
  environment: process.env.NODE_ENV,
  service: 'arbimind-backend',
  version: process.env.APP_VERSION || '1.0.0',
});

// Send logs
app.use((req, res, next) => {
  res.on('finish', () => {
    logtail.log(`${req.method} ${req.path} ${res.statusCode}`, {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      responseTime: res.getHeader('X-Response-Time'),
    });
  });
  next();
});
```

### Logtail Alert Rules (in Logtail UI)

#### Rule 1: Arbitrage Failure
```
Query: service="arbimind-bot" level="error" message~="execution failed"
Alert: Slack webhook + Email
Threshold: > 3 in 10 minutes
```

#### Rule 2: RPC Provider Error
```
Query: error_type="RPC_CALL_FAILED" OR status="provider_down"
Alert: PagerDuty critical
Threshold: Immediate
```

#### Rule 3: Slippage Alert
```
Query: slippage_percent > 2
Alert: Slack #trading
Threshold: Immediate (per transaction)
```

---

## 4. Datadog Integration (Optional)

### Metric Names to Send
```
arbimind.bot.opportunities_found
arbimind.bot.transactions_executed
arbimind.bot.transaction_failed
arbimind.bot.gas_price
arbimind.bot.profit_eth
arbimind.backend.api_response_time
arbimind.backend.memory_usage
arbimind.backend.error_count
```

### Datadog Monitor Rules
```
Monitor: High Error Rate
Query: avg:arbimind.backend.error_count{*}.as_count() > 10
Alert Threshold: 5 minutes
```

---

## 5. One-Click Setup Commands

```bash
# 1. Get Sentry DSN
# Go to: https://sentry.io → New Project → Node.js

# 2. Get Logtail Token
# Go to: https://betterstack.com/logtail → Create Source

# 3. Add Railway Webhook
# Go to: https://dashboard.railway.app → Project → Integrations

# 4. Create Slack Webhooks
# Go to: Slack App → Incoming Webhooks → Add to Workspace

# 5. Add to .env.production
cat >> .env.production << EOF
SENTRY_DSN=https://...@sentry.io/...
LOGTAIL_TOKEN=...
SLACK_WEBHOOK_ALERTS=https://hooks.slack.com/services/...
SLACK_WEBHOOK_DEPLOYMENTS=https://hooks.slack.com/services/...
EOF

# 6. Deploy
git add .
git commit -m "chore: alerting and monitoring configuration"
git push origin main
```

---

## 6. Dashboard URLs (Post-Setup)

- **Sentry**: https://sentry.io/organizations/arbimind/
- **Logtail**: https://betterstack.com/logtail/logs
- **Railway**: https://dashboard.railway.app/project
- **Datadog** (if used): https://app.datadoghq.com/

---

Notes:
- All alert thresholds are adjustable based on production traffic
- PagerDuty escalations require PagerDuty integration (setup in Sentry + Railway)
- Slack webhooks support thread replies for grouped alerts
- Test alerts: trigger test transaction in bot to validate pipeline
