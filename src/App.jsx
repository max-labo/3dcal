import React, { useMemo, useState, useEffect, useRef } from "react";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, googleProvider, db } from "./firebase";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, ShoppingCart, Trash2, Copy, RotateCcw, Plus, Minus, Check, Info, Undo, Pencil, ChevronLeft, ChevronRight, Save, History, Menu, X } from "lucide-react";


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
  { key: "PETG", label: "PETG", weightRateTHB: 3, timeRateTHB: 1.4, weightRateUSD: 0.12, timeRateUSD: 0.05, weightRateJPY: 17, timeRateJPY: 7, weightRateEUR: 0.11, timeRateEUR: 0.04, color: "#22C55E" },
  { key: "PETG-CF", label: "PETG-CF", weightRateTHB: 5, timeRateTHB: 1.6, weightRateUSD: 0.20, timeRateUSD: 0.05, weightRateJPY: 28, timeRateJPY: 7, weightRateEUR: 0.19, timeRateEUR: 0.04, color: "#f59e0b" },
  { key: "TPU", label: "TPU", weightRateTHB: 6, timeRateTHB: 1.6, weightRateUSD: 0.24, timeRateUSD: 0.05, weightRateJPY: 34, timeRateJPY: 7, weightRateEUR: 0.22, timeRateEUR: 0.04, color: "#F43F5E" },
  { key: "PAHT-CF", label: "PAHT-CF", weightRateTHB: 9, timeRateTHB: 2, weightRateUSD: 0.32, timeRateUSD: 0.11, weightRateJPY: 45, timeRateJPY: 16, weightRateEUR: 0.30, timeRateEUR: 0.10, color: "#60a5fa" },
  { key: "ASA", label: "ASA", weightRateTHB: 7, timeRateTHB: 1.8, weightRateUSD: 0.24, timeRateUSD: 0.06, weightRateJPY: 38, timeRateJPY: 10, weightRateEUR: 0.21, timeRateEUR: 0.05, color: "#fef08a" },
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

