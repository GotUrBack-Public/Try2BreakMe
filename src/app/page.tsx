"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getWalletInfo, getClaimants, submitClaim, type WalletInfo, type Claimant } from "@/lib/firebase";
import { generateFingerprint, signRequest, initHCaptcha, getHCaptchaToken, resetHCaptcha, isLocallyBlacklisted, setLocalBlacklist } from "@/lib/security";
import { initCTFLayer1 } from "@/lib/ctf-engine";

// ==========================================
// CONFIG
// ==========================================
const WALLET_ADDRESS = process.env.NEXT_PUBLIC_WALLET_ADDRESS || "bc1qyour_wallet_address_here";
const WALLET_LABEL = process.env.NEXT_PUBLIC_WALLET_LABEL || "BTC Wallet Prize";
const HCAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || "YOUR_HCAPTCHA_SITE_KEY";
const HMAC_SECRET = process.env.NEXT_PUBLIC_HMAC_SECRET || "client-secret-change-in-production";

// ASCII Art for "Try2BreakMe"
const TRY2BREAKME_ASCII = `
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠖⠃⠀⠀⠀⡁⠀⠀⠀⠀⠀⠐⠆⠀⠀⠀⠀⠀⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⢔⡤⠊⠁⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⠀⠀⠀⠁⠀⠀⠘⠁⢀⠀⠀⠀⠀⢈⠓⠂⠠⡄⠀⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⣶⠿⠞⠋⠁⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠒⠁⠀⠠⡚⠁⢀⣙⣀⣈⡩⠬⢁⠀⢑⠶⠤⡆⠤⡀⠀⠀⠀⠀⠀⠀⢀⠴⢲⣋⣽⣷⠟⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⠀⢠⠀⠀⣶⠃⠗⣡⣶⣮⣿⡿⠿⠿⢿⣿⣷⣶⣤⣤⠤⠴⠦⠬⣤⣤⠄⣉⠉⠝⢲⣿⡷⠻⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⠀⠀⠀⠁⡀⡸⠁⣰⣿⡿⠛⠋⣁⡀⠤⠤⢄⡀⠈⠛⢯⣿⣟⣾⣶⣶⣮⣭⣵⣾⣿⣟⠿⠉⢨⠖⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠀⢠⠳⡧⣻⡿⠋⢀⠒⠉⠀⠀⠀⠀⠀⠀⠉⠢⠀⠀⠙⠛⣻⣿⣿⣿⢿⣿⣿⠟⡱⠖⠊⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⢠⣧⠓⣾⣿⠁⠀⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⢦⣠⣾⣿⠿⣿⣿⣿⡿⣫⠏⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⠂⢃⣸⣿⠇⢠⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⣴⣿⠟⢿⠁⠸⡿⣿⣯⡶⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⢘⡄⠘⣿⣿⠀⠸⡀⠀⠀⠀⠀⠀⢀⣀⣴⣾⣿⡿⡟⡋⠐⡇⠀⢸⣿⣿⠃⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢡⠘⢰⣿⡿⡆⠀⣇⠀⣀⣠⣤⣶⣿⢷⢟⠻⠀⠈⠀⠀⠀⡇⠀⣼⣿⣿⠂⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠔⢀⡴⢯⣾⠟⡏⢀⣠⣿⣿⣿⣟⢟⡋⠅⠘⠉⠀⠀⠀⠀⢀⠀⠁⢠⣿⣟⠃⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠞⣻⣷⡿⢙⣩⣶⡿⠿⠛⠉⠑⢡⡁⠀⠀⠀⠀⠀⠀⢀⠔⠁⠀⣰⣿⣿⡟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣡⣾⣥⣾⢫⡦⠾⠛⠙⠉⠀⠀⢀⣀⠀⠈⠙⠓⠦⠤⠤⠀⠘⠁⢀⡤⣾⡿⠏⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠔⣴⣾⣿⣿⢟⢝⠢⠃⢀⣤⢴⣾⣮⣷⣶⢿⣶⡤⣐⡀⠀⣠⣤⢶⣪⣿⣿⡿⠟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⡀⣦⣾⡿⡛⠵⠺⢈⡠⠶⠿⠥⠥⡭⠉⠉⢱⡛⠻⠿⣿⣿⣿⣿⣿⠿⠿⠿⠟⠭⠛⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⢀⢴⠕⣋⠝⠕⠐⠀⠔⠉⠀⠀⠀⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠁⠉⠁⠁⠁⠁⠈⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⢀⣠⠁⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
`;

