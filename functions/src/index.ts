import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { z } from "zod";

admin.initializeApp();
const db = admin.firestore();

// ==========================================
// CONFIG - MAXIMUM SECURITY
// ==========================================
const ADMIN_UIDS = ["YOUR_ADMIN_UID_HERE"]; // REPLACE!
const HCAPTCHA_SECRET_KEY = process.env.HCAPTCHA_SECRET_KEY || "YOUR_HCAPTCHA_SECRET";
const SECRETS_COLLECTION = "wallet_secrets";
const METADATA_DOC_ID = "btc-wallet-main";

// SECURITY CONSTANTS
const MAX_REQUESTS_PER_WINDOW = 3;           // 3 requests max
const BLACKLIST_WINDOW_MS = 60 * 60 * 1000;  // 1 hour window
const BLACKLIST_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hour blacklist
const CAPTCHA_REQUIRED_AFTER = 1;            // Captcha after 1 request
const REPLAY_WINDOW_MS = 5 * 60 * 1000;      // 5 min replay protection
const HCAPTCHA_SCORE_THRESHOLD = 0.7;        // hCaptcha score threshold

// ==========================================
// SCHEMAS
// ==========================================
const StoreSeedSchema = z.object({
  seedPhrase: z.string().min(12).max(200),
  derivationPath: z.string().default("m/84'/0'/0'"),
  label: z.string().optional(),
});

const GetWalletInfoSchema = z.object({
  address: z.string().regex(/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/),
  // Security fields
  fingerprint: z.string().length(64).optional(),
  timestamp: z.number().optional(),
  nonce: z.string().length(32).optional(),
  signature: z.string().length(64).optional(),
  captchaToken: z.string().optional(),
});

const SubmitClaimSchema = z.object({
  address: z.string().regex(/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/),
  txid: z.string().length(64),
  method: z.string().max(200),
  fingerprint: z.string().length(64).optional(),
  timestamp: z.number().optional(),
  nonce: z.string().length(32).optional(),
  signature: z.string().length(64).optional(),
  captchaToken: z.string().optional(),
});

// ==========================================
// SECURITY UTILITIES
// ==========================================

interface SecurityCheckResult {
  allowed: boolean;
  reason?: string;
  requiresCaptcha: boolean;
  blacklisted: boolean;
  remainingRequests: number;
}

/**
 * Check and update rate limit with aggressive blacklisting
 * Tracks by IP + Fingerprint combo
 */
async function checkSecurity(
  ip: string,
  fingerprint?: string,
  captchaToken?: string,
  timestamp?: number,
  nonce?: string,
  signature?: string
): Promise<SecurityCheckResult> {
  const identifier = fingerprint ? `${ip}:${fingerprint}` : ip;
  const now = Date.now();
  
  // Check blacklist first
  const blacklistRef = db.collection("security_blacklist").doc(identifier);
  const blacklistDoc = await blacklistRef.get();
  
  if (blacklistDoc.exists) {
    const data = blacklistDoc.data()!;
    if (data.expiresAt > now) {
      return {
        allowed: false,
        reason: `Blacklisted until ${new Date(data.expiresAt).toISOString()}. Reason: ${data.reason}`,
        requiresCaptcha: false,
        blacklisted: true,
        remainingRequests: 0,
      };
    } else {
      // Expired - clean up
      await blacklistRef.delete();
    }
  }
  
  // Check replay protection (nonce reuse)
  if (nonce && timestamp) {
    if (now - timestamp > REPLAY_WINDOW_MS) {
      return { allowed: false, reason: "Request timestamp too old", requiresCaptcha: false, blacklisted: false, remainingRequests: 0 };
    }
    
    const nonceRef = db.collection("security_nonces").doc(nonce);
    const nonceDoc = await nonceRef.get();
    if (nonceDoc.exists) {
      return { allowed: false, reason: "Replay attack detected (nonce reused)", requiresCaptcha: false, blacklisted: false, remainingRequests: 0 };
    }
    // Store nonce with TTL
    await nonceRef.set({ usedAt: admin.firestore.FieldValue.serverTimestamp(), identifier });
  }
  
  // Verify hCaptcha if provided
  let captchaValid = false;
  if (captchaToken) {
    captchaValid = await verifyHCaptcha(captchaToken, ip);
  }
  
  // Get request counter
  const counterRef = db.collection("security_counters").doc(identifier);
  const counterDoc = await counterRef.get();
  
  let count = 0;
  let windowStart = now;
  
  if (counterDoc.exists) {
    const data = counterDoc.data()!;
    count = data.count || 0;
    windowStart = data.windowStart || now;
    
    // Reset window if expired
    if (now - windowStart > BLACKLIST_WINDOW_MS) {
      count = 0;
      windowStart = now;
    }
  }
  
  const remainingRequests = Math.max(0, MAX_REQUESTS_PER_WINDOW - count);
  const requiresCaptcha = count >= CAPTCHA_REQUIRED_AFTER && !captchaValid;
  
  // If over limit and no valid captcha -> BLACKLIST
  if (count >= MAX_REQUESTS_PER_WINDOW && !captchaValid) {
    await blacklistRef.set({
      identifier,
      ip,
      fingerprint,
      reason: `Exceeded ${MAX_REQUESTS_PER_WINDOW} requests per ${BLACKLIST_WINDOW_MS/1000/60}min without valid captcha`,
      count,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: now + BLACKLIST_DURATION_MS,
    });
    
    return {
      allowed: false,
      reason: `Rate limit exceeded. Blacklisted for ${BLACKLIST_DURATION_MS/1000/60/60}h.`,
      requiresCaptcha: false,
      blacklisted: true,
      remainingRequests: 0,
    };
  }
  
  // Increment counter
  await counterRef.set({
    count: count + 1,
    windowStart,
    lastRequest: admin.firestore.FieldValue.serverTimestamp(),
    ip,
    fingerprint,
  });
  
  return {
    allowed: true,
    requiresCaptcha,
    blacklisted: false,
    remainingRequests,
  };
}

