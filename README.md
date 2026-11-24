# BTC Wallet Prize Display - MAXIMUM SECURITY

Eine maximal gehärtete Website, die ein echtes BTC Wallet anzeigt (Adresse, Balance). Der Seed Phrase liegt **AES-256-GCM verschlüsselt** in Firestore und ist **nur via Admin SDK** lesbar.

## 🔐 Security Architecture (Maximum Paranoia Mode)

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js + Obfuscation)             │
│  • Zeigt NUR: Adresse, Balance, Derivation Path                 │
│  • KEIN Zugriff auf Seed                                        │
│  • Device Fingerprinting (Canvas, WebGL, Audio, Fonts, etc.)   │
│  • hCaptcha v2 Invisible (Auto-Refresh alle 60s, Score ≥ 0.7)  │
│  • HMAC-SHA256 Request Signing + Nonce + Timestamp             │
│  • JavaScript Obfuscation (Control Flow Flattening, Dead Code,  │
│    Self-Defending, String Array Encoding RC4)                  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS Callable Functions (Signed)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              FIREBASE FUNCTIONS (Node.js 20)                    │
│  • getWalletInfo() → Balance Check (mit Security Check)        │
│  • submitClaim() → Claim einreichen (mit Security Check)       │
│  • adminStoreSeed() → EINMALIG Seed verschlüsselt speichern    │
│  • adminRetrieveSeed() → NOTFALL-Recovery (Heavy Audit Log)    │
│  • SECURITY CHECK pro Request:                                  │
│     - IP + Fingerprint Blacklist (24h bei 3 Requests ohne Captcha) │
│     - Replay Protection (Nonce, 5min Window)                   │
│     - hCaptcha Verification (Server-side)                      │
│     - Rate Counter (3 req/hour per IP+Fingerprint)             │
└────────────────────────────┬────────────────────────────────────┘
                             │ Admin SDK (bypasses Rules)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FIRESTORE                                    │
│  /wallet_secrets/btc-wallet-main                               │
│    • encryptedSeed (AES-256-GCM, base64)                       │
│    • iv, authTag                                               │
│    • derivationPath, label, createdAt                          │
│  /claimants/{id}                                               │
│    • address, txid, method, claimedAt, verified=false          │
│  /security_blacklist/{identifier}                              │
│    • IP+Fingerprint, reason, expiresAt (24h)                   │
│  /security_counters/{identifier}                               │
│    • count, windowStart, lastRequest                           │
│  /security_nonces/{nonce}                                      │
│    • usedAt, identifier (Replay Protection)                    │
│  /audit_log/{id}                                               │
│    • Alle Admin-Aktionen (seed_stored, seed_retrieved, ...)    │
└─────────────────────────────────────────────────────────────────┘
```

### Firestore Rules (Maximal restriktiv)
- **wallet_secrets**: Client lesen NUR Metadaten (KEIN Seed), schreiben NIE
- **claimants**: Öffentlich lesen (verified), Authenticated schreiben (validiert)
- **security_***: Komplett gesperrt (nur Server/Admin SDK)
- **audit_log**: Komplett gesperrt

### Verschlüsselung
- **Algorithmus**: AES-256-GCM (authenticated encryption)
- **Key**: 32 Bytes aus Functions Config / Secret Manager
- **IV**: 12 Bytes random pro Verschlüsselung
- **Key Storage**: NUR in Functions Config, NIEMALS im Repo

## 🚀 Deployment

### 1. Firebase Projekt erstellen
```bash
firebase projects:create your-project-id
firebase use your-project-id
```

### 2. hCaptcha Setup (KOSTENLOS, großzügiges Free Tier)
1. https://dashboard.hcaptcha.com → New Site
2. Site Key → `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`
3. Secret Key → `firebase functions:config:set hcaptcha_secret_key="YOUR_SECRET"`

### 3. Firebase Config setzen
```bash
# Frontend Config (public)
firebase functions:config:set \
  firebase.api_key="YOUR_API_KEY" \
  firebase.auth_domain="your-project.firebaseapp.com" \
  firebase.project_id="your-project-id" \
  firebase.storage_bucket="your-project.appspot.com" \
  firebase.messaging_sender_id="YOUR_SENDER_ID" \
  firebase.app_id="YOUR_APP_ID"

# Backend Secrets (PRIVATE!)
# Generate Master Key: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
firebase functions:config:set \
  master_encryption_key="BASE64_ENCODED_32_BYTE_KEY" \
  hcaptcha_secret_key="YOUR_HCAPTCHA_SECRET"
```

### 4. Frontend Environment
```bash
cp .env.local.example .env.local
# Edit .env.local with your Firebase config + hCaptcha Site Key
```

### 5. Admin UID ermitteln
1. Firebase Console → Authentication → Users
2. Deinen User kopieren → UID in `functions/src/index.ts` ADMIN_UIDS eintragen
3. Auch in `scripts/store-seed.js` ADMIN_UID eintragen

### 6. Seed einmalig speichern
```bash
# Edit scripts/store-seed.js: SEED_PHRASE, ADMIN_UID
cd /workspace/app
node scripts/store-seed.js
```

**WICHTIG**: Nach erfolgreichem Speichern `SEED_PHRASE` aus dem Script entfernen oder Script löschen!

### 7. Admin Functions DEAKTIVIEREN (nach Setup!)
```bash
# In functions/src/index.ts: adminStoreSeed, adminRetrieveSeed, adminRotateKey
# Kommentieren oder löschen, dann redeploy:
firebase deploy --only functions
```

### 8. Build & Deploy
```bash
# Install deps
npm install
cd functions && npm install && cd ..

