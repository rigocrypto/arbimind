# Mobile App: Push Notifications Setup

## Overview

Configure push notifications for real-time alerts (opportunities, transactions, RPC failures) sent from ArbiMind backend to iOS/Android apps.

---

## Architecture

```
┌─────────────────────────────────┐
│   ArbiMind Backend              │
│   (packages/backend)            │
└──────────────┬──────────────────┘
               │ Firebase Cloud Messaging (FCM)
               ↓
┌─────────────────────────────────┐
│   Firebase Cloud Messaging      │
│   (Google's Push Service)       │
└──────────────┬──────────────────┘
               │
        ┌──────┴──────┐
        ↓             ↓
   iOS (APNs)    Android (FCM)
   ┌────────┐    ┌────────┐
   │ iPhone │    │Android │
   │  App   │    │  App   │
   └────────┘    └────────┘
```

---

## Step 1: Firebase Project Setup

### 1a. Create Firebase Project

```bash
# Go to: https://console.firebase.google.com/
# Click: New Project
# Name: arbimind-mobile
# Select region: US Central
# Enable Google Analytics: No (optional)
# Create Project
```

### 1b. Register iOS App

```
1. Project Settings → iOS Apps → Add App
2. Bundle ID: com.arbimind.mobile (or your bundle ID)
3. App nickname: ArbiMind iOS
4. Download GoogleService-Info.plist
5. Add to Xcode project (Xcode → Add Files)
```

### 1c. Register Android App

```
1. Project Settings → Android Apps → Add App
2. Package name: com.arbimind.mobile (or your package name)
3. App nickname: ArbiMind Android
4. SHA-1 fingerprint: (see "Get SHA-1" section below)
5. Download google-services.json
6. Copy to: android/app/google-services.json
```

### Get Android SHA-1 Fingerprint

```bash
# Generate debug keystore SHA-1
./gradlew signingReport

# Or manually:
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep "SHA1:"
```

---

## Step 2: Backend Configuration

### 2a. Install Firebase Admin SDK

```bash
cd packages/backend
npm install firebase-admin
```

### 2b. Add Firebase Credentials

```bash
# 1. Go to: Firebase Project → Settings → Service Accounts
# 2. Click: Generate Private Key
# 3. Save JSON file
# 4. Rename to: firebase-admin-key.json
# 5. Add to .gitignore: echo "firebase-admin-key.json" >> .gitignore
# 6. Copy to backend: cp ~/Downloads/firebase-admin-key.json packages/backend/

# 7. Update .env
echo "FIREBASE_KEY_FILE=firebase-admin-key.json" >> packages/backend/.env
```

### 2c. Initialize Firebase in Backend

**packages/backend/src/services/notifications.ts**

