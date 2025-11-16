# ArbiMind Mobile App — Performance Dashboard

## Overview

A React Native mobile application for real-time monitoring of ArbiMind bot performance, profit tracking, and push alerts.

**Platforms**: iOS 13+ | Android 8+  
**Framework**: React Native (Expo or bare)  
**State Management**: Redux + Redux Thunk  
**Networking**: axios + WebSocket  
**Real-time**: Socket.io for live metrics  

---

## Architecture

```
┌─────────────────────────────────────┐
│   Mobile App (React Native)         │
├─────────────────────────────────────┤
│                                     │
│  Screens                            │
│  ├─ Dashboard (Profit, Opp Count)  │
│  ├─ Real-time Alerts               │
│  ├─ Transaction History            │
│  ├─ Gas Analytics                  │
│  └─ Settings                       │
│                                     │
│  Redux Store                        │
│  ├─ metrics (live data)             │
│  ├─ transactions (history)          │
│  ├─ alerts (notifications)          │
│  └─ user (auth + preferences)       │
│                                     │
│  Services                           │
│  ├─ API Client (REST + WebSocket)   │
│  ├─ Push Notifications              │
│  ├─ Local Storage                   │
│  └─ Analytics                       │
│                                     │
└─────────────────────────────────────┘
         ↓ WebSocket / HTTP
┌─────────────────────────────────────┐
│   ArbiMind Backend API              │
│   (packages/backend)                │
└─────────────────────────────────────┘
```

---

## Core Features

### 1. Real-time Dashboard
- **Current Profit (24h)** — ETH earned in last 24 hours
- **Opportunities Found** — Live opportunity counter
- **Success Rate** — % of profitable executions
- **Gas Optimization** — Average gas cost per tx
- **RPC Provider Status** — Health of fallback chain

### 2. Live Alerts
- Arbitrage opportunities detected
- Transaction executed (success/failure)
- RPC provider switched
- Gas price spikes
- Profit milestones ($100, $1000, etc.)

### 3. Transaction History
- Time, token pair, DEX pair, profit
- Gas cost, actual slippage, hash
- Tap to view on Arbiscan

### 4. Analytics Dashboard
- Profit over time (24h, 7d, 30d)
- Win/loss ratio
- Gas cost trends
- Most profitable pairs
- Riskiest pairs

### 5. Settings & Alerts
- Push notification preferences
- Dark mode toggle
- Price alerts (above/below threshold)
- Logout / Session management

---

## Project Structure

```
arbimind-mobile/
├── app/
│   ├── screens/
│   │   ├── DashboardScreen.tsx
│   │   ├── AlertsScreen.tsx
│   │   ├── TransactionsScreen.tsx
│   │   ├── AnalyticsScreen.tsx
│   │   └── SettingsScreen.tsx
│   ├── components/
│   │   ├── MetricCard.tsx
│   │   ├── AlertBanner.tsx
│   │   ├── TransactionRow.tsx
│   │   └── ChartComponent.tsx
│   ├── services/
│   │   ├── api.ts (REST + WebSocket)
│   │   ├── notifications.ts (Firebase Cloud Messaging)
│   │   └── storage.ts (AsyncStorage)
│   ├── store/
│   │   ├── slices/
│   │   │   ├── metricsSlice.ts
│   │   │   ├── transactionsSlice.ts
│   │   │   ├── alertsSlice.ts
│   │   │   └── userSlice.ts
│   │   └── index.ts (Redux store config)
│   ├── App.tsx (Root component + navigation)
│   └── types.ts (TypeScript interfaces)
├── app.json (Expo config)
├── package.json
├── tsconfig.json
└── .env (API_URL, PUSH_TOKEN, etc.)
```

---

## Quick Start (Bare React Native)

### Step 1: Create Project

