import React, { useMemo, useState, useEffect, useRef } from "react";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, googleProvider, db } from "./firebase";

// ===== Currency Configuration =====
const CURRENCIES = {
  THB: { symbol: "฿", code: "THB", locale: "th-TH", defaultMin: 150 },
  USD: { symbol: "$", code: "USD", locale: "en-US", defaultMin: 5 },
  JPY: { symbol: "¥", code: "JPY", locale: "ja-JP", defaultMin: 500 },
  EUR: { symbol: "€", code: "EUR", locale: "de-DE", defaultMin: 5 },
};

// ===== Base Materials (static) =====
// Materials with separate rates for each currency
// JPY and EUR rates are calculated as: (THB rate * 1.2) * exchange_rate, rounded to decent numbers
// JPY: ~4.72 JPY per THB (example: 3 THB * 1.2 = 3.6 THB = 17 JPY)
// EUR: ~0.031 EUR per THB (example: 3 THB * 1.2 = 3.6 THB = 0.11 EUR)
const BASE_MATERIALS = [
  { key: "PETG", label: "PETG", weightRateTHB: 3, timeRateTHB: 1.2, weightRateUSD: 0.12, timeRateUSD: 0.05, weightRateJPY: 17, timeRateJPY: 7, weightRateEUR: 0.11, timeRateEUR: 0.04, color: "#ef4444" },
  { key: "PETG-CF", label: "PETG-CF", weightRateTHB: 5, timeRateTHB: 1.2, weightRateUSD: 0.20, timeRateUSD: 0.05, weightRateJPY: 28, timeRateJPY: 7, weightRateEUR: 0.19, timeRateEUR: 0.04, color: "#f59e0b" },
  { key: "TPU", label: "TPU", weightRateTHB: 6, timeRateTHB: 1.2, weightRateUSD: 0.24, timeRateUSD: 0.05, weightRateJPY: 34, timeRateJPY: 7, weightRateEUR: 0.22, timeRateEUR: 0.04, color: "#10b981" },
  { key: "PAHT-CF", label: "PAHT-CF", weightRateTHB: 8, timeRateTHB: 2.8, weightRateUSD: 0.32, timeRateUSD: 0.11, weightRateJPY: 45, timeRateJPY: 16, weightRateEUR: 0.30, timeRateEUR: 0.10, color: "#60a5fa" },
];

