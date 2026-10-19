import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { hexToHsv, hsvToHex, CustomColors } from '../../utils/themeColors';
import { 
  subscribePresetThemes, 
  createPresetTheme, 
  deletePresetTheme, 
  DEFAULT_PRESET_THEMES 
} from '../../services/db';
import { PresetTheme } from '../../types';
import { 
  BookmarkPlus, 
  Trash2, 
  Check, 
  CheckCircle2, 
  Palette, 
  Sparkles, 
  Plus, 
  X,
  Loader2
} from 'lucide-react';

type ActiveTab = 'BACKGROUND' | 'FOREGROUND' | 'BUTTON_LOGO';

interface ColorStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ColorStudioModal: React.FC<ColorStudioModalProps> = ({ isOpen, onClose }) => {
  const { user, role } = useAuth();
  const isAdmin = role === 'admin';
  const { customColors, setAllCustomColors } = useTheme();

  // Remember initial colors when modal opens so Cancel can cleanly restore them
  const initialColorsRef = useRef<CustomColors>(customColors);

  // Active color tab for Admin: BACKGROUND, FOREGROUND, or BUTTON & LOGO
  const [activeTab, setActiveTab] = useState<ActiveTab>('BACKGROUND');

  // Working colors state
  const [workingColors, setWorkingColors] = useState<CustomColors>(customColors);

  // Active HSV slider values for the currently selected tab (Admin only)
  const [hue, setHue] = useState<number>(215);
  const [sat, setSat] = useState<number>(85);
  const [val, setVal] = useState<number>(90);

  // Preset themes synced from Firestore
  const [presetThemes, setPresetThemes] = useState<PresetTheme[]>(DEFAULT_PRESET_THEMES);
  const [newPresetName, setNewPresetName] = useState('');
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [showSavePresetInput, setShowSavePresetInput] = useState(false);
  const [presetFeedback, setPresetFeedback] = useState<string | null>(null);

  // Subscribe to real-time preset themes in Firestore
  useEffect(() => {
    const unsub = subscribePresetThemes((themes) => {
      setPresetThemes(themes);
    });
    return () => unsub();
  }, []);

  // Initialize or re-sync when modal opens
  useEffect(() => {
    if (isOpen) {
      initialColorsRef.current = { ...customColors };
      setWorkingColors({ ...customColors });
      syncHsvFromTab('BACKGROUND', customColors);
      setActiveTab('BACKGROUND');
      setShowSavePresetInput(false);
      setPresetFeedback(null);
    }
  }, [isOpen]);

  // Sync HSV sliders based on current active tab and given colors
  const syncHsvFromTab = (tab: ActiveTab, currentColors: CustomColors) => {
    let targetHex = currentColors.bgColor;
    if (tab === 'FOREGROUND') {
      targetHex = currentColors.fgColor;
    } else if (tab === 'BUTTON_LOGO') {
      targetHex = currentColors.primaryColor || currentColors.buttonColor || '#2563eb';
    }
    const hsv = hexToHsv(targetHex);
    setHue(hsv.h);
    setSat(hsv.s);
    setVal(hsv.v);
  };