async function verifyHCaptcha(token: string, ip: string): Promise<boolean> {
  if (!HCAPTCHA_SECRET_KEY || HCAPTCHA_SECRET_KEY === "YOUR_HCAPTCHA_SECRET") {
    console.warn("hCaptcha secret not configured, skipping verification");
    return true; // Fail open for development
  }
  
  try {
    const response = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: HCAPTCHA_SECRET_KEY,
        response: token,
        remoteip: ip,
      }),
    });
    
    const data = await response.json() as { success: boolean; score?: number };
    return data.success === true && (data.score || 1) >= HCAPTCHA_SCORE_THRESHOLD;
  } catch (error) {
    console.error("hCaptcha verification failed:", error);
    return false;
  }
}

async function encryptSeed(seedPhrase: string, masterKeyB64: string) {
  const masterKey = Uint8Array.from(atob(masterKeyB64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", masterKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(seedPhrase);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const encryptedArray = new Uint8Array(encrypted);
  const authTag = encryptedArray.slice(-16);
  const ciphertext = encryptedArray.slice(0, -16);
  return {
    encryptedSeed: btoa(String.fromCharCode(...ciphertext)),
    iv: btoa(String.fromCharCode(...iv)),
    authTag: btoa(String.fromCharCode(...authTag)),
  };
}

async function decryptSeed(encryptedSeedB64: string, ivB64: string, authTagB64: string, masterKeyB64: string) {
  const masterKey = Uint8Array.from(atob(masterKeyB64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", masterKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const encryptedBytes = Uint8Array.from(atob(encryptedSeedB64), c => c.charCodeAt(0));
  const authTagBytes = Uint8Array.from(atob(authTagB64), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const combined = new Uint8Array(encryptedBytes.length + authTagBytes.length);
  combined.set(encryptedBytes);
  combined.set(authTagBytes, encryptedBytes.length);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, combined);
  return new TextDecoder().decode(decrypted);
}

async function fetchBalance(address: string) {
  try {
    const response = await fetch(`https://blockstream.info/api/address/${address}`);
    if (!response.ok) throw new Error("Blockstream API error");
    const data = await response.json() as { chain_stats: { funded_txo_sum: number; spent_txo_sum: number }; mempool_stats: { funded_txo_sum: number; spent_txo_sum: number } };
    return { confirmed: data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum, unconfirmed: data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum };
  } catch { return { confirmed: 0, unconfirmed: 0 }; }
}

// ==========================================
// CALLABLE FUNCTIONS (with Security)
// ==========================================

export const getWalletInfo = functions.https.onCall(async (request) => {
  // SECURITY CHECK
  const ip = request.rawRequest.ip || "unknown";
  const data = request.data as Record<string, any>;
  const { fingerprint, timestamp, nonce, signature, captchaToken } = data;
  
  const security = await checkSecurity(ip, fingerprint, captchaToken, timestamp, nonce, signature);
  if (!security.allowed) {
    throw new functions.https.HttpsError("permission-denied", security.reason || "Security check failed");
  }
  
  // Validate request
  const parseResult = GetWalletInfoSchema.safeParse(data);
  if (!parseResult.success) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid request format");
  }
  
  const { address } = parseResult.data;
  const balance = await fetchBalance(address);
  
  const metaDoc = await db.collection(SECRETS_COLLECTION).doc(METADATA_DOC_ID).get();
  const metadata = metaDoc.exists ? metaDoc.data() : {};
  
  return {
    address,
    balanceBtc: (balance.confirmed / 1e8).toFixed(8),
    balanceSat: balance.confirmed,
    unconfirmedSat: balance.unconfirmed,
    derivationPath: metadata?.derivationPath || "m/84'/0'/0'",
    label: metadata?.label || "BTC Wallet Prize",
    lastUpdated: new Date().toISOString(),
    // Security info for client
    security: {
      remainingRequests: security.remainingRequests,
      requiresCaptcha: security.requiresCaptcha,
    },
  };
});

export const submitClaim = functions.https.onCall(async (request) => {
  const ip = request.rawRequest.ip || "unknown";
  const data = request.data as Record<string, any>;
  const { fingerprint, timestamp, nonce, signature, captchaToken } = data;
  
  const security = await checkSecurity(ip, fingerprint, captchaToken, timestamp, nonce, signature);
  if (!security.allowed) {
    throw new functions.https.HttpsError("permission-denied", security.reason || "Security check failed");
  }
  
  const parseResult = SubmitClaimSchema.safeParse(data);
  if (!parseResult.success) {
    throw new functions.https.HttpsError("invalid-argument", parseResult.error.message);
  }
  
  const { address, txid, method } = parseResult.data;
  const claimantId = `${address}_${Date.now()}`;
  
  await db.collection("claimants").doc(claimantId).set({
    address,
    txid,
    method,
    claimedAt: admin.firestore.FieldValue.serverTimestamp(),
    verified: false,
    ip,
    fingerprint,
  });
  
  return { success: true, message: "Claim submitted. Manual verification required.", claimantId, security: { remainingRequests: security.remainingRequests } };
});

export const getClaimants = functions.https.onCall(async (request) => {
  const ip = request.rawRequest.ip || "unknown";
  const data = request.data as Record<string, any>;
  const { fingerprint, timestamp, nonce, signature, captchaToken } = data;
  
  const security = await checkSecurity(ip, fingerprint, captchaToken, timestamp, nonce, signature);
  if (!security.allowed) {
    throw new functions.https.HttpsError("permission-denied", security.reason || "Security check failed");
  }
  
  const snapshot = await db.collection("claimants").where("verified", "==", true).orderBy("claimedAt", "desc").limit(20).get();
  return { claimants: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), security: { remainingRequests: security.remainingRequests } };
});

// ==========================================
// ADMIN FUNCTIONS
// ==========================================

export const adminStoreSeed = functions.https.onCall(async (request) => {
  if (!request.auth || !ADMIN_UIDS.includes(request.auth.uid)) {
    throw new functions.https.HttpsError("permission-denied", "Admin only");
  }
  
  const parseResult = StoreSeedSchema.safeParse(request.data);
  if (!parseResult.success) {
    throw new functions.https.HttpsError("invalid-argument", parseResult.error.message);
  }
  
  const { seedPhrase, derivationPath, label } = parseResult.data;
  const words = seedPhrase.trim().split(/\s+/);
  if (![12, 15, 18, 21, 24].includes(words.length)) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid BIP39 word count");
  }
  
  const masterKeyB64 = process.env.MASTER_ENCRYPTION_KEY;
  if (!masterKeyB64) {
    throw new functions.https.HttpsError("failed-precondition", "MASTER_ENCRYPTION_KEY not configured");
  }
  
  const { encryptedSeed, iv, authTag } = await encryptSeed(seedPhrase, masterKeyB64);
  
  await db.collection(SECRETS_COLLECTION).doc(METADATA_DOC_ID).set({ encryptedSeed, iv, authTag, derivationPath, label: label || "BTC Wallet Prize", createdAt: admin.firestore.FieldValue.serverTimestamp(), version: 1 }, { merge: true });
  
  await db.collection("audit_log").add({ action: "seed_stored", adminUid: request.auth.uid, timestamp: admin.firestore.FieldValue.serverTimestamp(), metadata: { derivationPath, label } });
  
  return { success: true, message: "Seed encrypted and stored. DELETE THIS FUNCTION!", derivationPath };
});

export const adminRetrieveSeed = functions.https.onCall(async (request) => {
  if (!request.auth || !ADMIN_UIDS.includes(request.auth.uid)) {
    throw new functions.https.HttpsError("permission-denied", "Admin only");
  }
  
  const masterKeyB64 = process.env.MASTER_ENCRYPTION_KEY;
  if (!masterKeyB64) throw new functions.https.HttpsError("failed-precondition", "MASTER_ENCRYPTION_KEY not configured");
  
  const doc = await db.collection(SECRETS_COLLECTION).doc(METADATA_DOC_ID).get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "No seed stored");
  
  const { encryptedSeed, iv, authTag } = doc.data()!;
  const seedPhrase = await decryptSeed(encryptedSeed, iv, authTag, masterKeyB64);
  
  await db.collection("audit_log").add({ action: "seed_retrieved", adminUid: request.auth.uid, timestamp: admin.firestore.FieldValue.serverTimestamp(), warning: "SEED ACCESSED - COINS COMPROMISED IF NOT MOVED" });
  
  return { seedPhrase };
});