```bash
# Using React Native CLI
npx react-native init ArbiMindMobile --template react-native-template-typescript

cd ArbiMindMobile

# Install core dependencies
npm install @react-navigation/native @react-navigation/bottom-tabs
npm install @reduxjs/toolkit react-redux
npm install axios socket.io-client
npm install @react-native-firebase/app @react-native-firebase/messaging
npm install react-native-chart-kit react-native-svg
npm install dotenv
```

### Step 2: Configure Firebase (for Push Notifications)

```bash
# Download google-services.json (Android) and GoogleService-Info.plist (iOS)
# From: https://console.firebase.google.com/

# Copy to appropriate directories:
# Android: android/app/google-services.json
# iOS: ios/GoogleService-Info.plist
```

### Step 3: Update Build Files

**android/build.gradle**
```gradle
buildscript {
  dependencies {
    classpath 'com.google.gms:google-services:4.3.15'
  }
}
```

**android/app/build.gradle**
```gradle
apply plugin: 'com.google.gms.google-services'

dependencies {
  implementation 'com.google.firebase:firebase-messaging'
}
```

### Step 4: Run

```bash
# iOS
cd ios && pod install && cd ..
npx react-native run-ios

# Android
npx react-native run-android
```

---

## Quick Start (Expo)

### Step 1: Create Project

```bash
npx create-expo-app ArbiMindMobile
cd ArbiMindMobile

# Install dependencies
npx expo install expo-notifications
npx expo install expo-device
npm install @react-navigation/native @react-navigation/bottom-tabs
npm install @reduxjs/toolkit react-redux
npm install axios socket.io-client
npm install react-native-chart-kit react-native-svg
npm install dotenv
```

### Step 2: Run

```bash
npx expo start

# Scan QR code with Expo Go app
# Or build for iOS/Android:
npx eas build --platform ios
npx eas build --platform android
```

---

## API Integration

### .env File

```
REACT_APP_API_URL=https://api.arbimind.app
REACT_APP_WS_URL=wss://api.arbimind.app
REACT_APP_FIREBASE_PROJECT_ID=arbimind-prod
REACT_APP_FIREBASE_API_KEY=your_firebase_key
```

### API Client (services/api.ts)

```typescript
import axios from 'axios';
import io from 'socket.io-client';

const API_BASE = process.env.REACT_APP_API_URL;
const WS_URL = process.env.REACT_APP_WS_URL;

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

// REST Endpoints
export const getMetrics = () => apiClient.get('/api/metrics');
export const getTransactions = (limit: number = 50) =>
  apiClient.get(`/api/transactions?limit=${limit}`);
export const getAnalytics = (timeframe: string = '24h') =>
  apiClient.get(`/api/analytics/${timeframe}`);

// WebSocket for real-time updates
export const socket = io(WS_URL, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
});

socket.on('metrics_update', (data) => {
  // Handle real-time metric updates
});

socket.on('transaction_executed', (data) => {
  // Handle transaction alerts
});

socket.on('alert', (data) => {
  // Handle general alerts
});
```

---

## Redux Store Setup

### store/slices/metricsSlice.ts

```typescript
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { getMetrics } from '../../services/api';

export const fetchMetrics = createAsyncThunk(
  'metrics/fetchMetrics',
  async () => {
    const response = await getMetrics();
    return response.data;
  }
);

const metricsSlice = createSlice({
  name: 'metrics',
  initialState: {
    profit24h: 0,
    opportunitiesCount: 0,
    successRate: 0,
    gasAverage: 0,
    rpcStatus: 'healthy',
    loading: false,
    error: null,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMetrics.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchMetrics.fulfilled, (state, action) => {
        state.loading = false;
        state.profit24h = action.payload.profit24h;
        state.opportunitiesCount = action.payload.opportunitiesCount;
        state.successRate = action.payload.successRate;
        state.gasAverage = action.payload.gasAverage;
        state.rpcStatus = action.payload.rpcStatus;
      })
      .addCase(fetchMetrics.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      });
  },
});

export default metricsSlice.reducer;
```

---

## Push Notifications Setup

### services/notifications.ts

