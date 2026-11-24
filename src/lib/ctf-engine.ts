// ==========================================
// CTF ENGINE - Hidden Vulnerability Chain
// Layer 1: Frontend DOM/JS Vulnerability
// ==========================================

interface CTFState {
  layer: number;
  hints: string[];
  unlocked: boolean;
}

// Hidden state - not exported, only accessible via console/debug
const ctfState: CTFState = {
  layer: 0,
  hints: [],
  unlocked: false,
};

/**
 * LAYER 1 VULNERABILITY: DOM-based Hidden Debug Interface
 * 
 * Trigger: Add ?debug=ctf_2024 to URL, or set localStorage.debug_ctf = "1"
 * Reveals: Hidden debug panel with timing attack endpoint
 * Hint to Layer 2: "The PIN check counts cycles... each byte leaks time"
 */
export function initCTFLayer1(): void {
  // Check for hidden trigger (URL param or localStorage)
  const urlParams = new URLSearchParams(window.location.search);
  const debugParam = urlParams.get('debug');
  const localDebug = localStorage.getItem('debug_ctf');
  
  if (debugParam === 'ctf_2024' || localDebug === '1') {
    ctfState.layer = 1;
    ctfState.unlocked = true;
    injectDebugPanel();
    console.log('%c[CTF] Layer 1 unlocked: Debug interface active', 'color: #0f0; font-size: 12px');
  }
  
  // Hidden hint in page source (invisible to users)
  // This is the ONLY hint on the website - hidden in a data attribute
  injectHiddenHint();
}

function injectHiddenHint(): void {
  // Hint hidden in a data attribute on body - invisible to users
  // Only visible in "View Source" or DevTools Elements tab
  const hint = "ctf{d3bug_p4r4m_1s_ctf_2024}";
  const encoded = btoa(hint).split('').reverse().join('');
  
  // Inject after a small delay to avoid detection
  setTimeout(() => {
    const body = document.body;
    if (body) {
      // Hidden in a non-standard attribute
      body.setAttribute('data-ctf-hint', encoded);
      // Also in a comment node (visible in View Source)
      const comment = document.createComment(` ${encoded} `);
      body.appendChild(comment);
    }
  }, 2000);
}

function injectDebugPanel(): void {
  const panel = document.createElement('div');
  panel.id = 'ctf-debug-panel';
  panel.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 9999;
    background: #0a0a0a; border: 1px solid #0f0; border-radius: 8px;
    padding: 16px; font-family: monospace; font-size: 11px; color: #0f0;
    max-width: 400px; box-shadow: 0 0 20px rgba(0,255,0,0.3);
  `;
  panel.innerHTML = `
    <div style="margin-bottom: 8px; font-weight: bold;">🔓 CTF DEBUG PANEL (Layer 1)</div>
    <div style="margin-bottom: 8px; font-size: 10px; opacity: 0.7;">
      Hint: The PIN check counts cycles... each byte leaks time ⏱️
    </div>
    <button id="ctf-test-timing" style="
      width: 100%; padding: 8px; background: transparent; border: 1px solid #0f0;
      color: #0f0; cursor: pointer; font-family: monospace; font-size: 10px;
    ">Test Timing Attack Endpoint</button>
    <div id="ctf-timing-results" style="margin-top: 8px; min-height: 60px; font-size: 9px;"></div>
  `;
  document.body.appendChild(panel);
  
  // Wire up timing test button
  const btn = document.getElementById('ctf-test-timing') as HTMLButtonElement | null;
  const results = document.getElementById('ctf-timing-results');
  if (btn && results) {
    btn.onclick = async () => {
      btn.textContent = 'Testing...';
      btn.disabled = true;
      try {
        // This calls the vulnerable endpoint
        const res = await fetch('/api/ctf/timing-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: '000000' })
        });
        const data = await res.json();
        results.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
        
        if (data.hint) {
          ctfState.hints.push(data.hint);
          ctfState.layer = 2;
          showLayer2Hint(data.hint);
        }
      } catch (e: any) {
        results.innerHTML = `<span style="color: #f00;">Error: ${e.message}</span>`;
      }
      btn.textContent = 'Test Timing Attack Endpoint';
      btn.disabled = false;
    };
  }
}

function showLayer2Hint(hint: string): void {
  const panel = document.getElementById('ctf-debug-panel');
  if (panel) {
    const hintDiv = document.createElement('div');
    hintDiv.style.cssText = 'margin-top: 8px; padding: 8px; background: #1a1a1a; border: 1px solid #ff0; color: #ff0; font-size: 10px;';
    hintDiv.innerHTML = `<strong>Layer 2 Hint:</strong> ${hint}<br>Next: Functions endpoint /api/ctf/pin-check`;
    panel.appendChild(hintDiv);
  }
}

// Auto-init on load
if (typeof window !== 'undefined') {
  // Delay to avoid blocking page load
  setTimeout(initCTFLayer1, 100);
}

/**
 * Helper: Expose minimal API for console debugging
 * Only works if Layer 1 is unlocked
 */
declare global {
  interface Window {
    __ctf: {
      state: () => CTFState;
      unlock: (layer: number) => void;
      getHint: (layer: number) => string | undefined;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__ctf = {
    state: () => ({ ...ctfState }),
    unlock: (layer: number) => { ctfState.layer = layer; ctfState.unlocked = true; },
    getHint: (layer: number) => ctfState.hints[layer - 1],
  };
}