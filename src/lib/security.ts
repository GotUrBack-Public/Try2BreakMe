// ==========================================
// CLIENT-SIDE SECURITY UTILITIES
// Device Fingerprinting, HMAC Signing, hCaptcha
// ==========================================

interface FingerprintComponents {
  userAgent: string;
  language: string;
  languages: string[];
  platform: string;
  screenResolution: string;
  colorDepth: number;
  timezone: string;
  timezoneOffset: number;
  hardwareConcurrency: number;
  deviceMemory: number;
  touchSupport: boolean;
  maxTouchPoints: number;
  pixelRatio: number;
  canvasFingerprint: string;
  webglFingerprint: string;
  audioFingerprint: number;
  fonts: string[];
  plugins: string[];
  mimeTypes: string[];
  cookiesEnabled: boolean;
  doNotTrack: string;
  localStorage: boolean;
  sessionStorage: boolean;
  indexedDB: boolean;
  cpuClass: string;
  navigatorVendor: string;
  navigatorProduct: string;
  navigatorProductSub: string;
  battery?: { level: number; charging: boolean };
}

interface SignedRequest {
  payload: any;
  timestamp: number;
  nonce: string;
  signature: string;
  fingerprint: string;
  captchaToken?: string;
}

/**
 * Generate comprehensive device fingerprint
 * Used for blacklisting beyond just IP
 */
export async function generateFingerprint(): Promise<{ fingerprint: string; components: FingerprintComponents }> {
  const components = await collectFingerprintComponents();
  const fingerprint = await hashObject(components);
  return { fingerprint, components };
}

async function collectFingerprintComponents(): Promise<FingerprintComponents> {
  const nav = navigator;
  const screen = window.screen;
  
  // Canvas fingerprint
  const canvasFingerprint = await getCanvasFingerprint();
  
  // WebGL fingerprint
  const webglFingerprint = getWebGLFingerprint();
  
  // Audio fingerprint
  const audioFingerprint = await getAudioFingerprint();
  
  // Font detection (subset)
  const fonts = await detectFonts([
    'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana',
    'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS',
    'Trebuchet MS', 'Arial Black', 'Impact', 'Lucida Console', 'Tahoma'
  ]);
  
  // Plugins & MimeTypes
  const plugins = Array.from(nav.plugins || []).map(p => p.name).sort();
  const mimeTypes = Array.from(nav.mimeTypes || []).map(m => m.type).sort();
  
  // Battery API (if available)
  let battery: FingerprintComponents['battery'];
  try {
    const bat = await (nav as any).getBattery?.();
    if (bat) battery = { level: bat.level, charging: bat.charging };
  } catch {}

  return {
    userAgent: nav.userAgent,
    language: nav.language,
    languages: Array.from(nav.languages || []),
    platform: nav.platform,
    screenResolution: `${screen.width}x${screen.height}`,
    colorDepth: screen.colorDepth,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: new Date().getTimezoneOffset(),
    hardwareConcurrency: nav.hardwareConcurrency || 0,
    deviceMemory: (nav as any).deviceMemory || 0,
    touchSupport: 'ontouchstart' in window,
    maxTouchPoints: nav.maxTouchPoints || 0,
    pixelRatio: window.devicePixelRatio || 1,
    canvasFingerprint,
    webglFingerprint,
    audioFingerprint,
    fonts,
    plugins,
    mimeTypes,
    cookiesEnabled: navigator.cookieEnabled,
    doNotTrack: nav.doNotTrack || 'unknown',
    localStorage: !!window.localStorage,
    sessionStorage: !!window.sessionStorage,
    indexedDB: !!window.indexedDB,
    cpuClass: (nav as any).cpuClass || 'unknown',
    navigatorVendor: nav.vendor,
    navigatorProduct: nav.product,
    navigatorProductSub: nav.productSub,
    battery,
  };
}

async function getCanvasFingerprint(): Promise<string> {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve('no-canvas');
      
      // Draw complex pattern
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 200, 50);
      ctx.fillStyle = '#069';
      ctx.fillText('🔐 Fingerprint Test 123', 10, 10);
      ctx.fillStyle = 'rgba(255, 102, 0, 0.7)';
      ctx.fillText('🔐 Fingerprint Test 123', 12, 12);
      
      // Add gradient
      const gradient = ctx.createLinearGradient(0, 0, 200, 50);
      gradient.addColorStop(0, '#ff0000');
      gradient.addColorStop(1, '#0000ff');
      ctx.fillStyle = gradient;
      ctx.fillRect(50, 20, 100, 20);
      
      resolve(canvas.toDataURL());
    } catch {
      resolve('canvas-error');
    }
  });
}

function getWebGLFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
    if (!gl) return 'no-webgl';
    
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info') as any;
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'hidden';
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'hidden';
    const version = gl.getParameter(gl.VERSION);
    const shading = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
    
    return `${vendor}~${renderer}~${version}~${shading}`;
  } catch {
    return 'webgl-error';
  }
}

async function getAudioFingerprint(): Promise<number> {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const analyser = audioCtx.createAnalyser();
    const gainNode = audioCtx.createGain();
    const scriptProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
    
    oscillator.type = 'triangle';
    oscillator.frequency.value = 10000;
    gainNode.gain.value = 0;
    
    oscillator.connect(analyser);
    analyser.connect(scriptProcessor);
    scriptProcessor.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    let fingerprint = 0;
    scriptProcessor.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0);
      fingerprint = Math.abs(data.reduce((acc, val) => acc + Math.abs(val), 0) * 10000);
    };
    
    oscillator.start(0);
    await new Promise(r => setTimeout(r, 100));
    oscillator.stop(0);
    audioCtx.close();
    
    return fingerprint;
  } catch {
    return 0;
  }
}

