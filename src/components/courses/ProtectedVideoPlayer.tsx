import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Minus,
  Plus,
  ShieldCheck,
  Settings,
  Check
} from 'lucide-react';
import { extractYouTubeId, getGoogleDriveEmbedUrl } from '../../utils/mediaUrl';

interface ProtectedVideoPlayerProps {
  title: string;
  url: string;
  onClose?: () => void;
  isInline?: boolean;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface QualityOption {
  id: string;
  label: string;
  desc: string;
}

const QUALITY_OPTIONS: QualityOption[] = [
  { id: 'auto', label: 'Auto', desc: 'স্বয়ংক্রিয় (Recommended)' },
  { id: 'hd1080', label: '1080p', desc: 'Full HD' },
  { id: 'hd720', label: '720p', desc: 'HD Quality' },
  { id: 'large', label: '480p', desc: 'Standard Definition' },
  { id: 'medium', label: '360p', desc: 'Medium Data' },
  { id: 'small', label: '240p', desc: 'Data Saver' },
  { id: 'tiny', label: '144p', desc: 'Ultra Low Data' }
];

const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 3.5, 4.0];

export const ProtectedVideoPlayer: React.FC<ProtectedVideoPlayerProps> = ({
  title,
  url,
  onClose,
  isInline = false
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const html5VideoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const hideControlsTimerRef = useRef<any>(null);
  const pollTimerRef = useRef<any>(null);
  const uniquePlayerId = useRef(`yt-player-${Math.random().toString(36).substring(2, 9)}`);
  
  // Single-tap vs Double-tap debouncer to eliminate pause/resume bug
  const singleTapTimerRef = useRef<any>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });

  // Touch gesture tracking for brightness (left) and volume (right)
  const touchStartRef = useRef<{ x: number; y: number; time: number; brightness: number; volume: number }>({
    x: 0,
    y: 0,
    time: 0,
    brightness: 1,
    volume: 100
  });
  const isDraggingRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [brightness, setBrightness] = useState(1); // 0.25 to 1.5
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [selectedQuality, setSelectedQuality] = useState<string>('auto');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  // Gesture indicators
  const [skipFeedback, setSkipFeedback] = useState<{ side: 'left' | 'right'; text: string } | null>(null);
  const [gestureFeedback, setGestureFeedback] = useState<{ type: 'brightness' | 'volume'; value: number } | null>(null);
  const [playFeedback, setPlayFeedback] = useState<'play' | 'pause' | null>(null);

  // Extract YouTube ID with robust universal parser
  const videoId = extractYouTubeId(url);
  const isDriveVideo = !videoId && url.includes('drive.google.com');
  const isDirectVideo = !videoId && !isDriveVideo;

  // Universal Player Command Dispatcher (Calls YT.Player + postMessage fallback)
  const dispatchCommand = useCallback((func: string, args: any[] = []) => {
    if (ytPlayerRef.current && typeof ytPlayerRef.current[func] === 'function') {
      try {
        ytPlayerRef.current[func](...args);
      } catch (err) {
        console.warn('YT.Player call failed:', err);
      }
    }
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func, args }),
          '*'
        );
      } catch {}
    }
  }, []);

  // Autohide controls after inactivity while playing (YouTube style)
  const resetHideTimer = useCallback(() => {
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    if (isPlaying) {
      hideControlsTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3500);
    }
  }, [isPlaying]);

  const showControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    resetHideTimer();
  }, [resetHideTimer]);

  // Listen to popstate / hardware back button to close menus or player
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (showSpeedMenu) {
        e.preventDefault();
        setShowSpeedMenu(false);
      } else if (showQualityMenu) {
        e.preventDefault();
        setShowQualityMenu(false);
      } else if (isFullscreen) {
        toggleFullscreen();
      } else if (onClose && !isInline) {
        onClose();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showSpeedMenu, showQualityMenu, isFullscreen, onClose, isInline]);

  // Fullscreen change events & keyboard shortcuts
  useEffect(() => {
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
      // Prevent devtools and download shortcuts to protect content
      if (
        (e.ctrlKey || e.metaKey) && 
        (e.key === 's' || e.key === 'u' || e.key === 'S' || e.key === 'U')
      ) {
        e.preventDefault();
        return;
      }

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
        } else if (showQualityMenu) {
          setShowQualityMenu(false);
        } else if (isFullscreen) {
          toggleFullscreen();
        } else if (onClose && !isInline) {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showSpeedMenu, showQualityMenu, isFullscreen, onClose, isInline, isPlaying]);

  // Initialize official YouTube Iframe API if available
  useEffect(() => {
    if (!videoId) return;

    let checkInterval: any = null;

    const initYT = () => {
      if (window.YT && window.YT.Player && iframeRef.current) {
        try {
          ytPlayerRef.current = new window.YT.Player(uniquePlayerId.current, {
            events: {
              onReady: (e: any) => {
                ytPlayerRef.current = e.target;
                if (hasStarted) {
                  e.target.playVideo();
                }
                // Apply playback rate & quality on ready
                if (playbackSpeed !== 1) {
                  e.target.setPlaybackRate(playbackSpeed);
                }
                if (selectedQuality !== 'auto') {
                  e.target.setPlaybackQuality(selectedQuality);
                }
              },
              onStateChange: (e: any) => {
                // 1 = PLAYING, 2 = PAUSED, 0 = ENDED, 3 = BUFFERING
                if (e.data === 1) {
                  setIsPlaying(true);
                  setHasStarted(true);
                  resetHideTimer();
                } else if (e.data === 2) {
                  setIsPlaying(false);
                  setControlsVisible(true);
                } else if (e.data === 0) {
                  setIsPlaying(false);
                  setControlsVisible(true);
                }
              }
            }
          });
        } catch {
          // Fallback to postMessage
        }
      }
    };

    if (window.YT && window.YT.Player) {
      initYT();
    } else {
      checkInterval = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(checkInterval);
          initYT();
        }
      }, 300);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  }, [videoId, hasStarted, playbackSpeed, selectedQuality, resetHideTimer]);

  // PostMessage listener for YouTube IFrame API communication
  useEffect(() => {
    if (!videoId) return;

    const handleMessage = (e: MessageEvent) => {
      try {
        let data = e.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch {
            return;
          }
        }
        if (data && data.event === 'infoDelivery' && data.info) {
          if (typeof data.info.currentTime === 'number') {
            setCurrentTime(data.info.currentTime);
          }
          if (typeof data.info.duration === 'number' && data.info.duration > 0) {
            setDuration(data.info.duration);
          }
          if (typeof data.info.playerState === 'number') {
            // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
            if (data.info.playerState === 1) {
              setIsPlaying(true);
              setHasStarted(true);
            } else if (data.info.playerState === 2) {
              setIsPlaying(false);
            } else if (data.info.playerState === 0) {
              setIsPlaying(false);
              setControlsVisible(true);
            }
          }
        }
      } catch {}
    };

    window.addEventListener('message', handleMessage);

    // Initial handshake with iframe
    const handshakeTimer = setTimeout(() => {
      if (iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'listening', id: uniquePlayerId.current }),
          '*'
        );
      }
    }, 600);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(handshakeTimer);
    };
  }, [videoId]);

  // Periodic polling for YouTube player state & time
  useEffect(() => {
    if (videoId && isPlaying) {
      pollTimerRef.current = setInterval(() => {
        dispatchCommand('getCurrentTime');
        dispatchCommand('getDuration');
      }, 1000);
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [videoId, isPlaying, dispatchCommand]);

  // Auto-hide controls timer update when isPlaying changes
  useEffect(() => {
    if (isPlaying) {
      resetHideTimer();
    } else {
      setControlsVisible(true);
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    }
  }, [isPlaying, resetHideTimer]);

  // Play / Pause toggle with smooth feedback
  const togglePlay = () => {
    setHasStarted(true);

    if (isDirectVideo && html5VideoRef.current) {
      if (html5VideoRef.current.paused) {
        html5VideoRef.current.play();
        setIsPlaying(true);
        setPlayFeedback('play');
        resetHideTimer();
      } else {
        html5VideoRef.current.pause();
        setIsPlaying(false);
        setPlayFeedback('pause');
        setControlsVisible(true);
      }
      setTimeout(() => setPlayFeedback(null), 600);
      return;
    }

    if (videoId) {
      if (isPlaying) {
        dispatchCommand('pauseVideo');
        setIsPlaying(false);
        setPlayFeedback('pause');
        setControlsVisible(true);
      } else {
        dispatchCommand('playVideo');
        setIsPlaying(true);
        setPlayFeedback('play');
        resetHideTimer();
      }
      setTimeout(() => setPlayFeedback(null), 600);
    }
  };

  // 10s Skip Backward
  const handleSkipBackward = () => {
    if (isDirectVideo && html5VideoRef.current) {
      const newTime = Math.max(0, html5VideoRef.current.currentTime - 10);
      html5VideoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      setSkipFeedback({ side: 'left', text: '-10s' });
      setTimeout(() => setSkipFeedback(null), 700);
      showControlsTemporarily();
      return;
    }

    if (videoId) {
      const newTime = Math.max(0, currentTime - 10);
      dispatchCommand('seekTo', [newTime, true]);
      setCurrentTime(newTime);
      setSkipFeedback({ side: 'left', text: '-10s' });
      setTimeout(() => setSkipFeedback(null), 700);
      showControlsTemporarily();
    }
  };

  // 10s Skip Forward
  const handleSkipForward = () => {
    if (isDirectVideo && html5VideoRef.current) {
      const newTime = Math.min(duration || 999999, html5VideoRef.current.currentTime + 10);
      html5VideoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      setSkipFeedback({ side: 'right', text: '+10s' });
      setTimeout(() => setSkipFeedback(null), 700);
      showControlsTemporarily();
      return;
    }

    if (videoId) {
      const newTime = Math.min(duration || 999999, currentTime + 10);
      dispatchCommand('seekTo', [newTime, true]);
      setCurrentTime(newTime);
      setSkipFeedback({ side: 'right', text: '+10s' });
      setTimeout(() => setSkipFeedback(null), 700);
      showControlsTemporarily();
    }
  };

  // TOUCH GESTURE: Left side swipe = Brightness, Right side swipe = Volume
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      brightness: brightness,
      volume: volume
    };
    isDraggingRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    // Trigger vertical swipe if dragged > 12px
    if (Math.abs(deltaY) > 12 && Math.abs(deltaY) > Math.abs(deltaX)) {
      isDraggingRef.current = true;
      const rect = containerRef.current?.getBoundingClientRect();
      const isLeftSide = rect ? (touchStartRef.current.x < rect.left + rect.width / 2) : true;
      const sensitivity = 0.005;

      if (isLeftSide) {
        // Brightness control (0.25 to 1.5)
        const newBright = Math.min(1.5, Math.max(0.25, touchStartRef.current.brightness - deltaY * sensitivity));
        setBrightness(newBright);
        setGestureFeedback({ type: 'brightness', value: Math.round(newBright * 100) });
      } else {
        // Volume control (0 to 100)
        const newVol = Math.min(100, Math.max(0, Math.round(touchStartRef.current.volume - deltaY * 0.4)));
        setVolume(newVol);
        setIsMuted(newVol === 0);

        if (isDirectVideo && html5VideoRef.current) {
          html5VideoRef.current.volume = newVol / 100;
        } else if (videoId) {
          dispatchCommand('setVolume', [newVol]);
        }
        setGestureFeedback({ type: 'volume', value: newVol });
      }
    }
  };

  // SCREEN TAP DISPATCHER: Solves Double-Tap vs Single-Tap conflict!
  const handleScreenTap = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const now = Date.now();
    const timeSinceLast = now - lastTapRef.current.time;
    const deltaX = Math.abs(clientX - lastTapRef.current.x);

    // DOUBLE TAP DETECTED (< 260ms between taps in same vicinity)
    if (timeSinceLast < 260 && deltaX < 90) {
      // 1. Cancel the single-tap timer immediately so video NEVER pauses/resumes!
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapRef.current = { time: 0, x: 0, y: 0 };

      const relX = clientX - rect.left;
      if (relX < rect.width * 0.4) {
        // Double tap left: 10s backward
        handleSkipBackward();
      } else if (relX > rect.width * 0.6) {
        // Double tap right: 10s forward
        handleSkipForward();
      } else {
        // Double tap center: toggle play/pause
        togglePlay();
      }
      return;
    }

    // First tap of a potential double tap: schedule single-tap execution
    lastTapRef.current = { time: now, x: clientX, y: clientY };

    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;

      // SINGLE TAP LOGIC (YouTube style):
      // If controls are hidden: reveal controls!
      if (!controlsVisible) {
        setControlsVisible(true);
        resetHideTimer();
      } else {
        // Controls are already visible:
        // If tapped in the center area, toggle play/pause!
        const relX = clientX - rect.left;
        const relY = clientY - rect.top;
        const isCenterArea = 
          relX >= rect.width * 0.25 && 
          relX <= rect.width * 0.75 && 
          relY >= rect.height * 0.2 && 
          relY <= rect.height * 0.8;

        if (isCenterArea) {
          togglePlay();
        } else {
          // Tapped outside center: hide controls
          setControlsVisible(false);
        }
      }
    }, 260);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    setTimeout(() => setGestureFeedback(null), 900);
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      return;
    }

    if (e.changedTouches.length === 1) {
      const touch = e.changedTouches[0];
      handleScreenTap(touch.clientX, touch.clientY);
    }
  };

  const handleMouseClick = (e: React.MouseEvent<HTMLDivElement>) => {
    handleScreenTap(e.clientX, e.clientY);
  };

  const toggleMute = () => {
    if (isDirectVideo && html5VideoRef.current) {
      html5VideoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
      return;
    }

    if (videoId) {
      const action = isMuted ? 'unMute' : 'mute';
      dispatchCommand(action);
      setIsMuted(!isMuted);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = Number(e.target.value);
    setCurrentTime(targetTime);
    if (isDirectVideo && html5VideoRef.current) {
      html5VideoRef.current.currentTime = targetTime;
    } else if (videoId) {
      dispatchCommand('seekTo', [targetTime, true]);
    }
    showControlsTemporarily();
  };

  // Playback speed up to 4.0x with precision & instant application
  const handleSetSpeed = (speed: number) => {
    const clamped = Math.round(Math.min(4.0, Math.max(0.25, speed)) * 100) / 100;
    setPlaybackSpeed(clamped);

    if (isDirectVideo && html5VideoRef.current) {
      html5VideoRef.current.playbackRate = clamped;
    } else if (videoId) {
      dispatchCommand('setPlaybackRate', [clamped]);
    }
  };

  // Video Quality Handler
  const handleSetQuality = (qualityId: string) => {
    setSelectedQuality(qualityId);
    if (videoId) {
      dispatchCommand('setPlaybackQuality', [qualityId]);
      dispatchCommand('setPlaybackQualityRange', [qualityId]);
    }
    setShowQualityMenu(false);
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

  const currentQualityLabel = QUALITY_OPTIONS.find(q => q.id === selectedQuality)?.label || 'Auto';

  // Video markup
  const videoPlayerMarkup = (
    <div 
      ref={containerRef}
      onMouseMove={showControlsTemporarily}
      className={`relative w-full bg-black flex flex-col select-none overflow-hidden transition-all duration-300 ${
        isFullscreen 
          ? 'fixed inset-0 w-screen h-screen max-w-none rounded-none z-[9999]' 
          : 'w-full rounded-3xl border border-slate-800 shadow-2xl'
      }`}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* Top Header Bar (Hides when controls hide, shows on touch) */}
      <div 
        className={`flex items-center justify-between px-4 py-3 z-30 transition-all duration-300 ${
          isFullscreen 
            ? `absolute top-0 inset-x-0 bg-gradient-to-b from-black/95 via-black/60 to-transparent border-none ${
                controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
              }`
            : `absolute top-0 inset-x-0 bg-gradient-to-b from-black/90 via-black/40 to-transparent border-b border-white/5 ${
                controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
              }`
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div 
            className="w-7 h-7 rounded-lg text-white flex items-center justify-center shadow-xs shrink-0"
            style={{ backgroundColor: 'var(--theme-primary)' }}
          >
            <GraduationCap className="w-4 h-4" />
          </div>
          <span className="font-semibold text-xs sm:text-sm text-white truncate max-w-xs sm:max-w-md drop-shadow-md">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Strictly Protected In-App Player Badge */}
          <span className="text-[11px] font-semibold text-slate-200 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 flex items-center gap-1.5 shadow-xs">
            <span 
              className="w-2 h-2 rounded-full animate-pulse" 
              style={{ backgroundColor: 'var(--theme-primary)' }}
            />
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">সুরক্ষিত ইন-অ্যাপ প্লেয়ার</span>
            <span className="sm:hidden">ইন-অ্যাপ</span>
          </span>

          {onClose && !isInline && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title="Close Player"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Video Canvas Container (16:9 aspect ratio, 100% width) */}
      <div 
        className="relative w-full aspect-video max-w-full bg-black flex items-center justify-center overflow-hidden"
        style={{ filter: `brightness(${brightness})` }}
      >
        {/* Case 1: YouTube video - 100% IN-APP PLAYBACK WITH HARDENED ANTI-DOWNLOAD SANDBOX */}
        {videoId && (
          <div className="absolute inset-0 w-full h-full select-none pointer-events-none">
            <iframe
              ref={iframeRef}
              id={uniquePlayerId.current}
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${hasStarted ? 1 : 0}&enablejsapi=1&rel=0&playsinline=1&modestbranding=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`}
              title={title}
              className="w-full h-full border-0 absolute inset-0 pointer-events-none select-none"
              sandbox="allow-scripts allow-same-origin allow-presentation"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        )}

        {/* Case 2: Google Drive Video */}
        {isDriveVideo && (
          <iframe
            src={getGoogleDriveEmbedUrl(url)}
            className="w-full h-full absolute inset-0 border-none"
            title={title}
            sandbox="allow-scripts allow-same-origin allow-presentation"
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
        )}

        {/* Case 3: Direct video / MP4 / Blob / File */}
        {isDirectVideo && (
          <video
            ref={html5VideoRef}
            src={url}
            playsInline
            controlsList="nodownload nofullscreen noplaybackrate"
            disablePictureInPicture
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
            onTimeUpdate={() => {
              if (html5VideoRef.current) {
                setCurrentTime(html5VideoRef.current.currentTime);
              }
            }}
            onLoadedMetadata={() => {
              if (html5VideoRef.current) {
                setDuration(html5VideoRef.current.duration);
              }
            }}
            onEnded={() => {
              setIsPlaying(false);
              setControlsVisible(true);
            }}
            className="w-full h-full object-contain pointer-events-none select-none"
          />
        )}

        {/* Interaction Surface Overlay: Captures Taps, Double-Taps, and Swipes */}
        {!isDriveVideo && (
          <div 
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={handleMouseClick}
            className="absolute inset-0 z-10 cursor-pointer"
          />
        )}

        {/* Initial Big Play Button if Not Started Yet */}
        {!hasStarted && !isDriveVideo && (
          <div 
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px] cursor-pointer group"
          >
            <div 
              className="w-16 sm:w-20 h-16 sm:h-20 rounded-full text-white flex items-center justify-center shadow-2xl transition-all transform group-hover:scale-110 active:scale-95"
              style={{ 
                backgroundColor: 'var(--theme-primary)',
                boxShadow: '0 0 40px var(--theme-primary-glow)' 
              }}
            >
              <Play className="w-8 sm:w-10 h-8 sm:h-10 fill-white ml-1" />
            </div>
            <span className="mt-4 text-xs sm:text-sm font-bold text-white bg-black/80 px-4 py-2 rounded-full border border-white/10 shadow-lg flex items-center gap-2">
              <Play className="w-3.5 h-3.5 text-blue-400 fill-blue-400" />
              <span>ভিডিও প্লে করতে টাচ করুন</span>
            </span>
          </div>
        )}

        {/* Center YouTube-Style Play / Pause Action Button (Shown when controls are visible & video started) */}
        {hasStarted && !isDriveVideo && (
          <div 
            className={`absolute inset-0 z-20 flex items-center justify-center pointer-events-none transition-all duration-300 ${
              controlsVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'
            }`}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="w-14 sm:w-16 h-14 sm:h-16 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white flex items-center justify-center shadow-2xl backdrop-blur-md cursor-pointer pointer-events-auto transform transition-transform hover:scale-110 active:scale-95"
              title={isPlaying ? 'Pause Video' : 'Play Video'}
            >
              {isPlaying ? (
                <Pause className="w-7 h-7 sm:w-8 sm:h-8 fill-white" />
              ) : (
                <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-white ml-1" />
              )}
            </button>
          </div>
        )}

        {/* Smooth Play / Pause Pulse feedback on quick double-tap center */}
        {playFeedback && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-black/75 backdrop-blur-md text-white flex items-center justify-center shadow-2xl animate-ping duration-300">
              {playFeedback === 'play' ? (
                <Play className="w-8 h-8 fill-white ml-1" />
              ) : (
                <Pause className="w-8 h-8 fill-white" />
              )}
            </div>
          </div>
        )}

        {/* Left / Right 10s Skip Animation Overlays (No pause interruption!) */}
        {skipFeedback && (
          <div 
            className={`absolute top-0 bottom-0 z-20 w-1/3 flex items-center justify-center pointer-events-none ${
              skipFeedback.side === 'left' ? 'left-0 bg-gradient-to-r from-blue-600/35 to-transparent' : 'right-0 bg-gradient-to-l from-blue-600/35 to-transparent'
            }`}
          >
            <div className="flex flex-col items-center text-white bg-black/85 px-4 py-3 rounded-2xl backdrop-blur-md shadow-2xl border border-white/10 animate-scaleUp">
              {skipFeedback.side === 'left' ? <RotateCcw className="w-6 h-6 mb-1 text-blue-400" /> : <RotateCw className="w-6 h-6 mb-1 text-blue-400" />}
              <span className="text-xs font-bold font-mono tracking-wider">{skipFeedback.text}</span>
            </div>
          </div>
        )}

        {/* Gesture HUD Feedback: Brightness & Volume */}
        {gestureFeedback && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-black/85 backdrop-blur-md text-white shadow-2xl pointer-events-none border border-white/10">
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

      {/* Bottom Control Bar (Auto-hides while playing, reveals on screen touch) */}
      {!isDriveVideo && (
        <div 
          className={`absolute bottom-0 inset-x-0 z-30 px-3 sm:px-5 py-2.5 bg-gradient-to-t from-black/95 via-black/85 to-transparent text-white transition-all duration-300 ${
            controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
          }`}
        >
          {/* Seek Progress Bar */}
          <div className="relative flex items-center w-full mb-1.5 group">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1.5 bg-slate-700/80 rounded-lg appearance-none cursor-pointer hover:h-2 transition-all"
              style={{ accentColor: 'var(--theme-primary)' }}
            />
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2.5">
              {/* Play / Pause button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors cursor-pointer"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
              </button>

              {/* 10s Backward / Forward */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSkipBackward();
                }}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Rewind 10s"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSkipForward();
                }}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Forward 10s"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Volume & Mute */}
              <div className="flex items-center gap-1.5 group/vol">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMute();
                  }}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const newVol = Number(e.target.value);
                    setVolume(newVol);
                    setIsMuted(newVol === 0);
                    if (isDirectVideo && html5VideoRef.current) {
                      html5VideoRef.current.volume = newVol / 100;
                    } else if (videoId) {
                      dispatchCommand('setVolume', [newVol]);
                    }
                  }}
                  className="w-14 sm:w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer hidden sm:inline-block"
                  style={{ accentColor: 'var(--theme-primary)' }}
                />
              </div>

              {/* Timestamps */}
              <span className="font-mono text-[11px] text-slate-300">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Video Quality Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.history.pushState({ modal: 'quality' }, '');
                  setShowQualityMenu(true);
                }}
                className="px-2 sm:px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono text-[11px] sm:text-xs flex items-center gap-1 transition-all cursor-pointer border border-white/10"
                title="Video Quality (1080p, 720p, 480p, Auto)"
              >
                <Settings className="w-3.5 h-3.5 text-blue-400" />
                <span>{currentQualityLabel}</span>
              </button>

              {/* Playback Speed Button (Up to 4.0x) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.history.pushState({ modal: 'speed' }, '');
                  setShowSpeedMenu(true);
                }}
                className="px-2 sm:px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono text-[11px] sm:text-xs flex items-center gap-1 transition-all cursor-pointer border border-white/10"
                title="Playback Speed (0.25x - 4.0x)"
              >
                <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                <span>{playbackSpeed.toFixed(2)}x</span>
              </button>

              {/* Fullscreen Toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors cursor-pointer"
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PLAYBACK SPEED MODAL (UP TO 4.0x WITH CLEAR SCALE MARKINGS) */}
      {showSpeedMenu && (
        <div 
          onClick={() => setShowSpeedMenu(false)}
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl text-white space-y-5 animate-scaleUp"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Gauge className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base text-white">Playback Speed (0.25x - 4.0x)</h3>
              </div>
              <button
                onClick={() => setShowSpeedMenu(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Speed Display */}
            <div className="text-center py-1">
              <span 
                className="text-4xl font-extrabold font-mono tracking-tight"
                style={{ color: 'var(--theme-primary)' }}
              >
                {playbackSpeed.toFixed(2)}x
              </span>
              <p className="text-xs text-slate-400 mt-1">
                ৪x পর্যন্ত স্পিড স্কেল এবং দ্রুত প্রিসেট বাটন
              </p>
            </div>

            {/* Continuous Precision Slider: 0.25 to 4.0 with step 0.05 */}
            <div className="space-y-1.5">
              <input
                type="range"
                min={0.25}
                max={4.0}
                step={0.05}
                value={playbackSpeed}
                onChange={(e) => handleSetSpeed(Number(e.target.value))}
                className="w-full h-2.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: 'var(--theme-primary)' }}
              />
              {/* Accurately marked scale labels up to 4.0x */}
              <div className="flex justify-between text-[10px] text-slate-400 font-mono pt-1">
                <span>0.25x</span>
                <span>1.0x</span>
                <span>2.0x</span>
                <span>3.0x</span>
                <span>4.0x</span>
              </div>
            </div>

            {/* Minus / Plus fine-tuning buttons */}
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => handleSetSpeed(playbackSpeed - 0.05)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" /> -0.05
              </button>
              <button
                onClick={() => handleSetSpeed(1.0)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                Normal (1.0x)
              </button>
              <button
                onClick={() => handleSetSpeed(playbackSpeed + 0.05)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> +0.05
              </button>
            </div>

            {/* Quick Presets Grid (0.5x, 0.75x, 1x, 1.25x, 1.5x, 1.75x, 2x, 2.5x, 3x, 3.5x, 4x) */}
            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-800">
              {SPEED_PRESETS.map((preset) => {
                const isMatch = Math.abs(playbackSpeed - preset) < 0.005;
                return (
                  <button
                    key={preset}
                    onClick={() => handleSetSpeed(preset)}
                    className="py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border"
                    style={{
                      backgroundColor: isMatch ? 'var(--theme-primary)' : 'rgba(30, 41, 59, 0.8)',
                      borderColor: isMatch ? 'var(--theme-primary)' : 'rgba(51, 65, 85, 0.5)',
                      color: isMatch ? '#ffffff' : '#cbd5e1'
                    }}
                  >
                    {preset.toFixed(2)}x
                  </button>
                );
              })}
            </div>

            {/* Done button */}
            <button
              onClick={() => setShowSpeedMenu(false)}
              className="w-full py-2.5 rounded-xl text-white font-bold text-xs sm:text-sm cursor-pointer shadow-md transition-all"
              style={{ backgroundColor: 'var(--theme-primary)' }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* VIDEO QUALITY MODAL (Auto, 1080p, 720p, 480p, 360p, 240p) */}
      {showQualityMenu && (
        <div 
          onClick={() => setShowQualityMenu(false)}
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl text-white space-y-4 animate-scaleUp"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-base text-white">Video Quality (রেজোলিউশন)</h3>
              </div>
              <button
                onClick={() => setShowQualityMenu(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quality List */}
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {QUALITY_OPTIONS.map((q) => {
                const isSelected = selectedQuality === q.id;
                return (
                  <button
                    key={q.id}
                    onClick={() => handleSetQuality(q.id)}
                    className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-600/20 text-white font-bold ring-1 ring-blue-500/30'
                        : 'border-slate-800 bg-slate-800/40 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div>
                      <span className="text-sm font-semibold block">{q.label}</span>
                      <span className="text-[11px] text-slate-400 block">{q.desc}</span>
                    </div>
                    {isSelected && (
                      <div 
                        className="w-6 h-6 rounded-full text-white flex items-center justify-center shadow-xs"
                        style={{ backgroundColor: 'var(--theme-primary)' }}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Done button */}
            <button
              onClick={() => setShowQualityMenu(false)}
              className="w-full py-2.5 rounded-xl text-white font-bold text-xs sm:text-sm cursor-pointer shadow-md transition-all"
              style={{ backgroundColor: 'var(--theme-primary)' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // If isInline and not isFullscreen, render inline
  if (isInline && !isFullscreen) {
    return videoPlayerMarkup;
  }

  // If standalone modal or fullscreen
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${isFullscreen ? 'p-0 bg-black' : 'p-0 sm:p-4 bg-black/95 backdrop-blur-md'}`}>
      {videoPlayerMarkup}
    </div>
  );
};
