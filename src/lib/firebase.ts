import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getFunctions, Functions, httpsCallable } from "firebase/functions";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "YOUR_API_KEY",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "YOUR_PROJECT.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "YOUR_PROJECT_ID",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "YOUR_PROJECT.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "YOUR_SENDER_ID",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "YOUR_APP_ID",
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let functions: Functions;

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) auth = getAuth(getFirebaseApp());
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (!db) db = getFirestore(getFirebaseApp());
  return db;
}

export function getFirebaseFunctions(): Functions {
  if (!functions) functions = getFunctions(getFirebaseApp(), "europe-west1");
  return functions;
}

// ==========================================
// CALLABLE WRAPPERS (accept security fields)
// ==========================================

export async function getWalletInfo(signedPayload: any) {
  const fn = httpsCallable(getFirebaseFunctions(), "getWalletInfo");
  return fn(signedPayload);
}

export async function getClaimants(signedPayload: any) {
  const fn = httpsCallable(getFirebaseFunctions(), "getClaimants");
  return fn(signedPayload);
}

export async function submitClaim(signedPayload: any) {
  const fn = httpsCallable(getFirebaseFunctions(), "submitClaim");
  return fn(signedPayload);
}

// ==========================================
// TYPES
// ==========================================

export interface WalletInfo {
  address: string;
  balanceBtc: string;
  balanceSat: number;
  unconfirmedSat: number;
  derivationPath: string;
  label: string;
  lastUpdated: string;
  security?: {
    remainingRequests: number;
    requiresCaptcha: boolean;
  };
}

export interface Claimant {
  id: string;
  address: string;
  txid: string;
  method: string;
  claimedAt: any;
  verified: boolean;
}