  // Handle Tab Change (Admin)
  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    syncHsvFromTab(tab, workingColors);
  };

  // When Hue, Saturation, or Value changes, update workingColors and live app preview (Admin)
  const handleSliderUpdate = (newH: number, newS: number, newV: number) => {
    const clampedH = Math.max(0, Math.min(360, Math.round(newH)));
    const clampedS = Math.max(0, Math.min(100, Math.round(newS)));
    const clampedV = Math.max(0, Math.min(100, Math.round(newV)));

    setHue(clampedH);
    setSat(clampedS);
    setVal(clampedV);

    const newHex = hsvToHex(clampedH, clampedS, clampedV);

    let updatedColors: CustomColors = { ...workingColors };
    if (activeTab === 'BACKGROUND') {
      updatedColors.bgColor = newHex;
    } else if (activeTab === 'FOREGROUND') {
      updatedColors.fgColor = newHex;
    } else if (activeTab === 'BUTTON_LOGO') {
      updatedColors.primaryColor = newHex;
      updatedColors.buttonColor = newHex;
      updatedColors.logoColor = newHex;
    }

    setWorkingColors(updatedColors);
    // Real-time live update across the entire app interface
    setAllCustomColors(updatedColors);
  };

  // Apply a preset theme to working colors
  const handleApplyPreset = (preset: PresetTheme) => {
    const updated: CustomColors = {
      bgColor: preset.bgColor,
      fgColor: preset.fgColor,
      primaryColor: preset.primaryColor,
      buttonColor: preset.primaryColor,
      logoColor: preset.primaryColor
    };
    setWorkingColors(updated);
    syncHsvFromTab(activeTab, updated);
    setAllCustomColors(updated);
  };

  // Save current workingColors as a new Preset Theme to Firestore (Admin only)
  const handleSaveAsPreset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newPresetName.trim()) return;

    setIsSavingPreset(true);
    setPresetFeedback(null);
    try {
      await createPresetTheme(
        newPresetName.trim(),
        {
          bgColor: workingColors.bgColor,
          fgColor: workingColors.fgColor,
          primaryColor: workingColors.primaryColor || workingColors.buttonColor || '#2563eb'
        },
        user?.name || 'Admin'
      );
      setNewPresetName('');
      setShowSavePresetInput(false);
      setPresetFeedback('প্রিসেট থিম সফলভাবে তৈরি হয়েছে এবং সবার জন্য উন্মুক্ত করা হয়েছে!');
      setTimeout(() => setPresetFeedback(null), 3500);
    } catch (err) {
      console.error('Save preset error:', err);
      setPresetFeedback('প্রিসেট সংরক্ষণ করতে সমস্যা হয়েছে।');
    } finally {
      setIsSavingPreset(false);
    }
  };

  // Delete a preset theme from Firestore (Admin only)
  const handleDeletePreset = async (e: React.MouseEvent, presetId: string, presetName: string) => {
    e.stopPropagation();
    if (window.confirm(`আপনি কি "${presetName}" প্রিসেট থিমটি মুছে ফেলতে চান?`)) {
      try {
        await deletePresetTheme(presetId);
      } catch (err) {
        console.error('Delete preset error:', err);
      }
    }
  };

  // Cancel: Revert all colors to initial state and close
  const handleCancel = () => {
    setAllCustomColors(initialColorsRef.current);
    onClose();
  };

  // Set: Confirm and close (already applied to app state and localStorage)
  const handleSet = () => {
    setAllCustomColors(workingColors);
    onClose();
  };

  if (!isOpen) return null;

  // Calculate thumb offset for 16px wide indicator so it stays exactly within the bar
  const hueThumbOffset = `calc(${(hue / 360)} * (100% - 16px))`;
  const satThumbOffset = `calc(${(sat / 100)} * (100% - 16px))`;
  const valThumbOffset = `calc(${(val / 100)} * (100% - 16px))`;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={handleCancel}
    >
      <div 
        className="w-full max-w-[440px] bg-[#1a1720] border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 my-auto text-white max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div 
              className="w-8 h-8 rounded-xl text-white flex items-center justify-center shadow-xs"
              style={{ backgroundColor: workingColors.primaryColor || workingColors.buttonColor }}
            >
              <Palette className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-white">
                {isAdmin ? 'Color Studio (কালার স্টুডিও)' : 'Themes (প্রিসেট থিমসমূহ)'}
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-400">
                {isAdmin 
                  ? 'কাস্টম কালার নির্বাচন ও নতুন প্রিসেট থিম তৈরি করুন' 
                  : 'এডমিন কর্তৃক নির্ধারিত থিমসমূহ থেকে আপনার পছন্দের থিম নির্বাচন করুন'}
              </p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FEEDBACK BANNER */}
        {presetFeedback && (
          <div className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-600/60 text-emerald-300 text-xs font-semibold flex items-center gap-2 shrink-0 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{presetFeedback}</span>
          </div>
        )}

        {/* SCROLLABLE BODY */}
        <div className="overflow-y-auto space-y-4 pr-1 flex-1">
          
          {/* ======================================================== */}
          {/* ADMIN INTERFACE: 3 Tabs + 3 Sliders + Preset Management */}
          {/* ======================================================== */}
          {isAdmin ? (
            <>
              {/* 1. TOP BAR: 3 PREVIEW TABS (BACKGROUND | FOREGROUND | BUTTON & LOGO) */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center select-none pt-1">
                {/* TAB 1: BACKGROUND */}
                <button
                  type="button"
                  onClick={() => handleSelectTab('BACKGROUND')}
                  className="flex flex-col items-center gap-2 group cursor-pointer focus:outline-none"
                >
                  <div 
                    className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl transition-all duration-200 shadow-md ${
                      activeTab === 'BACKGROUND'
                        ? 'ring-3 ring-white shadow-[0_0_18px_rgba(255,255,255,0.45)] scale-105'
                        : 'border border-white/15 opacity-75 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: workingColors.bgColor }}
                  />
                  <span className={`text-[10px] sm:text-[11px] font-bold tracking-wider uppercase transition-colors ${
                    activeTab === 'BACKGROUND' ? 'text-white' : 'text-slate-400'
                  }`}>
                    BACKGROUND
                  </span>
                </button>

                {/* TAB 2: FOREGROUND */}
                <button
                  type="button"
                  onClick={() => handleSelectTab('FOREGROUND')}
                  className="flex flex-col items-center gap-2 group cursor-pointer focus:outline-none"
                >
                  <div 
                    className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl transition-all duration-200 shadow-md ${
                      activeTab === 'FOREGROUND'
                        ? 'ring-3 ring-white shadow-[0_0_18px_rgba(255,255,255,0.45)] scale-105'
                        : 'border border-white/15 opacity-75 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: workingColors.fgColor }}
                  />
                  <span className={`text-[10px] sm:text-[11px] font-bold tracking-wider uppercase transition-colors ${
                    activeTab === 'FOREGROUND' ? 'text-white' : 'text-slate-400'
                  }`}>
                    FOREGROUND
                  </span>
                </button>

                {/* TAB 3: BUTTON & LOGO */}
                <button
                  type="button"
                  onClick={() => handleSelectTab('BUTTON_LOGO')}
                  className="flex flex-col items-center gap-2 group cursor-pointer focus:outline-none"
                >
                  <div 
                    className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl transition-all duration-200 shadow-md ${
                      activeTab === 'BUTTON_LOGO'
                        ? 'ring-3 ring-white shadow-[0_0_18px_rgba(255,255,255,0.45)] scale-105'
                        : 'border border-white/15 opacity-75 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: workingColors.primaryColor || workingColors.buttonColor }}
                  />
                  <span className={`text-[10px] sm:text-[11px] font-bold tracking-wider uppercase transition-colors ${
                    activeTab === 'BUTTON_LOGO' ? 'text-white' : 'text-slate-400'
                  }`}>
                    BUTTON & LOGO
                  </span>
                </button>
              </div>

              {/* 2. MAIN CARD: SELECT COLOR WITH 3 SLIDERS (HUE, SATURATION, VALUE) */}
              <div className="bg-[#241d2c] border border-white/5 rounded-2xl p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm sm:text-base text-white">
                    Select color
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/10 text-slate-300">
                    {activeTab === 'BACKGROUND' ? workingColors.bgColor : activeTab === 'FOREGROUND' ? workingColors.fgColor : (workingColors.primaryColor || workingColors.buttonColor)}
                  </span>
                </div>

                {/* SLIDER 1: HUE */}
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-200 block">
                    Hue
                  </span>
                  <div className="relative h-9 rounded-md overflow-visible">
                    <div 
                      className="w-full h-5 rounded-md shadow-inner"
                      style={{
                        background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'
                      }}
                    />
                    <div 
                      className="absolute top-[16px] w-4 h-5 flex flex-col items-center pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)] z-10"
                      style={{ left: hueThumbOffset }}
                    >
                      <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-[#38bdf8]" />
                      <div className="w-3.5 h-3 bg-[#38bdf8] rounded-b-xs" />
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="1"
                      value={hue}
                      onChange={(e) => handleSliderUpdate(Number(e.target.value), sat, val)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                      aria-label="Hue Slider"
                    />
                  </div>
                </div>

                {/* SLIDER 2: SATURATION */}
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-200 block">
                    Saturation
                  </span>
                  <div className="relative h-9 rounded-md overflow-visible">
                    <div 
                      className="w-full h-5 rounded-md shadow-inner"
                      style={{
                        background: `linear-gradient(to right, ${hsvToHex(hue, 0, 100)}, ${hsvToHex(hue, 100, 100)})`
                      }}
                    />
                    <div 
                      className="absolute top-[16px] w-4 h-5 flex flex-col items-center pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)] z-10"
                      style={{ left: satThumbOffset }}
                    >
                      <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-[#38bdf8]" />
                      <div className="w-3.5 h-3 bg-[#38bdf8] rounded-b-xs" />
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={sat}
                      onChange={(e) => handleSliderUpdate(hue, Number(e.target.value), val)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                      aria-label="Saturation Slider"
                    />
                  </div>
                </div>

                {/* SLIDER 3: VALUE (BRIGHTNESS) */}
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-200 block">
                    Value
                  </span>
                  <div className="relative h-9 rounded-md overflow-visible">
                    <div 
                      className="w-full h-5 rounded-md shadow-inner"
                      style={{
                        background: `linear-gradient(to right, #000000, ${hsvToHex(hue, sat, 100)})`
                      }}
                    />
                    <div 
                      className="absolute top-[16px] w-4 h-5 flex flex-col items-center pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)] z-10"
                      style={{ left: valThumbOffset }}
                    >
                      <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-[#38bdf8]" />
                      <div className="w-3.5 h-3 bg-[#38bdf8] rounded-b-xs" />
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={val}
                      onChange={(e) => handleSliderUpdate(hue, sat, Number(e.target.value))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                      aria-label="Value Slider"
                    />
                  </div>
                </div>
              </div>

              {/* 3. MINI UI MOCKUP PREVIEW */}
              <div 
                className="rounded-2xl border border-white/10 p-3.5 shadow-lg transition-colors duration-150 space-y-2.5"
                style={{ backgroundColor: workingColors.bgColor }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1 w-4">
                    <span className="w-4 h-0.5 bg-slate-400 rounded-full" />
                    <span className="w-3 h-0.5 bg-slate-400 rounded-full" />
                    <span className="w-4 h-0.5 bg-slate-400 rounded-full" />
                  </div>
                  <div className="w-5 h-5 rounded-full bg-slate-400/25 flex items-center justify-center">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                  </div>
                </div>
                <div className="w-28 h-2 rounded-full bg-white/15" />
                <div className="w-16 h-1.5 rounded-full bg-white/10" />

                <div 
                  className="rounded-xl p-3 shadow-md flex items-center justify-end mt-2 transition-colors duration-150"
                  style={{ backgroundColor: workingColors.fgColor }}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    className="px-4 py-1.5 rounded-lg text-white font-medium text-xs shadow-md transition-colors duration-150"
                    style={{ backgroundColor: workingColors.primaryColor || workingColors.buttonColor }}
                  >
                    Button
                  </button>
                </div>
              </div>

              {/* 4. ADMIN PRESET THEMES CREATION & CLOUD STORAGE */}
              <div className="p-3.5 rounded-2xl bg-[#241d2c] border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <BookmarkPlus className="w-4 h-4 text-theme-primary" />
                    <span className="text-xs font-bold text-white">
                      প্রিসেট থিম লাইব্রেরি (Cloud Presets)
                    </span>
                  </div>
                  {!showSavePresetInput ? (
                    <button
                      type="button"
                      onClick={() => setShowSavePresetInput(true)}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>প্রিসেট তৈরি করুন</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowSavePresetInput(false)}
                      className="text-slate-400 hover:text-white text-[11px]"
                    >
                      বন্ধ করুন
                    </button>
                  )}
                </div>

                {/* Form to Save Current Colors as Preset */}
                {showSavePresetInput && (
                  <form onSubmit={handleSaveAsPreset} className="p-3 rounded-xl bg-black/30 border border-white/10 space-y-2">
                    <span className="text-[11px] text-slate-300 block font-medium">
                      বর্তমান কালার কম্বিনেশন দিয়ে নতুন প্রিসেট থিম তৈরি করুন:
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="থিমের নাম দিন (e.g. Royal Emerald)"
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-xl bg-[#1a1720] border border-white/15 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-theme-primary"
                        maxLength={30}
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={isSavingPreset || !newPresetName.trim()}
                        className="px-3.5 py-1.5 rounded-xl btn-theme-primary text-xs font-bold disabled:opacity-50 flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        {isSavingPreset ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        <span>সেভ করুন</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* List of Existing Presets */}
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {presetThemes.map((preset) => {
                    const isCurrent = 
                      workingColors.bgColor.toLowerCase() === preset.bgColor.toLowerCase() &&
                      workingColors.fgColor.toLowerCase() === preset.fgColor.toLowerCase();

                    return (
                      <div
                        key={preset.id}
                        onClick={() => handleApplyPreset(preset)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isCurrent 
                            ? 'bg-white/15 border-white/40 ring-1 ring-white/30' 
                            : 'bg-black/20 hover:bg-black/40 border-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Tri-color swatch capsule */}
                          <div className="flex items-center -space-x-1 shrink-0">
                            <span 
                              className="w-4 h-4 rounded-full ring-1 ring-white/20" 
                              style={{ backgroundColor: preset.bgColor }}
                              title="Background" 
                            />
                            <span 
                              className="w-4 h-4 rounded-full ring-1 ring-white/20" 
                              style={{ backgroundColor: preset.fgColor }}
                              title="Foreground" 
                            />
                            <span 
                              className="w-4 h-4 rounded-full ring-1 ring-white/20" 
                              style={{ backgroundColor: preset.primaryColor }}
                              title="Button & Logo" 
                            />
                          </div>
                          <span className="text-xs font-semibold text-slate-200 truncate">
                            {preset.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isCurrent && (
                            <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5">
                              <Check className="w-3 h-3 stroke-[3]" />
                              <span>সক্রিয়</span>
                            </span>
                          )}
                          {!preset.id.startsWith('default_') && (
                            <button
                              type="button"
                              onClick={(e) => handleDeletePreset(e, preset.id, preset.name)}
                              className="p-1 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                              title="মুছে ফেলুন"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* ======================================================== */
            /* STUDENT INTERFACE: PRESET THEMES ONLY (NO COLOR PICKERS) */
            /* ======================================================== */
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-center space-y-1">
                <span className="text-xs font-bold text-white block">
                  এডমিন কর্তৃক প্রস্তুতকৃত থিম লাইব্রেরি
                </span>
                <span className="text-[11px] text-slate-300 block">
                  যেকোনো থিমে ট্যাপ করলেই পুরো অ্যাপ ইন্টারফেস সেই থিমে রূপান্তরিত হবে।
                </span>
              </div>

              {/* Grid of Admin Presets */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {presetThemes.map((preset) => {
                  const isCurrent = 
                    workingColors.bgColor.toLowerCase() === preset.bgColor.toLowerCase() &&
                    workingColors.fgColor.toLowerCase() === preset.fgColor.toLowerCase();

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col gap-2.5 ${
                        isCurrent
                          ? 'ring-2 ring-white shadow-[0_0_15px_rgba(255,255,255,0.25)] scale-[1.02]'
                          : 'border-white/10 hover:border-white/25 hover:bg-white/5'
                      }`}
                      style={{ backgroundColor: preset.bgColor }}
                    >
                      {/* Top Header of Card */}
                      <div className="flex items-center justify-between gap-1 w-full">
                        <span className="text-xs font-bold text-white truncate drop-shadow-xs">
                          {preset.name}
                        </span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-xs">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                            <span>Active</span>
                          </span>
                        )}
                      </div>

                      {/* Mini Simulation of the Theme */}
                      <div 
                        className="w-full p-2 rounded-xl flex items-center justify-between shadow-xs border border-white/10"
                        style={{ backgroundColor: preset.fgColor }}
                      >
                        <div className="space-y-1">
                          <div className="w-12 h-1.5 rounded-full bg-white/30" />
                          <div className="w-8 h-1 rounded-full bg-white/20" />
                        </div>
                        <span 
                          className="px-2.5 py-1 rounded-lg text-white font-bold text-[10px] shadow-xs"
                          style={{ backgroundColor: preset.primaryColor }}
                        >
                          Button
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Mini UI Mockup Preview of the Student's selected theme */}
              <div className="pt-2">
                <span className="text-[11px] font-bold text-slate-300 block mb-1.5">
                  নির্বাচিত থিমের লাইভ অ্যাপ প্রিভিউ:
                </span>
                <div 
                  className="rounded-2xl border border-white/10 p-3.5 shadow-lg transition-colors duration-150 space-y-2.5"
                  style={{ backgroundColor: workingColors.bgColor }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1 w-4">
                      <span className="w-4 h-0.5 bg-slate-400 rounded-full" />
                      <span className="w-3 h-0.5 bg-slate-400 rounded-full" />
                      <span className="w-4 h-0.5 bg-slate-400 rounded-full" />
                    </div>
                    <div className="w-5 h-5 rounded-full bg-slate-400/25 flex items-center justify-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                    </div>
                  </div>
                  <div className="w-28 h-2 rounded-full bg-white/15" />
                  <div className="w-16 h-1.5 rounded-full bg-white/10" />

                  <div 
                    className="rounded-xl p-3 shadow-md flex items-center justify-end mt-2 transition-colors duration-150"
                    style={{ backgroundColor: workingColors.fgColor }}
                  >
                    <button
                      type="button"
                      tabIndex={-1}
                      className="px-4 py-1.5 rounded-lg text-white font-medium text-xs shadow-md transition-colors duration-150"
                      style={{ backgroundColor: workingColors.primaryColor || workingColors.buttonColor }}
                    >
                      Button & Logo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* BOTTOM ACTION BUTTONS: CANCEL & SET ONLY */}
        <div className="flex items-center justify-between pt-2 border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={handleCancel}
            className="text-slate-300 hover:text-white font-semibold text-xs sm:text-sm px-4 py-2 cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSet}
            className="px-8 py-2 rounded-full bg-[#483e50] hover:bg-[#584c62] text-white font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer"
          >
            {isAdmin ? 'Set' : 'Apply Theme (সেট করুন)'}
          </button>
        </div>

      </div>
    </div>
  );
};
