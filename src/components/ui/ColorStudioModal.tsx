import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { hexToHsv, hsvToHex, CustomColors } from '../../utils/themeColors';

type ActiveTab = 'BACKGROUND' | 'FOREGROUND' | 'BUTTON_LOGO';

interface ColorStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ColorStudioModal: React.FC<ColorStudioModalProps> = ({ isOpen, onClose }) => {
  const { customColors, setAllCustomColors } = useTheme();

  // Remember initial colors when modal opens so Cancel can cleanly restore them
  const initialColorsRef = useRef<CustomColors>(customColors);

  // Active color tab: BACKGROUND, FOREGROUND, or BUTTON & LOGO
  const [activeTab, setActiveTab] = useState<ActiveTab>('BACKGROUND');

  // Working colors state
  const [workingColors, setWorkingColors] = useState<CustomColors>(customColors);

  // Active HSV slider values for the currently selected tab
  const [hue, setHue] = useState<number>(215);
  const [sat, setSat] = useState<number>(85);
  const [val, setVal] = useState<number>(90);

  // Initialize or re-sync when modal opens
  useEffect(() => {
    if (isOpen) {
      initialColorsRef.current = { ...customColors };
      setWorkingColors({ ...customColors });
      syncHsvFromTab('BACKGROUND', customColors);
      setActiveTab('BACKGROUND');
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

  // Handle Tab Change
  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    syncHsvFromTab(tab, workingColors);
  };

  // When Hue, Saturation, or Value changes, update workingColors and live app preview
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
        className="w-full max-w-[420px] bg-[#1a1720] border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 my-auto text-white"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* 1. TOP BAR: 3 PREVIEW TABS (BACKGROUND | FOREGROUND | BUTTON & LOGO) */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center select-none">
          {/* TAB 1: BACKGROUND */}
          <button
            type="button"
            onClick={() => handleSelectTab('BACKGROUND')}
            className="flex flex-col items-center gap-2 group cursor-pointer focus:outline-none"
          >
            <div 
              className={`w-18 h-18 sm:w-22 sm:h-22 rounded-2xl transition-all duration-200 shadow-md ${
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
              className={`w-18 h-18 sm:w-22 sm:h-22 rounded-2xl transition-all duration-200 shadow-md ${
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
              className={`w-18 h-18 sm:w-22 sm:h-22 rounded-2xl transition-all duration-200 shadow-md ${
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
        <div className="bg-[#241d2c] border border-white/5 rounded-2xl p-4 sm:p-5 space-y-4">
          <h3 className="font-bold text-base sm:text-lg text-white">
            Select color
          </h3>

          {/* SLIDER 1: HUE */}
          <div className="space-y-1">
            <span className="text-xs sm:text-sm font-semibold text-slate-200 block">
              Hue
            </span>
            <div className="relative h-9 rounded-md overflow-visible">
              {/* Hue Rainbow Gradient Track */}
              <div 
                className="w-full h-5 rounded-md shadow-inner"
                style={{
                  background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'
                }}
              />
              {/* Pointed Blue Thumb Indicator pointing up at the track */}
              <div 
                className="absolute top-[16px] w-4 h-5 flex flex-col items-center pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)] z-10"
                style={{ left: hueThumbOffset }}
              >
                <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-[#38bdf8]" />
                <div className="w-3.5 h-3 bg-[#38bdf8] rounded-b-xs" />
              </div>
              {/* Invisible Range Input for smooth touch and mouse control */}
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
            <span className="text-xs sm:text-sm font-semibold text-slate-200 block">
              Saturation
            </span>
            <div className="relative h-9 rounded-md overflow-visible">
              {/* Saturation Gradient Track */}
              <div 
                className="w-full h-5 rounded-md shadow-inner"
                style={{
                  background: `linear-gradient(to right, ${hsvToHex(hue, 0, 100)}, ${hsvToHex(hue, 100, 100)})`
                }}
              />
              {/* Pointed Blue Thumb Indicator */}
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
            <span className="text-xs sm:text-sm font-semibold text-slate-200 block">
              Value
            </span>
            <div className="relative h-9 rounded-md overflow-visible">
              {/* Value Gradient Track from 0% Black to 100% Brightness */}
              <div 
                className="w-full h-5 rounded-md shadow-inner"
                style={{
                  background: `linear-gradient(to right, #000000, ${hsvToHex(hue, sat, 100)})`
                }}
              />
              {/* Pointed Blue Thumb Indicator */}
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

          {/* 3. MINI UI MOCKUP PREVIEW (Bottom preview box showing live Background, Foreground, and Button & Logo) */}
          <div className="pt-2">
            <div 
              className="rounded-2xl border border-white/10 p-3.5 sm:p-4 shadow-lg transition-colors duration-150 space-y-2.5"
              style={{ backgroundColor: workingColors.bgColor }}
            >
              {/* Header simulation */}
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

              {/* Title bar placeholders */}
              <div className="w-28 h-2 rounded-full bg-white/15" />
              <div className="w-16 h-1.5 rounded-full bg-white/10" />

              {/* Foreground card simulation */}
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
          </div>

          {/* 4. BOTTOM ACTION BUTTONS: CANCEL & SET ONLY */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className="text-slate-300 hover:text-white font-semibold text-sm px-4 py-2 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSet}
              className="px-8 py-2 rounded-full bg-[#483e50] hover:bg-[#584c62] text-white font-bold text-sm shadow-md transition-all cursor-pointer"
            >
              Set
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
