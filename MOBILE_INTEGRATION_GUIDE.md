# ArbiMind Mobile App — Complete Integration Guide

## 📱 What You're Building

A **React Native** cross-platform mobile app for real-time ArbiMind performance monitoring:

- **iOS 13+** (iPhone, iPad)
- **Android 8+** (phones, tablets)
- **Real-time dashboard** (profit, opportunities, RPC status)
- **Live alerts** (push notifications)
- **Transaction history** with Arbiscan links
- **Gas analytics** and trend charts
- **Dark mode** support
- **Offline support** (local caching)

---

## 📦 Complete Deliverables

### Documentation Files
1. **`MOBILE_APP_DOCS.md`** — Architecture, setup, and project structure
2. **`MOBILE_PUSH_NOTIFICATIONS.md`** — Firebase Cloud Messaging integration
3. **This file** — Integration checklist and deployment guide

### Code Templates
4. **`MOBILE_API_CLIENT.ts`** — REST + WebSocket API integration layer
5. **`MOBILE_DASHBOARD_SCREEN.tsx`** — React Native dashboard component
6. **`MOBILE_REDUX_METRICS_SLICE.ts`** — Redux state management for metrics

### Backend Integration
- Firebase notifications service in backend
- API endpoints for device registration
- Push notification helpers (opportunities, transactions, RPC, gas, milestones)

---

## 🚀 Quick Start (30 minutes)

### Option A: Expo (Fastest)

```bash
# 1. Create project
npx create-expo-app ArbiMindMobile
cd ArbiMindMobile

# 2. Install dependencies
npm install @react-navigation/native @react-navigation/bottom-tabs
npm install @reduxjs/toolkit react-redux axios socket.io-client
npm install expo-notifications expo-device dotenv

# 3. Copy template files
cp ../MOBILE_API_CLIENT.ts ./src/services/
cp ../MOBILE_DASHBOARD_SCREEN.tsx ./src/screens/
cp ../MOBILE_REDUX_METRICS_SLICE.ts ./src/store/slices/

# 4. Create .env
cat > .env << EOF
REACT_APP_API_URL=https://api.arbimind.app
REACT_APP_WS_URL=wss://api.arbimind.app
REACT_APP_FIREBASE_PROJECT_ID=arbimind-prod
EOF

# 5. Run
npx expo start

# Scan QR code with Expo Go app
```

### Option B: Bare React Native (Advanced)

```bash
# 1. Create project
npx react-native init ArbiMindMobile --template react-native-template-typescript
cd ArbiMindMobile

# 2. Install dependencies
npm install @react-navigation/native @react-navigation/bottom-tabs
npm install @reduxjs/toolkit react-redux axios socket.io-client
npm install @react-native-firebase/app @react-native-firebase/messaging
npm install react-native-chart-kit react-native-svg

# 3. iOS setup
cd ios && pod install && cd ..

# 4. Android setup (see MOBILE_APP_DOCS.md for Firebase config)

# 5. Run
npx react-native run-ios  # or run-android
```

---

## 🔌 API Integration Checklist

### Backend (ArbiMind)

- [ ] Install Firebase Admin SDK
  ```bash
  cd packages/backend
  npm install firebase-admin
  ```

- [ ] Add Firebase service account
  - Download from Firebase Console
  - Save as `packages/backend/firebase-admin-key.json`
  - Add to `.gitignore`

- [ ] Create notifications service
  - Copy code from `MOBILE_PUSH_NOTIFICATIONS.md` → packages/backend/src/services/notifications.ts
  - Initialize Firebase Admin in index.ts

- [ ] Add notifications API route
  - POST `/api/notifications/register` — device registration
  - POST `/api/notifications/unregister` — device unregistration

- [ ] Test backend notifications
  ```bash
  npm run dev  # Start backend
  curl -X POST http://localhost:3002/api/notifications/register \
    -H "Content-Type: application/json" \
    -d '{"deviceToken": "test-token"}'
  ```

### Mobile App (React Native/Expo)

- [ ] Configure Firebase
  - Expo: Use Firebase SDK via npm
  - Bare: Add GoogleService-Info.plist (iOS) + google-services.json (Android)

- [ ] Initialize notifications on app startup
  ```typescript
  // App.tsx useEffect()
  const initNotifications = async () => {
    const token = await requestUserPermission();
    await apiClient.post('/api/notifications/register', { deviceToken: token });
    handleNotifications();
  };
  ```

- [ ] Handle foreground notifications
  - Alert user when notification arrives
  - Navigate to relevant screen

- [ ] Handle background notifications
  - Dispatch Redux action
  - Update cache

