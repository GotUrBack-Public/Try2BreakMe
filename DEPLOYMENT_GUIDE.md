# 🚀 Firebase Deployment Guide - Try2BreakMe BTC Wallet CTF

## 📋 Übersicht

Dies ist ein **CTF (Capture The Flag)** Challenge mit einem echten BTC Wallet. Der Seed Phrase liegt AES-256-GCM verschlüsselt in Firestore und ist nur durch eine **4-Layer Vulnerability Chain** erreichbar.

**Ziel:** Finder der Seed Phrase behält das BTC darauf.

---

## 🔐 Die 4-Layer Vulnerability Chain

| Layer | Ort | Vulnerability | Hinweis auf nächsten Layer |
|-------|-----|---------------|---------------------------|
| **1** | Frontend (Client) | Hidden Debug Panel via `?debug=ctf_2024` | "The PIN check counts cycles... each byte leaks time" |
| **2** | Cloud Functions | Timing Attack auf PIN (`739281`) | "The solution hashes to the secret document ID: SHA256(solution)[:32]" |
| **3** | Firestore | Predictable Doc ID: `encrypted-seed-{SHA256(solution)[:32]}` | "Key = SHA256(PIN + Challenge_Solution)" |
| **4** | Crypto | Weak Key Derivation: `SHA256(PIN + Solution)` (no KDF) | Final Flag + Decrypted Seed |

---

## 🛠️ Schritt-für-Schritt Deployment

### 1. Firebase Projekt erstellen

```bash
# Firebase CLI installieren
npm install -g firebase-tools

# Login
firebase login

# Projekt erstellen
firebase projects:create try2breakme-btc
firebase use try2breakme-btc
```

### 2. hCaptcha Setup (KOSTENLOS)

1. Gehe zu https://dashboard.hcaptcha.com
2. **New Site** → Name: "Try2BreakMe" → Domain: deine Domain + localhost
3. **Site Key** kopieren → wird `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`
4. **Secret Key** kopieren → wird `HCAPTCHA_SECRET_KEY` in Functions Config

### 3. Master Encryption Key generieren

```bash
# 32 Bytes = 256 Bits für AES-256
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Beispiel Output: "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0UvWxYz="
```

### 4. Firebase Functions Config setzen

```bash
# Alle Secrets auf einmal setzen
firebase functions:config:set \
  master_encryption_key="DEIN_BASE64_KEY_HIER" \
  hcaptcha_secret_key="DEIN_HCAPTCHA_SECRET_KEY" \
  firebase.api_key="DEIN_API_KEY" \
  firebase.auth_domain="try2breakme-btc.firebaseapp.com" \
  firebase.project_id="try2breakme-btc" \
  firebase.storage_bucket="try2breakme-btc.appspot.com" \
  firebase.messaging_sender_id="DEIN_SENDER_ID" \
  firebase.app_id="DEIN_APP_ID"

# Prüfen
firebase functions:config:get
```

### 5. Frontend Environment (.env.local)

```bash
cp .env.local.example .env.local
```

Bearbeite `.env.local`:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=dein_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=try2breakme-btc.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=try2breakme-btc
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=try2breakme-btc.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=dein_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=dein_app_id

NEXT_PUBLIC_WALLET_ADDRESS=bc1qDEINE_WALLET_ADRESSE_HIER
NEXT_PUBLIC_WALLET_LABEL=Try2BreakMe BTC Prize

NEXT_PUBLIC_HCAPTCHA_SITE_KEY=DEIN_HCAPTCHA_SITE_KEY
NEXT_PUBLIC_HMAC_SECRET=client-hmac-secret-change-me
```

### 6. Admin UID ermitteln & eintragen

1. Firebase Console → **Authentication** → **Users**
2. Deinen User anklicken → **UID kopieren** (z.B. `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)
3. In **ZWEI Dateien** eintragen:

**Datei 1:** `functions/src/index.ts` (Zeile ~11)
```typescript
const ADMIN_UIDS = ["DEINE_UID_HIER"]; // REPLACE!
```

**Datei 2:** `scripts/store-seed.js` (Zeile ~12)
```javascript
const ADMIN_UID = "DEINE_UID_HIER"; // REPLACE!
```

### 7. Dependencies installieren & Build testen

```bash
# Root dependencies
npm install

# Functions dependencies
cd functions && npm install && cd ..

# Build testen (lokal)
npm run build
cd functions && npm run build && cd ..
```

### 8. Seed Phrase EINMALIG in Firestore speichern

