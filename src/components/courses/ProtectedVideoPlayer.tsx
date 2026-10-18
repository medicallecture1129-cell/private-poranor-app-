import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  X, 
  RotateCcw,
  RotateCw,
  Gauge, 
  GraduationCap,
  Sun,
  ArrowLeft,
  Minus,
  Plus
} from 'lucide-react';

interface ProtectedVideoPlayerProps {
  title: string;
  url: string;
  onClose?: () => void;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export const ProtectedVideoPlayer: React.FC<ProtectedVideoPlayerProps> = ({
  title,
  url,
  onClose
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const hideControlsTimerRef = useRef<any>(null);
  
  // Touch gesture tracking for brightness (left) and volume (right)
  const touchStartRef = useRef<{ x: number; y: number; time: number; brightness: number; volume: number }>({
    x: 0,
    y: 0,
    time: 0,
    brightness: 1,
    volume: 100
  });
  const isDraggingRef = useRef(false);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [brightness, setBrightness] = useState(1); // 0.25 to 1.5
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isApiReady, setIsApiReady] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  // Gesture indicators
  const [skipFeedback, setSkipFeedback] = useState<{ side: 'left' | 'right'; text: string } | null>(null);
  const [gestureFeedback, setGestureFeedback] = useState<{ type: 'brightness' | 'volume'; value: number } | null>(null);
  const [playFeedback, setPlayFeedback] = useState<'play' | 'pause' | null>(null);

  // Extract YouTube ID
  const getYouTubeId = (rawUrl: string): string | null => {
    try {
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
      const match = rawUrl.match(regExp);
      return match && match[2].length === 11 ? match[2] : null;
    } catch {
      return null;
    }
  };

  const videoId = getYouTubeId(url);

  // Listen to popstate / hardware back button to close speed menu or player
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (showSpeedMenu) {
        e.preventDefault();
        setShowSpeedMenu(false);
      } else if (onClose) {
        onClose();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showSpeedMenu, onClose]);