---

## 📊 Screens to Implement

### 1. Dashboard Screen (Main Tab)
```
┌─────────────────┐
│ ArbiMind Mobile │
├─────────────────┤
│ Profit (24h):   │
│ 2.3421 ETH ✅  │
├─────────────────┤
│ Opportunities:  │
│ 1,247 found    │
├─────────────────┤
│ Success Rate:   │
│ 87.3%           │
├─────────────────┤
│ Avg Gas:        │
│ 2.50 gwei       │
├─────────────────┤
│ RPC Status:     │
│ ✅ Healthy     │
└─────────────────┘
```

**Components**: `MetricCard`, `RefreshControl`, WebSocket listener

### 2. Alerts Screen (Second Tab)
```
Shows push notifications:
- "🚀 Opportunity: ETH → ARB (+0.42%)"
- "✅ Transaction: 0.0031 ETH profit"
- "⚠️ RPC Failed: Switched to fallback"
- "⛽ Gas Spike: 5.2 gwei (+15%)"

Tap to view details
```

**Components**: `AlertList`, `AlertDetail`, `AlertBanner`

### 3. Transactions Screen (Third Tab)
```
Recent transactions:
- 2025-11-14 10:30 | WETH/ARB | +0.0031 ETH | ✅
- 2025-11-14 10:15 | USDC/DAI | +0.0012 ETH | ✅
- 2025-11-14 10:00 | LINK/UNI | -0.0005 ETH | ❌ (slippage)

Tap to view on Arbiscan
```

**Components**: `TransactionList`, `TransactionDetail`, `ExternalLink`

### 4. Analytics Screen (Fourth Tab)
```
Charts:
- Profit over time (line chart)
- Token pair performance (bar chart)
- Win/loss ratio (pie chart)
- Gas cost trends (area chart)

Date range selector: 24h | 7d | 30d
```

**Components**: `LineChart`, `BarChart`, `PieChart`, `DateRangePicker`

### 5. Settings Screen (Fifth Tab)
```
- Dark Mode Toggle
- Push Notification Preferences
  ☑️ Opportunities
  ☑️ Transactions
  ☑️ RPC Failures
  ☑️ Gas Spikes
  ☑️ Profit Milestones
- Logout
- App Version
```

**Components**: `Toggle`, `Switch`, `Button`

---

## 🔐 Security Best Practices

### Authentication
- [ ] Store JWT tokens in secure storage (Keychain/Keystore)
- [ ] Refresh tokens before expiry
- [ ] Handle 401 errors (logout on invalid token)

### Data Storage
- [ ] Use encrypted AsyncStorage or Realm
- [ ] Don't store private keys locally
- [ ] Cache only non-sensitive data

### API Communication
- [ ] Use HTTPS only
- [ ] Verify SSL certificates
- [ ] Add request/response validation
- [ ] Rate limit locally to prevent spam

### Firebase
- [ ] Restrict Firebase project access
- [ ] Enable firewall rules
- [ ] Monitor Firebase logs in GCP

---

## 📈 Firebase Setup (Step-by-Step)

### 1. Create Firebase Project
```
Go to: https://console.firebase.google.com/
New Project → arbimind-mobile → Create
```

### 2. Register iOS App
```
Project Settings → iOS Apps → Add App
Bundle ID: com.arbimind.mobile
App Name: ArbiMind iOS
Download GoogleService-Info.plist
Add to Xcode: Xcode → Add Files → GoogleService-Info.plist
```

### 3. Register Android App
```
Project Settings → Android Apps → Add App
Package: com.arbimind.mobile
App Name: ArbiMind Android
SHA-1: Get from ./gradlew signingReport
Download google-services.json
Copy to: android/app/google-services.json
```

### 4. Get Service Account
```
Project Settings → Service Accounts
Generate Private Key → Download JSON
Save as: packages/backend/firebase-admin-key.json
Add to .gitignore
```

### 5. Enable Cloud Messaging
```
Firebase Project → Cloud Messaging tab
Enable Cloud Messaging API
```

---

## 🧪 Testing Checklist

### Local Testing
- [ ] Run mobile app locally with backend on localhost
- [ ] Test all screens load correctly
- [ ] Test Redux state updates
- [ ] Test API calls and error handling
- [ ] Test WebSocket real-time updates

### Firebase Testing
- [ ] Send test notification from Firebase Console
- [ ] Verify device receives push notification
- [ ] Verify foreground notification handling
- [ ] Verify background notification handling
- [ ] Test with app closed

