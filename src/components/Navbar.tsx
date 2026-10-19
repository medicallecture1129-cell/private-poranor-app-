import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { 
  subscribePortalSettings, 
  DEFAULT_PORTAL_SETTINGS,
  subscribeNotifications,
  markNotificationRead
} from '../services/db';
import { PortalSettings, AppNotification } from '../types';
import { ColorStudioModal } from './ui/ColorStudioModal';
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
  RefreshCw,
  Radio,
  FileCheck,
  Award,
  Sparkles,
  Check
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, role, logout } = useAuth();
  const { customColors } = useTheme();

  const [settings, setSettings] = useState<PortalSettings>(DEFAULT_PORTAL_SETTINGS);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPaletteModal, setShowPaletteModal] = useState(false);
  
  // Real-Time Notifications State
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [pushStatus, setPushStatus] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  // App update checking state for PWA
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState<string | null>(null);

  // Subscribe to real-time notifications
  useEffect(() => {
    const unsub = subscribeNotifications((notifs) => {
      setNotifications(notifs);
    });
    return () => unsub();
  }, []);

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
      if (showNotificationsModal) setShowNotificationsModal(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showProfileModal, showInstallGuide, showPaletteModal, showNotificationsModal]);

  const handleRequestPushPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setPushStatus(perm);
        if (perm === 'granted') {
          new Notification('ওয়েব পুশ নোটিফিকেশন চালু হয়েছে!', {
            body: 'লাইভ ক্লাস, পরীক্ষার রুটিন এবং রেজাল্ট পাবলিশ হলে রিয়েল-টাইম নোটিফিকেশন পাবেন।',
            icon: '/favicon.ico'
          });
        }
      } catch (err) {
        console.warn('Push permission error:', err);
      }
    }
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
            {/* Real-time Notifications Bell Button */}
            <button
              onClick={() => {
                window.history.pushState({ modal: 'notifications' }, '');
                setShowNotificationsModal(true);
              }}
              className="relative p-2 rounded-xl border border-theme-border bg-theme-card hover:bg-theme-card-hover text-slate-200 transition-all cursor-pointer shadow-xs"
              title="Real-time Notifications & Updates"
            >
              <Bell className="w-4 h-4 text-theme-title" />
              {notifications.filter(n => !n.read).length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white font-mono font-bold text-[9px] flex items-center justify-center animate-pulse shadow-sm">
                  {notifications.filter(n => !n.read).length > 9 ? '9+' : notifications.filter(n => !n.read).length}
                </span>
              )}
            </button>

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
              <span className="hidden sm:inline text-xs font-bold text-theme-title">
                {role === 'admin' ? 'Colors' : 'Themes'}
              </span>
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

              {/* Quick Custom Color / Preset Theme Trigger */}
              <div className="pt-2 border-t border-theme-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-theme-title flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5" style={{ color: 'var(--theme-primary)' }} />
                    <span>{role === 'admin' ? 'Custom Color Studio' : 'Preset Themes'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileModal(false);
                      setShowPaletteModal(true);
                    }}
                    className="text-xs font-bold px-2.5 py-1 rounded-lg btn-theme-primary cursor-pointer"
                  >
                    {role === 'admin' ? 'Open Color Studio' : 'Browse Themes'}
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

      {/* Refined Color Studio Modal (BACKGROUND, FOREGROUND, BUTTON & LOGO Tabs + 3 HSV Sliders) */}
      <ColorStudioModal 
        isOpen={showPaletteModal} 
        onClose={() => setShowPaletteModal(false)} 
      />

      {/* REAL-TIME NOTIFICATIONS MODAL */}
      {showNotificationsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg bg-theme-card border border-theme-border rounded-3xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-theme-border flex items-center justify-between bg-theme-surface">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-theme-title">
                    নোটিফিকেশন ও ঘোষণা (Notification Hub)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    লাইভ ক্লাস, এক্সাম রুটিন ও রেজাল্ট সংক্রান্ত সর্বশেষ আপডেট
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowNotificationsModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Web Push Notification Status Bar */}
            <div className="p-3.5 bg-theme-surface/70 border-b border-theme-border flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Radio className={`w-4 h-4 ${pushStatus === 'granted' ? 'text-emerald-400' : 'text-amber-400'}`} />
                <span className="text-slate-300 text-[11px]">
                  ওয়েব পুশ নোটিফিকেশন: <strong className={pushStatus === 'granted' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    {pushStatus === 'granted' ? 'সক্রিয় (Active)' : 'নিষ্ক্রিয় (Off)'}
                  </strong>
                </span>
              </div>

              {pushStatus !== 'granted' && typeof window !== 'undefined' && 'Notification' in window && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await Notification.requestPermission();
                      setPushStatus(res);
                      if (res === 'granted') {
                        new Notification('Exam Portal', {
                          body: 'পুশ নোটিফিকেশন সফলভাবে সক্রিয় হয়েছে!'
                        });
                      }
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                  className="px-2.5 py-1 rounded-xl btn-theme-primary text-[10px] font-bold cursor-pointer transition-all shadow-xs"
                >
                  অনুমতি দিন
                </button>
              )}
            </div>

            {/* Notifications List */}
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-theme-border p-2">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-slate-400 space-y-2">
                  <Bell className="w-8 h-8 mx-auto text-slate-500 opacity-50" />
                  <p className="text-xs font-medium">কোনো নতুন নোটিফিকেশন নেই।</p>
                  <p className="text-[10px] text-slate-500">নতুন ক্লাস বা এক্সাম পাবলিশ হলে এখানে সরাসরি দেখতে পাবেন।</p>
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => {
                      if (!notif.read) {
                        markNotificationRead(notif.id);
                      }
                    }}
                    className={`p-3.5 rounded-2xl flex items-start gap-3 transition-colors cursor-pointer ${
                      notif.read ? 'hover:bg-theme-surface/50 opacity-80' : 'bg-rose-500/5 hover:bg-rose-500/10'
                    }`}
                  >
                    <div className="p-2 rounded-xl bg-theme-surface border border-theme-border shrink-0 mt-0.5">
                      {notif.type === 'omr' ? (
                        <FileCheck className="w-4 h-4 text-purple-400" />
                      ) : notif.type === 'exam' ? (
                        <Radio className="w-4 h-4 text-rose-400 animate-pulse" />
                      ) : notif.type === 'result' ? (
                        <Award className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-blue-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-xs text-theme-title truncate">
                          {notif.title}
                        </h4>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {notif.message}
                      </p>
                    </div>

                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 mt-2" title="Unread" />
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-theme-border flex items-center justify-between bg-theme-surface">
              <span className="text-[10px] text-slate-400">
                মোট {notifications.length} টি নোটিফিকেশন
              </span>
              <button
                type="button"
                onClick={() => setShowNotificationsModal(false)}
                className="px-4 py-1.5 rounded-xl bg-theme-card hover:bg-theme-card-hover border border-theme-border text-slate-200 text-xs font-semibold cursor-pointer"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