// ===== Utils =====
function classNames(...c) { return c.filter(Boolean).join(" "); }
function toMinutes(d, h, m) { return Math.max(0, Math.floor(Number(d) || 0) * 1440 + Math.floor(Number(h) || 0) * 60 + Math.max(0, Math.floor(Number(m) || 0))); }
function formatCurrency(n, currency) {
  const config = CURRENCIES[currency];
  if (currency === "THB") {
    return `${Math.floor(n).toLocaleString(config.locale)} ${config.symbol}`;
  } else if (currency === "USD" || currency === "EUR") {
    // For USD and EUR, show cents (2 decimal places)
    return `${config.symbol}${Number(n.toFixed(2)).toLocaleString(config.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else if (currency === "JPY") {
    // For JPY, no decimal places (whole numbers only)
    return `${config.symbol}${Math.floor(n).toLocaleString(config.locale)}`;
  } else {
    return `${config.symbol}${Math.floor(n).toLocaleString(config.locale)}`;
  }
}
// Legacy function for backward compatibility (will be replaced)
function formatTHB(n) { return formatCurrency(n, "THB"); }
const findBaseByKey = (key) => BASE_MATERIALS.find((m) => m.key === key);
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatRate(rate, currency) {
  const config = CURRENCIES[currency];
  // For USD and EUR, always show 2 decimal places (cents)
  if (currency === "USD" || currency === "EUR") {
    return rate.toFixed(2).toLocaleString(config.locale);
  }
  // For JPY, always show whole numbers (no decimals)
  if (currency === "JPY") {
    return Math.floor(rate).toLocaleString(config.locale);
  }
  // For THB, show decimals if the rate has decimals, otherwise show whole number
  if (rate % 1 === 0) {
    return Math.floor(rate).toLocaleString(config.locale);
  } else {
    return rate.toFixed(1).toLocaleString(config.locale);
  }
}

export default function App() {
  // ===== State =====
  const [currency, setCurrency] = useState("THB"); // Default to THB
  const [material, setMaterial] = useState("PETG");
  const [grams, setGrams] = useState("");
  const [days, setDays] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [colors, setColors] = useState("1");
  const [copied, setCopied] = useState(false);
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [showCurrencyWarning, setShowCurrencyWarning] = useState(false);
  const [pendingCurrency, setPendingCurrency] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationPos, setAnimationPos] = useState({ startX: 0, startY: 0, endX: 0, endY: 0 });
  const addToCartButtonRef = useRef(null);
  const viewCartButtonRef = useRef(null);
  
  // Advanced options
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [discountThreshold, setDiscountThreshold] = useState(100);
  const [discountPercentage, setDiscountPercentage] = useState(20); // 20% discount = 0.8 multiplier
  const [colorSurchargeEnabled, setColorSurchargeEnabled] = useState(true);
  const [colorSurchargePercentage, setColorSurchargePercentage] = useState(15); // 15% per extra color
  const [minimumSurchargeEnabled, setMinimumSurchargeEnabled] = useState(true);
  // Minimum price defaults based on currency (default to USD since currency starts as USD)
  const [minimumSurchargeAmount, setMinimumSurchargeAmount] = useState(CURRENCIES.USD.defaultMin);
  // Temporary input values for easier editing
  const [discountThresholdInput, setDiscountThresholdInput] = useState('');
  const [discountPercentageInput, setDiscountPercentageInput] = useState('');
  const [colorSurchargePercentageInput, setColorSurchargePercentageInput] = useState('');
  const [minimumSurchargeAmountInput, setMinimumSurchargeAmountInput] = useState('');

  // Overrides for built-in materials (label, rates) - currency-aware
  const [overrides, setOverrides] = useState({}); // { [key]: { label, weightRateTHB, timeRateTHB, weightRateUSD, timeRateUSD } }

  // Custom material controls - currency-aware
  const [customLabel, setCustomLabel] = useState("Custom");
  const [customWeightRateTHB, setCustomWeightRateTHB] = useState(10); // 10/g THB
  const [customTimeRateTHB, setCustomTimeRateTHB] = useState(3); // 3/min THB
  const [customWeightRateUSD, setCustomWeightRateUSD] = useState(0.40); // USD rates (independent)
  const [customTimeRateUSD, setCustomTimeRateUSD] = useState(0.12); // USD rates (independent)
  const [customWeightRateJPY, setCustomWeightRateJPY] = useState(57); // JPY rates (calculated: 10 THB * 1.2 * 4.72 ≈ 57)
  const [customTimeRateJPY, setCustomTimeRateJPY] = useState(17); // JPY rates (calculated: 3 THB * 1.2 * 4.72 ≈ 17)
  const [customWeightRateEUR, setCustomWeightRateEUR] = useState(0.37); // EUR rates (calculated: 10 THB * 1.2 * 0.031 ≈ 0.37)
  const [customTimeRateEUR, setCustomTimeRateEUR] = useState(0.11); // EUR rates (calculated: 3 THB * 1.2 * 0.031 ≈ 0.11)
  const customColor = "#a855f7"; // purple

  // Generic editor (for ALL materials including Custom)
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(null); // 'PETG' | 'CUSTOM' ...
  const [editorDraft, setEditorDraft] = useState({ label: "", weightTHB: 0, timeTHB: 0, weightUSD: 0, timeUSD: 0, weightJPY: 0, timeJPY: 0, weightEUR: 0, timeEUR: 0 });

  // Authentication state
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimeoutRef = useRef(null);
  const isInitialLoadRef = useRef(true);

  // Build materials list with overrides applied; insert Custom AFTER PAHT-CF
  // Material rates are currency-aware (all currencies are independent)
  const MATERIALS = useMemo(() => {
    const list = BASE_MATERIALS.map((m) => {
      const o = overrides[m.key] || {};
      return { 
        ...m, 
        label: o.label ?? m.label, 
        weightRateTHB: o.weightRateTHB ?? m.weightRateTHB, 
        timeRateTHB: o.timeRateTHB ?? m.timeRateTHB,
        weightRateUSD: o.weightRateUSD ?? m.weightRateUSD, 
        timeRateUSD: o.timeRateUSD ?? m.timeRateUSD,
        weightRateJPY: o.weightRateJPY ?? m.weightRateJPY, 
        timeRateJPY: o.timeRateJPY ?? m.timeRateJPY,
        weightRateEUR: o.weightRateEUR ?? m.weightRateEUR, 
        timeRateEUR: o.timeRateEUR ?? m.timeRateEUR,
      };
    });
    const idx = list.findIndex((m) => m.key === "PAHT-CF");
    const before = list.slice(0, idx + 1);
    const after = list.slice(idx + 1);
    const custom = { 
      key: "CUSTOM", 
      label: customLabel, 
      weightRateTHB: customWeightRateTHB, 
      timeRateTHB: customTimeRateTHB,
      weightRateUSD: customWeightRateUSD, 
      timeRateUSD: customTimeRateUSD,
      weightRateJPY: customWeightRateJPY, 
      timeRateJPY: customTimeRateJPY,
      weightRateEUR: customWeightRateEUR, 
      timeRateEUR: customTimeRateEUR,
      color: customColor 
    };
    return [...before, custom, ...after];
  }, [overrides, customLabel, customWeightRateTHB, customTimeRateTHB, customWeightRateUSD, customTimeRateUSD, customWeightRateJPY, customTimeRateJPY, customWeightRateEUR, customTimeRateEUR]);

  // Get current currency rates for selected material
  const getMaterialRates = (material) => {
    const m = MATERIALS.find((m) => m.key === material) || MATERIALS[0];
    if (currency === "USD") {
      return { weightRate: m.weightRateUSD, timeRate: m.timeRateUSD };
    } else if (currency === "JPY") {
      return { weightRate: m.weightRateJPY, timeRate: m.timeRateJPY };
    } else if (currency === "EUR") {
      return { weightRate: m.weightRateEUR, timeRate: m.timeRateEUR };
    } else {
      return { weightRate: m.weightRateTHB, timeRate: m.timeRateTHB };
    }
  };

  const selected = MATERIALS.find((m) => m.key === material) || MATERIALS[0];
  const materialRates = useMemo(() => getMaterialRates(material), [material, currency, MATERIALS]);

  // ===== Derived values =====
  const parsed = useMemo(() => {
    const g = Math.max(0, Number(grams || 0));
    const d = Math.max(0, Number(days || 0));
    const h = Math.max(0, Number(hours || 0));
    const m = Math.max(0, Number(minutes || 0));
    const c = Math.max(1, Number(colors || 1));
    return { g, d, h, m, c, totalMinutes: toMinutes(d, h, m) };
  }, [grams, days, hours, minutes, colors]);

  const result = useMemo(() => {
    const { g, totalMinutes, c } = parsed;
    const colorPct = colorSurchargeEnabled ? Math.max(0, (c - 1) * (colorSurchargePercentage / 100)) : 0;
    const discountEligible = discountEnabled && g >= discountThreshold;

    // Weight path
    const baseWeight = g * materialRates.weightRate;
    const withColorsWeight = baseWeight * (1 + colorPct);
    const discountMultiplier = discountEligible ? (1 - discountPercentage / 100) : 1;
    let finalWeight = withColorsWeight * discountMultiplier;

    // Time path (NO discount)
    const baseTime = totalMinutes * materialRates.timeRate;
    const withColorsTime = baseTime * (1 + colorPct);
    let finalTime = withColorsTime;

    // Apply minimum price to both weight and time if enabled (before comparison)
    if (minimumSurchargeEnabled) {
      // Apply minimum to both methods individually
      finalWeight = Math.max(finalWeight, minimumSurchargeAmount);
      finalTime = Math.max(finalTime, minimumSurchargeAmount);
    }

    const useWeight = finalWeight >= finalTime; // pick higher cost
    const final = useWeight ? finalWeight : finalTime;

    return { baseWeight, withColorsWeight, finalWeight, baseTime, withColorsTime, finalTime, discountEligible, colorPct, useWeight, final, discountMultiplier };
  }, [parsed, materialRates, discountEnabled, discountThreshold, discountPercentage, colorSurchargeEnabled, colorSurchargePercentage, minimumSurchargeEnabled, minimumSurchargeAmount]);

  const summaryText = useMemo(() => {
    if (!String(grams).trim()) return ""; // Blank until grams provided
    const { g, d, h, m } = parsed;
    const dInt = Math.max(0, Math.floor(d));
    const hInt = Math.max(0, Math.floor(h));
    const mInt = Math.max(0, Math.floor(m));
    const timeStr = dInt > 0 ? `${dInt}d${hInt}h${mInt}m` : `${hInt}h${mInt}m`;
    return `${selected.label} ${g}g. ${timeStr} = ${formatCurrency(result.final, currency)}`;
  }, [grams, parsed, result.final, selected.label, currency]);

  // ===== Currency change handler =====
  function handleCurrencyChange(newCurrency) {
    if (cart.length > 0 && newCurrency !== currency) {
      setPendingCurrency(newCurrency);
      setShowCurrencyWarning(true);
    } else {
      setCurrency(newCurrency);
      // Update minimum price to default for new currency
      setMinimumSurchargeAmount(CURRENCIES[newCurrency].defaultMin);
    }
  }

  function confirmCurrencyChange() {
    if (pendingCurrency) {
      setCurrency(pendingCurrency);
      setCart([]); // Clear cart
      // Update minimum price to default for new currency
      setMinimumSurchargeAmount(CURRENCIES[pendingCurrency].defaultMin);
      setShowCurrencyWarning(false);
      setPendingCurrency(null);
    }
  }

  // Track if we're loading settings to prevent overwriting
  const isLoadingSettingsRef = useRef(false);

  // Update minimum price when currency changes (only if not loading settings and no cart items)
  useEffect(() => {
    if (cart.length === 0 && !isLoadingSettingsRef.current) {
      setMinimumSurchargeAmount(CURRENCIES[currency].defaultMin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  function cancelCurrencyChange() {
    setShowCurrencyWarning(false);
    setPendingCurrency(null);
  }

  // ===== Authentication & Settings =====
  // Save settings to Firestore
  async function saveSettings() {
    if (!user || !db) {
      console.log("Cannot save settings: user or db not available", { user: !!user, db: !!db });
      return;
    }
    
    if (isInitialLoadRef.current) {
      console.log("Skipping save: initial load in progress");
      return;
    }
    
    setSaving(true);
    try {
      const settings = {
        currency,
        overrides,
        customLabel,
        customWeightRateTHB,
        customTimeRateTHB,
        customWeightRateUSD,
        customTimeRateUSD,
        customWeightRateJPY,
        customTimeRateJPY,
        customWeightRateEUR,
        customTimeRateEUR,
        discountEnabled,
        discountThreshold,
        discountPercentage,
        colorSurchargeEnabled,
        colorSurchargePercentage,
        minimumSurchargeEnabled,
        minimumSurchargeAmount,
        updatedAt: new Date().toISOString(),
      };
      
      console.log("Saving settings to Firestore for user:", user.uid);
      console.log("Settings data:", settings);
      await setDoc(doc(db, "users", user.uid), settings, { merge: true });
      console.log("✅ Settings saved successfully to Firestore!");
    } catch (error) {
      console.error("Error saving settings:", error);
      // Show user-friendly error message
      alert("Failed to save settings. Please check the browser console for details.");
    } finally {
      setSaving(false);
    }
  }

  // Load settings from Firestore
  async function loadSettings(userToLoad = null) {
    // Use provided user or fall back to state user
    const currentUser = userToLoad || user;
    if (!currentUser || !db) {
      console.log("Cannot load settings: user or db not available", { 
        user: !!currentUser, 
        userId: currentUser?.uid, 
        db: !!db 
      });
      return;
    }
    
    try {
      console.log("Starting to load settings for user:", currentUser.uid);
      isLoadingSettingsRef.current = true;
      isInitialLoadRef.current = true; // Prevent auto-save during load
      
      const docRef = doc(db, "users", currentUser.uid);
      console.log("Fetching document from Firestore:", `users/${currentUser.uid}`);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log("Settings found in Firestore, loading:", data);
        
        // Load settings - batch state updates for better performance
        if (data.currency !== undefined) setCurrency(data.currency);
        if (data.overrides !== undefined) setOverrides(data.overrides);
        if (data.customLabel !== undefined) setCustomLabel(data.customLabel);
        if (data.customWeightRateTHB !== undefined) setCustomWeightRateTHB(data.customWeightRateTHB);
        if (data.customTimeRateTHB !== undefined) setCustomTimeRateTHB(data.customTimeRateTHB);
        if (data.customWeightRateUSD !== undefined) setCustomWeightRateUSD(data.customWeightRateUSD);
        if (data.customTimeRateUSD !== undefined) setCustomTimeRateUSD(data.customTimeRateUSD);
        if (data.customWeightRateJPY !== undefined) setCustomWeightRateJPY(data.customWeightRateJPY);
        if (data.customTimeRateJPY !== undefined) setCustomTimeRateJPY(data.customTimeRateJPY);
        if (data.customWeightRateEUR !== undefined) setCustomWeightRateEUR(data.customWeightRateEUR);
        if (data.customTimeRateEUR !== undefined) setCustomTimeRateEUR(data.customTimeRateEUR);
        if (data.discountEnabled !== undefined) setDiscountEnabled(data.discountEnabled);
        if (data.discountThreshold !== undefined) setDiscountThreshold(data.discountThreshold);
        if (data.discountPercentage !== undefined) setDiscountPercentage(data.discountPercentage);
        if (data.colorSurchargeEnabled !== undefined) setColorSurchargeEnabled(data.colorSurchargeEnabled);
        if (data.colorSurchargePercentage !== undefined) setColorSurchargePercentage(data.colorSurchargePercentage);
        if (data.minimumSurchargeEnabled !== undefined) setMinimumSurchargeEnabled(data.minimumSurchargeEnabled);
        
        // Load minimum surcharge amount after a brief delay to ensure currency is set
        if (data.minimumSurchargeAmount !== undefined) {
          setTimeout(() => {
            setMinimumSurchargeAmount(data.minimumSurchargeAmount);
          }, 200);
        }
        
        console.log("All settings loaded successfully");
      } else {
        console.log("No settings document found in Firestore for user:", currentUser.uid);
        console.log("This is normal for first-time users. Settings will be created when you make changes.");
      }
      
      // Wait for state updates to complete before enabling auto-save
      setTimeout(() => {
        isLoadingSettingsRef.current = false;
        isInitialLoadRef.current = false;
        console.log("Settings loading complete. Auto-save is now enabled.");
      }, 1000);
    } catch (error) {
      console.error("Error loading settings from Firestore:", error);
      console.error("Error details:", {
        code: error.code,
        message: error.message,
        userId: currentUser.uid
      });
      isLoadingSettingsRef.current = false;
      isInitialLoadRef.current = false;
    }
  }

  // Handle Google login
  async function handleGoogleLogin() {
    if (!auth || !googleProvider) {
      alert("Firebase is not configured. Please set up Firebase to enable login.\n\nSee src/firebase.js for setup instructions.");
      return;
    }
    try {
      await signInWithPopup(auth, googleProvider);
      // Settings will be loaded automatically via useEffect when user state changes
    } catch (error) {
      console.error("Error signing in:", error);
      if (error.code === 'auth/popup-closed-by-user') {
        // User closed the popup, no need to show error
        return;
      }
      alert("Failed to sign in. Please check your Firebase configuration.");
    }
  }

  // Handle logout
  async function handleLogout() {
    if (!auth) return;
    try {
      await signOut(auth);
      // Reset to defaults (or keep current settings for guest mode)
    } catch (error) {
      console.error("Error signing out:", error);
    }
  }

  // Auto-save settings when they change (debounced)
  useEffect(() => {
    // Don't save if no user, if loading settings, or if Firebase isn't ready
    if (!user || !db || isInitialLoadRef.current || isLoadingSettingsRef.current) {
      return;
    }
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set new timeout to save after 2 seconds of inactivity
    saveTimeoutRef.current = setTimeout(() => {
      saveSettings();
    }, 2000);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    user,
    db,
    currency,
    overrides,
    customLabel,
    customWeightRateTHB,
    customTimeRateTHB,
    customWeightRateUSD,
    customTimeRateUSD,
    customWeightRateJPY,
    customTimeRateJPY,
    customWeightRateEUR,
    customTimeRateEUR,
    discountEnabled,
    discountThreshold,
    discountPercentage,
    colorSurchargeEnabled,
    colorSurchargePercentage,
    minimumSurchargeEnabled,
    minimumSurchargeAmount,
  ]);

  // Monitor authentication state and load settings on page load/refresh
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("Auth state changed:", currentUser ? "Logged in" : "Logged out", currentUser?.uid);
      setUser(currentUser);
      setLoading(false);
      
      if (currentUser && db) {
        console.log("User authenticated, loading settings for:", currentUser.uid);
        // Ensure db is ready, then load settings
        try {
          // Wait a bit for auth to fully initialize, then load settings with the current user
          await new Promise(resolve => setTimeout(resolve, 200));
          await loadSettings(currentUser);
        } catch (error) {
          console.error("Error in auth state change handler:", error);
        }
      } else {
        // Reset loading flags when user logs out
        isLoadingSettingsRef.current = false;
        isInitialLoadRef.current = false;
        console.log("User logged out, resetting settings flags");
      }
    });
    
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Actions =====
  async function copySummary(e) {
    try {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (!summaryText) return;
      
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(summaryText);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      } else {
        // Fallback for iOS Safari and older browsers
        const textArea = document.createElement('textarea');
        textArea.value = summaryText;
        textArea.style.position = 'fixed';
        textArea.style.top = '-9999px';
        textArea.style.left = '-9999px';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        textArea.setSelectionRange(0, summaryText.length);
        
        try {
          const successful = document.execCommand('copy');
          if (successful) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }
        } catch (err) {
          console.error('Copy failed:', err);
        }
        
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }
  function resetAll() { setMaterial("PETG"); setGrams(""); setDays(""); setHours(""); setMinutes(""); setColors("1"); setCopied(false); }
  function addToCart() {
    if (!summaryText) return;
    const { g, d, h, m, c } = parsed;
    const useW = result.useWeight;
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      material: selected.label,
      color: selected.color,
      grams: g,
      days: Math.max(0, Math.floor(d)),
      hours: Math.max(0, Math.floor(h)),
      minutes: Math.max(0, Math.floor(m)),
      colors: c,
      method: useW ? "Based on weight" : "Based on time",
      base: useW ? result.baseWeight : result.baseTime,
      withColors: useW ? result.withColorsWeight : result.withColorsTime,
      final: useW ? result.finalWeight : result.finalTime,
      summary: summaryText,
    };
    
    // Calculate positions for animation - start from above cart button
    if (viewCartButtonRef.current) {
      const endRect = viewCartButtonRef.current.getBoundingClientRect();
      // Start from above the cart button (centered horizontally, 150px above)
      // End at the exact center of the cart button
      const centerX = endRect.left + endRect.width / 2;
      const centerY = endRect.top + endRect.height / 2;
      setAnimationPos({
        startX: centerX,
        startY: centerY - 150,
        endX: centerX,
        endY: centerY,
      });
    }
    
    // Trigger animation
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 1000);
    
    setCart((prev) => [item, ...prev]);
    resetAll();
  }
  function removeFromCart(id) { setCart((prev) => prev.filter((it) => it.id !== id)); }
  const cartTotal = useMemo(() => cart.reduce((sum, it) => sum + it.final, 0), [cart]);

  // ===== Material Editor Helpers =====
  function openEditorFor(key) {
    setEditorKey(key);
    if (key === "CUSTOM") {
      const draft = { label: customLabel };
      if (currency === "THB") {
        draft.weightTHB = customWeightRateTHB;
        draft.timeTHB = customTimeRateTHB;
      } else if (currency === "USD") {
        draft.weightUSD = customWeightRateUSD;
        draft.timeUSD = customTimeRateUSD;
      } else if (currency === "JPY") {
        draft.weightJPY = customWeightRateJPY;
        draft.timeJPY = customTimeRateJPY;
      } else if (currency === "EUR") {
        draft.weightEUR = customWeightRateEUR;
        draft.timeEUR = customTimeRateEUR;
      }
      setEditorDraft(draft);
    } else {
      const base = MATERIALS.find((m) => m.key === key);
      const draft = { label: base?.label || "" };
      if (currency === "THB") {
        draft.weightTHB = base?.weightRateTHB || 0;
        draft.timeTHB = base?.timeRateTHB || 0;
      } else if (currency === "USD") {
        draft.weightUSD = base?.weightRateUSD || 0;
        draft.timeUSD = base?.timeRateUSD || 0;
      } else if (currency === "JPY") {
        draft.weightJPY = base?.weightRateJPY || 0;
        draft.timeJPY = base?.timeRateJPY || 0;
      } else if (currency === "EUR") {
        draft.weightEUR = base?.weightRateEUR || 0;
        draft.timeEUR = base?.timeRateEUR || 0;
      }
      setEditorDraft(draft);
    }
    setEditorOpen(true);
  }
  function saveEditor() {
    const { label } = editorDraft;
    if (editorKey === "CUSTOM") {
      setCustomLabel((label || "Custom").trim());
      if (currency === "THB") {
        setCustomWeightRateTHB(Math.max(0, Number(editorDraft.weightTHB) || 0));
        setCustomTimeRateTHB(Math.max(0, Number(editorDraft.timeTHB) || 0));
      } else if (currency === "USD") {
        setCustomWeightRateUSD(Math.max(0, Number(editorDraft.weightUSD) || 0));
        setCustomTimeRateUSD(Math.max(0, Number(editorDraft.timeUSD) || 0));
      } else if (currency === "JPY") {
        setCustomWeightRateJPY(Math.max(0, Number(editorDraft.weightJPY) || 0));
        setCustomTimeRateJPY(Math.max(0, Number(editorDraft.timeJPY) || 0));
      } else if (currency === "EUR") {
        setCustomWeightRateEUR(Math.max(0, Number(editorDraft.weightEUR) || 0));
        setCustomTimeRateEUR(Math.max(0, Number(editorDraft.timeEUR) || 0));
      }
    } else if (editorKey) {
      const base = findBaseByKey(editorKey);
      const update = {
        label: (label || base?.label || "").trim(),
      };
      if (currency === "THB") {
        update.weightRateTHB = Math.max(0, Number(editorDraft.weightTHB) || 0);
        update.timeRateTHB = Math.max(0, Number(editorDraft.timeTHB) || 0);
      } else if (currency === "USD") {
        update.weightRateUSD = Math.max(0, Number(editorDraft.weightUSD) || 0);
        update.timeRateUSD = Math.max(0, Number(editorDraft.timeUSD) || 0);
      } else if (currency === "JPY") {
        update.weightRateJPY = Math.max(0, Number(editorDraft.weightJPY) || 0);
        update.timeRateJPY = Math.max(0, Number(editorDraft.timeJPY) || 0);
      } else if (currency === "EUR") {
        update.weightRateEUR = Math.max(0, Number(editorDraft.weightEUR) || 0);
        update.timeRateEUR = Math.max(0, Number(editorDraft.timeEUR) || 0);
      }
      setOverrides((prev) => ({
        ...prev,
        [editorKey]: {
          ...(prev[editorKey] || {}),
          ...update,
        },
      }));
    }
    setEditorOpen(false);
  }
  function resetEditorToDefault() {
    if (editorKey === "CUSTOM") {
      const draft = { label: "Custom" };
      if (currency === "THB") {
        draft.weightTHB = 10;
        draft.timeTHB = 3;
      } else if (currency === "USD") {
        draft.weightUSD = 0.40;
        draft.timeUSD = 0.12;
      } else if (currency === "JPY") {
        draft.weightJPY = 57;
        draft.timeJPY = 17;
      } else if (currency === "EUR") {
        draft.weightEUR = 0.37;
        draft.timeEUR = 0.11;
      }
      setEditorDraft(draft);
    } else if (editorKey) {
      const base = findBaseByKey(editorKey);
      if (base) {
        const draft = { label: base.label };
        if (currency === "THB") {
          draft.weightTHB = base.weightRateTHB;
          draft.timeTHB = base.timeRateTHB;
        } else if (currency === "USD") {
          draft.weightUSD = base.weightRateUSD;
          draft.timeUSD = base.timeRateUSD;
        } else if (currency === "JPY") {
          draft.weightJPY = base.weightRateJPY;
          draft.timeJPY = base.timeRateJPY;
        } else if (currency === "EUR") {
          draft.weightEUR = base.weightRateEUR;
          draft.timeEUR = base.timeRateEUR;
        }
        setEditorDraft(draft);
      }
    }
  }

  // ===== UI =====
  return (
    <>
      {/* Main wrapper */}
      <div className="min-h-screen w-full text-neutral-100 antialiased">
        <div className="mx-auto max-w-3xl px-4 pb-28 pt-2 sm:pt-3">
          {/* Header */}
          <header className="mb-3 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">3D Print Cost Calculator 1.0</h1>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={currency}
                onChange={(e) => handleCurrencyChange(e.target.value)}
                className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 outline-none ring-0 focus:border-neutral-500 hover:bg-neutral-800 transition-colors"
              >
                <option value="THB">THB (฿)</option>
                <option value="JPY">JPY (¥)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
              
              {/* User Authentication */}
              {loading ? (
                <div className="w-8 h-8 rounded-full border-2 border-neutral-700 border-t-neutral-400 animate-spin"></div>
              ) : user ? (
                <div className="flex items-center gap-2">
                  {saving && (
                    <span className="text-xs text-neutral-400 hidden sm:inline">Saving...</span>
                  )}
                  <div className="flex items-center gap-2 px-2 py-1 rounded-lg border border-neutral-800 bg-neutral-900">
                    {user.photoURL ? (
                      <img 
                        src={user.photoURL} 
                        alt={user.displayName || "User"} 
                        className="w-6 h-6 rounded-full"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center text-xs">
                        {user.displayName ? user.displayName.charAt(0).toUpperCase() : "U"}
                      </div>
                    )}
                    <span className="text-xs text-neutral-300 hidden sm:inline max-w-[120px] truncate">
                      {user.displayName || user.email}
                    </span>
                    <button
                      onClick={handleLogout}
                      className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                      title="Sign out"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleGoogleLogin}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900 text-sm text-neutral-100 hover:bg-neutral-800 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span className="hidden sm:inline">Sign in</span>
                </button>
              )}
            </div>
          </header>

          {/* Card */}
          <div className="rounded-2xl border border-neutral-800/70 bg-neutral-900/60 p-3 shadow-xl ring-1 ring-black/30 sm:p-4">
            {/* Material selector */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-300">Filament type</label>
              <div className="grid grid-cols-5 gap-1.5">
                {MATERIALS.map((m) => (
                  <div key={m.key} className="relative">
                    <button
                      onClick={() => setMaterial(m.key)}
                      className={classNames(
                        "group relative w-full rounded-lg border p-1 text-left text-[11px] font-medium transition-all focus:outline-none",
                        material === m.key ? "border-white/40 bg-white/10 shadow-inner" : "border-neutral-800 bg-neutral-900 hover:bg-neutral-800"
                      )}
                      style={{ boxShadow: material === m.key ? `0 0 0 1px ${m.color} inset, 0 6px 20px -10px ${m.color}66` : undefined }}
                    >
                      <span className="mb-0.5 inline-block h-4 w-4 rounded" style={{ background: m.color }} aria-hidden />
                      <div className="leading-tight">
                        <div className="truncate text-[12px]">{m.label}</div>
                        <div className="mt-0.5 text-[10px] text-neutral-400">
                          {(() => {
                            let weightRate, timeRate;
                            if (currency === "USD") {
                              weightRate = m.weightRateUSD;
                              timeRate = m.timeRateUSD;
                            } else if (currency === "JPY") {
                              weightRate = m.weightRateJPY;
                              timeRate = m.timeRateJPY;
                            } else if (currency === "EUR") {
                              weightRate = m.weightRateEUR;
                              timeRate = m.timeRateEUR;
                            } else {
                              weightRate = m.weightRateTHB;
                              timeRate = m.timeRateTHB;
                            }
                            const weightRateFormatted = formatRate(weightRate, currency);
                            const timeRateFormatted = formatRate(timeRate, currency);
                            const symbol = CURRENCIES[currency].symbol;
                            return `${symbol}${weightRateFormatted}/g • ${symbol}${timeRateFormatted}/min`;
                          })()}
                        </div>
                      </div>
                    </button>

                    {/* Gear button (ALL materials, incl. CUSTOM) — top-right */}
                    <button
                      className="absolute top-0.5 right-0.5 z-10 inline-flex h-5 w-5 items-center justify-center rounded text-[9px] hover:opacity-70 active:opacity-50"
                      onClick={(e) => { e.stopPropagation(); openEditorFor(m.key); }}
                      title={`Edit ${m.label}`}
                    >
                      ⚙️
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Weight */}
            <div className="mt-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-neutral-300 whitespace-nowrap">Filament usage</label>
                <div className="w-[120px]">
                  <div className="relative">
                    <input className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-base outline-none ring-0 focus:border-neutral-500" type="number" inputMode="decimal" min={0} max={9999} step={1} value={grams} onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || (val.length <= 4 && (!val.includes('.') || val.split('.')[0].length <= 4))) {
                        setGrams(val);
                      }
                    }} onFocus={(e) => e.target.select()} />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500">g.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Time */}
            <div className="mt-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-neutral-300 whitespace-nowrap">Print time</label>
                <div className="grid grid-cols-3 gap-2 sm:max-w-[384px]">
                  <div className="relative">
                    <input className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-base outline-none ring-0 focus:border-neutral-500" type="number" inputMode="numeric" min={0} max={9999} step={1} value={days} onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || val.length <= 4) {
                        setDays(val);
                      }
                    }} onFocus={(e) => e.target.select()} />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500">day</span>
                  </div>
                  <div className="relative">
                    <input className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-base outline-none ring-0 focus:border-neutral-500" type="number" inputMode="numeric" min={0} max={9999} step={1} value={hours} onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || val.length <= 4) {
                        setHours(val);
                      }
                    }} onFocus={(e) => e.target.select()} />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500">hr</span>
                  </div>
                  <div className="relative">
                    <input className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-base outline-none ring-0 focus:border-neutral-500" type="number" inputMode="numeric" min={0} max={9999} step={1} value={minutes} onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || val.length <= 4) {
                        setMinutes(val);
                      }
                    }} onFocus={(e) => e.target.select()} />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500">min</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Colors */}
            <div className="mt-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-neutral-300 whitespace-nowrap">Number of colors</label>
                <div className="w-[120px]">
                  <input className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-base outline-none ring-0 placeholder:text-neutral-500 focus:border-neutral-500" type="number" inputMode="numeric" min={1} max={9999} step={1} placeholder="Number of colors" value={colors} onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || val.length <= 4) {
                      setColors(val);
                    }
                  }} onFocus={(e) => e.target.select()} />
                </div>
              </div>
            </div>

            {/* Rule */}
            <div className="mt-4">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-medium text-neutral-400 whitespace-nowrap">Rule</label>
                <p className="text-[10px] text-neutral-500">
                  {(() => {
                    const parts = [];
                    if (discountEnabled) {
                      parts.push(`* ${discountPercentage}% discount at ≥${discountThreshold}g`);
                    }
                    if (colorSurchargeEnabled) {
                      parts.push(`+${colorSurchargePercentage}% per extra color`);
                    }
                    if (minimumSurchargeEnabled) {
                      parts.push(`Min: ${formatCurrency(minimumSurchargeAmount, currency)}`);
                    }
                    if (parts.length === 0) {
                      return 'Discount and color surcharge disabled';
                    }
                    return parts.join(' • ');
                  })()}
                </p>
              </div>
            </div>

            {/* Summary / Breakdown */}
            <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/70 p-3 sm:p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-neutral-100">Summary</h3>
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={(e) => { if (summaryText) copySummary(e); }} 
                    disabled={!summaryText} 
                    className={"rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-[10px] font-medium hover:bg-neutral-700 active:translate-y-[1px] touch-manipulation" + (!summaryText ? " opacity-50 cursor-not-allowed hover:bg-neutral-800" : "")}
                    type="button"
                  >
                    {copied ? "✓ Copied" : "Copy text"}
                  </button>
                  <button onClick={resetAll} className="rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-[10px] font-medium hover:bg-neutral-700 active:translate-y-[1px]">Reset</button>
                  <button
                    onClick={() => setShowAdvancedOptions(true)}
                    className="rounded-lg border border-neutral-700 bg-neutral-800/50 px-2 py-1 text-[10px] text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
                  >
                    Advanced Options
                  </button>
                </div>
              </div>

              <div className="min-h-[36px] rounded-lg bg-neutral-950 p-2.5 text-sm text-neutral-200" role="status">{summaryText}</div>

              {/* Two method cards with automatic fade on the inactive one */}
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-neutral-300">
                {/* Weight card */}
                <div
                  className={classNames(
                    "rounded-lg border p-2 transition",
                    result.useWeight ? "" : "border-neutral-800 bg-neutral-900 opacity-60 saturate-0"
                  )}
                  style={result.useWeight ? { borderColor: selected.color, backgroundColor: hexToRgba(selected.color, 0.1), boxShadow: `0 0 0 1px ${selected.color} inset` } : undefined}
                  aria-disabled={!result.useWeight}
                >
                  <div className="mb-0.5">
                    <span className={classNames(
                      "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
                      result.useWeight 
                        ? "border-white/30 bg-white/10 text-white" 
                        : "border-neutral-700 bg-neutral-800/50 text-neutral-500"
                    )}>
                      Based on weight
                    </span>
                  </div>
                  <div className="text-sm text-neutral-400">Base: {formatCurrency(result.baseWeight, currency)}</div>
                  <div className="text-sm text-neutral-400">{parsed.c} {parsed.c === 1 ? "color" : "colors"}: + {formatCurrency(result.withColorsWeight - result.baseWeight, currency)}</div>
                  <div className="mt-0.5 text-sm flex items-center gap-2">
                    Final: 
                    {(() => {
                      // Calculate what finalWeight would be WITHOUT minimum (before minimum was applied)
                      const finalWeightBeforeMin = result.withColorsWeight * result.discountMultiplier;
                      
                      // Check if discount is applied
                      const discountApplied = result.discountEligible;
                      // Check if minimum is actually being applied (price before minimum is below minimum)
                      const minimumApplied = minimumSurchargeEnabled && finalWeightBeforeMin < minimumSurchargeAmount;
                      
                      // Determine what to show
                      if (discountApplied && minimumApplied) {
                        // Both discount and minimum applied - show withColorsWeight strikethrough, then final in orange
                        return (
                          <>
                            <span className="font-semibold text-red-400 line-through">{formatCurrency(result.withColorsWeight, currency)}</span>
                            <span className="font-semibold text-orange-400">{formatCurrency(result.finalWeight, currency)}</span>
                          </>
                        );
                      } else if (discountApplied) {
                        // Only discount applied - show withColorsWeight strikethrough, then final
                        return (
                          <>
                            <span className="font-semibold text-red-400 line-through">{formatCurrency(result.withColorsWeight, currency)}</span>
                            <span className="font-semibold text-emerald-400">{formatCurrency(result.finalWeight, currency)}</span>
                          </>
                        );
                      } else if (minimumApplied) {
                        // Only minimum applied - show final price in orange (no strikethrough)
                        return <span className="font-semibold text-orange-400">{formatCurrency(result.finalWeight, currency)}</span>;
                      }
                      // No discount, no minimum - show final price
                      return <span className="font-semibold text-emerald-400">{formatCurrency(result.finalWeight, currency)}</span>;
                    })()}
                  </div>
                </div>

                {/* Time card */}
                <div
                  className={classNames(
                    "rounded-lg border p-2 transition",
                    !result.useWeight ? "" : "border-neutral-800 bg-neutral-900 opacity-60 saturate-0"
                  )}
                  style={!result.useWeight ? { borderColor: selected.color, backgroundColor: hexToRgba(selected.color, 0.1), boxShadow: `0 0 0 1px ${selected.color} inset` } : undefined}
                  aria-disabled={result.useWeight}
                >
                  <div className="mb-0.5">
                    <span className={classNames(
                      "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
                      !result.useWeight 
                        ? "border-white/30 bg-white/10 text-white" 
                        : "border-neutral-700 bg-neutral-800/50 text-neutral-500"
                    )}>
                      Based on time
                    </span>
                  </div>
                  <div className="text-sm text-neutral-400">Base: {formatCurrency(result.baseTime, currency)}</div>
                  <div className="text-sm text-neutral-400">{parsed.c} {parsed.c === 1 ? "color" : "colors"}: + {formatCurrency(result.withColorsTime - result.baseTime, currency)}</div>
                  <div className="mt-0.5 text-sm flex items-center gap-2">
                    Final: 
                    {(() => {
                      // Calculate what finalTime would be WITHOUT minimum (before minimum was applied)
                      const finalTimeBeforeMin = result.withColorsTime;
                      
                      // Check if minimum is actually being applied (price before minimum is below minimum)
                      const minimumApplied = minimumSurchargeEnabled && finalTimeBeforeMin < minimumSurchargeAmount;
                      
                      // Determine what to show
                      if (minimumApplied) {
                        // Minimum applied - show final price in orange (no strikethrough)
                        return <span className="font-semibold text-orange-400">{formatCurrency(result.finalTime, currency)}</span>;
                      }
                      // No minimum - show final price
                      return <span className="font-semibold text-emerald-400">{formatCurrency(result.finalTime, currency)}</span>;
                    })()}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-400">
                {result.useWeight && result.discountEligible && (
                  <span className="rounded-full border border-neutral-800 bg-neutral-900 px-1.5 py-0.5">Discount applied (−{discountPercentage}%)</span>
                )}
                {colorSurchargeEnabled && (parsed.c - 1) * colorSurchargePercentage > 0 && (
                  <span className="rounded-full border border-neutral-800 bg-neutral-900 px-1.5 py-0.5">Colors surcharge: {(parsed.c - 1) * colorSurchargePercentage}%</span>
                )}
                {minimumSurchargeEnabled && (() => {
                  // Calculate original final before minimum was applied
                  const originalFinalBeforeMin = result.useWeight 
                    ? (result.withColorsWeight * result.discountMultiplier)
                    : result.withColorsTime;
                  // Check if minimum was actually applied (original price was below minimum)
                  const isMinimumApplied = originalFinalBeforeMin < minimumSurchargeAmount;
                  return isMinimumApplied ? (
                    <span className="rounded-full border border-neutral-800 bg-neutral-900 px-1.5 py-0.5">Min: {formatCurrency(minimumSurchargeAmount, currency)}</span>
                  ) : null;
                })()}
                <span className="rounded-full border border-neutral-800 bg-neutral-900 px-1.5 py-0.5">Picked: {result.useWeight ? "Weight" : "Time"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1 truncate">
              <span className="inline-block h-3 w-3 rounded flex-shrink-0" style={{ background: selected.color }} aria-hidden />
              <span className="text-xs text-neutral-400 truncate">{selected.label}</span>
            </div>
            <div className="truncate text-lg font-semibold leading-tight text-white">{formatCurrency(result.final, currency)}</div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              ref={addToCartButtonRef}
              onClick={addToCart} 
              disabled={!summaryText} 
              className={"rounded-xl bg-emerald-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 active:translate-y-[1px]" + (!summaryText ? " opacity-50 cursor-not-allowed hover:bg-emerald-500/90" : "")}
            >
              Add to cart
            </button>
            <button 
              ref={viewCartButtonRef}
              onClick={() => setShowCart(true)} 
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 active:translate-y-[1px] relative"
            >
              View cart ({cart.length})
            </button>
          </div>
        </div>
      </footer>

      {/* Cart Modal (popup) */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowCart(false)} />
          <div className="relative z-10 w-full max-w-3xl rounded-t-2xl sm:rounded-2xl border border-neutral-800 bg-neutral-900/95 p-4 sm:p-6 shadow-2xl ring-1 ring-black/40">
            <div className="mb-3 flex items-center justify-between">
              {/* Compact: small cart on one line, no bold */}
              <div className="min-w-0 text-neutral-300 text-sm sm:text-base leading-tight">
                <span className="align-middle" aria-hidden>🛒</span>
                <span className="ml-1 align-middle">{cart.length} {cart.length === 1 ? "item" : "items"}•Total {formatCurrency(cartTotal, currency)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowCart(false)} className="rounded-md border border-white/80 bg-white px-3.5 py-1.5 text-sm text-neutral-900 hover:bg-neutral-200 focus:outline-none focus:ring-2 focus:ring-white/60">Close</button>
              </div>
            </div>

            {cart.length === 0 ? (
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900">🛍️</div>
                <div className="text-base text-neutral-200">Cart is empty</div>
                <div className="mt-1 text-sm text-neutral-400">Add items from the calculator below.</div>
              </div>
            ) : (
              <>
                <ul className="relative grid max-h-[60vh] gap-2 overflow-auto">
                  {cart.map((it) => {
                    const discountApplied = it.method.startsWith("Based on weight") && it.grams >= discountThreshold && discountEnabled;
                    const colorDelta = it.withColors - it.base;
                    return (
                      <li key={it.id} className="flex items-stretch gap-2">
                        <div className="flex-1 rounded-lg border border-neutral-800 bg-neutral-950/90 p-2.5">
                          <div className="min-w-0 leading-tight">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className="inline-block h-4 w-4 rounded flex-shrink-0" style={{ background: it.color }} aria-hidden />
                              <span className="text-base font-semibold text-neutral-100">{it.material}</span>
                              <span className="text-sm text-neutral-400">{it.grams}g. {it.days > 0 ? `${it.days}d` : ""}{it.hours}h{it.minutes}m</span>
                            </div>
                            <div className="mt-1.5 pt-1.5 border-t border-neutral-800">
                              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                <span className="shrink-0 rounded-md border border-neutral-700/60 bg-neutral-800/40 px-2 py-0.5 text-xs font-semibold text-neutral-300">{it.method}</span>
                                {discountApplied && (<span className="shrink-0 rounded-md border border-emerald-700/60 bg-emerald-900/40 px-2 py-0.5 text-xs font-semibold text-emerald-300">-20%</span>)}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-sm text-neutral-300">
                                <span className="text-neutral-500">Base:</span>
                                <span className="text-neutral-200">{formatCurrency(it.base, currency)}</span>
                                <span className="text-neutral-600">+</span>
                                <span className="text-neutral-500">Colors:</span>
                                <span className="text-neutral-200">{formatCurrency(colorDelta, currency)}</span>
                                <span className="text-neutral-600">=</span>
                                <span className="text-emerald-400 font-semibold">{formatCurrency(it.final, currency)}</span>
                              </div>
                            </div>
                            <details className="mt-1.5">
                              <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300 transition-colors">Details</summary>
                              <div className="mt-1 text-xs text-neutral-400 bg-neutral-900/50 rounded p-1.5">{it.summary}</div>
                            </details>
                          </div>
                        </div>
                        <div className="shrink-0 flex items-start pt-0.5">
                          <button onClick={() => removeFromCart(it.id)} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm leading-none text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50 transition-colors" aria-label="Remove">✕</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="sticky bottom-0 mt-3 border-t border-neutral-800 bg-gradient-to-t from-neutral-900 via-neutral-900/95 to-transparent px-4 pt-3 pb-2">
                  <div className="flex items-center justify-between">
                    <div className="text-base text-neutral-300">Total ({cart.length} {cart.length === 1 ? "item" : "items"})</div>
                    <div className="text-2xl font-extrabold tracking-tight text-white">{formatCurrency(cartTotal, currency)}</div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Material Editor (generic) */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setEditorOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-t-2xl sm:rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-neutral-100 flex items-center gap-1">
                <span className="text-[9px]">⚙️</span>
                {(() => {
                  const materialColor = editorKey === 'CUSTOM' 
                    ? customColor 
                    : (MATERIALS.find((m) => m.key === editorKey)?.color || findBaseByKey(editorKey)?.color || '#ffffff');
                  return (
                    <>
                      <span className="inline-block h-4 w-4 rounded flex-shrink-0" style={{ background: materialColor }} aria-hidden />
                      {editorDraft.label || (editorKey === 'CUSTOM' ? 'Custom Material' : (findBaseByKey(editorKey)?.label || 'Material'))}
                    </>
                  );
                })()}
              </h4>
              <button onClick={() => setEditorOpen(false)} className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-[11px] hover:bg-neutral-700">Close</button>
            </div>
            <div className="grid gap-3 text-sm">
              <label className="grid gap-1">
                <span className="text-neutral-200">Name</span>
                <input className="max-w-[240px] rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-base text-neutral-100 outline-none ring-0 placeholder:text-neutral-400 focus:border-neutral-500" value={editorDraft.label} onChange={(e)=>setEditorDraft(v=>({...v,label:e.target.value}))} />
              </label>
              
              {/* Current Currency Rates */}
              {(() => {
                const currencyConfig = CURRENCIES[currency];
                const currencySymbol = currencyConfig.symbol;
                const currencyCode = currencyConfig.code;
                
                // Get the rate field names based on currency
                let weightField, timeField, weightValue, timeValue, step, inputMode, maxValue;
                if (currency === "THB") {
                  weightField = "weightTHB";
                  timeField = "timeTHB";
                  weightValue = editorDraft.weightTHB;
                  timeValue = editorDraft.timeTHB;
                  step = 0.1;
                  inputMode = "decimal";
                  maxValue = 999.9;
                } else if (currency === "USD") {
                  weightField = "weightUSD";
                  timeField = "timeUSD";
                  weightValue = editorDraft.weightUSD;
                  timeValue = editorDraft.timeUSD;
                  step = 0.01;
                  inputMode = "decimal";
                  maxValue = 999.9;
                } else if (currency === "JPY") {
                  weightField = "weightJPY";
                  timeField = "timeJPY";
                  weightValue = editorDraft.weightJPY;
                  timeValue = editorDraft.timeJPY;
                  step = 1;
                  inputMode = "numeric";
                  maxValue = 9999;
                } else if (currency === "EUR") {
                  weightField = "weightEUR";
                  timeField = "timeEUR";
                  weightValue = editorDraft.weightEUR;
                  timeValue = editorDraft.timeEUR;
                  step = 0.01;
                  inputMode = "decimal";
                  maxValue = 999.9;
                }

                return (
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
                    <div className="mb-2 text-xs font-medium text-neutral-300">{currencyCode} Rates</div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="grid gap-1">
                        <span className="text-xs text-neutral-400">Material cost ({currencyCode})</span>
                        <div className="relative">
                          <input 
                            type="number" 
                            inputMode={inputMode}
                            min={0} 
                            max={maxValue} 
                            step={step} 
                            className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-base outline-none ring-0 focus:border-neutral-500 text-neutral-100"
                            value={weightValue} 
                            onChange={(e) => {
                              const val = e.target.value;
                              if (currency === "JPY") {
                                if (val === '' || val.length <= 4) {
                                  setEditorDraft(v => ({ ...v, [weightField]: val === '' ? 0 : Number(val || 0) }));
                                }
                              } else {
                                const parts = val.split('.');
                                const intPart = parts[0];
                                const maxDecimals = currency === "THB" ? 1 : 2;
                                if (val === '' || (intPart.length <= 4 && (!val.includes('.') || parts[1]?.length <= maxDecimals))) {
                                  setEditorDraft(v => ({ ...v, [weightField]: val === '' ? 0 : Number(val || 0) }));
                                }
                              }
                            }} 
                            onFocus={(e) => e.target.select()} 
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500">{currencySymbol}/g</span>
                        </div>
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs text-neutral-400">Time cost ({currencyCode})</span>
                        <div className="relative">
                          <input 
                            type="number" 
                            inputMode={inputMode}
                            min={0} 
                            max={maxValue} 
                            step={step} 
                            className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-base outline-none ring-0 focus:border-neutral-500 text-neutral-100"
                            value={timeValue} 
                            onChange={(e) => {
                              const val = e.target.value;
                              if (currency === "JPY") {
                                if (val === '' || val.length <= 4) {
                                  setEditorDraft(v => ({ ...v, [timeField]: val === '' ? 0 : Number(val || 0) }));
                                }
                              } else {
                                const parts = val.split('.');
                                const intPart = parts[0];
                                const maxDecimals = currency === "THB" ? 1 : 2;
                                if (val === '' || (intPart.length <= 4 && (!val.includes('.') || parts[1]?.length <= maxDecimals))) {
                                  setEditorDraft(v => ({ ...v, [timeField]: val === '' ? 0 : Number(val || 0) }));
                                }
                              }
                            }} 
                            onFocus={(e) => e.target.select()} 
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500">{currencySymbol}/min</span>
                        </div>
                      </label>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <button className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-100 hover:bg-neutral-700" onClick={resetEditorToDefault}>Reset default</button>
              <div className="flex items-center gap-2">
                <button className="rounded-md px-3 py-1.5 text-xs text-neutral-300 hover:text-white" onClick={()=>setEditorOpen(false)}>Cancel</button>
                <button className="rounded-md bg-emerald-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500" onClick={saveEditor}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Options Modal */}
      {showAdvancedOptions && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowAdvancedOptions(false)} />
          <div className="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-neutral-800 bg-neutral-900 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-neutral-100">Advanced Options</h4>
              <button onClick={() => setShowAdvancedOptions(false)} className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-[10px] hover:bg-neutral-700">Close</button>
            </div>
            
            <div className="grid gap-3 text-sm">
              {/* Discount Settings */}
              <div className={classNames("rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 transition-all duration-300 ease-in-out", !discountEnabled && "opacity-50")} style={{ willChange: 'opacity' }}>
                <div className="mb-2 flex items-center justify-between">
                  <span className={classNames("text-sm font-medium transition-colors duration-300 ease-in-out", discountEnabled ? "text-neutral-100" : "text-neutral-500")}>Enable Discount</span>
                  <button
                    type="button"
                    onClick={() => setDiscountEnabled(!discountEnabled)}
                    className={classNames(
                      "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-900",
                      discountEnabled ? "bg-emerald-500" : "bg-neutral-700"
                    )}
                  >
                    <span
                      className={classNames(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        discountEnabled ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
                <div className="grid gap-2 mt-2">
                    <label className="grid gap-1">
                      <span className={classNames("text-xs transition-colors duration-300 ease-in-out", discountEnabled ? "text-neutral-300" : "text-neutral-600")}>Discount Threshold</span>
                      <div className="w-[140px]">
                        <div className="relative">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={9999}
                            step={1}
                            className={classNames("w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-base outline-none placeholder:text-neutral-400 focus:border-neutral-500 transition-colors duration-300 ease-in-out", discountEnabled ? "text-neutral-100" : "text-neutral-500 cursor-not-allowed")}
                            disabled={!discountEnabled}
                            value={discountThresholdInput !== '' ? discountThresholdInput : (discountThreshold || '')}
                            onChange={(e) => {
                              if (!discountEnabled) return;
                              const val = e.target.value;
                              if (val === '' || val.length <= 4) {
                                setDiscountThresholdInput(val);
                                if (val === '') {
                                  setDiscountThreshold(0);
                                } else {
                                  const num = Number(val);
                                  if (!isNaN(num) && num >= 0 && num <= 9999) {
                                    setDiscountThreshold(num);
                                  }
                                }
                              }
                            }}
                            onFocus={(e) => {
                              e.target.select();
                              setDiscountThresholdInput(discountThreshold.toString());
                            }}
                            onBlur={(e) => {
                              const val = e.target.value;
                              if (val === '' || val === '0') {
                                setDiscountThreshold(0);
                                setDiscountThresholdInput('');
                              } else {
                                setDiscountThresholdInput('');
                              }
                            }}
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500">g.</span>
                        </div>
                      </div>
                    </label>
                    <label className="grid gap-1">
                      <span className={classNames("text-xs transition-colors duration-300 ease-in-out", discountEnabled ? "text-neutral-300" : "text-neutral-600")}>Discount Percentage</span>
                      <div className="w-[140px]">
                        <div className="relative">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={100}
                            step={1}
                            className={classNames("w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-base outline-none placeholder:text-neutral-400 focus:border-neutral-500 transition-colors duration-300 ease-in-out", discountEnabled ? "text-neutral-100" : "text-neutral-500 cursor-not-allowed")}
                            disabled={!discountEnabled}
                            value={discountPercentageInput !== '' ? discountPercentageInput : (discountPercentage || '')}
                            onChange={(e) => {
                              if (!discountEnabled) return;
                              const val = e.target.value;
                              setDiscountPercentageInput(val);
                              if (val === '') {
                                setDiscountPercentage(0);
                              } else {
                                const num = Number(val);
                                if (!isNaN(num) && num >= 0 && num <= 100) {
                                  setDiscountPercentage(num);
                                }
                              }
                            }}
                            onFocus={(e) => {
                              e.target.select();
                              setDiscountPercentageInput(discountPercentage.toString());
                            }}
                            onBlur={(e) => {
                              const val = e.target.value;
                              if (val === '' || val === '0') {
                                setDiscountPercentage(0);
                                setDiscountPercentageInput('');
                              } else {
                                setDiscountPercentageInput('');
                              }
                            }}
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500">%</span>
                        </div>
                      </div>
                    </label>
                    <div className="mt-1.5 text-[10px] text-neutral-400">
                      <p className={classNames("transition-colors duration-300 ease-in-out", discountEnabled ? "text-neutral-500" : "text-neutral-600")}>{discountPercentage}% discount triggers when weight ≥ {discountThreshold}g (applied after color surcharge, weight method only).</p>
                    </div>
                  </div>
              </div>

              {/* Color Surcharge Settings */}
              <div className={classNames("rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 transition-all duration-300 ease-in-out", !colorSurchargeEnabled && "opacity-50")} style={{ willChange: 'opacity' }}>
                <div className="mb-2 flex items-center justify-between">
                  <span className={classNames("text-sm font-medium transition-colors duration-300 ease-in-out", colorSurchargeEnabled ? "text-neutral-100" : "text-neutral-500")}>Multi color Surcharge</span>
                  <button
                    type="button"
                    onClick={() => setColorSurchargeEnabled(!colorSurchargeEnabled)}
                    className={classNames(
                      "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-900",
                      colorSurchargeEnabled ? "bg-emerald-500" : "bg-neutral-700"
                    )}
                  >
                    <span
                      className={classNames(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        colorSurchargeEnabled ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
                <div className="grid gap-2 mt-2">
                    <label className="grid gap-1">
                      <span className={classNames("text-xs transition-colors duration-300 ease-in-out", colorSurchargeEnabled ? "text-neutral-300" : "text-neutral-600")}>Color Surcharge per Extra Color</span>
                      <div className="w-[140px]">
                        <div className="relative">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={999.9}
                            step={0.1}
                            className={classNames("w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-base outline-none placeholder:text-neutral-400 focus:border-neutral-500 transition-colors duration-300 ease-in-out", colorSurchargeEnabled ? "text-neutral-100" : "text-neutral-500 cursor-not-allowed")}
                            disabled={!colorSurchargeEnabled}
                            value={colorSurchargePercentageInput !== '' ? colorSurchargePercentageInput : (colorSurchargePercentage || '')}
                            onChange={(e) => {
                              if (!colorSurchargeEnabled) return;
                              const val = e.target.value;
                              const parts = val.split('.');
                              const intPart = parts[0];
                              if (val === '' || (intPart.length <= 4 && (!val.includes('.') || parts[1].length <= 1))) {
                                setColorSurchargePercentageInput(val);
                                if (val === '') {
                                  setColorSurchargePercentage(0);
                                } else {
                                  const num = Number(val);
                                  if (!isNaN(num) && num >= 0 && num <= 999.9) {
                                    setColorSurchargePercentage(num);
                                  }
                                }
                              }
                            }}
                            onFocus={(e) => {
                              e.target.select();
                              setColorSurchargePercentageInput(colorSurchargePercentage.toString());
                            }}
                            onBlur={(e) => {
                              const val = e.target.value;
                              if (val === '' || val === '0') {
                                setColorSurchargePercentage(0);
                                setColorSurchargePercentageInput('');
                              } else {
                                setColorSurchargePercentageInput('');
                              }
                            }}
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500">%</span>
                        </div>
                      </div>
                    </label>
                    <div className="mt-1.5 text-[10px] text-neutral-400">
                      <p className={classNames("transition-colors duration-300 ease-in-out", colorSurchargeEnabled ? "text-neutral-500" : "text-neutral-600")}>Each extra color adds +{colorSurchargePercentage}% before discount. (2 colors → +{colorSurchargePercentage}%, 3 → +{colorSurchargePercentage * 2}%, ...)</p>
                    </div>
                  </div>
              </div>

              {/* Minimum Price Settings */}
              <div className={classNames("rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 transition-all duration-300 ease-in-out", !minimumSurchargeEnabled && "opacity-50")} style={{ willChange: 'opacity' }}>
                <div className="mb-2 flex items-center justify-between">
                  <span className={classNames("text-sm font-medium transition-colors duration-300 ease-in-out", minimumSurchargeEnabled ? "text-neutral-100" : "text-neutral-500")}>Enable Minimum Price</span>
                  <button
                    type="button"
                    onClick={() => setMinimumSurchargeEnabled(!minimumSurchargeEnabled)}
                    className={classNames(
                      "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 focus:ring-offset-neutral-900",
                      minimumSurchargeEnabled ? "bg-emerald-500" : "bg-neutral-700"
                    )}
                  >
                    <span
                      className={classNames(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        minimumSurchargeEnabled ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
                <div className="grid gap-2 mt-2">
                    <label className="grid gap-1">
                      <span className={classNames("text-xs transition-colors duration-300 ease-in-out", minimumSurchargeEnabled ? "text-neutral-300" : "text-neutral-600")}>Minimum Price ({currency})</span>
                      <div className="w-[140px]">
                        <div className="relative">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={9999}
                            step={1}
                            className={classNames("w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-base outline-none placeholder:text-neutral-400 focus:border-neutral-500 transition-colors duration-300 ease-in-out", minimumSurchargeEnabled ? "text-neutral-100" : "text-neutral-500 cursor-not-allowed")}
                            disabled={!minimumSurchargeEnabled}
                            placeholder={CURRENCIES[currency].defaultMin.toString()}
                            value={minimumSurchargeAmountInput !== '' ? minimumSurchargeAmountInput : (minimumSurchargeAmount > 0 ? minimumSurchargeAmount.toString() : '')}
                            onChange={(e) => {
                              if (!minimumSurchargeEnabled) return;
                              const val = e.target.value;
                              if (val === '' || val.length <= 4) {
                                setMinimumSurchargeAmountInput(val);
                                if (val === '') {
                                  setMinimumSurchargeAmount(0);
                                } else {
                                  const num = Number(val);
                                  if (!isNaN(num) && num >= 0 && num <= 9999) {
                                    setMinimumSurchargeAmount(num);
                                  }
                                }
                              }
                            }}
                            onFocus={(e) => {
                              e.target.select();
                              setMinimumSurchargeAmountInput(minimumSurchargeAmount > 0 ? minimumSurchargeAmount.toString() : CURRENCIES[currency].defaultMin.toString());
                            }}
                            onBlur={(e) => {
                              const val = e.target.value;
                              if (val === '' || val === '0') {
                                setMinimumSurchargeAmount(CURRENCIES[currency].defaultMin);
                                setMinimumSurchargeAmountInput('');
                              } else {
                                const num = Number(val);
                                if (!isNaN(num) && num >= 0 && num <= 9999) {
                                  setMinimumSurchargeAmount(num);
                                }
                                setMinimumSurchargeAmountInput('');
                              }
                            }}
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500">{CURRENCIES[currency].symbol}</span>
                        </div>
                      </div>
                    </label>
                    <div className="mt-1.5 text-[10px] text-neutral-400">
                      <p className={classNames("transition-colors duration-300 ease-in-out", minimumSurchargeEnabled ? "text-neutral-500" : "text-neutral-600")}>If the final price (based on weight or time) is below the minimum, the minimum price will be used instead. Default: {formatCurrency(CURRENCIES[currency].defaultMin, currency)}.</p>
                    </div>
                  </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                className="rounded-md px-2.5 py-1 text-[10px] text-neutral-300 hover:text-white"
                onClick={() => {
                  setDiscountEnabled(true);
                  setDiscountThreshold(100);
                  setDiscountPercentage(20);
                  setColorSurchargeEnabled(true);
                  setColorSurchargePercentage(15);
                  setMinimumSurchargeEnabled(true);
                  setMinimumSurchargeAmount(CURRENCIES[currency].defaultMin);
                }}
              >
                Reset to Default
              </button>
              <button
                className="rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                onClick={() => setShowAdvancedOptions(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Currency Change Warning Modal */}
      {showCurrencyWarning && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={cancelCurrencyChange} />
          <div className="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-6 shadow-2xl ring-1 ring-black/40">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-neutral-100 mb-2">Change Currency?</h3>
              <p className="text-sm text-neutral-300">
                You have {cart.length} {cart.length === 1 ? "item" : "items"} in your cart. Changing currency will remove all items from the cart.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={cancelCurrencyChange}
                className="rounded-md border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-700"
              >
                Cancel
              </button>
              <button
                onClick={confirmCurrencyChange}
                className="rounded-md bg-orange-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
              >
                Change Currency
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Cart Animation */}
      {isAnimating && (
        <div 
          className="fixed z-50 pointer-events-none"
          style={{
            left: `${animationPos.endX}px`,
            top: `${animationPos.endY}px`,
            transform: 'translate(-50%, -50%)',
            '--delta-y': `${animationPos.startY - animationPos.endY}px`,
          }}
        >
          <div 
            className="text-3xl animate-drop-to-cart"
            style={{
              filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))',
            }}
          >
            📦
          </div>
        </div>
      )}

      <style>{`
        @keyframes dropToCart {
          0% {
            transform: translate(-50%, calc(-50% + var(--delta-y, 0px))) scale(1);
            opacity: 1;
          }
          60% {
            transform: translate(-50%, -50%) scale(1.2);
            opacity: 1;
          }
          80% {
            transform: translate(-50%, -50%) scale(0.9);
            opacity: 0.9;
          }
          100% {
            transform: translate(-50%, -50%) scale(0.3);
            opacity: 0;
          }
        }
        .animate-drop-to-cart {
          animation: dropToCart 1s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        /* Hide number input spinners */
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
        }
      `}</style>
    </>
  );
}