**WICHTIG:** Bereite deine echte BIP39 Seed Phrase vor (12 oder 24 Wörter).

```bash
# Script bearbeiten - SEED_PHRASE eintragen
nano scripts/store-seed.js
```

```javascript
const SEED_PHRASE = "dein echter 12 oder 24 wort seed phrase hier"; // REPLACE!
const DERIVATION_PATH = "m/84'/0'/0'"; // Native SegWit (bc1q...)
const LABEL = "Try2BreakMe BTC Prize";
```

```bash
# Ausführen (nutzt Admin SDK, bypassed Firestore Rules)
node scripts/store-seed.js
```

**Erwartete Ausgabe:**
```
🔐 Initializing Firebase Admin...
🔒 Encrypting seed phrase...
💾 Storing in Firestore (Admin SDK bypasses rules)...
✅ Seed encrypted and stored successfully!

📋 Next steps:
1. Verify in Firebase Console > Firestore > wallet_secrets/btc-wallet-main
2. Delete this script or remove SEED_PHRASE from it
3. Deploy functions: firebase deploy --only functions
4. Set MASTER_ENCRYPTION_KEY in Functions config...
```

**⚠️ KRITISCH:** Nach erfolgreichem Speichern **SOFORT** die `SEED_PHRASE` aus dem Script entfernen oder Script löschen!

### 9. Admin Functions ENTFERNEN (Security!)

**WICHTIG:** Die Admin Functions (`adminStoreSeed`, `adminRetrieveSeed`, `adminRotateKey`) sind **Backdoors**. Nach dem Seed-Setup **MUSSEN** sie entfernt werden.

Bearbeite `functions/src/index.ts`:
- Lösche oder kommentiere die drei Admin Functions aus (ab Zeile ~335 bis ~410)
- **BEHALTEN:** Die CTF Functions (`ctfTimingTest`, `ctfPinCheck`, `ctfChallenge`, `ctfFinalVerify`)

```bash
# Funktionen neu bauen
cd functions && npm run build && cd ..
```

### 10. Firestore Rules deployen

```bash
firebase deploy --only firestore:rules
```

### 11. Firebase Hosting & Functions deployen

```bash
# Production Build (mit Obfuscation)
npm run build

# Alles deployen
firebase deploy
```

**Erwartete URLs:**
- Website: `https://try2breakme-btc.web.app` (oder deine Custom Domain)
- Functions: `https://europe-west1-try2breakme-btc.cloudfunctions.net/...`

---

## 🔍 Verification Checklist

Nach Deployment prüfen:

- [ ] Website lädt: `https://try2breakme-btc.web.app`
- [ ] ASCII Art "Try2BreakMe" sichtbar
- [ ] Wallet Balance wird angezeigt (Blockstream API)
- [ ] hCaptcha lädt (unsichtbar, alle 60s Refresh)
- [ ] Security Status Bar zeigt "Fingerprint OK", "hCaptcha Ready", "Requests: 3/3"
- [ ] Firestore: `wallet_secrets/btc-wallet-main` existiert mit `encryptedSeed`, `iv`, `authTag`
- [ ] Firestore Rules: Lesen nur Metadaten, KEIN Seed
- [ ] Functions Logs: Keine Errors

---

## 🎯 CTF Lösungspfad (für dich als Ersteller)

### Layer 1: Hidden Hint finden
```
1. Website besuchen
2. View Source (Ctrl+U) oder DevTools Elements
3. Suche nach: data-ctf-hint oder HTML Comment
4. Wert: base64 → reverse → dekodieren
5. Ergebnis: "ctf{d3bug_p4r4m_1s_ctf_2024}"
6. URL aufrufen: https://try2breakme-btc.web.app/?debug=ctf_2024
7. Debug Panel erscheint unten rechts
```

### Layer 2: Timing Attack auf PIN
```
1. Debug Panel: "Test Timing Attack Endpoint" klicken
2. Oder direkt: POST /api/ctf/timing-test mit {"pin": "000000"}
3. Statistische Analyse: ~1000 Requests pro Byte
4. Korrektes Byte = ~100μs länger (künstlicher Delay)
5. PIN finden: 739281
6. Hint erhalten: "The solution hashes to the secret document ID: SHA256(solution)[:32]"
```