  // Load YouTube IFrame API script
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        setIsApiReady(true);
      };
    } else {
      setIsApiReady(true);
    }
  }, []);

  // Initialize YouTube player with uncropped standard 100% width and height
  useEffect(() => {
    if (!isApiReady || !videoId) return;

    playerRef.current = new window.YT.Player('yt-portal-player-frame', {
      videoId: videoId,
      width: '100%',
      height: '100%',
      playerVars: {
        controls: 0,
        modestbranding: 1,
        rel: 0,
        iv_load_policy: 3,
        disablekb: 1,
        fs: 0,
        playsinline: 1,
        origin: window.location.origin
      },
      events: {
        onReady: (event: any) => {
          setDuration(event.target.getDuration() || 0);
          event.target.setPlaybackRate(playbackSpeed);
        },
        onStateChange: (event: any) => {
          if (event.data === 1) {
            setIsPlaying(true);
          } else {
            setIsPlaying(false);
            setControlsVisible(true);
          }
        }
      }
    });

    const interval = setInterval(() => {
      if (playerRef.current && playerRef.current.getCurrentTime) {
        const curr = playerRef.current.getCurrentTime() || 0;
        setCurrentTime(curr);
        const dur = playerRef.current.getDuration() || 0;
        if (dur > 0) setDuration(dur);
      }
    }, 350);

    const handleFullscreenChange = () => {
      const isNowFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isNowFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'j') {
        e.preventDefault();
        handleSkipBackward();
      } else if (e.key === 'ArrowRight' || e.key === 'l') {
        e.preventDefault();
        handleSkipForward();
      } else if (e.key === 'f') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'Escape') {
        if (showSpeedMenu) {
          setShowSpeedMenu(false);
        } else if (isFullscreen) {
          toggleFullscreen();
        } else if (onClose) {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(interval);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
      try {
        if (playerRef.current && playerRef.current.destroy) {
          playerRef.current.destroy();
        }
      } catch {}
    };
  }, [isApiReady, videoId]);

  // Autohide controls after inactivity
  const resetHideTimer = () => {
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    if (isPlaying) {
      hideControlsTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3500);
    }
  };

  const handleUserActivity = () => {
    setControlsVisible(true);
    resetHideTimer();
  };

  // Play / Pause toggle with smooth feedback
  const togglePlay = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
      setPlayFeedback('pause');
      setControlsVisible(true);
    } else {
      playerRef.current.playVideo();
      setIsPlaying(true);
      setPlayFeedback('play');
      resetHideTimer();
    }
    setTimeout(() => setPlayFeedback(null), 600);
  };

  // 10s Skip Backward
  const handleSkipBackward = () => {
    if (!playerRef.current || !playerRef.current.getCurrentTime) return;
    const newTime = Math.max(0, currentTime - 10);
    playerRef.current.seekTo(newTime, true);
    setCurrentTime(newTime);
    setSkipFeedback({ side: 'left', text: '-10s' });
    setTimeout(() => setSkipFeedback(null), 700);
    handleUserActivity();
  };

  // 10s Skip Forward
  const handleSkipForward = () => {
    if (!playerRef.current || !playerRef.current.getCurrentTime) return;
    const newTime = Math.min(duration, currentTime + 10);
    playerRef.current.seekTo(newTime, true);
    setCurrentTime(newTime);
    setSkipFeedback({ side: 'right', text: '+10s' });
    setTimeout(() => setSkipFeedback(null), 700);
    handleUserActivity();
  };

  // Touch Gesture Handling: Vertical swipe for Brightness (Left) and Volume (Right)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      touchStartRef.current = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
        time: Date.now(),
        brightness: brightness,
        volume: volume
      };
      isDraggingRef.current = false;
      handleUserActivity();
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const currentX = touch.clientX - rect.left;
      const currentY = touch.clientY - rect.top;
      const deltaY = touchStartRef.current.y - currentY; // Up is positive
      const deltaX = Math.abs(currentX - touchStartRef.current.x);

      // Vertical drag check
      if (Math.abs(deltaY) > 12 && Math.abs(deltaY) > deltaX) {
        isDraggingRef.current = true;
        const isLeftSide = touchStartRef.current.x < rect.width * 0.48;

        if (isLeftSide) {
          // Brightness Control (0.25 to 1.5)
          const newBrightness = Math.min(1.5, Math.max(0.25, touchStartRef.current.brightness + (deltaY / rect.height) * 1.3));
          setBrightness(newBrightness);
          const percent = Math.round(((newBrightness - 0.25) / 1.25) * 100);
          setGestureFeedback({
            type: 'brightness',
            value: percent
          });
        } else {
          // Volume Control (0 to 100)
          const newVolume = Math.min(100, Math.max(0, touchStartRef.current.volume + (deltaY / rect.height) * 100));
          const roundedVol = Math.round(newVolume);
          setVolume(roundedVol);
          if (playerRef.current && playerRef.current.setVolume) {
            playerRef.current.setVolume(roundedVol);
            if (roundedVol === 0) {
              playerRef.current.mute();
              setIsMuted(true);
            } else if (isMuted) {
              playerRef.current.unMute();
              setIsMuted(false);
            }
          }
          setGestureFeedback({
            type: 'volume',
            value: roundedVol
          });
        }
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isDraggingRef.current) {
      setTimeout(() => setGestureFeedback(null), 800);
      return;
    }

    // It was a tap!
    const now = Date.now();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const tapX = touchStartRef.current.x;
    const isLeftThird = tapX < rect.width * 0.35;
    const isRightThird = tapX > rect.width * 0.65;

    if (now - lastTapRef.current.time < 320) {
      // Double tap!
      if (isLeftThird) {
        handleSkipBackward();
      } else if (isRightThird) {
        handleSkipForward();
      } else {
        togglePlay();
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      // Single tap: toggle pause/play smoothly!
      lastTapRef.current = { time: now, x: tapX };
      togglePlay();
    }
  };

  const toggleMute = () => {
    if (!playerRef.current) return;
    if (isMuted) {
      playerRef.current.unMute();
      setIsMuted(false);
    } else {
      playerRef.current.mute();
      setIsMuted(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = Number(e.target.value);
    setCurrentTime(targetTime);
    if (playerRef.current && playerRef.current.seekTo) {
      playerRef.current.seekTo(targetTime, true);
    }
  };

  const handleSetSpeed = (speed: number) => {
    // 0.25 to 5.0 with 0.01 precision
    const clamped = Math.round(Math.min(5.0, Math.max(0.25, speed)) * 100) / 100;
    setPlaybackSpeed(clamped);
    if (playerRef.current && playerRef.current.setPlaybackRate) {
      playerRef.current.setPlaybackRate(clamped);
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!isFullscreen) {
        const el = containerRef.current as any;
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch {
      setIsFullscreen(!isFullscreen);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins}:${s < 10 ? '0' + s : s}`;
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${isFullscreen ? 'p-0 bg-black' : 'p-0 sm:p-4 bg-black/95 backdrop-blur-md'}`}>
      <div 
        ref={containerRef}
        onMouseMove={handleUserActivity}
        className={`relative w-full max-w-full bg-black flex flex-col select-none overflow-hidden ${
          isFullscreen 
            ? 'fixed inset-0 w-screen h-screen max-w-none rounded-none z-[9999]' 
            : 'sm:max-w-5xl sm:rounded-2xl border-0 sm:border border-slate-800 shadow-2xl h-full sm:h-auto sm:max-h-[96vh]'
        }`}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Top Header Bar */}
        <div 
          className={`flex items-center justify-between px-4 py-2.5 z-30 transition-all duration-300 ${
            isFullscreen 
              ? `absolute top-0 inset-x-0 bg-gradient-to-b from-black/90 via-black/40 to-transparent border-none ${
                  controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
                }`
              : 'bg-slate-900 border-b border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <GraduationCap className="w-4 h-4" />
            </div>
            <span className="font-semibold text-xs sm:text-sm text-white truncate max-w-xs sm:max-w-md">
              {title}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/50 hidden sm:inline">
              Protected Lecture
            </span>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close Player"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Video Canvas Container (16:9 aspect ratio, 100% width, no mobile cut-off) */}
        <div 
          className="relative w-full aspect-video max-w-full bg-black flex items-center justify-center overflow-hidden"
          style={{ filter: `brightness(${brightness})` }}
        >
          {/* YouTube iFrame holder - absolute fill to guarantee 100% mobile fit */}
          <div className="absolute inset-0 w-full h-full pointer-events-none select-none">
            <div id="yt-portal-player-frame" className="w-full h-full absolute inset-0" />
          </div>

          {/* Interactive Screen Layer (Single tap: play/pause; Double tap: 10s skip; Swipe: Brightness/Volume) */}
          <div 
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={togglePlay}
            className="absolute inset-0 z-10 cursor-pointer"
          />

          {/* Smooth Play / Pause Pulse feedback on tap (no center button clutter) */}
          {playFeedback && (
            <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
              <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center shadow-2xl animate-ping duration-300">
                {playFeedback === 'play' ? (
                  <Play className="w-8 h-8 fill-white ml-1" />
                ) : (
                  <Pause className="w-8 h-8 fill-white" />
                )}
              </div>
            </div>
          )}

          {/* Left / Right 10s Skip Animation Overlays */}
          {skipFeedback && (
            <div 
              className={`absolute top-0 bottom-0 z-20 w-1/3 flex items-center justify-center pointer-events-none ${
                skipFeedback.side === 'left' ? 'left-0 bg-gradient-to-r from-blue-600/30 to-transparent' : 'right-0 bg-gradient-to-l from-blue-600/30 to-transparent'
              }`}
            >
              <div className="flex flex-col items-center text-white bg-black/70 px-4 py-3 rounded-2xl backdrop-blur-md shadow-2xl animate-pulse">
                {skipFeedback.side === 'left' ? <RotateCcw className="w-6 h-6 mb-1 text-blue-400" /> : <RotateCw className="w-6 h-6 mb-1 text-blue-400" />}
                <span className="text-xs font-bold font-mono">{skipFeedback.text}</span>
              </div>
            </div>
          )}

          {/* Gesture HUD Feedback: Brightness (Left Swipe) & Volume (Right Swipe) */}
          {gestureFeedback && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-black/80 backdrop-blur-md text-white shadow-2xl pointer-events-none border border-white/10">
              {gestureFeedback.type === 'brightness' ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold font-mono">Brightness: {gestureFeedback.value}%</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold font-mono">Volume: {gestureFeedback.value}%</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Bottom Control Bar */}
        <div 
          className={`z-30 px-3 sm:px-4 py-2 bg-gradient-to-t from-black/95 via-black/80 to-transparent text-white transition-all duration-300 ${
            controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
        >
          {/* Seek Progress Bar */}
          <div className="relative flex items-center w-full mb-1 group">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1.5 bg-slate-700/80 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:h-2 transition-all"
            />
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between gap-2">
            {/* Left Controls: Play/Pause, 10s back, 10s forward, Timestamp */}
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={togglePlay}
                className="p-1.5 text-white hover:text-blue-400 transition-colors cursor-pointer"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              </button>

              <button
                onClick={handleSkipBackward}
                className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Backward 10s"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={handleSkipForward}
                className="p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Forward 10s"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Timestamp */}
              <div className="text-[11px] sm:text-xs font-mono text-slate-300 pl-1">
                <span>{formatTime(currentTime)}</span>
                <span className="text-slate-500 mx-1">/</span>
                <span className="text-slate-400">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Right Controls: Volume, Speed (Screenshot 2 Match), Fullscreen */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={toggleMute}
                className="p-2 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {/* Playback Speed Button (Opens Screenshot 2 Speed Drawer) */}
              <button
                onClick={() => {
                  window.history.pushState({ modal: 'speedMenu' }, '');
                  setShowSpeedMenu(true);
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer flex items-center gap-1 border border-slate-700/60"
                title="Playback Speed"
              >
                <Gauge className="w-3.5 h-3.5 text-blue-400" />
                <span>{playbackSpeed.toFixed(playbackSpeed % 1 === 0 ? 1 : 2)}x</span>
              </button>

              {/* Fullscreen Toggle */}
              <button
                onClick={toggleFullscreen}
                className="p-2 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* PLAYBACK SPEED OVERLAY MODAL (EXACT 100% MATCH WITH SCREENSHOT 2) */}
        {showSpeedMenu && (
          <div className="absolute inset-0 z-40 bg-black/85 backdrop-blur-md flex flex-col justify-end sm:justify-center p-3 sm:p-6 animate-in fade-in duration-150">
            <div className="w-full max-w-sm mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl text-white space-y-5">
              {/* Header with back arrow matching Screenshot 2 */}
              <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                <button
                  onClick={() => setShowSpeedMenu(false)}
                  className="p-1.5 -ml-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h3 className="font-bold text-base tracking-tight text-white">
                  Playback Speed
                </h3>
              </div>

              {/* Custom Fine Slider with - and + buttons (0.25x to 5.0x by 0.01) */}
              <div className="space-y-3 p-4 rounded-2xl bg-slate-800/60 border border-slate-750">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span>Custom</span>
                  <span className="text-sm font-bold text-rose-500 font-mono">
                    {playbackSpeed.toFixed(2)}x
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleSetSpeed(playbackSpeed - 0.01)}
                    className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-200 cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  <input
                    type="range"
                    min={0.25}
                    max={5.0}
                    step={0.01}
                    value={playbackSpeed}
                    onChange={(e) => handleSetSpeed(Number(e.target.value))}
                    className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-rose-500"
                  />

                  <button
                    onClick={() => handleSetSpeed(playbackSpeed + 0.01)}
                    className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-200 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>0.05x</span>
                  <span>5.0x</span>
                </div>
              </div>

              {/* Preset buttons matching Screenshot 2 */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  0.50, 0.75, 1.0, 1.25,
                  1.50, 1.75, 2.0, 3.0,
                  5.0, 2.75
                ].map((s) => {
                  const isActive = Math.abs(playbackSpeed - s) < 0.005;
                  return (
                    <button
                      key={s}
                      onClick={() => {
                        handleSetSpeed(s);
                        setShowSpeedMenu(false);
                      }}
                      className={`py-2 px-1 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                        isActive
                          ? 'bg-rose-500/20 text-rose-500 border border-rose-500/50 shadow-xs'
                          : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
                      }`}
                    >
                      {s.toFixed(2)}x
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setShowSpeedMenu(false)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