const InfoTooltip = ({ content, id, activeTooltip, setActiveTooltip }) => {
  return (
    <div className="relative inline-flex items-center">
      <Info 
        className="w-3 h-3 text-neutral-500 cursor-pointer hover:text-neutral-300 transition-colors" 
        onClick={(e) => {
          e.stopPropagation();
          setActiveTooltip(activeTooltip === id ? null : id);
        }}
      />
      <AnimatePresence>
        {activeTooltip === id && (
          <motion.div 
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 p-2 bg-black/95 border border-white/10 rounded-lg text-[10px] text-neutral-200 w-44 shadow-2xl z-50 text-center backdrop-blur-md font-normal leading-normal select-none"
          >
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-black/95" />
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  // ===== State =====
  const [currency, setCurrency] = useState("THB"); // Default to THB
  const [material, setMaterial] = useState("PETG");
  const [grams, setGrams] = useState("");
  const [days, setDays] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [colors, setColors] = useState("1");
  const [editingItemId, setEditingItemId] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [direction, setDirection] = useState(1); // 1 = next, -1 = prev
  const [copied, setCopied] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [shippingEnabled, setShippingEnabled] = useState(false);
  const [shippingCost, setShippingCost] = useState("60");
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [showCurrencyWarning, setShowCurrencyWarning] = useState(false);
  const [showBrackets, setShowBrackets] = useState(true);
  const [pendingCurrency, setPendingCurrency] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationPos, setAnimationPos] = useState({ startX: 0, startY: 0, endX: 0, endY: 0 });
  const addToCartButtonRef = useRef(null);
  const viewCartButtonRef = useRef(null);
  
  // Advanced options
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [discountEnabled, setDiscountEnabled] = useState(true);
  const [discountTimeEnabled, setDiscountTimeEnabled] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState(null);
  
  // Shipping details
  const [showShippingInputModal, setShowShippingInputModal] = useState(false);
  const [shippingInputValue, setShippingInputValue] = useState('60');
  const [discountTiers, setDiscountTiers] = useState([
    { threshold: 100, percentage: 10 },
    { threshold: 300, percentage: 20 },
    { threshold: 1000, percentage: 30 }
  ]);
  const [colorSurchargeEnabled, setColorSurchargeEnabled] = useState(true);
  const [colorSurchargePercentage, setColorSurchargePercentage] = useState(15); // 15% per extra color
  const [minimumSurchargeEnabled, setMinimumSurchargeEnabled] = useState(false);
  // Minimum price defaults based on currency (default to USD since currency starts as USD)
  const [minimumSurchargeAmount, setMinimumSurchargeAmount] = useState(CURRENCIES.USD.defaultMin);
  // Temporary input values for easier editing
  const [colorSurchargePercentageInput, setColorSurchargePercentageInput] = useState('');
  const [minimumSurchargeAmountInput, setMinimumSurchargeAmountInput] = useState('');

  const [savedOrders, setSavedOrders] = useState([]);
  const [showSaveOrderModal, setShowSaveOrderModal] = useState(false);
  const [saveOrderNameInput, setSaveOrderNameInput] = useState("");
  const [showRestoreConfirmModal, setShowRestoreConfirmModal] = useState(false);
  const [pendingRestoreOrder, setPendingRestoreOrder] = useState(null);
  
  // New States for web popups
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [showRemoveSavedOrderConfirmModal, setShowRemoveSavedOrderConfirmModal] = useState(false);
  const [pendingRemoveSavedOrder, setPendingRemoveSavedOrder] = useState(null);
  const [showSavedOrdersModal, setShowSavedOrdersModal] = useState(false);
  const [showCartMenu, setShowCartMenu] = useState(false);

  // Overrides for built-in materials (label, rates) - currency-aware
  const [overrides, setOverrides] = useState({}); // { [key]: { label, weightRateTHB, timeRateTHB, weightRateUSD, timeRateUSD } }

  // Custom materials - supports multiple items
  const [customMaterials, setCustomMaterials] = useState([
    { 
      key: "CUSTOM", label: "Custom", 
      weightRateTHB: 10, timeRateTHB: 3, 
      weightRateUSD: 0.40, timeRateUSD: 0.12, 
      weightRateJPY: 57, timeRateJPY: 17, 
      weightRateEUR: 0.37, timeRateEUR: 0.11, 
      color: "#a855f7" 
    }
  ]);

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

  // Build materials list with overrides applied; insert Custom materials at end
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
    return [...list, ...customMaterials];
  }, [overrides, customMaterials]);

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

  const isEmpty = !String(grams).trim() && !String(days).trim() && !String(hours).trim() && !String(minutes).trim();

  const result = useMemo(() => {
    const { g, totalMinutes, c } = parsed;
    const colorPct = colorSurchargeEnabled ? Math.max(0, (c - 1) * (colorSurchargePercentage / 100)) : 0;

    // Evaluate tiered discounts
    const activeTiers = discountTiers
      .map(t => ({ threshold: Number(t.threshold) || 0, percentage: Number(t.percentage) || 0 }))
      .filter(t => t.percentage > 0)
      .sort((a, b) => b.threshold - a.threshold);

    const matchedTier = activeTiers.find(t => g >= t.threshold);
    const activeDiscountPercentage = matchedTier ? matchedTier.percentage : 0;
    const discountEligible = discountEnabled && activeDiscountPercentage > 0;
    const discountEligibleTime = discountTimeEnabled && activeDiscountPercentage > 0;

    // Weight path
    const baseWeight = g * materialRates.weightRate;
    const withColorsWeight = baseWeight * (1 + colorPct);
    const discountMultiplier = discountEligible ? (1 - activeDiscountPercentage / 100) : 1;
    let finalWeight = withColorsWeight * discountMultiplier;

    // Time path
    const baseTime = totalMinutes * materialRates.timeRate;
    const withColorsTime = baseTime * (1 + colorPct);
    const discountMultiplierTime = discountEligibleTime ? (1 - activeDiscountPercentage / 100) : 1;
    let finalTime = withColorsTime * discountMultiplierTime;

    // Apply minimum price to both weight and time if enabled (before comparison)
    if (minimumSurchargeEnabled) {
      finalWeight = Math.max(finalWeight, minimumSurchargeAmount);
      finalTime = Math.max(finalTime, minimumSurchargeAmount);
    }

    const useWeight = finalWeight >= finalTime; // pick higher cost
    const final = useWeight ? finalWeight : finalTime;

    return { 
      baseWeight, withColorsWeight, finalWeight, 
      baseTime, withColorsTime, finalTime, 
      discountEligible, colorPct, useWeight, final, 
      discountMultiplier, activeDiscountPercentage 
    };
  }, [parsed, materialRates, discountEnabled, discountTiers, colorSurchargeEnabled, colorSurchargePercentage, minimumSurchargeEnabled, minimumSurchargeAmount]);

  const summaryText = useMemo(() => {
    if (!String(grams).trim()) return ""; // Blank until grams provided
    const { g, d, h, m } = parsed;
    const dInt = Math.max(0, Math.floor(d));
    const hInt = Math.max(0, Math.floor(h));
    const mInt = Math.max(0, Math.floor(m));
    const timeStr = dInt > 0 ? `${dInt}d${hInt}h${mInt}m` : `${hInt}h${mInt}m`;
    const costText = formatCurrency(result.final, currency);
    const withBaht = currency === "THB" ? costText.replace(" ฿", " บาท") : costText;
    const useW = result.useWeight;
    const formattedWeight = showBrackets && useW ? `(${g}g.)` : `${g}g.`;
    const formattedTime = showBrackets && !useW ? `(${timeStr})` : timeStr;
    return `${selected.label} ${formattedWeight} ${formattedTime} = ${withBaht}`;
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
        customMaterials,
        discountEnabled,
        discountTimeEnabled,
        discountTiers,
        colorSurchargeEnabled,
        colorSurchargePercentage,
        minimumSurchargeEnabled,
        minimumSurchargeAmount,
        showBrackets, 
        cart, 
        savedOrders, 
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
        if (data.customMaterials !== undefined && Array.isArray(data.customMaterials)) {
            setCustomMaterials(data.customMaterials);
        } else if (data.customLabel) {
            setCustomMaterials([{
                key: "CUSTOM", 
                label: data.customLabel, 
                weightRateTHB: data.customWeightRateTHB ?? 10,
                timeRateTHB: data.customTimeRateTHB ?? 3,
                weightRateUSD: data.customWeightRateUSD ?? 0.40,
                timeRateUSD: data.customTimeRateUSD ?? 0.12,
                weightRateJPY: data.customWeightRateJPY ?? 57,
                timeRateJPY: data.customTimeRateJPY ?? 17,
                weightRateEUR: data.customWeightRateEUR ?? 0.37,
                timeRateEUR: data.customTimeRateEUR ?? 0.11,
                color: "#a855f7"
            }]);
        }
        if (data.discountEnabled !== undefined) setDiscountEnabled(data.discountEnabled);
        if (data.discountTimeEnabled !== undefined) setDiscountTimeEnabled(data.discountTimeEnabled);
        if (data.discountTiers !== undefined && Array.isArray(data.discountTiers)) setDiscountTiers(data.discountTiers);
        if (data.colorSurchargeEnabled !== undefined) setColorSurchargeEnabled(data.colorSurchargeEnabled);
        if (data.colorSurchargePercentage !== undefined) setColorSurchargePercentage(data.colorSurchargePercentage);
        if (data.minimumSurchargeEnabled !== undefined) setMinimumSurchargeEnabled(data.minimumSurchargeEnabled);
        if (data.showBrackets !== undefined) setShowBrackets(data.showBrackets);
        
        // Load minimum surcharge amount (set immediately, React will batch updates)
        if (data.minimumSurchargeAmount !== undefined) {
          setMinimumSurchargeAmount(data.minimumSurchargeAmount);
        }
        
        // Load cart items
        if (data.cart !== undefined && Array.isArray(data.cart)) {
          setCart(data.cart);
          console.log("Cart loaded:", data.cart.length, "items");
        }
        
        if (data.savedOrders !== undefined && Array.isArray(data.savedOrders)) {
          setSavedOrders(data.savedOrders);
          console.log("Saved orders loaded:", data.savedOrders.length);
        }
        
        console.log("All settings loaded successfully");
      } else {
        console.log("No settings document found in Firestore for user:", currentUser.uid);
        console.log("This is normal for first-time users. Settings will be created when you make changes.");
      }
      
      // Use requestAnimationFrame for faster state update completion check
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          isLoadingSettingsRef.current = false;
          isInitialLoadRef.current = false;
          console.log("Settings loading complete. Auto-save is now enabled.");
        });
      });
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
    customMaterials,
    discountEnabled,
    discountTiers,
    colorSurchargeEnabled,
    colorSurchargePercentage,
    minimumSurchargeEnabled,
    minimumSurchargeAmount,
    cart, 
    savedOrders, 
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
        // Load settings immediately
        try {
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
        textArea.style.top = '10px';
        textArea.style.left = '10px';
        textArea.style.width = '1px';
        textArea.style.height = '1px';
        textArea.style.padding = '0';
        textArea.style.border = 'none';
        textArea.style.outline = 'none';
        textArea.style.boxShadow = 'none';
        textArea.style.background = 'transparent';
        textArea.style.fontSize = '16px'; // Prevent Safari auto-zoom bounce
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
  function resetAll() { 
    setMaterial("PETG"); setGrams(""); setDays(""); setHours(""); setMinutes(""); setColors("1"); setCopied(false); 
    setEditingItemId(null); 
  }
  function saveEdit() {
    if (!summaryText || !editingItemId) return;
    const { g, d, h, m, c } = parsed;
    const useW = result.useWeight;
    setCart(prev => prev.map(it => it.id === editingItemId ? {
      ...it,
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
      appliedDiscount: result.activeDiscountPercentage || 0,
      summary: summaryText,
    } : it));
    resetAll();
  }
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
      appliedDiscount: result.activeDiscountPercentage || 0,
      summary: summaryText,
    };
    
    // Calculate positions for animation - start from Add to Cart button to View Cart button
    if (viewCartButtonRef.current && addToCartButtonRef.current) {
      const startRect = addToCartButtonRef.current.getBoundingClientRect();
      const endRect = viewCartButtonRef.current.getBoundingClientRect();
      setAnimationPos({
        startX: startRect.left + startRect.width / 2,
        startY: startRect.top + startRect.height / 2,
        endX: endRect.left + endRect.width / 2,
        endY: endRect.top + endRect.height / 2,
      });
    }
    
    // Trigger animation
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 400);
    
    setCart((prev) => [item, ...prev]);
    resetAll();
  }
  function removeFromCart(id) { setCart((prev) => prev.filter((it) => it.id !== id)); }
  function handleClearCartClick() {
    setShowClearConfirmModal(true);
  }
  function confirmClearCart() {
    setCart([]);
    setShowClearConfirmModal(false);
  }

  function handleRemoveSavedOrderClick(id, name) {
    setPendingRemoveSavedOrder({ id, name });
    setShowRemoveSavedOrderConfirmModal(true);
  }
  function confirmRemoveSavedOrder() {
    if (pendingRemoveSavedOrder) {
      setSavedOrders(prev => prev.filter(order => order.id !== pendingRemoveSavedOrder.id));
      setPendingRemoveSavedOrder(null);
      setShowRemoveSavedOrderConfirmModal(false);
    }
  }

  function saveOrder(name) {
    if (!name.trim()) return;
    let baseName = name.trim();
    let finalName = baseName;
    let counter = 1;

    while (savedOrders.some(order => order.name === finalName)) {
      finalName = `${baseName} (${counter})`;
      counter++;
    }

    const newOrder = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      name: finalName,
      items: [...cart],
      timestamp: new Date().toISOString(),
    };
    setSavedOrders(prev => [newOrder, ...prev]);
    setShowSaveOrderModal(false);
    setSaveOrderNameInput("");
  }
  function restoreOrder(order) {
    if (cart.length > 0) {
      setPendingRestoreOrder(order);
      setShowRestoreConfirmModal(true);
    } else {
      setCart([...order.items]);
      setShowSavedOrdersModal(false);
    }
  }
  function confirmRestore() {
    if (pendingRestoreOrder) {
      setCart([...pendingRestoreOrder.items]);
      setPendingRestoreOrder(null);
      setShowRestoreConfirmModal(false);
      setShowSavedOrdersModal(false);
    }
  }
  function editItem(item) {
    if (item.isShipping) {
      setShippingInputValue(item.final);
      setEditingItemId(item.id);
      setShowShippingInputModal(true);
      setShowCart(false);
      return;
    }
    const found = MATERIALS.find(m => m.label === item.material) || MATERIALS[0];
    setMaterial(found.key);
    setGrams(item.grams || "");
    setDays(item.days || "");
    setHours(item.hours || "");
    setMinutes(item.minutes || "");
    setColors(String(item.colors || 1));
    setEditingItemId(item.id);
    setShowCart(false);
  }
  const cartTotal = useMemo(() => cart.reduce((sum, it) => sum + it.final, 0), [cart]);

  // ===== Material Editor Helpers =====
  function getRandomColor(excludeColors = []) {
    const presets = [
      "#ec4899", "#f43f5e", "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
      "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
      "#8b5cf6", "#a855f7", "#d946ef", "#64748b"
    ];
    const available = presets.filter(c => !excludeColors.includes(c.toLowerCase()));
    return available.length > 0 ? available[Math.floor(Math.random() * available.length)] : presets[0];
  }

  function addNewCustomMaterial() {
    const existingLabels = customMaterials.map(m => m.label);
    let cnt = 1;
    while (existingLabels.includes(cnt === 1 ? "Custom" : `Custom${cnt}`)) { cnt++; }
    const label = cnt === 1 ? "Custom" : `Custom${cnt}`;
    const key = `CUSTOM_${Date.now()}`;
    const existingColors = [...BASE_MATERIALS, ...customMaterials].map(m => m.color.toLowerCase());
    const color = getRandomColor(existingColors);
    const newItem = {
      key, label, color,
      weightRateTHB: 10, timeRateTHB: 3, weightRateUSD: 0.40, timeRateUSD: 0.12,
      weightRateJPY: 57, timeRateJPY: 17, weightRateEUR: 0.37, timeRateEUR: 0.11
    };
    setCustomMaterials(prev => [...prev, newItem]);
    setMaterial(key);
  }

  function openEditorFor(key) {
    setEditorKey(key);
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
    setEditorOpen(true);
  }

  function saveEditor() {
    const { label } = editorDraft;
    if (!editorKey) return;
    const update = { label: (label || "").trim() };
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
    if (editorKey.startsWith("CUSTOM")) {
      setCustomMaterials((prev) => prev.map((m) => m.key === editorKey ? { ...m, ...update } : m));
    } else {
      setOverrides((prev) => ({ ...prev, [editorKey]: { ...(prev[editorKey] || {}), ...update } }));
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

  const itemsPerPage = 4;
  const totalPages = Math.ceil((MATERIALS.length + 1) / itemsPerPage);
  const currentItems = MATERIALS.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage);
  
  const gridDisplayItems = [...currentItems];
  if (currentPage === totalPages - 1) {
    gridDisplayItems.push({ key: "ADD_NEW_ITEM", isAddButton: true });
  }

  useEffect(() => {
    if (totalPages > 0 && currentPage >= totalPages) {
      setCurrentPage(totalPages - 1);
    }
  }, [totalPages, currentPage]);

  const pageVariants = {
    enter: (dir) => ({ x: dir > 0 ? 100 : -100, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: dir > 0 ? -100 : 100, opacity: 0 })
  };

  // ===== UI =====
  return (
    <>
      {/* Main wrapper */}
      <div className="min-h-[100dvh] w-full min-w-[320px] md:min-w-[480px] text-neutral-100 antialiased flex flex-col items-center justify-start sm:justify-center relative overflow-hidden">
        {/* Ambient glow effects behind the card */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
        <div className="w-full max-w-[540px] px-4 pb-8 pt-3 sm:pt-4 z-10">
          {/* Header */}
          <header className="mb-2 flex items-center justify-between">
            <div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={currency}
                onChange={(e) => handleCurrencyChange(e.target.value)}
                className="h-9 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md px-3 text-center text-sm font-medium text-neutral-200 outline-none ring-0 focus:border-neutral-500 hover:bg-neutral-800/80 hover:border-white/20 transition-all cursor-pointer shadow-sm"
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
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md shadow-sm">
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
                  className="h-9 flex items-center gap-2 px-3 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md shadow-sm text-sm font-medium text-neutral-200 hover:bg-white/10 hover:border-white/20 transition-all hover:-translate-y-0.5"
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
          <div className="rounded-3xl border border-white/10 backdrop-blur-2xl bg-neutral-900/40 p-3 sm:p-5 shadow-2xl shadow-black/50 ring-1 ring-white/5 relative overflow-hidden">
            {/* Subtle card interior glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            {/* Material selector */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-sm font-medium text-neutral-300">Filament type</label>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1 bg-black/40 border border-white/5 rounded-lg px-1 py-0.5">
                    <button 
                      onClick={(e) => { e.preventDefault(); setDirection(-1); setCurrentPage(prev => Math.max(0, prev - 1)); }}
                      disabled={currentPage === 0}
                      className="p-1 rounded-md hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-400 hover:text-white transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] text-neutral-400 font-bold select-none px-1">{currentPage + 1} / {totalPages}</span>
                    <button 
                      onClick={(e) => { e.preventDefault(); setDirection(1); setCurrentPage(prev => Math.min(totalPages - 1, prev + 1)); }}
                      disabled={currentPage === totalPages - 1}
                      className="p-1 rounded-md hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-400 hover:text-white transition-colors"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <AnimatePresence mode="popLayout" custom={direction}>
                <motion.div
                  key={currentPage}
                  custom={direction}
                  variants={pageVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ type: "spring", stiffness: 400, damping: 38 }}
                  className="grid grid-cols-4 gap-1.5"
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.4}
                  onDragEnd={(e, { offset }) => {
                    const swipeThreshold = 50; 
                    if (offset.x < -swipeThreshold && currentPage < totalPages - 1) {
                      setDirection(1);
                      setCurrentPage(prev => prev + 1);
                    } else if (offset.x > swipeThreshold && currentPage > 0) {
                      setDirection(-1);
                      setCurrentPage(prev => prev - 1);
                    }
                  }}
                >
                  {gridDisplayItems.map((m) => m.isAddButton ? (
                  <motion.button
                    key="add-new-filament"
                    onClick={(e) => { e.preventDefault(); addNewCustomMaterial(); }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="group relative w-full h-full rounded-xl border border-dashed border-white/20 bg-white/5 hover:bg-emerald-500/5 hover:border-emerald-500/30 p-2 text-center flex flex-col items-center justify-center transition-all min-h-[52px] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-neutral-400 group-hover:text-emerald-400 group-hover:scale-110 transition-all" />
                    <span className="text-[10px] text-neutral-400 font-medium group-hover:text-emerald-300 mt-0.5">Add</span>
                  </motion.button>
                ) : (
                  <div key={m.key} className="relative">
                    <motion.button
                      onClick={() => setMaterial(m.key)}
                      whileHover={{ scale: 1.02, translateY: -1 }}
                      whileTap={{ scale: 0.98 }}
                      className={classNames(
                        "group relative w-full rounded-xl border p-2 text-left transition-all duration-300 ease-out focus:outline-none overflow-hidden",
                        material === m.key 
                          ? "border-white/20 bg-white/10 shadow-lg z-10" 
                          : "border-white/5 bg-black/40 hover:bg-white/5 hover:border-white/10"
                      )}
                      style={{ 
                        boxShadow: material === m.key ? `0 0 0 1px ${m.color}55 inset, 0 8px 16px -4px ${m.color}66, inset 0 16px 24px -12px ${m.color}33` : undefined,
                        borderColor: material === m.key ? `${m.color}88` : undefined
                      }}
                    >
                      <span className="mb-1 inline-block h-3.5 w-3.5 rounded-full shadow-sm" style={{ background: m.color, boxShadow: `0 0 8px ${m.color}88` }} aria-hidden />
                      <div className="leading-tight">
                        <div className="truncate text-sm font-bold text-neutral-100">{m.label}</div>
                        <div className="mt-0.5 text-[11px] font-medium text-neutral-300">
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
                    </motion.button>

                    {/* Gear button (ALL materials, incl. CUSTOM) — top-right */}
                    <motion.button
                      whileHover={{ scale: 1.1, rotate: 15 }}
                      whileTap={{ scale: 0.9 }}
                      className="absolute top-1 right-1 z-20 inline-flex h-5 w-5 items-center justify-center rounded-md text-neutral-400 hover:text-neutral-200 hover:bg-white/10 transition-colors"
                      onClick={(e) => { e.stopPropagation(); openEditorFor(m.key); }}
                      title={`Edit ${m.label}`}
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </motion.button>
                  </div>
                ))}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Weight */}
            <div className="mt-2">
              <div className="flex items-center gap-3">
                <label className="w-1/3 sm:w-1/4 text-sm font-medium text-neutral-300 pl-1.5 flex items-center gap-1.5">
                  Filament usage
                  {!grams && (
                    <span className="flex h-1.5 w-1.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                    </span>
                  )}
                </label>
                <div className="flex-1 min-w-0">
                  <div className="relative group">
                    <input className="w-full rounded-xl border border-white/5 bg-black/50 px-4 pr-10 py-2 text-lg font-medium text-center outline-none ring-0 focus:border-emerald-500/50 focus:bg-black/80 focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-inner group-hover:border-white/10" type="number" inputMode="decimal" min={0} max={9999} step={1} value={grams} onChange={(e) => {
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
            <div className="mt-2">
              <div className="flex items-center gap-3">
                <label className="w-1/3 sm:w-1/4 text-sm font-medium text-neutral-300 pl-1.5">Print time</label>
                <div className="grid grid-cols-3 gap-2 flex-1 min-w-0 group">
                  <div className="relative">
                    <input className="w-full rounded-xl border border-white/5 bg-black/50 pl-3 pr-8 py-2 text-lg font-medium text-center outline-none ring-0 focus:border-emerald-500/50 focus:bg-black/80 focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-inner group-hover:border-white/10" type="number" inputMode="numeric" min={0} max={99} step={1} value={days} onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || (val.length <= 2 && Number(val) <= 99)) {
                        setDays(val);
                      }
                    }} onFocus={(e) => e.target.select()} />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500">day</span>
                  </div>
                  <div className="relative">
                    <input className="w-full rounded-xl border border-white/5 bg-black/50 pl-3 pr-8 py-2 text-lg font-medium text-center outline-none ring-0 focus:border-emerald-500/50 focus:bg-black/80 focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-inner group-hover:border-white/10" type="number" inputMode="numeric" min={0} max={23} step={1} value={hours} onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || (val.length <= 2 && Number(val) <= 23)) {
                        setHours(val);
                      }
                    }} onFocus={(e) => e.target.select()} />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500">hr</span>
                  </div>
                  <div className="relative">
                    <input className="w-full rounded-xl border border-white/5 bg-black/50 pl-3 pr-8 py-2 text-lg font-medium text-center outline-none ring-0 focus:border-emerald-500/50 focus:bg-black/80 focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-inner group-hover:border-white/10" type="number" inputMode="numeric" min={0} max={59} step={1} value={minutes} onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || (val.length <= 2 && Number(val) <= 59)) {
                        setMinutes(val);
                      }
                    }} onFocus={(e) => e.target.select()} />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500">min</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Colors */}
            <div className="mt-2">
              <div className="flex items-center gap-3">
                <label className="w-1/3 sm:w-1/4 text-sm font-medium text-neutral-300 pl-1.5">Number of colors</label>
                <div className="flex-1 min-w-0 group relative">
                  <input className="w-full rounded-xl border border-white/5 bg-black/50 px-4 py-2 text-lg font-medium text-center outline-none ring-0 placeholder:text-neutral-600 focus:border-emerald-500/50 focus:bg-black/80 focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-inner group-hover:border-white/10" type="number" inputMode="numeric" min={1} max={99} step={1} placeholder="1" value={colors} onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || (val.length <= 2 && Number(val) <= 99)) {
                      setColors(val);
                    }
                  }} onFocus={(e) => e.target.select()} />
                </div>
              </div>
            </div>

            {/* Rule moved to Adv options */}

            {/* Summary / Breakdown */}
            <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm p-3 sm:p-4 shadow-inner relative overflow-hidden">
              {/* Highlight gradient */}
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-neutral-100 flex items-center gap-2">
                  <span className="p-1 rounded bg-white/10 ring-1 ring-white/5">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                  </span>
                  Summary
                </h3>
                <div className="flex items-center gap-2">
                  <div className="flex flex-wrap items-center gap-1 text-[10px] text-neutral-400">
                    {result.useWeight && result.discountEligible && (
                      <span className="rounded-full border border-neutral-800 bg-neutral-900 px-1.5 py-0.5">Discount applied (−{result.activeDiscountPercentage}%)</span>
                    )}
                    {colorSurchargeEnabled && (parsed.c - 1) * colorSurchargePercentage > 0 && (
                      <span className="rounded-full border border-neutral-800 bg-neutral-900 px-1.5 py-0.5">Colors surcharge: {(parsed.c - 1) * colorSurchargePercentage}%</span>
                    )}
                    {minimumSurchargeEnabled && (() => {
                      const originalFinalBeforeMin = result.useWeight 
                        ? (result.withColorsWeight * result.discountMultiplier)
                        : result.withColorsTime;
                      const isMinimumApplied = originalFinalBeforeMin < minimumSurchargeAmount;
                      return isMinimumApplied ? (
                        <span className="rounded-full border border-neutral-800 bg-neutral-900 px-1.5 py-0.5">Min: {formatCurrency(minimumSurchargeAmount, currency)}</span>
                      ) : null;
                    })()}
                    <span className="rounded-full border border-neutral-800 bg-neutral-900 px-1.5 py-0.5">Picked: {result.useWeight ? "Weight" : "Time"}</span>
                  </div>

 

                </div>
              </div>

 


              {/* Two method cards with automatic fade on the inactive one */}
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-neutral-300">
                {/* Weight card */}
                <div
                  className={classNames(
                    "rounded-lg border p-2 transition",
                    (isEmpty || !result.useWeight) ? "border-neutral-800 bg-neutral-900 opacity-60 saturate-0" : ""
                  )}
                  style={(!isEmpty && result.useWeight) ? { borderColor: selected.color, backgroundColor: hexToRgba(selected.color, 0.1), boxShadow: `0 0 0 1px ${selected.color} inset` } : undefined}
                  aria-disabled={isEmpty || !result.useWeight}
                >
                  <div className="mb-1.5 flex justify-between items-center">
                    <span className={classNames(
                      "inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold tracking-wider",
                      result.useWeight 
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" 
                        : "border-white/5 bg-white/5 text-neutral-500 font-medium"
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
                    (isEmpty || result.useWeight) ? "border-neutral-800 bg-neutral-900 opacity-60 saturate-0" : ""
                  )}
                  style={(!isEmpty && !result.useWeight) ? { borderColor: selected.color, backgroundColor: hexToRgba(selected.color, 0.1), boxShadow: `0 0 0 1px ${selected.color} inset` } : undefined}
                  aria-disabled={isEmpty || result.useWeight}
                >
                  <div className="mb-1.5 flex justify-between items-center">
                    <span className={classNames(
                      "inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold tracking-wider",
                      !result.useWeight 
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" 
                        : "border-white/5 bg-white/5 text-neutral-500 font-medium"
                    )}>
                      Based on time
                    </span>
                  </div>
                  <div className="text-sm text-neutral-400">Base: {formatCurrency(result.baseTime, currency)}</div>
                  <div className="text-sm text-neutral-400">{parsed.c} {parsed.c === 1 ? "color" : "colors"}: + {formatCurrency(result.withColorsTime - result.baseTime, currency)}</div>
                  <div className="mt-0.5 text-sm flex items-center gap-2">
                    Final: 
                    {(() => {
                      const finalTimeBeforeMin = result.withColorsTime * (result.discountMultiplierTime || 1);
                      const discountApplied = discountTimeEnabled && result.activeDiscountPercentage > 0;
                      const minimumApplied = minimumSurchargeEnabled && finalTimeBeforeMin < minimumSurchargeAmount;
                      
                      if (discountApplied && minimumApplied) {
                        return (
                          <>
                            <span className="font-semibold text-red-400 line-through">{formatCurrency(result.withColorsTime, currency)}</span>
                            <span className="font-semibold text-orange-400">{formatCurrency(result.finalTime, currency)}</span>
                          </>
                        );
                      } else if (discountApplied) {
                        return (
                          <>
                            <span className="font-semibold text-red-400 line-through">{formatCurrency(result.withColorsTime, currency)}</span>
                            <span className="font-semibold text-emerald-400">{formatCurrency(result.finalTime, currency)}</span>
                          </>
                        );
                      } else if (minimumApplied) {
                        return <span className="font-semibold text-orange-400">{formatCurrency(result.finalTime, currency)}</span>;
                      }
                      return <span className="font-semibold text-emerald-400">{formatCurrency(result.finalTime, currency)}</span>;
                    })()}
                  </div>
                </div>
              </div>

              <div 
                className="mt-4 min-h-[42px] rounded-xl bg-black/60 backdrop-blur-sm p-2.5 text-sm font-bold text-white flex items-center justify-center text-center transition-all duration-300" 
                role="status"
                style={{ 
                  boxShadow: summaryText ? `0 0 20px -5px ${hexToRgba(selected.color, 0.4)}` : 'none',
                  borderColor: summaryText ? hexToRgba(selected.color, 0.3) : 'transparent',
                  borderWidth: '1px'
                }}
              >
                {summaryText}
              </div>

              <div className="mt-2.5 flex items-center justify-center gap-2">
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowAdvancedOptions(true)} 
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold hover:bg-white/10 transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                  title="Advanced Options"
                >
                  <Settings className="w-3 h-3" />
                  <span>Advanced</span>
                </motion.button>

                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={resetAll} 
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold hover:bg-white/10 transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </motion.button>

                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => { if (summaryText) copySummary(e); }} 
                  disabled={!summaryText} 
                  className={classNames(
                    "rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold hover:bg-white/10 transition-all flex items-center gap-1 shadow-sm",
                    !summaryText ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                  )}
                  type="button"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? "Copied!" : "Copy"}</span>
                </motion.button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-black/60 backdrop-blur-xl supports-[backdrop-filter]:bg-black/40 pb-safe">
        <div className="mx-auto flex max-w-[540px] items-center justify-between gap-3 px-4 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1 truncate">
              <span className="inline-block h-3 w-3 rounded flex-shrink-0" style={{ background: selected.color }} aria-hidden />
              <span className="text-xs text-neutral-400 truncate">{selected.label}</span>
            </div>
            <div className="truncate text-lg font-semibold leading-tight text-white">{formatCurrency(result.final, currency)}</div>
          </div>
          <div className="flex items-center gap-2">
            {/* Text Summary Icon Button Removed */}

            {/* View Cart Icon Button with Badge */}
            <button 
              ref={viewCartButtonRef}
              onClick={() => setShowCart(true)} 
              className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-2 text-white transition-all active:scale-[0.98] relative group flex items-center justify-center aspect-square"
              title="View Cart"
            >
              <ShoppingCart className="w-4 h-4" />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-neutral-900 shadow-md">
                  {cart.length}
                </span>
              )}
            </button>

            {/* Add to Cart - Compact text button */}
            <button 
              ref={addToCartButtonRef}
              onClick={editingItemId ? saveEdit : addToCart} 
              disabled={!summaryText} 
              className={classNames(
                "rounded-xl px-4 py-2 text-sm font-semibold text-white transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg flex items-center gap-1.5 flex-1 justify-center sm:flex-initial",
                !summaryText 
                  ? "opacity-50 cursor-not-allowed bg-neutral-800 text-neutral-400 border border-white/5 shadow-none" 
                  : "bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 border border-emerald-400/30 shadow-emerald-500/20"
              )}
            >
              {editingItemId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{editingItemId ? "Save Edit" : "Add to cart"}</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Cart Modal (popup) */}
      <AnimatePresence>
        {showCart && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm" 
              onClick={() => { if (showCartMenu) setShowCartMenu(false); else setShowCart(false); }} 
            />
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              className="relative z-10 w-full max-w-[540px] rounded-t-3xl sm:rounded-3xl border border-white/10 bg-neutral-900/90 p-4 sm:p-6 shadow-2xl ring-1 ring-white/5 backdrop-blur-xl overflow-hidden"
            >
              {/* Top ambient glow */}
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-[60px] pointer-events-none" />
              
              <div className="mb-4 flex items-center justify-between gap-1 sm:gap-2 relative z-20 w-full">
                <div className="min-w-0 text-neutral-200 text-sm font-semibold flex items-center gap-1.5 shrink-0">
                  <ShoppingCart className="w-5 h-5 text-emerald-400" />
                  <span>{cart.length} {cart.length === 1 ? "item" : "items"}</span>
                </div>

                <div className="flex items-center gap-1 sm:gap-2 ml-auto">
                  {cart.length > 0 && (
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowSummaryModal(true)} 
                      className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-emerald-300 hover:bg-emerald-500/20 transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                      title="Text Summary"
                    >
                      <Copy className="w-4 h-4" />
                      <span className="text-xs font-medium">Text Summary</span>
                    </motion.button>
                  )}

                  <div className="relative">
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowCartMenu(!showCartMenu)} 
                      className="rounded-xl border border-white/10 bg-white/5 p-1.5 text-neutral-200 hover:bg-white/10 transition-all cursor-pointer shadow-sm flex items-center justify-center aspect-square"
                      title="Menu"
                    >
                      <Menu className="w-4 h-4" />
                    </motion.button>

                    {showCartMenu && (
                      <div className="fixed inset-0 z-20 bg-transparent cursor-default" onClick={() => setShowCartMenu(false)} />
                    )}

                    <AnimatePresence>
                      {showCartMenu && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 mt-2 w-48 rounded-xl border border-white/10 bg-neutral-950 p-1.5 shadow-2xl backdrop-blur-xl z-30 flex flex-col gap-0.5"
                        >
                          {/* Add Shipping */}
                          {cart.length > 0 && (
                            <button 
                              onClick={() => { setShowShippingInputModal(true); setShowCartMenu(false); }}
                              className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 text-xs text-blue-300"
                            >
                              <ShoppingCart className="w-4 h-4" />
                              <span>Add Shipping</span>
                            </button>
                          )}

                          {/* Save Order */}
                          {cart.length > 0 && (
                            <button 
                              onClick={() => { setShowSaveOrderModal(true); setSaveOrderNameInput(""); setShowCartMenu(false); }}
                              className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 text-xs text-neutral-200"
                            >
                              <Save className="w-4 h-4 text-emerald-400" />
                              <span>Save Order</span>
                            </button>
                          )}
                          
                          {/* Saved Orders */}
                          <button 
                            onClick={() => { setShowSavedOrdersModal(true); setShowCartMenu(false); }}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 text-xs text-neutral-200"
                          >
                            <div className="flex items-center gap-2">
                              <History className="w-4 h-4 text-emerald-400" />
                              <span>Saved Orders</span>
                            </div>
                            {savedOrders.length > 0 && (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-neutral-900 shadow-sm">
                                {savedOrders.length}
                              </span>
                            )}
                          </button>


                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { if (showCartMenu) setShowCartMenu(false); setShowCart(false); }}
                    className="rounded-xl border border-white/10 bg-white/5 p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white transition-all cursor-pointer shadow-sm flex items-center justify-center aspect-square -mr-1.5"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>

              {cart.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-2xl border border-white/5 bg-black/40 backdrop-blur-md p-10 text-center relative z-10"
                >
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/5 bg-white/5 text-neutral-400">
                    <ShoppingCart className="w-6 h-6" />
                  </div>
                  <div className="text-base font-semibold text-neutral-100">Cart is empty</div>
                  <div className="mt-1 text-sm text-neutral-400">Add items from the calculator to get started.</div>
                </motion.div>
              ) : (
                <div className="relative z-10">
                  <motion.ul layout className="grid max-h-[50vh] gap-1.5 overflow-auto pr-1">
                    <AnimatePresence initial={false}>
                      {[...cart].sort((a,b) => (a.isShipping ? 1 : b.isShipping ? -1 : (a.id > b.id ? 1 : -1))).map((it, index) => {
                        const pctApplied = it.appliedDiscount !== undefined 
                          ? it.appliedDiscount 
                          : (() => {
                              if (!discountEnabled || !it.method.startsWith("Based on weight")) return 0;
                              const tier = [...discountTiers].sort((a, b) => b.threshold - a.threshold).find(t => it.grams >= t.threshold);
                              return tier ? tier.percentage : 0;
                            })();
                        const discountApplied = pctApplied > 0;
                        const colorDelta = it.withColors - it.base;
                        return (
                          <motion.li 
                            key={it.id} 
                            layout
                            initial={{ opacity: 0, y: 20, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, x: -20, scale: 0.95, filter: "blur(4px)" }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="flex items-stretch gap-2"
                          >
                            <div className="flex-1 rounded-xl border border-white/5 bg-black/40 backdrop-blur-md px-2.5 py-1.5 hover:bg-black/60 transition-colors border-l-2" style={{ borderLeftColor: it.color }}>
                              <div className="min-w-0 leading-tight w-full">
                                <div className="flex items-center justify-between gap-1.5 flex-wrap text-sm w-full">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span 
                                      className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full text-[11px] font-extrabold text-black/80 flex-shrink-0" 
                                      style={{ background: it.color, boxShadow: `0 0 6px ${it.color}aa` }}
                                    >
                                      {index + 1}
                                    </span>
                                    <span className="font-bold text-neutral-100">{it.material}</span>
                                    {!it.isShipping && (
                                      <>
                                        <span className="font-medium text-neutral-500">
                                          {it.method.startsWith("Based on weight") ? `(${it.grams}g)` : `${it.grams}g`}
                                        </span>
                                        <span className="font-medium text-neutral-500">
                                          {it.method.startsWith("Based on time") ? `(${it.days > 0 ? `${it.days}d` : ""}${it.hours}h${it.minutes}m)` : `${it.days > 0 ? `${it.days}d` : ""}${it.hours}h${it.minutes}m`}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                  <span className="text-emerald-400 font-bold ml-auto whitespace-nowrap pl-2">{formatCurrency(it.final, currency).replace('฿', 'บาท')}</span>
                                </div>
                                {!it.isShipping && (
                                  <details className="mt-0.5">
                                    <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-400 transition-colors select-none w-fit">Details</summary>
                                    <div className="mt-0.5 text-xs text-neutral-400 bg-black/30 rounded-lg px-2 py-1.5 border border-white/5">
                                      <div className="mb-2 pb-2 border-b border-white/5 flex flex-wrap items-center gap-2">
                                        <span className="text-[10px] text-neutral-500 bg-neutral-800/40 border border-neutral-800/80 px-1.5 py-0.5 rounded-md leading-none whitespace-nowrap">{it.method}</span>
                                        {discountApplied && (
                                          <span className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-1.5 py-0.5 rounded-md leading-none whitespace-nowrap">-{pctApplied}% off</span>
                                        )}
                                      </div>
                                      <div className="mb-2 pb-2 border-b border-white/5 flex flex-col gap-1.5">
                                        <div className="text-neutral-300">
                                          Base {formatCurrency(it.base, currency).replace('฿', 'บาท')}
                                        </div>
                                        <div className="text-neutral-400">
                                          {it.colors || 1} {(it.colors || 1) === 1 ? 'Color' : 'Colors'} +{formatCurrency(it.withColors - it.base, currency).replace('฿', 'บาท')}
                                        </div>
                                      </div>
                                      {typeof it.summary === 'string' ? it.summary.replace(/฿/g, 'บาท') : it.summary}
                                    </div>
                                  </details>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 flex flex-row items-center gap-0.5 self-center">
                              <motion.button 
                                whileHover={{ scale: 1.1, color: "#38bdf8" }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => editItem(it)} 
                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-neutral-400 hover:bg-blue-500/10 transition-colors" 
                                aria-label="Edit"
                                title="Edit Item"
                              >
                                <Pencil className="w-4 h-4" />
                              </motion.button>
                              <motion.button 
                                whileHover={{ scale: 1.1, color: "#ef4444" }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => removeFromCart(it.id)} 
                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-neutral-400 hover:bg-red-500/10 transition-colors" 
                                aria-label="Remove"
                              >
                                <Trash2 className="w-4 h-4" />
                              </motion.button>
                            </div>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </motion.ul>

                  <div className="sticky bottom-0 mt-3 border-t border-white/5 bg-gradient-to-t from-neutral-900 via-neutral-900/95 to-transparent pt-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <motion.button 
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={handleClearCartClick}
                          className="rounded-xl border border-red-500/20 bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20 transition-all cursor-pointer flex items-center justify-center aspect-square"
                          title="Clear Cart"
                        >
                          <Trash2 className="w-4 h-4" />
                        </motion.button>
                        <div className="text-sm text-neutral-400">Total ({cart.length} {cart.length === 1 ? "item" : "items"})</div>
                      </div>
                      <div className="text-2xl font-extrabold tracking-tight text-white bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">{formatCurrency(cartTotal, currency)}</div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Summary Text Modal */}
      <AnimatePresence>
        {showSummaryModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowSummaryModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 450 }}
              className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-4 shadow-2xl backdrop-blur-xl"
            >
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-neutral-100 flex items-center gap-1.5">
                  <Copy className="w-4 h-4 text-emerald-400" />
                  Cart Summary Text
                </h4>
                <button 
                  onClick={() => setShowSummaryModal(false)} 
                  className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-[10px] hover:bg-neutral-700"
                >
                  Close
                </button>
              </div>

              <div className="relative mb-3">
                <textarea
                  readOnly
                  className="w-full h-40 rounded-lg border border-neutral-800 bg-black/50 p-3 text-xs font-mono text-neutral-200 outline-none resize-none"
                  value={(() => {
                    const lines = [...cart].sort((a,b) => (a.isShipping ? 1 : b.isShipping ? -1 : (a.id > b.id ? 1 : -1))).map(it => {
                      const costText = formatCurrency(it.final, currency);
                      const withBaht = currency === "THB" ? costText.replace(" ฿", " บาท") : costText;
                      
                      if (it.isShipping) {
                        return `${it.material} = ${withBaht}`;
                      }
                      
                      const timeStr = it.days > 0 ? `${it.days}d${it.hours}h${it.minutes}m` : `${it.hours}h${it.minutes}m`;
                      const useW = it.method ? it.method.startsWith("Based on weight") : true;
                      const formattedWeight = showBrackets && useW ? `(${it.grams}g.)` : `${it.grams}g.`;
                      const formattedTime = showBrackets && !useW ? `(${timeStr})` : timeStr;
                      
                      return `${it.material} ${formattedWeight} ${formattedTime} = ${withBaht}`;
                    });
                    const totalCostText = formatCurrency(cart.reduce((sum, item) => sum + item.final, 0), currency);
                    const totalWithBaht = currency === "THB" ? totalCostText.replace(" ฿", " บาท") : totalCostText;
                    return [...lines, "", `Total = ${totalWithBaht}`].join("\n");
                  })()}
                />
              </div>

              <div className="mt-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    const lines = [...cart].sort((a,b) => (a.isShipping ? 1 : b.isShipping ? -1 : (a.id > b.id ? 1 : -1))).map(it => {
                      if (it.isShipping) {
                        return `Shipping = ${formatCurrency(it.final, currency)}`;
                      }
                      const timeStr = it.days > 0 ? `${it.days}d${it.hours}h${it.minutes}m` : `${it.hours}h${it.minutes}m`;
                      const costText = formatCurrency(it.final, currency);
                      const withBaht = currency === "THB" ? costText.replace(" ฿", " บาท") : costText;
                      
                      const useW = it.method ? it.method.startsWith("Based on weight") : true;
                      const formattedWeight = showBrackets && useW ? `(${it.grams}g.)` : `${it.grams}g.`;
                      const formattedTime = showBrackets && !useW ? `(${timeStr})` : timeStr;
                      
                      return `${it.material} ${formattedWeight} ${formattedTime} = ${withBaht}`;
                    });
                    const totalCostText = formatCurrency(cart.reduce((sum, item) => sum + item.final, 0), currency);
                    const totalWithBaht = currency === "THB" ? totalCostText.replace(" ฿", " บาท") : totalCostText;
                    const text = [...lines, "", `Total = ${totalWithBaht}`].join("\n");
                    navigator.clipboard.writeText(text);
                    setCopiedSummary(true);
                    setTimeout(() => setCopiedSummary(false), 2000);
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 py-2.5 text-sm font-bold text-neutral-900 shadow-lg hover:from-emerald-400 hover:to-teal-300 transition-all cursor-pointer border border-emerald-400/20 shadow-emerald-500/20"
                >
                  {copiedSummary ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedSummary ? "Copied!" : "Copy to Clipboard"}</span>
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Shipping Cost Input Modal */}
      <AnimatePresence>
        {showShippingInputModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => { setShowShippingInputModal(false); setEditingItemId(null); setShippingInputValue(""); }}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 450 }}
              className="relative z-10 w-full max-w-xs rounded-2xl border border-white/10 bg-neutral-900 p-4 shadow-2xl backdrop-blur-xl"
            >
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-neutral-100 flex items-center gap-1.5">
                  <ShoppingCart className="w-4 h-4 text-blue-400" />
                  {editingItemId ? "Edit Shipping" : "Add Shipping Cost"}
                </h4>
                <button 
                  onClick={() => { setShowShippingInputModal(false); setEditingItemId(null); setShippingInputValue(""); }} 
                  className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-[10px] hover:bg-neutral-700"
                >
                  Close
                </button>
              </div>

              <div className="relative mb-3">
                <label className="text-xs text-neutral-400 mb-1 block">Shipping Amount ({CURRENCIES[currency].symbol})</label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    className="w-full rounded-lg border border-neutral-800 bg-black/50 p-2.5 text-center text-lg font-bold text-neutral-200 outline-none focus:border-blue-500 transition-all"
                    value={shippingInputValue}
                    onChange={(e) => setShippingInputValue(e.target.value)}
                  />
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  const cost = Number(shippingInputValue) || 0;
                  if (cost >= 0) {
                    if (editingItemId) {
                      setCart(prev => prev.map(it => it.id === editingItemId ? {
                        ...it,
                        final: cost,
                        base: cost,
                        summary: `Shipping: ${formatCurrency(cost, currency)}`
                      } : it));
                      setEditingItemId(null);
                    } else {
                      setCart([...cart, {
                        id: Date.now(),
                        isShipping: true,
                        material: "Shipping",
                        final: cost,
                        base: cost,
                        color: "#38bdf8",
                        grams: 0,
                        hours: 0, minutes: 0, days: 0,
                        method: "Flat Rate",
                        summary: `Shipping: ${formatCurrency(cost, currency)}`
                      }]);
                    }
                    setShowShippingInputModal(false);
                    setShippingInputValue("");
                  }
                }}
                className="w-full flex items-center justify-center gap-1 rounded-xl bg-blue-500 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-400 transition-all cursor-pointer"
              >
                {editingItemId ? "Save" : "Add to Cart"}
              </motion.button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Material Editor (generic) */}
      <AnimatePresence>
        {editorOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setEditorOpen(false)}
            />
            <motion.div
              initial={{ y: "100%", opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: "100%", opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              className="relative z-10 w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-white/10 bg-neutral-900/90 p-4 sm:p-5 shadow-2xl backdrop-blur-xl overflow-hidden"
            >
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-neutral-100 flex items-center gap-1">
                <span className="text-[9px]">⚙️</span>
                {(() => {
                  const materialColor = (MATERIALS.find((m) => m.key === editorKey)?.color || findBaseByKey(editorKey)?.color || '#ffffff');
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
                            className="w-full rounded-lg border border-neutral-800 bg-neutral-950 pl-3 pr-12 py-2 text-base text-center outline-none ring-0 focus:border-neutral-500 text-neutral-100"
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
                            className="w-full rounded-lg border border-neutral-800 bg-neutral-950 pl-3 pr-12 py-2 text-base text-center outline-none ring-0 focus:border-neutral-500 text-neutral-100"
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
              <div className="flex items-center gap-1.5">
                <button className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-100 hover:bg-neutral-700" onClick={resetEditorToDefault}>Reset default</button>
                {editorKey && editorKey.startsWith("CUSTOM") && (
                  <button 
                    onClick={() => {
                      if (confirm(`Are you sure you want to remove ${editorDraft.label || "this material"}?`)) {
                        setCustomMaterials(prev => prev.filter(m => m.key !== editorKey));
                        setEditorOpen(false);
                        setMaterial("PETG"); 
                      }
                    }} 
                    className="p-1 px-1.5 rounded-md border border-red-900/30 bg-red-950/30 hover:bg-red-900/50 text-red-500 hover:text-red-400 transition-all flex items-center justify-center cursor-pointer aspect-square"
                    title="Delete Material"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button className="rounded-md px-3 py-1.5 text-xs text-neutral-300 hover:text-white" onClick={()=>setEditorOpen(false)}>Cancel</button>
                <button className="rounded-md bg-emerald-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500" onClick={saveEditor}>Save</button>
              </div>
            </div>
          </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Advanced Options Modal */}
      <AnimatePresence>
        {showAdvancedOptions && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => { setShowAdvancedOptions(false); setActiveTooltip(null); }}
            />
            <motion.div
              initial={{ y: "100%", opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: "100%", opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              className="relative z-10 w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-white/10 bg-neutral-900/90 p-3 sm:p-4 shadow-2xl backdrop-blur-xl overflow-hidden"
            >
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-neutral-100">Advanced Options</h4>
              <button onClick={() => setShowAdvancedOptions(false)} className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-[10px] hover:bg-neutral-700">Close</button>
            </div>

            {/* Current Rule Summary */}
            <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-black/40 border border-white/5 shadow-inner">
              <label className="text-[11px] font-semibold text-neutral-400 whitespace-nowrap leading-none flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Current rule
              </label>
              <div className="h-3 w-px bg-white/10" />
              <p className="text-[11px] text-neutral-200 font-medium">
                {(() => {
                  const parts = [];
                  if (discountEnabled) {
                    const topTier = [...discountTiers].sort((a,b) => b.threshold - a.threshold)[0];
                    if (topTier) {
                      parts.push(`Up to ${topTier.percentage}% off`);
                    }
                  }
                  if (colorSurchargeEnabled) {
                    parts.push(`+${colorSurchargePercentage}% extra color`);
                  }
                  if (minimumSurchargeEnabled) {
                    parts.push(`Min: ${formatCurrency(minimumSurchargeAmount, currency)}`);
                  }
                  if (parts.length === 0) {
                    return 'No rules active';
                  }
                  return parts.join(' • ');
                })()}
              </p>
            </div>

            <div className="grid gap-2 text-sm">
              {/* Discount Settings */}
              <div className={classNames("rounded-lg border border-neutral-800 bg-neutral-950/50 p-2 transition-all duration-300 ease-in-out", (!discountEnabled && !discountTimeEnabled) && "opacity-50")} style={{ willChange: 'opacity' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className={classNames("text-xs font-medium transition-colors", discountEnabled ? "text-neutral-100" : "text-neutral-500")}>Enable Discount (Weight)</span>
                    <InfoTooltip id="discount" content="Apply discounts automatically when total weight reaches thresholds." activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setDiscountEnabled(!discountEnabled)}
                    className={classNames(
                      "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                      discountEnabled ? "bg-emerald-500" : "bg-neutral-700"
                    )}
                  >
                    <span className={classNames("pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200", discountEnabled ? "translate-x-4" : "translate-x-0")} />
                  </button>
                </div>

                <div className="mt-1 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className={classNames("text-xs font-medium transition-colors", discountTimeEnabled ? "text-neutral-100" : "text-neutral-500")}>Enable Discount (Time)</span>
                    <InfoTooltip id="discountTime" content="Apply the same discount percentages when using Time-based pricing." activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setDiscountTimeEnabled(!discountTimeEnabled)}
                    className={classNames(
                      "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                      discountTimeEnabled ? "bg-emerald-500" : "bg-neutral-700"
                    )}
                  >
                    <span className={classNames("pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200", discountTimeEnabled ? "translate-x-4" : "translate-x-0")} />
                  </button>
                </div>
                
                {(discountEnabled || discountTimeEnabled) && (
                  <div className="mt-1.5 grid gap-1.5">
                    <span className="text-[10px] font-semibold text-neutral-400">Discount Tiers</span>
                    <div className="grid gap-1">
                      {discountTiers.map((tier, index) => (
                        <div key={index} className="flex items-center gap-2 bg-black/40 px-2 py-1 rounded-lg border border-white/5 shadow-inner">
                          <div className="flex-1 flex items-center gap-1">
                            <span className="text-[9px] text-neutral-500 font-medium">Min</span>
                            <div className="relative flex-1">
                              <input 
                                type="number"
                                value={tier.threshold}
                                onChange={(e) => {
                                  const newTiers = [...discountTiers];
                                  newTiers[index].threshold = Number(e.target.value) || 0;
                                  setDiscountTiers(newTiers);
                                }}
                                className="w-full bg-transparent text-xs font-bold outline-none text-neutral-200 p-0"
                              />
                              <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[9px] text-neutral-600">g</span>
                            </div>
                          </div>
                          <div className="flex-1 flex items-center gap-1 pl-1 border-l border-white/5">
                            <div className="relative flex-1">
                              <input 
                                type="number"
                                value={tier.percentage}
                                onChange={(e) => {
                                  const newTiers = [...discountTiers];
                                  newTiers[index].percentage = Number(e.target.value) || 0;
                                  setDiscountTiers(newTiers);
                                }}
                                className="w-full bg-transparent text-xs font-bold outline-none text-neutral-200 p-0 text-right pr-2"
                              />
                              <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[9px] text-neutral-600">%</span>
                            </div>
                          </div>
                          <motion.button
                            whileHover={{ scale: 1.1, color: "#ef4444" }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                              const newTiers = discountTiers.filter((_, i) => i !== index);
                              setDiscountTiers(newTiers);
                            }}
                            className="p-1 text-neutral-500 hover:text-red-400 transition-colors ml-auto"
                          >
                            <Trash2 className="w-3 h-3" />
                          </motion.button>
                        </div>
                      ))}
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setDiscountTiers([...discountTiers, { threshold: 0, percentage: 0 }])}
                      className="flex items-center justify-center gap-1 py-1 border border-dashed border-white/10 rounded-lg text-[10px] text-neutral-400 hover:text-neutral-200 transition-all cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add Tier
                    </motion.button>
                  </div>
                )}
              </div>

              {/* Color Surcharge Settings */}
              <div className={classNames("rounded-lg border border-neutral-800 bg-neutral-950/50 p-2 transition-all duration-300 ease-in-out", !colorSurchargeEnabled && "opacity-50")} style={{ willChange: 'opacity' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className={classNames("text-xs font-medium transition-colors", colorSurchargeEnabled ? "text-neutral-100" : "text-neutral-500")}>Multi color Surcharge</span>
                    <InfoTooltip id="color" content="Adds extra cost percentage for each filament color used beyond the first." activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                  </div>
                  <div className="flex items-center gap-2">
                    {colorSurchargeEnabled && (
                      <div className="relative w-[60px]">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0} max={99} step={1}
                          className="w-full rounded border border-neutral-800 bg-neutral-950 pl-1 pr-4 py-0.5 text-xs text-center outline-none text-neutral-100 focus:border-emerald-500"
                          disabled={!colorSurchargeEnabled}
                          value={colorSurchargePercentageInput !== '' ? colorSurchargePercentageInput : (colorSurchargePercentage || '')}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || (val.length <= 2 && Number(val) <= 99)) {
                              setColorSurchargePercentageInput(val);
                              if (val === '') setColorSurchargePercentage(0);
                              else {
                                const num = Number(val);
                                if (!isNaN(num) && num >= 0) setColorSurchargePercentage(num);
                              }
                            }
                          }}
                        />
                        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500">%</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setColorSurchargeEnabled(!colorSurchargeEnabled)}
                      className={classNames(
                        "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                        colorSurchargeEnabled ? "bg-emerald-500" : "bg-neutral-700"
                      )}
                    >
                      <span className={classNames("pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition", colorSurchargeEnabled ? "translate-x-4" : "translate-x-0")} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Minimum Price Settings */}
              <div className={classNames("rounded-lg border border-neutral-800 bg-neutral-950/50 p-2 transition-all duration-300 ease-in-out", !minimumSurchargeEnabled && "opacity-50")} style={{ willChange: 'opacity' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className={classNames("text-xs font-medium transition-colors", minimumSurchargeEnabled ? "text-neutral-100" : "text-neutral-500")}>Enable Minimum Price</span>
                    <InfoTooltip id="min" content="Prevents the total job cost from billing lower than this minimum floor price." activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                  </div>
                  <div className="flex items-center gap-2">
                    {minimumSurchargeEnabled && (
                      <div className="relative w-[70px]">
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0} max={9999} step={1}
                          className="w-full rounded border border-neutral-800 bg-neutral-950 pl-1 pr-4 py-0.5 text-xs text-center outline-none text-neutral-100 focus:border-emerald-500"
                          disabled={!minimumSurchargeEnabled}
                          placeholder={CURRENCIES[currency].defaultMin.toString()}
                          value={minimumSurchargeAmountInput !== '' ? minimumSurchargeAmountInput : (minimumSurchargeAmount > 0 ? minimumSurchargeAmount.toString() : '')}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || (val.length <= 4 && Number(val) <= 9999)) {
                              setMinimumSurchargeAmountInput(val);
                              if (val === '') setMinimumSurchargeAmount(0);
                              else {
                                const num = Number(val);
                                if (!isNaN(num) && num >= 0) setMinimumSurchargeAmount(num);
                              }
                            }
                          }}
                        />
                        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500">{CURRENCIES[currency].symbol}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setMinimumSurchargeEnabled(!minimumSurchargeEnabled)}
                      className={classNames(
                        "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                        minimumSurchargeEnabled ? "bg-emerald-500" : "bg-neutral-700"
                      )}
                    >
                      <span className={classNames("pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition", minimumSurchargeEnabled ? "translate-x-4" : "translate-x-0")} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Display Settings */}
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-neutral-100">Show brackets around method</span>
                    <InfoTooltip id="brackets" content="Wraps calculated weight or time inside brackets on dashboard summary titles." activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBrackets(!showBrackets)}
                    className={classNames(
                      "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                      showBrackets ? "bg-emerald-500" : "bg-neutral-800"
                    )}
                  >
                    <span className={classNames("pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition", showBrackets ? "translate-x-4" : "translate-x-0")} />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-[11px] text-neutral-600">
                PrintCalc 2.0 Powered by{' '}
                <a 
                  href="https://fb.com/kittipat.kk" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:opacity-80 transition-opacity"
                  style={{ color: '#FFECAA' }}
                >
                  Max
                </a>
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-md px-2.5 py-1 text-[10px] text-neutral-300 hover:text-white"
                  onClick={() => {
                    setDiscountEnabled(false);
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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

      {/* Save Order Modal */}
      <AnimatePresence>
        {showSaveOrderModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowSaveOrderModal(false)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 450 }}
              className="relative z-10 w-full max-w-xs rounded-2xl border border-white/10 bg-neutral-900 p-4 shadow-2xl backdrop-blur-xl"
            >
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-neutral-100 flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-400" />
                  Save Order
                </h4>
                <button 
                  onClick={() => setShowSaveOrderModal(false)} 
                  className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-[10px] hover:bg-neutral-700"
                >
                  Close
                </button>
              </div>

              <div className="relative mb-3">
                <label className="text-xs text-neutral-400 mb-1 block">Order Name</label>
                <div className="relative">
                  <input
                    type="text"
                    className="w-full rounded-lg border border-neutral-800 bg-black/50 p-2 text-neutral-200 outline-none focus:border-emerald-500 transition-all text-sm"
                    placeholder="e.g. My Project"
                    value={saveOrderNameInput}
                    onChange={(e) => setSaveOrderNameInput(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => saveOrder(saveOrderNameInput)}
                className="w-full flex items-center justify-center gap-1 rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-white shadow-lg hover:bg-emerald-400 transition-all cursor-pointer"
              >
                Save
              </motion.button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Clear Confirm Modal */}
      <AnimatePresence>
        {showClearConfirmModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowClearConfirmModal(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: "spring", damping: 30, stiffness: 450 }} className="relative z-10 w-full max-w-xs rounded-2xl border border-red-500/20 bg-neutral-900 p-4 shadow-2xl backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-red-400 flex items-center gap-1.5"><Trash2 className="w-4 h-4 text-red-500" />Clear Cart</h4>
              </div>
              <p className="text-xs text-neutral-300 mb-4">Are you sure you want to **remove all items** from your cart? This action cannot be undone.</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowClearConfirmModal(false)} className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700">Cancel</button>
                <button onClick={confirmClearCart} className="flex-1 rounded-lg bg-red-500 py-1.5 text-xs font-semibold text-white hover:bg-red-400">Clear All</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Remove Saved Order Confirm Modal */}
      <AnimatePresence>
        {showRemoveSavedOrderConfirmModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowRemoveSavedOrderConfirmModal(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: "spring", damping: 30, stiffness: 450 }} className="relative z-10 w-full max-w-xs rounded-2xl border border-red-500/20 bg-neutral-900 p-4 shadow-2xl backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-red-400 flex items-center gap-1.5"><Trash2 className="w-4 h-4 text-red-500" />Remove Order</h4>
              </div>
              <p className="text-xs text-neutral-300 mb-4">Are you sure you want to delete **"{pendingRemoveSavedOrder?.name}"**?</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowRemoveSavedOrderConfirmModal(false)} className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700">Cancel</button>
                <button onClick={confirmRemoveSavedOrder} className="flex-1 rounded-lg bg-red-500 py-1.5 text-xs font-semibold text-white hover:bg-red-400">Remove</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Saved Orders Modal */}
      <AnimatePresence>
        {showSavedOrdersModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowSavedOrdersModal(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: "spring", damping: 30, stiffness: 450 }} className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-4 shadow-2xl backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-neutral-100 flex items-center gap-1.5"><History className="w-4 h-4 text-emerald-400" />Saved Orders</h4>
                <button onClick={() => setShowSavedOrdersModal(false)} className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-[10px] hover:bg-neutral-700">Close</button>
              </div>
              {savedOrders.length === 0 ? (
                <div className="p-10 text-center text-xs text-neutral-500">No saved orders</div>
              ) : (
                <div className="max-h-60 overflow-auto flex flex-col gap-1.5 pr-1">
                  {savedOrders.map(order => {
                    const orderTotal = order.items.reduce((sum, item) => sum + item.final, 0);
                    return (
                      <div key={order.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-white/5 bg-black/40 hover:bg-black/60 cursor-pointer transition-colors" onClick={() => restoreOrder(order)}>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="font-bold text-neutral-200 truncate text-sm">{order.name}</span>
                          <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
                            <span>{new Date(order.timestamp).toLocaleDateString()} {new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                            <span>•</span>
                            <span>{order.items.length} {order.items.length === 1 ? "item" : "items"}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-emerald-400">
                            {formatCurrency(orderTotal, currency)}
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); handleRemoveSavedOrderClick(order.id, order.name); }} className="p-1.5 rounded-lg hover:bg-red-500/10 text-neutral-400 hover:text-red-400 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Restore Confirm Modal */}
      <AnimatePresence>
        {showRestoreConfirmModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowRestoreConfirmModal(false)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: "spring", damping: 30, stiffness: 450 }} className="relative z-10 w-full max-w-xs rounded-2xl border border-red-500/20 bg-neutral-900 p-4 shadow-2xl backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-red-400 flex items-center gap-1.5"><Info className="w-4 h-4 text-red-500" />Warning</h4>
              </div>
              <p className="text-xs text-neutral-300 mb-4">Restoring this order will **remove all current items** from your cart. Do you want to proceed?</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowRestoreConfirmModal(false)} className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700">Cancel</button>
                <button onClick={confirmRestore} className="flex-1 rounded-lg bg-red-500 py-1.5 text-xs font-semibold text-white hover:bg-red-400">Restore</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add to Cart Animation */}
      <AnimatePresence>
        {isAnimating && (
            <motion.div 
              initial={{ 
                opacity: 1, 
                scale: 0.3, 
                x: animationPos.startX, 
                y: animationPos.startY,
                filter: 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.6))' 
              }}
              animate={{ 
                opacity: [1, 1, 1],
                scale: [0.3, 1.6, 0.7],
                x: [
                  animationPos.startX, 
                  animationPos.startX + (animationPos.endX - animationPos.startX) * 0.4, 
                  animationPos.endX
                ],
                y: [
                  animationPos.startY, 
                  Math.min(animationPos.startY, animationPos.endY) - 140, 
                  animationPos.endY
                ]
              }}
              transition={{ 
                duration: 0.4,
                ease: ["easeOut", "easeIn"] 
              }}
              className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center rounded-full bg-emerald-500 text-white font-bold shadow-[0_0_15px_#10b981]"
              style={{ 
                left: -14, 
                top: -14, 
                width: '28px', 
                height: '28px',
                position: 'fixed'
              }}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
            </motion.div>
        )}
      </AnimatePresence>

      <style>{`
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
