import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { normalizeHex } from '../utils/themeColors';
import { subscribePortalSettings, DEFAULT_PORTAL_SETTINGS } from '../services/db';
import { PortalSettings } from '../types';
import { 
  LogOut, 
  GraduationCap, 
  UserCircle, 
  Download, 
  CheckCircle2, 
  X, 
  Cloud, 
  Bell, 
  Palette, 
  Sparkles,
  RefreshCw,
  RotateCcw,
  Check
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, role, logout } = useAuth();
  const { 
    customColors,
    computedTheme,
    setCustomColor,
    resetCustomColors 
  } = useTheme();

  const [settings, setSettings] = useState<PortalSettings>(DEFAULT_PORTAL_SETTINGS);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPaletteModal, setShowPaletteModal] = useState(false);

  // App update checking state for PWA
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState<string | null>(null);

  // Local state for hex text inputs in custom color picker
  const [bgInput, setBgInput] = useState(customColors.bgColor);
  const [fgInput, setFgInput] = useState(customColors.fgColor);
  const [primaryInput, setPrimaryInput] = useState(customColors.primaryColor || customColors.buttonColor || '#2563eb');

  useEffect(() => {
    setBgInput(normalizeHex(customColors.bgColor, '#090e18'));
    setFgInput(normalizeHex(customColors.fgColor, '#132035'));
    setPrimaryInput(normalizeHex(customColors.primaryColor || customColors.buttonColor || '#2563eb'));
  }, [customColors]);

  // Subscribe to real-time Portal Settings from Firestore
  useEffect(() => {
    const unsub = subscribePortalSettings((portalData) => {
      setSettings(portalData);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // Check if launched as standalone PWA
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    ) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setIsInstalled(true);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.warn('Install prompt error:', err);
      }
    } else {
      window.history.pushState({ modal: 'installGuide' }, '');
      setShowInstallGuide(true);
    }
  };

  // Close modals on hardware back button
  useEffect(() => {
    const handlePopState = () => {
      if (showProfileModal) setShowProfileModal(false);
      if (showInstallGuide) setShowInstallGuide(false);
      if (showPaletteModal) setShowPaletteModal(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showProfileModal, showInstallGuide, showPaletteModal]);

  const handleHexChange = (key: 'bgColor' | 'fgColor' | 'primaryColor', val: string) => {
    if (key === 'bgColor') setBgInput(val);
    if (key === 'fgColor') setFgInput(val);
    if (key === 'primaryColor') setPrimaryInput(val);

    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(val)) {
      setCustomColor(key, val);
    }
  };

  const handlePickerChange = (key: 'bgColor' | 'fgColor' | 'primaryColor', val: string) => {
    const norm = normalizeHex(val);
    if (key === 'bgColor') setBgInput(norm);
    if (key === 'fgColor') setFgInput(norm);
    if (key === 'primaryColor') setPrimaryInput(norm);
    setCustomColor(key, norm);
  };

  // Trigger manual app update check for installed PWA / browser
  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateFeedback(null);
    try {
      if (window.checkAppUpdate) {
        const res = await window.checkAppUpdate();
        setUpdateFeedback(res.message);
        if (res.hasUpdate) {
          setTimeout(() => {
            window.location.reload();
          }, 1200);
        }
      } else if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          setUpdateFeedback('আপডেট চেক সম্পন্ন হয়েছে। অ্যাপ আপ-টু-ডেট আছে।');
        } else {
          setUpdateFeedback('অ্যাপটি আপ-টু-ডেট আছে।');
        }
      } else {
        setUpdateFeedback('অ্যাপটি আপ-টু-ডেট আছে।');
      }
    } catch (err) {
      setUpdateFeedback('আপডেট চেক সম্পন্ন হয়েছে।');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b backdrop-blur-md transition-colors bg-theme-surface border-theme-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Left: App Logo capsule + Title (Logo uses unified primary/logo color) */}
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm ring-2 ring-white/20 transition-all hover:scale-105"
              style={{ 
                backgroundColor: 'var(--theme-logo, var(--theme-primary))', 
                boxShadow: '0 4px 14px -2px var(--theme-logo-glow, var(--theme-primary-glow))' 
              }}
              title="Exam Portal Logo"
            >
              <GraduationCap className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg sm:text-xl tracking-tight text-theme-title">
                  {settings.portalName || 'Exam Portal'}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" title="All data 100% saved in Cloud Firestore">
                  <Cloud className="w-2.5 h-2.5" />
                  <span>Cloud Sync</span>
                </span>
              </div>
              <span className="text-xs font-medium text-slate-400 truncate max-w-[200px] sm:max-w-xs">
                {role === 'admin' ? 'Teacher / Admin Workspace' : role === 'student' ? 'Student Workspace' : (settings.tagline || 'Education & Exam System')}
              </span>
            </div>
          </div>

          {/* Right: Controls, Install PWA, & Profile (Light mode removed) */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Custom Color Studio Button Capsule */}
            <button
              onClick={() => setShowPaletteModal(true)}
              aria-label="Custom Color Studio"
              title="Custom Colors: Background, Foreground, Button & Logo"
              className="relative px-3 py-1.5 rounded-xl border border-theme-border bg-theme-card hover:bg-theme-card-hover text-slate-100 transition-all cursor-pointer flex items-center gap-2 shadow-xs group"
              style={{
                boxShadow: '0 2px 8px -2px var(--theme-primary-glow)',
                borderColor: 'var(--theme-primary-border)'
              }}
            >
              <span
                className="w-4 h-4 rounded-full ring-2 ring-white/50 shadow-xs shrink-0 transition-transform group-hover:scale-110"
                style={{ backgroundColor: 'var(--theme-primary)' }}
              />
              <Palette className="w-3.5 h-3.5 text-slate-300 group-hover:rotate-12 transition-transform" />
              <span className="hidden sm:inline text-xs font-bold text-theme-title">Colors</span>
            </button>

            {/* Install PWA Button */}
            {!isInstalled ? (
              <button
                onClick={handleInstallClick}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                title="Add to Home Screen / Install PWA"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Install App</span>
                <span className="sm:hidden">Install</span>
              </button>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/60 text-emerald-400 text-[11px] font-semibold border border-emerald-800">
                <CheckCircle2 className="w-3 h-3" />
                <span>Installed</span>
              </span>
            )}

            {/* Profile Avatar Capsule (Logout is inside Profile Modal) */}
            {user && (
              <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-theme-border">
                <button
                  onClick={() => {
                    window.history.pushState({ modal: 'profile' }, '');
                    setShowProfileModal(true);
                  }}
                  className="flex items-center gap-2.5 p-1 -m-1 rounded-xl hover:bg-theme-card transition-colors cursor-pointer text-left group"
                  title="View Profile & Settings"
                >
                  <div className="hidden sm:flex flex-col text-right">
                    <span className="text-sm font-semibold text-theme-title leading-tight">
                      {user.name}
                    </span>
                    <span className="text-[11px] text-slate-400 capitalize">
                      {user.role === 'admin' ? 'Admin' : 'Student'} {user.college ? `• ${user.college}` : ''}
                    </span>
                  </div>
                  <div 
                    className="w-8 h-8 rounded-full text-white flex items-center justify-center font-bold text-xs ring-2 ring-white/30 shadow-xs transition-transform group-hover:scale-105"
                    style={{ backgroundColor: 'var(--theme-primary)', boxShadow: '0 2px 10px -2px var(--theme-primary-glow)' }}
                  >
                    {user.name ? user.name.slice(0, 1).toUpperCase() : <UserCircle className="w-5 h-5" />}
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Real-Time Announcement Banner */}
        {settings.showAnnouncement && settings.announcementText && (
          <div className="bg-theme-card/70 border-t border-theme-border py-1.5 px-4 text-center">
            <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-xs font-medium text-theme-title">
              <Bell className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--theme-primary)' }} />
              <span>{settings.announcementText}</span>
            </div>
          </div>
        )}
      </header>

      {/* Install PWA Instructions Modal */}
      {showInstallGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-theme-card border border-theme-card rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="w-8 h-8 rounded-xl text-white flex items-center justify-center shadow-xs"
                  style={{ backgroundColor: 'var(--theme-primary)' }}
                >
                  <Download className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-theme-title text-base">
                  Install Exam Portal
                </h3>
              </div>
              <button
                onClick={() => setShowInstallGuide(false)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-300">
              <p>Install this app on your device for fast, full-screen offline access:</p>
              <div className="p-3 rounded-2xl bg-theme-surface border border-theme-border space-y-2 text-xs">
                <div>
                  <strong className="text-theme-title">Android (Chrome):</strong>
                  <p className="text-slate-400">Tap the 3 dots menu &gt; select "Install app" or "Add to Home screen".</p>
                </div>
                <div>
                  <strong className="text-theme-title">iPhone / iPad (Safari):</strong>
                  <p className="text-slate-400">Tap the Share icon &gt; scroll down &gt; select "Add to Home Screen".</p>
                </div>
                <div>
                  <strong className="text-theme-title">Desktop (Chrome/Edge):</strong>
                  <p className="text-slate-400">Click the install icon in the address bar.</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowInstallGuide(false)}
              className="w-full py-2.5 rounded-xl btn-theme-primary font-semibold text-xs sm:text-sm cursor-pointer shadow-xs"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* User Profile & Settings Modal */}
      {showProfileModal && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md bg-theme-card border border-theme-card rounded-3xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div 
              className="relative p-6 text-white text-center"
              style={{ 
                background: `linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-bg-surface) 100%)` 
              }}
            >
              <button
                onClick={() => setShowProfileModal(false)}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-black/20 hover:bg-black/40 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md text-white border border-white/20 font-black text-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
                {user.name ? user.name.slice(0, 1).toUpperCase() : 'U'}
              </div>

              <h3 className="text-xl font-bold tracking-tight">
                {user.name}
              </h3>
              <p className="text-xs text-slate-200 mt-1">
                {user.college || 'Institution N/A'} • <span className="capitalize">{user.role === 'admin' ? 'Administrator' : 'Student'}</span>
              </p>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-xs sm:text-sm">
              <div className="space-y-2">
                <div className="p-3 rounded-2xl bg-theme-surface border border-theme-border space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Email Address</span>
                  <span className="font-semibold text-theme-title">{user.email || 'N/A'}</span>
                </div>

                {user.mobile && (
                  <div className="p-3 rounded-2xl bg-theme-surface border border-theme-border space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Phone Number</span>
                    <span className="font-semibold text-theme-title">{user.mobile}</span>
                  </div>
                )}
              </div>

              {/* PWA Auto-Update / Version Status & Manual Check */}
              <div className="pt-2 border-t border-theme-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-theme-title flex items-center gap-1.5">
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin text-theme-primary' : 'text-slate-400'}`} />
                    <span>App Update / অটো আপডেট</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleCheckUpdate}
                    disabled={isCheckingUpdate}
                    className="px-2.5 py-1 rounded-lg btn-theme-primary text-[11px] font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                    <span>{isCheckingUpdate ? 'চেক হচ্ছে...' : 'Check for Update'}</span>
                  </button>
                </div>
                {updateFeedback && (
                  <p className="text-[11px] font-semibold text-emerald-400 p-2 rounded-xl bg-emerald-950/30 border border-emerald-800">
                    {updateFeedback}
                  </p>
                )}
                <p className="text-[10px] text-slate-400">
                  GitHub এ নতুন কোড আপলোড হলে ইনস্টল করা অ্যাপ ব্যাকগ্রাউন্ডে স্বয়ংক্রিয়ভাবে আপডেট গ্রহণ করবে।
                </p>
              </div>

              {/* Quick Custom Color Trigger */}
              <div className="pt-2 border-t border-theme-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-theme-title flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5" style={{ color: 'var(--theme-primary)' }} />
                    <span>Custom Colors</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileModal(false);
                      setShowPaletteModal(true);
                    }}
                    className="text-xs font-bold px-2.5 py-1 rounded-lg btn-theme-primary cursor-pointer"
                  >
                    Open Color Studio
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-theme-surface border border-theme-border text-[10px] text-center font-bold text-slate-300">
                  <div className="p-2 rounded-lg flex flex-col items-center gap-1 border border-white/10" style={{ backgroundColor: customColors.bgColor }}>
                    <span className="text-[9px] text-slate-300">Background</span>
                    <span className="font-mono text-[8px] text-slate-400">{customColors.bgColor}</span>
                  </div>
                  <div className="p-2 rounded-lg flex flex-col items-center gap-1 border border-white/20" style={{ backgroundColor: customColors.fgColor }}>
                    <span className="text-[9px] text-slate-200">Foreground</span>
                    <span className="font-mono text-[8px] text-slate-300">{customColors.fgColor}</span>
                  </div>
                  <div className="p-2 rounded-lg flex flex-col items-center gap-1 text-white shadow-xs" style={{ backgroundColor: customColors.primaryColor || customColors.buttonColor }}>
                    <span className="text-[9px] text-white">Button & Logo</span>
                    <span className="font-mono text-[8px] text-white/80">{customColors.primaryColor || customColors.buttonColor}</span>
                  </div>
                </div>
              </div>

              {/* Log Out button */}
              <div className="pt-3 border-t border-theme-border flex items-center justify-between gap-3">
                <button
                  onClick={() => {
                    setShowProfileModal(false);
                    logout();
                  }}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
                  title="Log out of your account"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log Out (লগআউট)</span>
                </button>

                <button
                  onClick={() => setShowProfileModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-theme-surface hover:bg-theme-surface-elevated text-slate-200 border border-theme-border font-bold text-xs transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Standalone Custom Color Studio Modal (3 UNIFIED CONTROLS, PERSISTENT PICKERS) */}
      {showPaletteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div className="w-full max-w-lg bg-theme-card border border-theme-card rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[94vh] flex flex-col my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-theme-border shrink-0">
              <div className="flex items-center gap-2.5">
                <div 
                  className="w-9 h-9 rounded-xl text-white flex items-center justify-center shadow-xs"
                  style={{ backgroundColor: 'var(--theme-logo, var(--theme-primary))' }}
                >
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-theme-title text-base">
                    Custom Color Studio (কাস্টম কালার)
                  </h3>
                  <p className="text-xs text-slate-400">
                    ব্যাকগ্রাউন্ড, ফোরগ্রাউন্ড এবং বাটন ও লোগোর সমন্বিত কালার
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPaletteModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 pr-1 flex-1">
              {/* Dynamic Live Preview of the 3 Colors: Clearly shows Background holding Foreground card */}
              <div 
                className="p-4 rounded-2xl border border-theme-border transition-all space-y-3"
                style={{ backgroundColor: customColors.bgColor }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-theme-primary" />
                      <span>লাইভ প্রিভিউ (Live Preview)</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-slate-200 border border-white/15">
                      BG: {customColors.bgColor.toUpperCase()}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={resetCustomColors}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 flex items-center gap-1 cursor-pointer transition-colors"
                    title="Reset to default colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Defaults</span>
                  </button>
                </div>

                {/* Simulated Foreground Card nested inside the Background */}
                <div 
                  className="p-3.5 rounded-2xl border shadow-lg space-y-3 transition-all"
                  style={{ 
                    backgroundColor: customColors.fgColor, 
                    borderColor: computedTheme.borderCard 
                  }}
                >
                  <div className="flex items-center justify-between">
                    {/* Simulated Logo */}
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-7 h-7 rounded-xl flex items-center justify-center text-white shadow-xs ring-2 ring-white/20"
                        style={{ backgroundColor: customColors.primaryColor || customColors.buttonColor }}
                      >
                        <GraduationCap className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-white">
                        {settings.portalName || 'Exam Portal'}
                      </span>
                    </div>

                    {/* Simulated Button */}
                    <button
                      type="button"
                      className="px-3 py-1 rounded-xl text-white font-bold text-xs shadow-md"
                      style={{ backgroundColor: customColors.primaryColor || customColors.buttonColor }}
                    >
                      Sample Button
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-300 border-t border-white/10 pt-2 font-mono">
                    <span>Card FG: {customColors.fgColor.toUpperCase()}</span>
                    <span>Button & Logo: {(customColors.primaryColor || customColors.buttonColor || '').toUpperCase()}</span>
                  </div>
                </div>
              </div>

              {/* 3 Dedicated Color Controls */}
              <div className="space-y-3">
                {/* 1. Background Color Picker */}
                <div className="p-3.5 rounded-2xl bg-theme-surface border border-theme-border space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-theme-title block">
                        ১. ব্যাকগ্রাউন্ড কালার (Background Color)
                      </span>
                      <span className="text-[11px] text-slate-400 block truncate">
                        পুরো অ্যাপ্লিকেশনের মেইন ব্যাকগ্রাউন্ড
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="color"
                        value={normalizeHex(customColors.bgColor, '#090e18')}
                        onChange={(e) => handlePickerChange('bgColor', e.target.value)}
                        className="w-9 h-9 rounded-xl cursor-pointer border-0 p-0 bg-transparent ring-1 ring-white/20"
                        title="Choose Background Color"
                      />
                      <input
                        type="text"
                        value={bgInput}
                        onChange={(e) => handleHexChange('bgColor', e.target.value)}
                        maxLength={7}
                        className="w-24 px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-theme-card border border-theme-border text-theme-title focus:outline-none uppercase"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Foreground / Card Color Picker (Clearly displays the current Background Color for context) */}
                <div className="p-3.5 rounded-2xl bg-theme-surface border border-theme-border space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-theme-title block">
                        ২. ফোরগ্রাউন্ড / কার্ড কালার (Foreground Color)
                      </span>
                      <span className="text-[11px] text-slate-400 block truncate">
                        এক্সাম কার্ড, কন্টেইনার ও ডায়ালগের কালার
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="color"
                        value={normalizeHex(customColors.fgColor, '#132035')}
                        onChange={(e) => handlePickerChange('fgColor', e.target.value)}
                        className="w-9 h-9 rounded-xl cursor-pointer border-0 p-0 bg-transparent ring-1 ring-white/20"
                        title="Choose Foreground / Card Color"
                      />
                      <input
                        type="text"
                        value={fgInput}
                        onChange={(e) => handleHexChange('fgColor', e.target.value)}
                        maxLength={7}
                        className="w-24 px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-theme-card border border-theme-border text-theme-title focus:outline-none uppercase"
                      />
                    </div>
                  </div>

                  {/* Visual Reference indicator showing active background for comparison */}
                  <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-theme-card/60 border border-theme-border text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">বর্তমান মেইন ব্যাকগ্রাউন্ড:</span>
                      <span 
                        className="w-3.5 h-3.5 rounded-full ring-1 ring-white/30 shrink-0"
                        style={{ backgroundColor: customColors.bgColor }}
                      />
                      <span className="font-mono font-bold text-theme-title">{customColors.bgColor.toUpperCase()}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 italic">
                      ব্যাকগ্রাউন্ডের তুলনায় কার্ডটি হালকা রাখুন
                    </span>
                  </div>
                </div>

                {/* 3. Button & Logo Color (Unified single picker as requested) */}
                <div className="p-3.5 rounded-2xl bg-theme-surface border border-theme-border space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-theme-title block">
                        ৩. বাটন ও লোগো কালার (Button & Logo Color)
                      </span>
                      <span className="text-[11px] text-slate-400 block truncate">
                        বাটন ও লোগোর জন্য ১টি সমন্বিত প্রাইমারি কালার
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="color"
                        value={normalizeHex(customColors.primaryColor || customColors.buttonColor, '#2563eb')}
                        onChange={(e) => handlePickerChange('primaryColor', e.target.value)}
                        className="w-9 h-9 rounded-xl cursor-pointer border-0 p-0 bg-transparent ring-1 ring-white/20"
                        title="Choose Button and Logo Color"
                      />
                      <input
                        type="text"
                        value={primaryInput}
                        onChange={(e) => handleHexChange('primaryColor', e.target.value)}
                        maxLength={7}
                        className="w-24 px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-theme-card border border-theme-border text-theme-title focus:outline-none uppercase"
                      />
                    </div>
                  </div>

                  {/* Dual badge demonstrating same color applied to both Button & Logo */}
                  <div className="flex items-center gap-2 pt-1 text-[11px]">
                    <span 
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-white font-bold text-[10px] shadow-xs"
                      style={{ backgroundColor: customColors.primaryColor || customColors.buttonColor }}
                    >
                      <GraduationCap className="w-3 h-3" />
                      <span>Logo</span>
                    </span>
                    <span 
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-white font-bold text-[10px] shadow-xs"
                      style={{ backgroundColor: customColors.primaryColor || customColors.buttonColor }}
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                      <span>Button</span>
                    </span>
                    <span className="text-[10px] text-slate-400 ml-auto">
                      উভয়টি একসাথে আপডেট হবে
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-theme-border flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-400">
                হেক্স কোড বা কালার পিকারের মাধ্যমে সেট করুন
              </span>
              <button
                type="button"
                onClick={() => setShowPaletteModal(false)}
                className="px-6 py-2.5 rounded-xl btn-theme-primary font-bold text-xs shadow-md cursor-pointer"
              >
                সম্পন্ন (Done)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