// ==========================================
// MAIN COMPONENT
// ==========================================

export default function WalletDisplayPage() {
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [claimants, setClaimants] = useState<Claimant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [securityInfo, setSecurityInfo] = useState<{ remainingRequests: number; requiresCaptcha: boolean } | null>(null);
  
  // Security state
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [fingerprinting, setFingerprinting] = useState(true);
  const [hcaptchaReady, setHcaptchaReady] = useState(false);
  const [blacklisted, setBlacklisted] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [lastCaptchaTime, setLastCaptchaTime] = useState<number>(0);
  
  // Claim form
  const [claimAddress, setClaimAddress] = useState("");
  const [claimTxid, setClaimTxid] = useState("");
  const [claimMethod, setClaimMethod] = useState("Moved funds to own wallet");
  const [claimSubmitting, setClaimSubmitting] = useState(false);

  // Refs
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const captchaIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ==========================================
  // INITIALIZATION
  // ==========================================

  useEffect(() => {
    initializeSecurity();
    
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      if (captchaIntervalRef.current) clearInterval(captchaIntervalRef.current);
    };
  }, []);

  const initializeSecurity = async () => {
    // Check local blacklist
    if (isLocallyBlacklisted()) {
      setBlacklisted(true);
      setError("Sie sind lokal auf der Blacklist. Warten Sie 24 Stunden oder löschen Sie localStorage.");
      setLoading(false);
      return;
    }

    // Generate fingerprint
    setFingerprinting(true);
    try {
      const { fingerprint: fp } = await generateFingerprint();
      setFingerprint(fp);
      console.log("[Security] Fingerprint generated:", fp.substring(0, 16) + "...");
    } catch (err) {
      console.error("[Security] Fingerprint failed:", err);
    } finally {
      setFingerprinting(false);
    }

    // Initialize hCaptcha
    try {
      await initHCaptcha(HCAPTCHA_SITE_KEY);
      setHcaptchaReady(true);
      console.log("[Security] hCaptcha initialized");

      // Force captcha refresh every 60 seconds
      captchaIntervalRef.current = setInterval(async () => {
        if (hcaptchaReady) {
          try {
            resetHCaptcha();
            const token = await getHCaptchaToken();
            setCaptchaToken(token);
            setLastCaptchaTime(Date.now());
            console.log("[Security] Auto-captcha refreshed");
          } catch (e) {
            console.warn("[Security] Auto-captcha failed:", e);
          }
        }
      }, 60_000);
    } catch (err) {
      console.error("[Security] hCaptcha init failed:", err);
    }

    // Initialize CTF Engine (hidden vulnerability chain)
    try {
      initCTFLayer1();
      console.log("[CTF] Engine initialized");
    } catch (err) {
      console.error("[CTF] Init failed:", err);
    }

    // Load data
    await loadWalletInfo();
    await loadClaimants();

    // Refresh interval
    refreshIntervalRef.current = setInterval(() => {
      loadWalletInfo();
      loadClaimants();
    }, 60_000);
  };

  // ==========================================
  // SECURE API CALLS
  // ==========================================

  const createSignedPayload = useCallback(async (payload: any) => {
    if (!fingerprint) throw new Error("Fingerprint not ready");
    
    // Get fresh captcha token if needed
    let token = captchaToken;
    if (!token || Date.now() - lastCaptchaTime > 55_000) {
      try {
        token = await getHCaptchaToken();
        setCaptchaToken(token);
        setLastCaptchaTime(Date.now());
      } catch (e) {
        console.warn("[Security] Captcha refresh failed:", e);
      }
    }
    
    return signRequest(payload, fingerprint, HMAC_SECRET);
  }, [fingerprint, captchaToken, lastCaptchaTime]);

  const loadWalletInfo = async () => {
    if (blacklisted) return;
    
    try {
      const signed = await createSignedPayload({ address: WALLET_ADDRESS });
      const result = await getWalletInfo(signed);
      const data = result.data as WalletInfo & { security?: { remainingRequests: number; requiresCaptcha: boolean } };
      
      setWalletInfo(data);
      if (data.security) setSecurityInfo(data.security);
      setError(null);
    } catch (err: any) {
      const msg = err.message || "Fehler beim Laden";
      setError(msg);
      
      // Check for blacklist response
      if (msg.includes("Blacklisted") || msg.includes("blacklist")) {
        setBlacklisted(true);
        setLocalBlacklist();
      }
    } finally {
      setLoading(false);
    }
  };

  const loadClaimants = async () => {
    if (blacklisted) return;
    
    try {
      const signed = await createSignedPayload({});
      const result = await getClaimants(signed);
      const data = result.data as { claimants: Claimant[]; security?: { remainingRequests: number } };
      setClaimants(data.claimants);
      if (data.security) setSecurityInfo(prev => prev ? { ...prev, remainingRequests: data.security!.remainingRequests } : null);
    } catch (err) {
      console.error("Failed to load claimants:", err);
    }
  };

  const handleClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimAddress || !claimTxid || claimSubmitting || blacklisted) return;

    setClaimSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const signed = await createSignedPayload({ address: claimAddress, txid: claimTxid, method: claimMethod });
      const result = await submitClaim(signed);
      const response = result.data as { success: boolean; message: string; security?: { remainingRequests: number } };
      
      if (response.success) {
        setSuccess("Claim eingereicht! Wird manuell verifiziert.");
        setClaimAddress("");
        setClaimTxid("");
        if (response.security) setSecurityInfo(prev => prev ? { ...prev, remainingRequests: response.security!.remainingRequests } : null);
        loadClaimants();
      } else {
        setError(response.message);
      }
    } catch (err: any) {
      const msg = err.message || "Fehler beim Einreichen";
      setError(msg);
      if (msg.includes("Blacklisted")) {
        setBlacklisted(true);
        setLocalBlacklist();
      }
    } finally {
      setClaimSubmitting(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setSuccess(`${label} kopiert!`);
    setTimeout(() => setSuccess(null), 2000);
  };

  const formatSat = (sat: number) => {
    if (sat >= 1e8) return `${(sat / 1e8).toFixed(8)} BTC`;
    if (sat >= 1e3) return `${(sat / 1e3).toFixed(1)} kSat`;
    return `${sat} Sat`;
  };

  // ==========================================
  // RENDER
  // ==========================================

  if (loading && !walletInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-cyan-500 border-t-transparent mx-auto"></div>
          <p className="text-slate-400">Initialisiere Security-System...</p>
          {fingerprinting && <p className="text-slate-500 text-sm">Generiere Device-Fingerprint...</p>}
          {!hcaptchaReady && <p className="text-slate-500 text-sm">Lade hCaptcha...</p>}
        </div>
      </div>
    );
  }

  if (blacklisted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <div className="card-elevated border-red-500/30 bg-red-500/5 max-w-md text-center">
          <div className="text-6xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-red-400 mb-2">Zugang verweigert</h1>
          <p className="text-slate-300 mb-4">
            Ihre IP/Fingerprint wurde aufgrund von zu vielen Requests ohne gültiges Captcha auf die Blacklist gesetzt.
          </p>
          <p className="text-slate-500 text-sm mb-6">
            Blacklist-Dauer: 24 Stunden. Versuchen Sie es später erneut.
          </p>
          <button
            onClick={() => { localStorage.clear(); window.location.reload(); }}
            className="btn-secondary"
          >
            LocalStorage löschen & Neuladen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Security Status Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-2">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <span className={`badge ${fingerprint ? "badge-success" : "badge-warning"}`}>
              {fingerprint ? "🔐 Fingerprint OK" : "⏳ Fingerprint..."}
            </span>
            <span className={`badge ${hcaptchaReady ? "badge-success" : "badge-warning"}`}>
              {hcaptchaReady ? "🛡️ hCaptcha Ready" : "⏳ hCaptcha..."}
            </span>
            {securityInfo && (
              <>
                <span className={`badge ${securityInfo.requiresCaptcha ? "badge-danger" : "badge-info"}`}>
                  📊 Requests: {securityInfo.remainingRequests}/3
                </span>
                {securityInfo.requiresCaptcha && (
                  <span className="badge badge-warning animate-pulse">🔄 Captcha erforderlich</span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            {lastCaptchaTime > 0 && (
              <span className="text-xs font-mono">
                Next Captcha: {Math.max(0, 60 - Math.floor((Date.now() - lastCaptchaTime) / 1000))}s
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-16 z-10 pt-4">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔐</span>
            <h1 className="font-bold text-2xl bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              {WALLET_LABEL}
            </h1>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="badge-success">Live Balance</span>
            <span className="badge-info">Maximum Security</span>
          </div>
        </div>
      </header>

      {/* ASCII Art Banner */}
      <section className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 overflow-x-auto">
          <pre className="font-mono text-xs text-cyan-400 leading-none select-all text-center">
{TRY2BREAKME_ASCII}
          </pre>
          <p className="text-center text-slate-500 text-sm mt-4">
            Try2BreakMe — Can you break the chain?
          </p>
        </div>
      </section>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Error/Success Banner */}
        {(error || success) && (
          <div className={`fixed top-28 left-4 right-4 z-50 animate-slide-up ${error ? "bg-red-500/20 border-red-500/30 text-red-400" : "bg-green-500/20 border-green-500/30 text-green-400"} border rounded-xl p-4`}>
            {error || success}
          </div>
        )}

        {/* Wallet Card */}
        <section className="card-elevated border-cyan-500/30 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Wallet Balance</h2>
            <button
              onClick={loadWalletInfo}
              disabled={loading}
              className="btn-secondary text-sm"
            >
              {loading ? "Aktualisiere..." : "🔄 Refresh"}
            </button>
          </div>

          {/* Main Balance */}
          <div className="text-center py-4">
            <div className="text-5xl font-mono font-bold text-cyan-400 mb-2">
              {walletInfo?.balanceBtc || "0.00000000"} BTC
            </div>
            <div className="text-slate-400 text-sm">
              {walletInfo ? formatSat(walletInfo.balanceSat) : "—"} confirmed
              {walletInfo && walletInfo.unconfirmedSat > 0 && (
                <>
                  <span className="mx-2">•</span>
                  <span className="text-yellow-400">+{formatSat(walletInfo.unconfirmedSat)} unconfirmed</span>
                </>
              )}
            </div>
            <div className="text-slate-500 text-xs mt-2">
              Zuletzt: {walletInfo ? new Date(walletInfo.lastUpdated).toLocaleString("de-DE") : "—"}
            </div>
          </div>

          {/* Address */}
          <div className="border-t border-slate-800 pt-6">
            <h3 className="text-lg font-medium mb-3">Empfangsadresse (Native SegWit)</h3>
            <div className="flex items-center gap-3">
              <code className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 font-mono text-base break-all">
                {WALLET_ADDRESS}
              </code>
              <button
                onClick={() => copyToClipboard(WALLET_ADDRESS, "Adresse")}
                className="btn-secondary whitespace-nowrap"
              >
                📋 Kopieren
              </button>
            </div>
          </div>

          {/* Derivation Info */}
          <div className="border-t border-slate-800 pt-6 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-slate-500">Derivation Path</div>
              <div className="font-mono text-cyan-400">{walletInfo?.derivationPath || "m/84'/0'/0'"}</div>
            </div>
            <div>
              <div className="text-slate-500">Address Type</div>
              <div className="font-mono text-cyan-400">Native SegWit (bc1q...)</div>
            </div>
          </div>

          {/* Security Notice */}
          <div className="border-t border-slate-800 pt-4 border-amber-500/30 bg-amber-500/5 rounded-lg p-4">
            <h4 className="text-amber-400 font-bold mb-2 flex items-center gap-2">
              ⚠️ Maximum Security Active
            </h4>
            <ul className="text-slate-300 text-sm space-y-1">
              <li>• Seed: AES-256-GCM verschlüsselt in Firestore (Admin SDK only)</li>
              <li>• Rate Limit: 3 Requests/IP+Fingerprint → 24h Blacklist</li>
              <li>• hCaptcha: Unsichtbar, Auto-Refresh alle 60s, Score ≥ 0.7</li>
              <li>• Request Signing: HMAC-SHA256 + Nonce + Timestamp (Replay-Schutz)</li>
              <li>• Device Fingerprinting: Canvas, WebGL, Audio, Fonts, Plugins</li>
              <li>• Build: JavaScript Obfuscation (Control Flow Flattening, Dead Code, Self-Defending)</li>
            </ul>
          </div>
        </section>

        {/* Claim Section */}
        <section className="card-elevated">
          <h2 className="text-2xl font-bold mb-6">💰 Claim einreichen</h2>
          <p className="text-slate-400 mb-6">
            BTC auf eigene Adresse transferiert? Claim einreichen (manuelle Verifikation):
          </p>

          <form onSubmit={handleClaimSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Deine BTC Adresse (bc1q...)</label>
              <input
                type="text"
                value={claimAddress}
                onChange={(e) => setClaimAddress(e.target.value)}
                className="input font-mono"
                placeholder="bc1q..."
                required
                disabled={claimSubmitting}
              />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-2">Transaktions-ID (64 Hex)</label>
              <input
                type="text"
                value={claimTxid}
                onChange={(e) => setClaimTxid(e.target.value)}
                className="input font-mono"
                placeholder="txid..."
                required
                disabled={claimSubmitting}
              />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-2">Methode</label>
              <input
                type="text"
                value={claimMethod}
                onChange={(e) => setClaimMethod(e.target.value)}
                className="input"
                placeholder="z.B. In Electrum importiert, auf Hardware Wallet geschickt"
                disabled={claimSubmitting}
              />
            </div>

            <button
              type="submit"
              className="btn-primary w-full py-3"
              disabled={claimSubmitting || !claimAddress || !claimTxid}
            >
              {claimSubmitting ? "Reiche ein..." : "Claim einreichen"}
            </button>
          </form>
        </section>

        {/* Leaderboard */}
        <section className="card-elevated">
          <h2 className="text-2xl font-bold mb-4">🏆 Verifizierte Claims</h2>
          
          {claimants.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <div className="text-4xl mb-4">🏁</div>
              <p>Noch keine verifizierten Claims.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-500 text-sm uppercase tracking-wider">
                    <th className="pb-3 px-4">#</th>
                    <th className="pb-3 px-4">Address</th>
                    <th className="pb-3 px-4">TXID</th>
                    <th className="pb-3 px-4">Methode</th>
                    <th className="pb-3 px-4">Datum</th>
                  </tr>
                </thead>
                <tbody>
                  {claimants.map((entry, i) => (
                    <tr key={entry.id} className="border-b border-slate-800/50 hover:bg-slate-800/50">
                      <td className="py-3 px-4 font-mono text-cyan-400 font-bold">{i + 1}</td>
                      <td className="py-3 px-4 font-mono text-sm">
                        {entry.address.slice(0, 10)}...{entry.address.slice(-8)}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-400">
                        {entry.txid.slice(0, 12)}...
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-300 max-w-xs truncate">
                        {entry.method}
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-500">
                        {entry.claimedAt?.toDate?.()?.toLocaleDateString("de-DE") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950/80 backdrop-blur-sm mt-16">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-sm text-slate-500">
          <p>Maximum Security • AES-256 Seed • 3 Req Blacklist • hCaptcha • HMAC Signing • Obfuscated Build</p>
          <p className="mt-2">
            Adresse: <code className="font-mono text-cyan-400">{WALLET_ADDRESS}</code>
          </p>
        </div>
      </footer>
    </div>
  );
}