# Production Build (mit Obfuscation)
npm run build

# Deploy everything
firebase deploy
```

## 📁 Projektstruktur

```
/workspace/app
├── functions/
│   ├── src/index.ts          # Cloud Functions (TypeScript, Security Checks)
│   ├── package.json
│   └── tsconfig.json
├── src/
│   ├── app/
│   │   ├── page.tsx          # Main display page (Security integrated)
│   │   ├── layout.tsx
│   │   └── globals.css       # Tailwind + Security styles
│   └── lib/
│       ├── firebase.ts       # Firebase client + callable wrappers
│       └── security.ts       # Fingerprinting, HMAC, hCaptcha
├── scripts/
│   └── store-seed.js         # Admin: Seed einmalig verschlüsselt speichern
├── firebase.json             # Hosting, Functions, Firestore config
├── firestore.rules           # Maximal restriktive Rules
├── firestore.indexes.json
├── next.config.js            # Security Headers, CSP, Obfuscation, Export
├── package.json
└── tsconfig.json
```

## 🛡️ Security Checklist (Production)

- [ ] **MASTER_ENCRYPTION_KEY** in Functions Config (32 Bytes base64)
- [ ] **HCAPTCHA_SECRET_KEY** in Functions Config
- [ ] **Admin UIDs** in `functions/src/index.ts` auf deine UIDs beschränkt
- [ ] **adminStoreSeed/adminRetrieveSeed** NACH Setup aus Code entfernen
- [ ] **Firebase Auth**: Nur Email/Passwort für Admin, Anonymous für User
- [ ] **App Check** aktivieren (reCAPTCHA Enterprise für Production)
- [ ] **Firestore Rules** deployed (`firebase deploy --only firestore:rules`)
- [ ] **CSP Header** in `next.config.js` auf deine Domains angepasst
- [ ] **hCaptcha Domain** in CSP `frame-src` und `connect-src` erlaubt
- [ ] **Custom Domain** mit HTTPS erzwungen
- [ ] **Monitoring**: Firebase Console → Functions → Logs für Blacklist-Events

## 🔄 Wallet Balance Update

Die Balance wird client-seitig alle 60 Sekunden via `blockstream.info` API aktualisiert.
Für Production: Eigener Electrs/Blockstream Server oder Alchemy/Blockcypher API.

## 💰 Claim Prozess

1. Finder bewegt BTC auf eigene Adresse
2. Reicht Claim ein: `submitClaim(address, txid, method)` (signed + captcha)
3. Admin prüft manuell in Firebase Console → `claimants` Collection
4. Setzt `verified: true` → erscheint auf Leaderboard

## ⚠️ Wichtige Hinweise

- **Seed Zugriff = Coin Verlust**: Wer `adminRetrieveSeed` aufruft, kompromittiert das Wallet. Coins SOFORT bewegen!
- **Free Tier Limits**: 125k Function Invocations/Monat, 50k Firestore Reads/Tag
- **Cold Starts**: Functions brauchen ~2-5s beim ersten Aufruf
- **Kein Backup**: Seed nur in Firestore. Exportiere verschlüsselt für Offline-Backup!
- **Obfuscation**: Production Build braucht `webpack-obfuscator` (installiert)

## 🆘 Notfall-Recovery

```bash
# Seed abrufen (NUR IM NOTFALL - loggt heavy audit trail)
firebase functions:call adminRetrieveSeed --data='{}'
```

Danach: **SOFORT Coins auf neue Adresse transferieren!**

## 🔧 Security Features Detail

### Rate Limiting & Blacklist
| Parameter | Wert |
|-----------|------|
| Max Requests pro Stunde (IP+Fingerprint) | 3 |
| Captcha erforderlich ab | 1 Request |
| Blacklist Dauer | 24 Stunden |
| Blacklist Grund | "Exceeded 3 requests without valid captcha" |
| Replay Protection Window | 5 Minuten |
| Nonce Length | 32 hex chars (16 bytes) |

### hCaptcha Configuration
- **Mode**: Invisible (kein User-Interaction nötig)
- **Auto-Refresh**: Alle 60 Sekunden (Client-seitig)
- **Score Threshold**: 0.7 (streng)
- **Theme**: Dark

### Request Signing (HMAC-SHA256)
```
Sign Data: JSON.stringify({ payload, timestamp, nonce, fingerprint })
Key: SHA256(HMAC_SECRET + fingerprint)
Signature: HMAC-SHA256(key, signData)
```
Server verifiziert: Timestamp ±5min, Nonce nicht verwendet, Signature gültig.

### Device Fingerprinting Components
- Canvas Fingerprint (2D Context Drawing)
- WebGL Fingerprint (Renderer, Vendor, Version)
- Audio Fingerprint (Oscillator + Analyser)
- Font Detection (15 common fonts)
- Plugin & MimeType Enumeration
- Battery API (falls verfügbar)
- Screen, Timezone, Hardware Concurrency, Device Memory
- Touch Support, Pixel Ratio, Navigator Properties

### JavaScript Obfuscation (Production Build)
- Control Flow Flattening (75%)
- Dead Code Injection (40%)
- Debug Protection + Interval
- Console Output Disabled
- Identifier Names → Hexadecimal
- Self-Defending (Anti-Tamper)
- String Array Encoding (RC4)
- String Array Shuffle + Rotate
- Transform Object Keys
- Split Strings (10 char chunks)

## 📄 Lizenz

MIT - Aber: Nutze nicht für illegale Zwecke. Echtes BTC = echte Verantwortung.