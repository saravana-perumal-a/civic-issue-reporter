// CivicFix Shared Configuration & Firebase Init Helper
// This file initializes Firebase using the compat SDK and manages local storage settings overrides.

// 1. Default Fallback Configuration
// Replace these with your actual Firebase project settings in the console:
// Project Settings -> General -> Your apps -> Web apps -> CDN config
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAP51V1QnZ_ObRbtMC_NJf5fS4x0WdrqqA",
  authDomain: "issue-reporter-eaf58.firebaseapp.com",
  projectId: "issue-reporter-eaf58",
  storageBucket: "issue-reporter-eaf58.firebasestorage.app",
  messagingSenderId: "663737215742",
  appId: "1:663737215742:web:78c9d19ee19b9297a193af"
};

// 2. Load Configuration (either from localStorage or fallback)
function getFirebaseConfig() {
  const stored = localStorage.getItem("CIVICFIX_FIREBASE_CONFIG");
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error("Error parsing stored Firebase config, using default", e);
    }
  }
  return DEFAULT_FIREBASE_CONFIG;
}

const firebaseConfig = getFirebaseConfig();

// Check if config is still placeholder
const isConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("PLACEHOLDER");

// Initialize Firebase
try {
  if (isConfigured) {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
      console.log("Firebase initialized successfully.");
    }
  } else {
    console.warn("Firebase config is not set. Please open the settings panel using the Gear icon in the header to enter your details.");
  }
} catch (error) {
  console.error("Firebase initialization failed:", error);
}

// Export database references (checking for existence first)
const auth = isConfigured ? firebase.auth() : null;
const db = isConfigured ? firebase.firestore() : null;

// Storage with safety check (some Firebase setups don't initialize Storage if bucket name is invalid)
let storage = null;
if (isConfigured) {
  try {
    storage = firebase.storage();
  } catch (err) {
    console.warn("Firebase Storage failed to initialize. Image uploads will fallback to Base64 Firestore document storage.", err);
  }
}

// 3. System Toast Notifications Helper
function showToast(message, type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let icon = "🔔";
  if (type === "success") icon = "✅";
  else if (type === "error") icon = "❌";
  else if (type === "warning") icon = "⚠️";
  
  toast.innerHTML = `
    <span>${icon}</span>
    <div>${message}</div>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;
  
  container.appendChild(toast);
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// 4. Client-side Image compression helper
// Resizes and compresses image file. Returns base64 representation.
function compressImage(file, maxWidth = 600, maxHeight = 600, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        
        // Output as base64 string
        const base64Data = canvas.toDataURL("image/jpeg", quality);
        resolve(base64Data);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

// 5. Settings HTML Panel inject helper
function injectSettingsPanel() {
  const overlay = document.createElement("div");
  overlay.id = "settings-overlay";
  overlay.className = "settings-overlay";
  
  const currentGeminiKey = localStorage.getItem("CIVICFIX_GEMINI_KEY") || "";
  const currentConfigStr = localStorage.getItem("CIVICFIX_FIREBASE_CONFIG") 
    ? JSON.stringify(JSON.parse(localStorage.getItem("CIVICFIX_FIREBASE_CONFIG")), null, 2)
    : JSON.stringify(DEFAULT_FIREBASE_CONFIG, null, 2);
    
  overlay.innerHTML = `
    <div class="settings-modal">
      <div class="settings-header">
        <h3>CivicFix Developer Settings</h3>
        <button class="btn btn-sm btn-outline" style="border:none; font-size:1.5rem; line-height:1;" onclick="toggleSettingsPanel(false)">&times;</button>
      </div>
      <div class="settings-body">
        <p style="font-size:0.85rem; color:#64748b; margin-bottom:1rem;">
          Configure your Firebase Web SDK parameters and Gemini API Key below. This saves settings locally in your browser.
        </p>
        <div class="form-group">
          <label class="form-label">Gemini API Key</label>
          <input type="password" id="settings-gemini-key" class="form-control" placeholder="AI Studio Gemini Key" value="${currentGeminiKey}">
        </div>
        <div class="form-group">
          <label class="form-label">Firebase Web Config (JSON)</label>
          <textarea id="settings-firebase-config" class="form-control" rows="8" style="font-family:monospace; font-size:0.8rem;">${currentConfigStr}</textarea>
        </div>
      </div>
      <div class="settings-footer">
        <button class="btn btn-secondary btn-sm" onclick="toggleSettingsPanel(false)">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="saveSettings()">Save & Reload</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function toggleSettingsPanel(show) {
  let panel = document.getElementById("settings-overlay");
  if (!panel) {
    injectSettingsPanel();
    panel = document.getElementById("settings-overlay");
  }
  panel.style.display = show ? "flex" : "none";
}

function saveSettings() {
  const geminiKey = document.getElementById("settings-gemini-key").value.trim();
  const configText = document.getElementById("settings-firebase-config").value.trim();
  
  try {
    const parsedConfig = JSON.parse(configText);
    
    // Simple verification
    if (!parsedConfig.apiKey || !parsedConfig.projectId) {
      throw new Error("Invalid Firebase Config (must contain apiKey and projectId)");
    }
    
    localStorage.setItem("CIVICFIX_GEMINI_KEY", geminiKey);
    localStorage.setItem("CIVICFIX_FIREBASE_CONFIG", JSON.stringify(parsedConfig));
    
    showToast("Settings saved successfully! Reloading...", "success");
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    alert("Configuration Error: " + e.message);
  }
}

// Inject toggle helper onto window
window.toggleSettingsPanel = toggleSettingsPanel;
window.saveSettings = saveSettings;

// Check if app is not configured and inject dynamic settings button on load
document.addEventListener("DOMContentLoaded", () => {
  if (!isConfigured) {
    showToast("Application requires configuration. Click the Gear icon in the header to set keys.", "warning");
    // Show settings panel on first load automatically if not configured
    setTimeout(() => toggleSettingsPanel(true), 1000);
  }
});