### Layer 3: Challenge Solution
```
1. Solution: ctf{t1m1ng_4tt4ck_m4st3r}
2. SHA256(solution)[:32] berechnen
3. Doc ID: encrypted-seed-{hash}
4. Callable Function: ctfChallenge({solution: "ctf{t1m1ng_4tt4ck_m4st3r}"})
5. Erhält: encryptedSeed, iv, authTag, key_hint
6. Key Hint: "Key = SHA256(PIN + Challenge_Solution)"
```

### Layer 4: Seed Entschlüsseln
```
1. Key = SHA256("739281" + "ctf{t1m1ng_4tt4ck_m4st3r}")
2. AES-256-GCM Decrypt mit encryptedSeed, iv, authTag
3. Erhält: BIP39 Seed Phrase (12/24 Wörter)
4. Verification: ctfFinalVerify({seed_phrase: "..."})
5. Flag: CTF{BTC_W4LL3T_PR1Z3_CL41M3D_7HR0UGH_71M1NG_4TT4CK_4ND_CRYPTO_4N4LYS1S}
```

---

## 💰 Wallet Setup (DEIN Part)

### Echte BTC Adresse generieren
```bash
# Mit deinem Seed (Electrum, BlueWallet, Sparrow, Hardware Wallet)
# Derivation Path: m/84'/0'/0' (Native SegWit bc1q...)
# Erste Adresse: bc1q...
```

### BTC darauf senden
- Beliebigen Betrag (z.B. 0.001 BTC = ~$60)
- Transaktion bestätigen lassen

### In .env.local eintragen
```env
NEXT_PUBLIC_WALLET_ADDRESS=bc1qDEINE_ADRESSE
```

### Claim Prozess (für Finder)
1. Finder importiert Seed in eigene Wallet
2. Überweist BTC auf eigene Adresse
3. Reicht Claim ein: Adresse + TXID + Methode
4. Du prüfst manuell in Firebase Console → `claimants` Collection
5. Setzt `verified: true` → erscheint auf Leaderboard

---

## 🛡️ Security Features (Active)

| Feature | Status |
|---------|--------|
| AES-256-GCM Seed Encryption | ✅ |
| hCaptcha Invisible (Score ≥ 0.7) | ✅ |
| Rate Limit: 3 req/h → 24h Blacklist | ✅ |
| Device Fingerprinting (Canvas, WebGL, Audio, Fonts) | ✅ |
| HMAC-SHA256 Request Signing + Nonce | ✅ |
| Replay Protection (5min Window) | ✅ |
| JS Obfuscation (Control Flow Flattening, RC4, Self-Defending) | ✅ |
| Security Headers (CSP, HSTS, COOP, CORP, COEP) | ✅ |
| Firestore Rules: Maximal restriktiv | ✅ |
| Admin SDK Only für Secrets | ✅ |

---

## 🆘 Notfall-Recovery

```bash
# Seed abrufen (NUR IM NOTFALL - heavy audit log!)
firebase functions:call adminRetrieveSeed --data='{}'

# Dann: SOFORT Coins auf neue Adresse bewegen!
```

---

## 📁 Wichtige Dateien Übersicht

```
/workspace/app
├── functions/src/index.ts          # Alle Functions (Security + CTF)
├── src/app/page.tsx                # Frontend mit ASCII Art + CTF Engine
├── src/lib/ctf-engine.ts           # Layer 1: Hidden Debug Panel
├── src/lib/security.ts             # Fingerprinting, HMAC, hCaptcha
├── scripts/store-seed.js           # Admin: Seed einmalig speichern
├── firebase.json                   # Hosting + Security Headers
├── firestore.rules                 # Maximal restriktiv
├── .env.local                      # Frontend Config (NICHT committen!)
└── DEPLOYMENT_GUIDE.md             # Diese Datei
```

---

## ⚠️ Wichtige Warnungen

1. **Seed = Geld:** Wer den Seed hat, hat die Coins. Unwiderruflich.
2. **Admin Functions = Backdoor:** Nach Setup **MÜSSEN** sie raus.
3. **Master Key = Alles:** Nie in Repo, nur Functions Config.
4. **Free Tier Limits:** 125k Function Invocations/Monat, 50k Firestore Reads/Tag
5. **Legal:** "Wer findet, behält" kann rechtlich problematisch sein (Schenkung/Glücksspiel). Steuerlich: Fund = Einkommen.

---

## 🎉 Fertig!

Nach Deployment ist die Seite live unter deiner Domain. Die ASCII Art "Try2BreakMe" ist prominent sichtbar. Die CTF-Chain ist vollständig implementiert und versteckt.

Viel Erfolg! 🔐₿