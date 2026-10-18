import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme, AVAILABLE_THEMES } from '../context/ThemeContext';
import { subscribePortalSettings, DEFAULT_PORTAL_SETTINGS } from '../services/db';
import { PortalSettings } from '../types';
import { 
  Moon, 
  Sun, 
  LogOut, 
  GraduationCap, 
  UserCircle, 
  Download, 
  CheckCircle2, 
  X,
  Cloud,
  Bell,
  Palette,
  Sparkles
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, role, logout } = useAuth();
  const { theme, toggleTheme, colorTheme, setColorTheme, activeThemeOption } = useTheme();

  const [settings, setSettings] = useState<PortalSettings>(DEFAULT_PORTAL_SETTINGS);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);

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
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showProfileModal, showInstallGuide]);

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b backdrop-blur-md transition-colors bg-white/95 dark:bg-black/95 border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Left: Logo & App Name */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 dark:bg-blue-600 flex items-center justify-center text-white shadow-sm ring-1 ring-blue-500/20">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg sm:text-xl tracking-tight text-slate-900 dark:text-white">
                  {settings.portalName || 'Exam Portal'}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800" title="All data 100% saved in Cloud Firestore">
                  <Cloud className="w-2.5 h-2.5" />
                  <span>Cloud Sync</span>
                </span>
              </div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate max-w-[200px] sm:max-w-xs">
                {role === 'admin' ? 'Teacher / Admin Workspace' : role === 'student' ? 'Student Workspace' : (settings.tagline || 'Education & Exam System')}
              </span>
            </div>
          </div>

          {/* Right: Controls, Install PWA, & Profile */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Install PWA / Add to Home Screen Button */}
            {!isInstalled ? (
              <button
                onClick={handleInstallClick}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                title="Add to Home Screen / Install App"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Install App</span>
                <span className="sm:hidden">Install</span>
              </button>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-3 h-3" />
                <span>Installed</span>
              </span>
            )}

            {/* Palette & Theme Controls */}
            <div className="relative">
              <button
                onClick={() => setShowThemePicker(!showThemePicker)}
                aria-label="Change Theme Palette"
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all cursor-pointer flex items-center gap-1.5"
                title="থিম কালার ও ভাইব পরিবর্তন করুন"
              >
                <Palette className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span 
                  className="w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 shadow-xs"
                  style={{ backgroundColor: activeThemeOption.colorHex }}
                />
              </button>

              {/* Quick Theme Picker Popover */}
              {showThemePicker && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowThemePicker(false)} 
                  />
                  <div className="absolute right-0 mt-2 w-72 p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 space-y-3.5">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span className="font-bold text-xs text-slate-900 dark:text-white">থিম ভাইব ও কালার</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">9 Palettes</span>
                    </div>

                    {/* Dark / Light Mode Switcher */}
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                      <button
                        onClick={() => toggleTheme()}
                        className={`py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          theme === 'light'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        <Sun className="w-3.5 h-3.5 text-amber-500" />
                        <span>Light</span>
                      </button>
                      <button
                        onClick={() => toggleTheme()}
                        className={`py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          theme === 'dark'
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Moon className="w-3.5 h-3.5 text-blue-400" />
                        <span>Dark</span>
                      </button>
                    </div>

                    {/* Color Swatches Grid */}
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {AVAILABLE_THEMES.map((t) => {
                        const isSelected = colorTheme === t.id;
                        return (
                          <button
                            key={t.id}
                            onClick={() => {
                              setColorTheme(t.id);
                            }}
                            className={`p-2 rounded-2xl border text-[11px] font-semibold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-950/60 shadow-xs ring-2 ring-blue-500/20'
                                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                            }`}
                          >
                            <span 
                              className="w-4 h-4 rounded-full shadow-inner ring-2 ring-white dark:ring-slate-900" 
                              style={{ backgroundColor: t.colorHex }}
                            />
                            <span className="truncate max-w-full text-[10px] text-slate-700 dark:text-slate-300">
                              {t.nameBn}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Quick Dark/Light Toggle */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme mode"
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>

            {user && (
              <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-slate-200 dark:border-slate-800">
                {/* Clickable Profile Card */}
                <button
                  onClick={() => {
                    window.history.pushState({ modal: 'profile' }, '');
                    setShowProfileModal(true);
                  }}
                  className="flex items-center gap-2.5 p-1 -m-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer text-left"
                  title="আপনার প্রোফাইল ও থিম সেটিংস দেখুন"
                >
                  <div className="hidden sm:flex flex-col text-right">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                      {user.name}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                      {user.role === 'admin' ? 'এডমিন' : 'শিক্ষার্থী'} {user.college ? `• ${user.college}` : ''}
                    </span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs ring-2 ring-blue-500/30">
                    {user.name ? user.name.slice(0, 1).toUpperCase() : <UserCircle className="w-5 h-5" />}
                  </div>
                </button>

                <button
                  onClick={logout}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors cursor-pointer ml-1"
                  title="Log Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Global Real-Time Announcement Banner from Cloud Firestore */}
        {settings.showAnnouncement && settings.announcementText && (
          <div className="bg-blue-600/10 dark:bg-blue-950/40 border-t border-blue-200 dark:border-blue-900/50 py-1.5 px-4 text-center">
            <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-xs text-blue-700 dark:text-blue-300 font-medium">
              <Bell className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>{settings.announcementText}</span>
            </div>
          </div>
        )}
      </header>

      {/* Install App / Add to Home Screen Instructions Modal */}
      {showInstallGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  <Download className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Install Exam Portal
                </h3>
              </div>
              <button
                onClick={() => setShowInstallGuide(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              <p>To install this app on your device for full-screen offline access:</p>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <div>
                  <strong className="text-slate-900 dark:text-white">Android (Chrome):</strong>
                  <p className="text-slate-500 dark:text-slate-400">Tap the 3 dots menu &gt; select "Install app" or "Add to Home screen".</p>
                </div>
                <div>
                  <strong className="text-slate-900 dark:text-white">iPhone / iPad (Safari):</strong>
                  <p className="text-slate-500 dark:text-slate-400">Tap the Share icon &gt; scroll down &gt; "Add to Home Screen".</p>
                </div>
                <div>
                  <strong className="text-slate-900 dark:text-white">Desktop (Chrome/Edge):</strong>
                  <p className="text-slate-500 dark:text-slate-400">Click the install icon in the address bar.</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowInstallGuide(false)}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* USER PROFILE & THEME SETTINGS MODAL */}
      {showProfileModal && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="relative bg-gradient-to-r from-blue-600 via-indigo-600 to-slate-900 p-6 text-white text-center">
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
              <p className="text-xs text-blue-200 mt-1">
                {user.college || 'College N/A'} • <span className="capitalize">{user.role === 'admin' ? 'অ্যাডমিনিস্ট্রেটর' : 'শিক্ষার্থী'}</span>
              </p>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-xs sm:text-sm">
              <div className="space-y-2.5">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">ইমেইল এড্রেস</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{user.email || 'N/A'}</span>
                </div>

                {user.mobile && (
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">মোবাইল নম্বর</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{user.mobile}</span>
                  </div>
                )}
              </div>

              {/* Theme Customization Section */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    ইন্টারফেস থিম (Theme Palette)
                  </span>
                  <button
                    onClick={toggleTheme}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}
                    <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                  </button>
                </div>

                {/* Color themes (9 distinct options) */}
                <div className="grid grid-cols-3 gap-2">
                  {AVAILABLE_THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setColorTheme(t.id)}
                      className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                        colorTheme === t.id
                          ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 shadow-xs'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full ${t.bgClass} shrink-0`} />
                      <span className="truncate">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  onClick={() => {
                    setShowProfileModal(false);
                    logout();
                  }}
                  className="px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>লগ আউট</span>
                </button>

                <button
                  onClick={() => setShowProfileModal(false)}
                  className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white dark:bg-slate-800 dark:hover:bg-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  বন্ধ করুন
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