export const adminRotateKey = functions.https.onCall(async (request) => {
  if (!request.auth || !ADMIN_UIDS.includes(request.auth.uid)) {
    throw new functions.https.HttpsError("permission-denied", "Admin only");
  }
  
  const { newMasterKeyB64 } = request.data as { newMasterKeyB64: string };
  if (!newMasterKeyB64) throw new functions.https.HttpsError("invalid-argument", "newMasterKeyB64 required");
  
  const oldMasterKeyB64 = process.env.MASTER_ENCRYPTION_KEY;
  if (!oldMasterKeyB64) throw new functions.https.HttpsError("failed-precondition", "Old key not configured");
  
  const doc = await db.collection(SECRETS_COLLECTION).doc(METADATA_DOC_ID).get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "No seed stored");
  
  const { encryptedSeed, iv, authTag } = doc.data()!;
  const seedPhrase = await decryptSeed(encryptedSeed, iv, authTag, oldMasterKeyB64);
  const { encryptedSeed: newEncrypted, iv: newIv, authTag: newAuthTag } = await encryptSeed(seedPhrase, newMasterKeyB64);
  
  await db.collection(SECRETS_COLLECTION).doc(METADATA_DOC_ID).update({ encryptedSeed: newEncrypted, iv: newIv, authTag: newAuthTag, rotatedAt: admin.firestore.FieldValue.serverTimestamp() });
  await db.collection("audit_log").add({ action: "key_rotated", adminUid: request.auth.uid, timestamp: admin.firestore.FieldValue.serverTimestamp() });
  
  return { success: true, message: "Key rotated. Update Functions config!" };
});

export const adminClearBlacklist = functions.https.onCall(async (request) => {
  if (!request.auth || !ADMIN_UIDS.includes(request.auth.uid)) {
    throw new functions.https.HttpsError("permission-denied", "Admin only");
  }
  
  const { identifier } = request.data as { identifier: string };
  if (identifier) {
    await db.collection("security_blacklist").doc(identifier).delete();
    await db.collection("security_counters").doc(identifier).delete();
    return { success: true, message: `Cleared blacklist for ${identifier}` };
  }
  
  // Clear all expired
  const now = Date.now();
  const batch = db.batch();
  const blacklistSnap = await db.collection("security_blacklist").where("expiresAt", "<", now).get();
  blacklistSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  
  return { success: true, message: `Cleared ${blacklistSnap.size} expired blacklist entries` };
});