async function detectFonts(fontList: string[]): Promise<string[]> {
  const baseFonts = ['monospace', 'sans-serif', 'serif'];
  const detected: string[] = [];
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = '72px monospace';
  
  const getWidth = (font: string) => {
    ctx.font = `72px ${font}, monospace`;
    return ctx.measureText('mmmmmmmmmmli').width;
  };
  
  const baseWidths = baseFonts.map(getWidth);
  
  for (const font of fontList) {
    const widths = baseFonts.map(f => getWidth(`${font}, ${f}`));
    if (widths.some((w, i) => w !== baseWidths[i])) {
      detected.push(font);
    }
  }
  
  return detected;
}

async function hashObject(obj: any): Promise<string> {
  const str = JSON.stringify(obj);
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate cryptographically secure nonce
 */
export function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * HMAC-SHA256 sign request payload
 * Key derived from fingerprint + timestamp (server knows derivation)
 */
export async function signRequest(
  payload: any,
  fingerprint: string,
  secretKey: string // In production: derived from challenge, not static
): Promise<SignedRequest> {
  const timestamp = Date.now();
  const nonce = generateNonce();
  
  const signData = JSON.stringify({ payload, timestamp, nonce, fingerprint });
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey + fingerprint);
  const messageData = encoder.encode(signData);
  
  const key = await crypto.subtle.importKey(
    'raw',
    await crypto.subtle.digest('SHA-256', keyData),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  const sigArray = Array.from(new Uint8Array(signature));
  const signatureHex = sigArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return {
    payload,
    timestamp,
    nonce,
    signature: signatureHex,
    fingerprint,
  };
}

/**
 * hCaptcha integration
 */
declare global {
  interface Window {
    hcaptcha: {
      render: (container: string | HTMLElement, options: any) => string;
      reset: (widgetId: string) => void;
      getResponse: (widgetId: string) => string;
      execute: (widgetId: string) => Promise<string | null>;
      onLoad: (callback: () => void) => void;
    };
  }
}

let hcaptchaWidgetId: string | null = null;
let hcaptchaLoaded = false;

export function initHCaptcha(siteKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (hcaptchaLoaded && hcaptchaWidgetId) {
      resolve();
      return;
    }
    
    window.hcaptcha = window.hcaptcha || { onLoad: () => {} };
    
    const existingScript = document.querySelector('script[src*="hcaptcha"]');
    if (existingScript) {
      checkHCaptchaReady(resolve, reject);
      return;
    }
    
    window.hcaptcha.onLoad = () => {
      hcaptchaLoaded = true;
      renderHCaptcha(siteKey);
      resolve();
    };
    
    const script = document.createElement('script');
    script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('hCaptcha script load failed'));
    document.head.appendChild(script);
  });
}

function checkHCaptchaReady(resolve: () => void, reject: (err: Error) => void) {
  const check = setInterval(() => {
    if (window.hcaptcha && typeof window.hcaptcha.render === 'function') {
      clearInterval(check);
      hcaptchaLoaded = true;
      resolve();
    }
  }, 100);
  
  setTimeout(() => {
    clearInterval(check);
    reject(new Error('hCaptcha init timeout'));
  }, 10000);
}

function renderHCaptcha(siteKey: string) {
  const container = document.createElement('div');
  container.id = 'hcaptcha-widget';
  container.style.display = 'none'; // Invisible
  document.body.appendChild(container);
  
  hcaptchaWidgetId = window.hcaptcha.render(container, {
    sitekey: siteKey,
    size: 'invisible',
    theme: 'dark',
  });
}

export async function getHCaptchaToken(): Promise<string> {
  if (!hcaptchaWidgetId || !hcaptchaLoaded) {
    throw new Error('hCaptcha not initialized');
  }
  
  return new Promise<string>((resolve, reject) => {
    // @ts-expect-error - hCaptcha types mismatch: Promise<string> vs actual Promise<string|null>
    window.hcaptcha.execute(hcaptchaWidgetId).then((token: string | null) => {
      if (token) resolve(token);
      else reject(new Error('Empty hCaptcha token'));
    }).catch(reject);
  });
}

export function resetHCaptcha() {
  if (hcaptchaWidgetId && hcaptchaLoaded) {
    window.hcaptcha.reset(hcaptchaWidgetId);
  }
}

/**
 * Check if client is blacklisted (stored in localStorage as backup)
 */
export function isLocallyBlacklisted(): boolean {
  try {
    const blacklist = localStorage.getItem('security_blacklist');
    if (!blacklist) return false;
    const data = JSON.parse(blacklist);
    return data.blacklisted === true && data.expires > Date.now();
  } catch {
    return false;
  }
}

export function setLocalBlacklist(expiresInMs: number = 24 * 60 * 60 * 1000) {
  localStorage.setItem('security_blacklist', JSON.stringify({
    blacklisted: true,
    expires: Date.now() + expiresInMs,
    reason: 'Rate limit exceeded',
  }));
}

export function clearLocalBlacklist() {
  localStorage.removeItem('security_blacklist');
}