```typescript
import admin from 'firebase-admin';
import * as fs from 'fs';
import { logger } from '../utils/logger';

// Initialize Firebase Admin
const serviceAccountPath = process.env.FIREBASE_KEY_FILE || 'firebase-admin-key.json';

if (!fs.existsSync(serviceAccountPath)) {
  logger.warn('Firebase service account not found');
} else {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  logger.info('Firebase Admin initialized');
}

const messaging = admin.messaging();

/**
 * Send push notification to device
 */
export async function sendNotificationToDevice(
  deviceToken: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  try {
    const message = {
      notification: { title, body },
      data: data || {},
      token: deviceToken,
    };

    const response = await messaging.send(message as any);
    logger.info('Push notification sent', { deviceToken, response });
  } catch (error) {
    logger.error('Failed to send notification', { error });
  }
}

/**
 * Send notification to topic (all subscribed devices)
 */
export async function sendNotificationToTopic(
  topic: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  try {
    const message = {
      notification: { title, body },
      data: data || {},
      topic,
    };

    const response = await messaging.send(message as any);
    logger.info('Topic notification sent', { topic, response });
  } catch (error) {
    logger.error('Failed to send topic notification', { error });
  }
}

/**
 * Subscribe device to topic
 */
export async function subscribeToTopic(deviceToken: string, topic: string): Promise<void> {
  try {
    await messaging.subscribeToTopic(deviceToken, topic);
    logger.info('Device subscribed to topic', { deviceToken, topic });
  } catch (error) {
    logger.error('Failed to subscribe device', { error });
  }
}

/**
 * Unsubscribe device from topic
 */
export async function unsubscribeFromTopic(deviceToken: string, topic: string): Promise<void> {
  try {
    await messaging.unsubscribeFromTopic(deviceToken, topic);
    logger.info('Device unsubscribed from topic', { deviceToken, topic });
  } catch (error) {
    logger.error('Failed to unsubscribe device', { error });
  }
}

/**
 * Alert Notification Helpers
 */

export async function notifyOpportunityDetected(
  opportunity: {
    tokenA: string;
    tokenB: string;
    profitPercent: number;
    dex1: string;
    dex2: string;
  }
): Promise<void> {
  const title = `🚀 Arbitrage Opportunity`;
  const body = `${opportunity.tokenA} → ${opportunity.tokenB} (+${(
    opportunity.profitPercent * 100
  ).toFixed(2)}%)`;
  const data = {
    type: 'opportunity',
    tokenA: opportunity.tokenA,
    tokenB: opportunity.tokenB,
    profitPercent: opportunity.profitPercent.toString(),
  };

  await sendNotificationToTopic('arbimind-alerts', title, body, data);
}

export async function notifyTransactionExecuted(tx: {
  hash: string;
  tokenA: string;
  tokenB: string;
  profitEth: number;
  status: 'success' | 'failed';
}): Promise<void> {
  const title =
    tx.status === 'success'
      ? `✅ Transaction Executed`
      : `❌ Transaction Failed`;
  const body = `${tx.tokenA}/${tx.tokenB} | ${tx.profitEth.toFixed(4)} ETH`;
  const data = {
    type: 'transaction',
    hash: tx.hash,
    status: tx.status,
  };

  await sendNotificationToTopic('arbimind-transactions', title, body, data);
}

export async function notifyRPCFailover(fallbackRpc: string): Promise<void> {
  const title = `⚠️ RPC Provider Failed`;
  const body = `Switched to: ${fallbackRpc}`;
  const data = { type: 'rpc_failover', fallback: fallbackRpc };

  await sendNotificationToTopic('arbimind-alerts', title, body, data);
}

export async function notifyGasSpike(gasPrice: number, previousPrice: number): Promise<void> {
  const increase = (((gasPrice - previousPrice) / previousPrice) * 100).toFixed(1);
  const title = `⛽ Gas Price Spike`;
  const body = `${gasPrice.toFixed(2)} gwei (+${increase}%)`;
  const data = {
    type: 'gas_spike',
    currentPrice: gasPrice.toString(),
    previousPrice: previousPrice.toString(),
  };

  await sendNotificationToTopic('arbimind-alerts', title, body, data);
}

export async function notifyProfitMilestone(profitEth: number): Promise<void> {
  const title = `💰 Profit Milestone!`;
  const body = `Total profit: ${profitEth.toFixed(4)} ETH`;
  const data = { type: 'milestone', profit: profitEth.toString() };

  await sendNotificationToTopic('arbimind-transactions', title, body, data);
}
```

### 2d. Add API Endpoint for Device Registration

**packages/backend/src/routes/notifications.ts**

```typescript
import { Router } from 'express';
import { subscribeToTopic, unsubscribeFromTopic } from '../services/notifications';
import { logger } from '../utils/logger';

export const router = Router();

/**
 * Register device for push notifications
 */
router.post('/register', async (req, res) => {
  try {
    const { deviceToken, topics = ['arbimind-alerts', 'arbimind-transactions'] } = req.body;

    if (!deviceToken) {
      return res.status(400).json({ error: 'deviceToken required' });
    }

    // Subscribe to topics
    for (const topic of topics) {
      await subscribeToTopic(deviceToken, topic);
    }

    res.json({ success: true, message: 'Device registered' });
  } catch (error) {
    logger.error('Device registration failed', { error });
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * Unregister device
 */
router.post('/unregister', async (req, res) => {
  try {
    const { deviceToken, topics = ['arbimind-alerts', 'arbimind-transactions'] } = req.body;

    if (!deviceToken) {
      return res.status(400).json({ error: 'deviceToken required' });
    }

    for (const topic of topics) {
      await unsubscribeFromTopic(deviceToken, topic);
    }

    res.json({ success: true, message: 'Device unregistered' });
  } catch (error) {
    logger.error('Device unregistration failed', { error });
    res.status(500).json({ error: 'Unregistration failed' });
  }
});
```