```typescript
import messaging from '@react-native-firebase/messaging';
import { Alert } from 'react-native';

export async function requestUserPermission() {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (enabled) {
    console.log('Notification permission granted');
    const token = await messaging().getToken();
    return token;
  }
}

export function handleNotifications() {
  // Foreground notifications
  messaging().onMessage(async (remoteMessage) => {
    Alert.alert(
      remoteMessage.notification?.title || 'ArbiMind Alert',
      remoteMessage.notification?.body
    );
  });

  // Background notifications
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    console.log('Background notification:', remoteMessage);
  });
}

export async function subscribeToTopic(topic: string) {
  await messaging().subscribeToTopic(topic);
  console.log(`Subscribed to ${topic}`);
}

// Subscribe to alerts
export async function setupAlertSubscriptions() {
  await subscribeToTopic('arbimind-alerts');
  await subscribeToTopic('arbimind-transactions');
  await subscribeToTopic('arbimind-gas-spikes');
}
```

---

## Environment Variables (Backend)

### packages/backend/.env

Add Firebase server credentials:

```
# Firebase Cloud Messaging
FIREBASE_PROJECT_ID=arbimind-prod
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...
```

### Sending Push from Backend

```typescript
// packages/backend/src/services/notifications.ts
import admin from 'firebase-admin';

const messaging = admin.messaging();

export async function sendAlert(title: string, body: string, topic: string) {
  const message = {
    notification: { title, body },
    topic: topic, // 'arbimind-alerts', 'arbimind-transactions', etc.
  };

  await messaging.send(message);
}

// Example: Send alert when RPC fails
export async function notifyRPCFailover(fallbackRpc: string) {
  await sendAlert(
    'RPC Provider Failed',
    `Switched to fallback: ${fallbackRpc}`,
    'arbimind-alerts'
  );
}
```

---

## Distribution & Deployment

### iOS (App Store)

```bash
# 1. Create Apple Developer account
# 2. Configure signing in Xcode
# 3. Build for distribution
npx react-native run-ios --configuration Release

# 4. Archive in Xcode and upload to TestFlight
# 5. Submit to App Store
```

### Android (Google Play)

```bash
# 1. Generate signed APK
cd android
./gradlew assembleRelease

# 2. Sign the APK
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 \
  -keystore my-release-key.keystore \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  alias_name

# 3. Zipalign for size optimization
zipalign -v 4 app-release-unsigned.apk ArbiMindMobile.apk

# 4. Upload to Google Play Console
```

---

## Monitoring & Analytics

### Track User Behavior

```typescript
import { Analytics } from '@react-native-firebase/analytics';

const analytics = Analytics();

// Track screen view
analytics.logScreenView({
  screen_name: 'dashboard',
  screen_class: 'DashboardScreen',
});

// Track event
analytics.logEvent('profit_milestone', {
  profit: 100, // $100
  currency: 'ETH',
});

// Track alert interaction
analytics.logEvent('alert_clicked', {
  alert_type: 'transaction_executed',
});
```

---

## Roadmap

- [ ] v1.0 — Dashboard, alerts, transaction history
- [ ] v1.1 — Analytics dashboard, price alerts
- [ ] v1.2 — Biometric authentication
- [ ] v2.0 — AR visualization of profit (optional fun feature)
- [ ] v2.1 — Multi-chain support (Ethereum, Polygon, Optimism)

---

## Support & Troubleshooting

**Push notifications not working?**
- Verify Firebase project credentials
- Check Android/iOS manifest permissions
- Test with: `npm run test:notifications`

**API connection issues?**
- Check `.env` API_URL
- Verify backend is running: `curl $REACT_APP_API_URL/health`
- Check WebSocket URL format

**Build issues?**
- Clear cache: `npm cache clean --force`
- Reinstall pods (iOS): `cd ios && pod install && cd ..`
- Check Node version: `node -v` (require ≥18)

---

**Next: Generate React Native starter template files →**
