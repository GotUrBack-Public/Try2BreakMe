/**
 * Admin Script: Store BTC Seed Phrase in Firestore (ENCRYPTED)
 * 
 * RUN ONCE via: node scripts/store-seed.js
 * 
 * Prerequisites:
 * 1. Firebase Admin SDK configured (GOOGLE_APPLICATION_CREDENTIALS)
 * 2. MASTER_ENCRYPTION_KEY in .env (32 bytes base64)
 * 3. Admin UID in script matches your Firebase Auth UID
 */

require("dotenv").config({ path: ".env.local" });
const admin = require("firebase-admin");
const crypto = require("crypto");

// ==========================================
// CONFIG - EDIT THESE
// ==========================================
const ADMIN_UID = "YOUR_FIREBASE_AUTH_UID_HERE"; // Get from Firebase Console > Authentication
const SEED_PHRASE = "your 12 or 24 word bip39 seed phrase here"; // REPLACE!
const DERIVATION_PATH = "m/84'/0'/0'"; // Native SegWit
const LABEL = "BTC Wallet Prize";
// ==========================================

const MASTER_KEY_B64 = process.env.MASTER_ENCRYPTION_KEY;
if (!MASTER_KEY_B64) {
  console.error("❌ MASTER_ENCRYPTION_KEY not set in .env.local");
  console.log("Generate one: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"");
  process.exit(1);
}

if (ADMIN_UID === "YOUR_FIREBASE_AUTH_UID_HERE") {
  console.error("❌ Set ADMIN_UID in script");
  process.exit(1);
}

if (SEED_PHRASE === "your 12 or 24 word bip39 seed phrase here") {
  console.error("❌ Set SEED_PHRASE in script");
  process.exit(1);
}

// Validate seed
const words = SEED_PHRASE.trim().split(/\s+/);
if (![12, 15, 18, 21, 24].includes(words.length)) {
  console.error(`❌ Invalid BIP39 word count: ${words.length} (expected 12, 15, 18, 21, 24)`);
  process.exit(1);
}

async function encryptSeed(seedPhrase, masterKeyB64) {
  const masterKey = Buffer.from(masterKeyB64, "base64");
  const key = await crypto.subtle.importKey(
    "raw", masterKey, { name: "AES-GCM" }, false, ["encrypt"]
  );
  
  const iv = crypto.randomBytes(12);
  const encoded = Buffer.from(seedPhrase, "utf8");
  
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const encryptedArray = new Uint8Array(encrypted);
  const authTag = encryptedArray.slice(-16);
  const ciphertext = encryptedArray.slice(0, -16);
  
  return {
    encryptedSeed: Buffer.from(ciphertext).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
    authTag: Buffer.from(authTag).toString("base64"),
  };
}

async function main() {
  console.log("🔐 Initializing Firebase Admin...");
  
  // Initialize Admin SDK
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }
  
  const db = admin.firestore();
  
  console.log("🔒 Encrypting seed phrase...");
  const { encryptedSeed, iv, authTag } = await encryptSeed(SEED_PHRASE, MASTER_KEY_B64);
  
  console.log("💾 Storing in Firestore (Admin SDK bypasses rules)...");
  await db.collection("wallet_secrets").doc("btc-wallet-main").set({
    encryptedSeed,
    iv,
    authTag,
    derivationPath: DERIVATION_PATH,
    label: LABEL,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    version: 1,
  }, { merge: true });
  
  // Audit log
  await db.collection("audit_log").add({
    action: "seed_stored_via_script",
    adminUid: ADMIN_UID,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    metadata: { derivationPath: DERIVATION_PATH, label: LABEL },
  });
  
  console.log("✅ Seed encrypted and stored successfully!");
  console.log("");
  console.log("📋 Next steps:");
  console.log("1. Verify in Firebase Console > Firestore > wallet_secrets/btc-wallet-main");
  console.log("2. Delete this script or remove SEED_PHRASE from it");
  console.log("3. Deploy functions: firebase deploy --only functions");
  console.log("4. Set MASTER_ENCRYPTION_KEY in Functions config:");
  console.log(`   firebase functions:config:set master_encryption_key="${MASTER_KEY_B64}"`);
  console.log("5. Deploy frontend: npm run deploy");
}

main().catch(console.error);