### 2e. Register Notifications Route in index.ts

**packages/backend/src/index.ts**

```typescript
import notificationsRoutes from './routes/notifications';

// Add to app
app.use('/api/notifications', notificationsRoutes);
```

---

## Step 3: Mobile App Implementation

### 3a. Request Permission (iOS/Android)

**Mobile App: Request FCM Permission**

```typescript
import { requestUserPermission, handleNotifications } from '../services/notifications';

export async function initNotifications() {
  try {
    const token = await requestUserPermission();
    console.log('Device FCM token:', token);

    // Send token to backend
    await apiClient.post('/api/notifications/register', {
      deviceToken: token,
      topics: ['arbimind-alerts', 'arbimind-transactions'],
    });

    // Handle incoming notifications
    handleNotifications();
  } catch (error) {
    console.error('Notification setup failed:', error);
  }
}

// Call in App.tsx useEffect
useEffect(() => {
  initNotifications();
}, []);
```

### 3b. Handle Notifications

**Mobile App: services/notifications.ts**

```typescript
import messaging from '@react-native-firebase/messaging';
import { Alert } from 'react-native';

export async function requestUserPermission(): Promise<string | null> {
  const authStatus = await messaging().requestPermission();

  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (!enabled) {
    console.log('Notification permission denied');
    return null;
  }

  const token = await messaging().getToken();
  return token;
}

export function handleNotifications() {
  // Handle foreground notifications
  const unsubscribe = messaging().onMessage(async (remoteMessage) => {
    const { title, body } = remoteMessage.notification || {};
    const data = remoteMessage.data;

    Alert.alert(title || 'ArbiMind', body || 'New alert');

    // Handle by type
    if (data?.type === 'opportunity') {
      // Navigate to opportunities screen
      navigation.navigate('Alerts');
    } else if (data?.type === 'transaction') {
      // Navigate to transactions screen
      navigation.navigate('Transactions');
    }
  });

  // Handle background notifications
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    console.log('Background notification:', remoteMessage);
    // Dispatch Redux action to update state
  });

  return unsubscribe;
}

export async function subscribeToTopic(topic: string) {
  await messaging().subscribeToTopic(topic);
  console.log(`Subscribed to ${topic}`);
}
```

---

## Step 4: Test Push Notifications

### 4a. From Firebase Console

```
1. Firebase Project → Cloud Messaging tab
2. Click: Send your first message
3. Title: "Test Alert"
4. Body: "This is a test"
5. Target: Topic "arbimind-alerts"
6. Click: Schedule
7. Check your mobile device
```

### 4b. From Backend (Manual)

```bash
# Test with curl
curl -X POST http://localhost:3002/api/notifications/send \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Notification",
    "body": "Test message",
    "topic": "arbimind-alerts"
  }'
```

---

## Step 5: Production Deployment

### iOS (App Store)

```bash
# 1. Archive app with push capability
# Xcode → Product → Archive

# 2. Export for App Store
# Click: Export → Select distribution method

# 3. Upload to TestFlight/App Store
# Xcode Organizer → Validate → Upload
```

### Android (Google Play)

```bash
# 1. Build signed APK
./gradlew assembleRelease

# 2. Sign APK
jarsigner -verbose -sigalg SHA1withRSA \
  -keystore my-release-key.keystore \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  alias_name

# 3. Upload to Google Play Console
# https://play.google.com/console/
```

---

## Troubleshooting

**Push notifications not received?**

1. Check Firebase project is active
2. Verify device token on backend: `curl http://localhost:3002/api/notifications/devices`
3. Check logcat/Xcode logs for errors
4. Ensure app has notification permission

**Invalid credentials?**

1. Regenerate service account key
2. Update `firebase-admin-key.json`
3. Restart backend server

**Device not registered?**

1. Ensure backend is reachable from mobile app
2. Check `.env` `REACT_APP_API_URL`
3. Verify network connectivity

---

## Topics Reference

Use these topics for subscriptions:

| Topic | Use Case |
|-------|----------|
| `arbimind-alerts` | General alerts (RPC failures, gas spikes) |
| `arbimind-transactions` | Transaction results & profit updates |
| `arbimind-milestones` | Profit milestones ($100, $1000, etc.) |

---

**Next: Deploy mobile app to App Store and Google Play →**