### End-to-End Testing
- [ ] Bot creates opportunity → Mobile receives alert
- [ ] Bot executes transaction → Mobile shows in history
- [ ] RPC provider fails → Mobile shows alert + status change
- [ ] Gas price spikes → Mobile receives alert

---

## 🚀 Deployment

### iOS (App Store)

```bash
# 1. Create Apple Developer account
# 2. Add push capability in Xcode
# 3. Create App ID with push notifications
# 4. Create provisioning profile
# 5. Archive app
#    Xcode → Product → Archive → Export

# 6. Upload to TestFlight
#    Xcode Organizer → Validate → Upload

# 7. Test on TestFlight devices
# 8. Submit to App Store Review
# 9. App Store releases your app
```

### Android (Google Play)

```bash
# 1. Create Google Play Developer account
# 2. Generate signed APK
#    ./gradlew assembleRelease

# 3. Sign APK
#    jarsigner -verbose -sigalg SHA1withRSA \
#      -keystore my-release-key.keystore \
#      app/build/outputs/apk/release/app-release-unsigned.apk \
#      alias_name

# 4. Optimize with zipalign
#    zipalign -v 4 app-release-unsigned.apk ArbiMindMobile.apk

# 5. Upload to Google Play Console
#    https://play.google.com/console/

# 6. Fill app details, screenshots, description
# 7. Submit for review
# 8. Google Play reviews and releases
```

---

## 📊 Monitoring & Analytics

### Firebase Analytics

Track user behavior:

```typescript
import { Analytics } from '@react-native-firebase/analytics';

const analytics = Analytics();

// Screen views
analytics.logScreenView({
  screen_name: 'dashboard',
  screen_class: 'DashboardScreen',
});

// Custom events
analytics.logEvent('profit_milestone', { profit: 100 });
analytics.logEvent('alert_clicked', { alert_type: 'transaction' });
```

### Sentry (Crash Reporting)

```bash
npm install @sentry/react-native
```

```typescript
import * as Sentry from "@sentry/react-native";

Sentry.init({
  dsn: "your-sentry-dsn",
  tracesSampleRate: 1.0,
});

// Automatically captures unhandled crashes
```

---

## 📚 Resources

- **React Native Docs**: https://reactnative.dev/
- **React Navigation**: https://reactnavigation.org/
- **Redux Toolkit**: https://redux-toolkit.js.org/
- **Firebase Cloud Messaging**: https://firebase.google.com/docs/cloud-messaging
- **Expo**: https://docs.expo.dev/
- **React Native Firebase**: https://rnfirebase.io/

---

## ✅ Final Checklist (Before Launch)

- [ ] All 5 screens implemented and tested
- [ ] Redux state management working
- [ ] API client connects to backend
- [ ] WebSocket real-time updates working
- [ ] Push notifications sending and receiving
- [ ] Dark mode toggle working
- [ ] Offline mode (local caching) working
- [ ] Error handling and retry logic
- [ ] Analytics tracking implemented
- [ ] Sentry crash reporting configured
- [ ] iOS app builds and runs
- [ ] Android app builds and runs
- [ ] iOS app submitted to App Store
- [ ] Android app submitted to Google Play
- [ ] Testflight testing complete
- [ ] Beta release to small user group
- [ ] Monitor crash reports and feedback
- [ ] Full production release

---

## 🎯 Roadmap

**v1.0 (Launch)**
- Dashboard, alerts, transactions, analytics
- Push notifications
- Dark mode

**v1.1 (Week 2)**
- Biometric authentication (Face ID, Touch ID)
- Offline mode improvements
- Share transaction links

**v1.2 (Week 3)**
- Price alerts (below/above threshold)
- Favorite token pairs
- Quick stats widgets

**v2.0 (Month 2)**
- Multi-chain support (Ethereum, Polygon, Optimism)
- Advanced charting (TradingView)
- Bot control (pause/resume)

---

## 🆘 Support

**Build Issues?**
- Clear cache: `npm cache clean --force`
- Reinstall pods (iOS): `cd ios && pod install && cd ..`
- Check Node version: `node -v` (require ≥18)

**API Issues?**
- Check backend is running: `curl http://localhost:3002/health`
- Check .env API_URL matches backend
- Check WebSocket URL format (wss:// for production)

**Push Notification Issues?**
- Verify Firebase credentials
- Check device token is valid
- Test from Firebase Console first
- Check app permissions (iOS/Android settings)

**Deployment Issues?**
- iOS: Check provisioning profiles and signing
- Android: Check keystore and keyalias
- Review App Store / Google Play guidelines

---

**Your ArbiMind mobile app is ready to launch. 📱🚀**
