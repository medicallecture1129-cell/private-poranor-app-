import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
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
  Sun, 
  Moon, 
  Monitor, 
  Palette, 
  Check,
  Sparkles,
  Pipette
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, role, logout } = useAuth();
  const { 
    theme, 
    preference, 
    isDarkMode, 
    baseColor,
    computedTheme,
    accentPalette, 
    palettes, 
    setBaseColor,
    setAccentPaletteId, 
    setThemePreference, 
    toggleTheme 
  } = useTheme();

  const [settings, setSettings] = useState<PortalSettings>(DEFAULT_PORTAL_SETTINGS);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPaletteModal, setShowPaletteModal] = useState(false);
  const [customHexInput, setCustomHexInput] = useState(baseColor);

  // Sync custom hex input with current base color
  useEffect(() => {
    setCustomHexInput(baseColor);
  }, [baseColor]);

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

  const handleCustomHexChange = (val: string) => {
    setCustomHexInput(val);
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(val)) {
      setBaseColor(val);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b backdrop-blur-md transition-colors bg-theme-surface border-theme-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Left: Element 1 of 3 (App Logo capsule + Title) */}
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm ring-2 ring-white/20 transition-all hover:scale-105"
              style={{ backgroundColor: 'var(--theme-primary)', boxShadow: '0 4px 14px -2px var(--theme-primary-glow)' }}
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

          {/* Right: Controls, Install PWA, & Header Capsules */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Dark / Light Theme Mode Switcher */}
            <button
              onClick={toggleTheme}
              aria-label={isDarkMode ? "Switch to Light mode" : "Switch to Dark mode"}
              title={isDarkMode ? "Switch to Light mode" : "Switch to Dark mode"}
              className="p-2 rounded-xl border border-theme-border bg-theme-card hover:bg-theme-card-hover text-slate-200 transition-all cursor-pointer flex items-center gap-1.5 shadow-xs group"
            >
              {isDarkMode ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400 group-hover:rotate-45 transition-transform duration-300" />
                  <span className="hidden sm:inline text-xs font-semibold">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-blue-400 group-hover:-rotate-12 transition-transform duration-300" />
                  <span className="hidden sm:inline text-xs font-semibold">Dark</span>
                </>
              )}
            </button>

            {/* Element 2 of 3: Color Palette Button Capsule (Highlighted in User Prompt) */}
            <button
              onClick={() => setShowPaletteModal(true)}
              aria-label="Theme Color Palette"
              title={`Theme Color: ${accentPalette.name} (${accentPalette.nameBn}) - Click to change color tone`}
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
              <span className="hidden sm:inline text-xs font-bold text-theme-title">Palette</span>
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

            {user && (
              <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-theme-border">
                {/* Element 3 of 3: Profile Icon Capsule (Highlighted in User Prompt) */}
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

                <button
                  onClick={logout}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors cursor-pointer ml-1"
                  title="Log Out"
                >
                  <LogOut className="w-4 h-4" />
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

      {/* User Profile & Theme Settings Modal */}
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
            <div className="p-6 space-y-5 text-xs sm:text-sm">
              <div className="space-y-2.5">
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

              {/* Quick Color Palette Trigger */}
              <div className="pt-3 border-t border-theme-border space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-theme-title flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5" style={{ color: 'var(--theme-primary)' }} />
                    <span>Global Theme Color</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileModal(false);
                      setShowPaletteModal(true);
                    }}
                    className="text-xs font-bold px-2 py-0.5 rounded-lg btn-theme-primary cursor-pointer"
                  >
                    Change Color
                  </button>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-theme-surface border border-theme-border">
                  <span className="w-4 h-4 rounded-full ring-2 ring-white/50" style={{ backgroundColor: 'var(--theme-primary)' }} />
                  <span className="text-xs font-semibold text-theme-title">{accentPalette.nameBn}</span>
                  <span className="text-[11px] text-slate-400 font-mono ml-auto">{baseColor}</span>
                </div>
              </div>

              {/* Appearance Mode (Dark, Light, System) */}
              <div className="pt-3 border-t border-theme-border space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-theme-title">
                    Appearance / থিম মোড
                  </span>
                  <span className="text-[11px] font-semibold text-theme-primary capitalize">
                    {preference === 'system' ? `System (${theme})` : `${preference} mode`}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setThemePreference('light')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      preference === 'light'
                        ? 'border-theme-primary bg-theme-primary/10 text-theme-title font-bold shadow-xs'
                        : 'border-theme-border text-slate-400 hover:bg-theme-surface'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                    <span>Light</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setThemePreference('dark')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      preference === 'dark'
                        ? 'border-theme-primary bg-theme-primary/20 text-theme-title font-bold shadow-xs'
                        : 'border-theme-border text-slate-400 hover:bg-theme-surface'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5 text-sky-400" />
                    <span>Dark</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setThemePreference('system')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      preference === 'system'
                        ? 'border-theme-primary bg-theme-primary/10 text-theme-title font-bold shadow-xs'
                        : 'border-theme-border text-slate-400 hover:bg-theme-surface'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5 text-purple-400" />
                    <span>System</span>
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  onClick={() => {
                    setShowProfileModal(false);
                    logout();
                  }}
                  className="px-4 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-400 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log Out</span>
                </button>

                <button
                  onClick={() => setShowProfileModal(false)}
                  className="px-5 py-2 rounded-xl bg-theme-surface hover:bg-theme-surface-elevated text-slate-200 border border-theme-border font-bold text-xs transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Standalone Automated Theme Color Palette Selector Modal */}
      {showPaletteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-theme-card border border-theme-card rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-theme-border shrink-0">
              <div className="flex items-center gap-2.5">
                <div 
                  className="w-9 h-9 rounded-xl text-white flex items-center justify-center shadow-xs"
                  style={{ backgroundColor: 'var(--theme-primary)' }}
                >
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-theme-title text-base">
                    গ্লোবাল ডার্ক থিম ও কালার ইঞ্জিন
                  </h3>
                  <p className="text-xs text-slate-400">
                    শুধু ১টি কালার সিলেক্ট করুন — পুরো অ্যাপ স্বয়ংক্রিয়ভাবে ছবির মতো রূপ নেবে
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
              {/* Dynamic Live Color Hierarchy Preview Card */}
              <div 
                className="p-3.5 rounded-2xl border border-theme-border transition-all"
                style={{ backgroundColor: computedTheme.bgMain }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-theme-primary" />
                    <span>অটোমেটিক ক্যালকুলেশন প্রিভিউ</span>
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white">
                    {baseColor.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                  {/* Layer 1: Pitch-Dark Solid Background */}
                  <div 
                    className="p-2.5 rounded-xl border border-white/10 flex flex-col items-center justify-center gap-1"
                    style={{ backgroundColor: computedTheme.bgMain }}
                  >
                    <span className="font-bold text-white text-[10px]">১. মেইন ব্যাকগ্রাউন্ড</span>
                    <span className="text-[9px] text-slate-400">Solid Pitch-Dark</span>
                    <span className="text-[9px] font-mono text-slate-500">{computedTheme.bgMain}</span>
                  </div>

                  {/* Layer 2: Foreground Card */}
                  <div 
                    className="p-2.5 rounded-xl border border-white/20 flex flex-col items-center justify-center gap-1 shadow-sm"
                    style={{ backgroundColor: computedTheme.bgCard, borderColor: computedTheme.borderCard }}
                  >
                    <span className="font-bold text-white text-[10px]">২. ফোরগ্রাউন্ড কার্ড</span>
                    <span className="text-[9px] text-slate-300">Message Box / Card</span>
                    <span className="text-[9px] font-mono text-slate-400">{computedTheme.bgCard}</span>
                  </div>

                  {/* Layer 3: Button & Logo Capsule */}
                  <div 
                    className="p-2.5 rounded-xl flex flex-col items-center justify-center gap-1 shadow-sm text-white"
                    style={{ backgroundColor: computedTheme.primary }}
                  >
                    <span className="font-bold text-[10px]">৩. বাটন ও লোগো</span>
                    <span className="text-[9px] text-white/90">Vibrant Capsule</span>
                    <span className="text-[9px] font-mono text-white/80">{computedTheme.primary}</span>
                  </div>
                </div>
              </div>

              {/* Custom Color Input: User can choose or type ANY color */}
              <div className="p-3.5 rounded-2xl bg-theme-surface border border-theme-border space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-theme-title flex items-center gap-1.5">
                    <Pipette className="w-3.5 h-3.5 text-theme-primary" />
                    <span>কাস্টম কালার পিকার (Choose Any Custom Color)</span>
                  </label>
                  <span className="text-[10px] text-slate-400">যেকোনো কালার কোড দিন</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="color"
                      value={baseColor}
                      onChange={(e) => setBaseColor(e.target.value)}
                      className="w-10 h-10 rounded-xl cursor-pointer border-0 p-0 bg-transparent"
                      title="Click to open system color picker"
                    />
                  </div>
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={customHexInput}
                      onChange={(e) => handleCustomHexChange(e.target.value)}
                      placeholder="#2563EB"
                      maxLength={7}
                      className="w-full pl-3 pr-8 py-2 rounded-xl text-xs font-mono font-bold bg-theme-card border border-theme-border text-theme-title focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] uppercase"
                    />
                    <div 
                      className="w-4 h-4 rounded-full absolute right-3 top-1/2 -translate-y-1/2 ring-1 ring-white/30"
                      style={{ backgroundColor: baseColor }}
                    />
                  </div>
                </div>
              </div>

              {/* 11 Curated Reference Presets from user's image */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    ছবির ১১টি রেফারেন্স থিম প্যালেট (Preset Themes)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {palettes.length} টি ভ্যারিয়েন্ট
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {palettes.map((p, idx) => {
                    const isSelected = p.hex.toLowerCase() === baseColor.toLowerCase();
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setAccentPaletteId(p.id);
                        }}
                        className={`p-3 rounded-2xl border text-left flex items-center justify-between gap-2.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'ring-2 ring-white/60 shadow-md'
                            : 'border-theme-border bg-theme-surface hover:bg-theme-card'
                        }`}
                        style={{
                          borderColor: isSelected ? p.hex : undefined,
                          backgroundColor: isSelected ? `${p.hex}22` : undefined
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Dual Color Swatch showing accent + card tone */}
                          <div className="relative w-7 h-7 rounded-full shrink-0 overflow-hidden ring-2 ring-white/40 shadow-xs flex items-center justify-center">
                            <div 
                              className="w-full h-full"
                              style={{ backgroundColor: p.hex }}
                            />
                            {isSelected && (
                              <Check className="w-3.5 h-3.5 text-white stroke-[3.5] absolute" />
                            )}
                          </div>
                          
                          <div className="min-w-0">
                            <p className="font-bold text-xs text-theme-title truncate leading-tight">
                              {idx + 1}. {p.nameBn}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono truncate">
                              {p.hex}
                            </p>
                          </div>
                        </div>

                        {isSelected && (
                          <span 
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0"
                            style={{ backgroundColor: p.hex }}
                          >
                            Active
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-theme-border flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-400">
                নির্বাচিত: <strong className="text-theme-title">{accentPalette.nameBn}</strong>
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
