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
  Minus,
  Plus,
  ShieldCheck,
  Lock
} from 'lucide-react';
import { extractYouTubeId, getGoogleDriveEmbedUrl } from '../../utils/mediaUrl';

interface ProtectedVideoPlayerProps {
  title: string;
  url: string;
  onClose?: () => void;
  isInline?: boolean;
}

export const ProtectedVideoPlayer: React.FC<ProtectedVideoPlayerProps> = ({
  title,
  url,
  onClose,
  isInline = false
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const html5VideoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const hideControlsTimerRef = useRef<any>(null);
  const pollTimerRef = useRef<any>(null);
  const uniquePlayerId = useRef(`yt-player-${Math.random().toString(36).substring(2, 9)}`);
  
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
  const [hasStarted, setHasStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [brightness, setBrightness] = useState(1); // 0.25 to 1.5
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  // Gesture indicators
  const [skipFeedback, setSkipFeedback] = useState<{ side: 'left' | 'right'; text: string } | null>(null);
  const [gestureFeedback, setGestureFeedback] = useState<{ type: 'brightness' | 'volume'; value: number } | null>(null);
  const [playFeedback, setPlayFeedback] = useState<'play' | 'pause' | null>(null);

  // Extract YouTube ID with robust universal parser
  const videoId = extractYouTubeId(url);
  const isDriveVideo = !videoId && url.includes('drive.google.com');
  const isDirectVideo = !videoId && !isDriveVideo;

  // Listen to popstate / hardware back button to close speed menu or player
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (showSpeedMenu) {
        e.preventDefault();
        setShowSpeedMenu(false);
      } else if (isFullscreen) {
        toggleFullscreen();
      } else if (onClose && !isInline) {
        onClose();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showSpeedMenu, isFullscreen, onClose, isInline]);

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
  }, [showSpeedMenu, isFullscreen, onClose, isInline, isPlaying]);

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
            // 1 = PLAYING, 2 = PAUSED, 0 = ENDED, 3 = BUFFERING
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
    }, 800);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(handshakeTimer);
    };
  }, [videoId]);

  // Periodic polling for YouTube player state & time
  useEffect(() => {
    if (videoId && isPlaying) {
      pollTimerRef.current = setInterval(() => {
        if (iframeRef.current && iframeRef.current.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'getCurrentTime', args: [] }),
            '*'
          );
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'getDuration', args: [] }),
            '*'
          );
        }
      }, 1000);
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [videoId, isPlaying]);

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
      if (iframeRef.current && iframeRef.current.contentWindow) {
        const action = isPlaying ? 'pauseVideo' : 'playVideo';
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: action, args: [] }),
          '*'
        );
      }
      const nextPlaying = !isPlaying;
      setIsPlaying(nextPlaying);
      setPlayFeedback(nextPlaying ? 'play' : 'pause');
      if (nextPlaying) resetHideTimer();
      else setControlsVisible(true);
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
      handleUserActivity();
      return;
    }

    if (videoId && iframeRef.current && iframeRef.current.contentWindow) {
      const newTime = Math.max(0, currentTime - 10);
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'seekTo', args: [newTime, true] }),
        '*'
      );
      setCurrentTime(newTime);
      setSkipFeedback({ side: 'left', text: '-10s' });
      setTimeout(() => setSkipFeedback(null), 700);
      handleUserActivity();
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
      handleUserActivity();
      return;
    }

    if (videoId && iframeRef.current && iframeRef.current.contentWindow) {
      const newTime = Math.min(duration || 999999, currentTime + 10);
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'seekTo', args: [newTime, true] }),
        '*'
      );
      setCurrentTime(newTime);
      setSkipFeedback({ side: 'right', text: '+10s' });
      setTimeout(() => setSkipFeedback(null), 700);
      handleUserActivity();
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
        } else if (videoId && iframeRef.current && iframeRef.current.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'setVolume', args: [newVol] }),
            '*'
          );
        }
        setGestureFeedback({ type: 'volume', value: newVol });
      }
    }
  };

  const handleTouchEnd = () => {
    setTimeout(() => setGestureFeedback(null), 900);
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      return;
    }

    const now = Date.now();
    const tapX = touchStartRef.current.x;
    const timeSinceLast = now - lastTapRef.current.time;
    const rect = containerRef.current?.getBoundingClientRect();

    if (timeSinceLast < 300) {
      // Double tap detected
      const isLeftThird = rect ? tapX < rect.left + rect.width * 0.35 : false;
      const isRightThird = rect ? tapX > rect.left + rect.width * 0.65 : false;

      if (isLeftThird) {
        handleSkipBackward();
      } else if (isRightThird) {
        handleSkipForward();
      } else {
        togglePlay();
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      // Single tap: toggle pause/play smoothly
      lastTapRef.current = { time: now, x: tapX };
      togglePlay();
    }
  };

  const toggleMute = () => {
    if (isDirectVideo && html5VideoRef.current) {
      html5VideoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
      return;
    }

    if (videoId && iframeRef.current && iframeRef.current.contentWindow) {
      const action = isMuted ? 'unMute' : 'mute';
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: action, args: [] }),
        '*'
      );
      setIsMuted(!isMuted);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = Number(e.target.value);
    setCurrentTime(targetTime);
    if (isDirectVideo && html5VideoRef.current) {
      html5VideoRef.current.currentTime = targetTime;
    } else if (videoId && iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'seekTo', args: [targetTime, true] }),
        '*'
      );
    }
  };

  const handleSetSpeed = (speed: number) => {
    const clamped = Math.round(Math.min(5.0, Math.max(0.25, speed)) * 100) / 100;
    setPlaybackSpeed(clamped);

    if (isDirectVideo && html5VideoRef.current) {
      html5VideoRef.current.playbackRate = clamped;
    } else if (videoId && iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [clamped] }),
        '*'
      );
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

  // Video markup
  const videoPlayerMarkup = (
    <div 
      ref={containerRef}
      onMouseMove={handleUserActivity}
      className={`relative w-full bg-black flex flex-col select-none overflow-hidden transition-all duration-300 ${
        isFullscreen 
          ? 'fixed inset-0 w-screen h-screen max-w-none rounded-none z-[9999]' 
          : 'w-full rounded-3xl border border-slate-800 shadow-2xl'
      }`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Top Header Bar */}
      <div 
        className={`flex items-center justify-between px-4 py-2.5 z-30 transition-all duration-300 ${
          isFullscreen 
            ? `absolute top-0 inset-x-0 bg-gradient-to-b from-black/95 via-black/50 to-transparent border-none ${
                controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
              }`
            : 'bg-slate-900 border-b border-slate-800'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div 
            className="w-7 h-7 rounded-lg text-white flex items-center justify-center shadow-xs shrink-0"
            style={{ backgroundColor: 'var(--theme-primary)' }}
          >
            <GraduationCap className="w-4 h-4" />
          </div>
          <span className="font-semibold text-xs sm:text-sm text-white truncate max-w-xs sm:max-w-md">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Strictly Protected In-App Player Badge */}
          <span className="text-[11px] font-semibold text-slate-300 bg-slate-800/90 px-2.5 py-1 rounded-lg border border-slate-700/60 flex items-center gap-1.5 shadow-xs">
            <span 
              className="w-2 h-2 rounded-full animate-pulse" 
              style={{ backgroundColor: 'var(--theme-primary)' }}
            />
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>সুরক্ষিত ইন-অ্যাপ প্লেয়ার</span>
          </span>

          {onClose && !isInline && (
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

      {/* Video Canvas Container (16:9 aspect ratio, 100% width) */}
      <div 
        className="relative w-full aspect-video max-w-full bg-black flex items-center justify-center overflow-hidden"
        style={{ filter: `brightness(${brightness})` }}
      >
        {/* Case 1: YouTube video - 100% IN-APP PLAYBACK, STRICTLY PREVENTING OPENING YOUTUBE */}
        {videoId && (
          <div className="absolute inset-0 w-full h-full select-none">
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

        {/* In-App Smart Interaction Overlay (Intercepts all clicks, prevents any click escaping to YouTube) */}
        {!isDriveVideo && (
          <div 
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={togglePlay}
            className="absolute inset-0 z-10 cursor-pointer"
          />
        )}

        {/* Initial Big Play Button if Not Started Yet */}
        {!hasStarted && !isDriveVideo && (
          <div 
            onClick={togglePlay}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[2px] cursor-pointer group"
          >
            <div 
              className="w-16 sm:w-20 h-16 sm:h-20 rounded-full text-white flex items-center justify-center shadow-2xl transition-all transform group-hover:scale-110"
              style={{ 
                backgroundColor: 'var(--theme-primary)',
                boxShadow: '0 0 35px var(--theme-primary-glow)' 
              }}
            >
              <Play className="w-8 sm:w-10 h-8 sm:h-10 fill-white ml-1" />
            </div>
            <span className="mt-3.5 text-xs sm:text-sm font-bold text-white bg-black/80 px-4 py-1.5 rounded-full border border-white/10 shadow-lg flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>ইন-অ্যাপ প্লে করুন</span>
            </span>
          </div>
        )}

        {/* Smooth Play / Pause Pulse feedback on tap */}
        {playFeedback && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-black/70 backdrop-blur-md text-white flex items-center justify-center shadow-2xl animate-ping duration-300">
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
            <div className="flex flex-col items-center text-white bg-black/80 px-4 py-3 rounded-2xl backdrop-blur-md shadow-2xl border border-white/10">
              {skipFeedback.side === 'left' ? <RotateCcw className="w-6 h-6 mb-1 text-blue-400" /> : <RotateCw className="w-6 h-6 mb-1 text-blue-400" />}
              <span className="text-xs font-bold font-mono">{skipFeedback.text}</span>
            </div>
          </div>
        )}

        {/* Gesture HUD Feedback: Brightness & Volume */}
        {gestureFeedback && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-black/85 backdrop-blur-md text-white shadow-2xl pointer-events-none border border-white/10">
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
      {!isDriveVideo && (
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
              className="w-full h-1.5 bg-slate-700/80 rounded-lg appearance-none cursor-pointer hover:h-2 transition-all"
              style={{ accentColor: 'var(--theme-primary)' }}
            />
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2.5">
              {/* Play / Pause button */}
              <button
                onClick={togglePlay}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors cursor-pointer"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
              </button>

              {/* 10s Backward / Forward */}
              <button
                onClick={handleSkipBackward}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Rewind 10s"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={handleSkipForward}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Forward 10s"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Volume & Mute */}
              <div className="flex items-center gap-1.5 group/vol">
                <button
                  onClick={toggleMute}
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
                    } else if (videoId && iframeRef.current && iframeRef.current.contentWindow) {
                      iframeRef.current.contentWindow.postMessage(
                        JSON.stringify({ event: 'command', func: 'setVolume', args: [newVol] }),
                        '*'
                      );
                    }
                  }}
                  className="w-14 sm:w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer hidden sm:inline-block"
                  style={{ accentColor: 'var(--theme-primary)' }}
                />
              </div>

              {/* Timestamps */}
              <span className="font-mono text-[11px] text-slate-400">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Playback Speed Button */}
              <button
                onClick={() => {
                  window.history.pushState({ modal: 'speed' }, '');
                  setShowSpeedMenu(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono text-xs flex items-center gap-1 transition-all cursor-pointer border border-white/10"
                title="Playback Speed (0.25x - 5.0x)"
              >
                <Gauge className="w-3.5 h-3.5" style={{ color: 'var(--theme-primary)' }} />
                <span>{playbackSpeed.toFixed(2)}x</span>
              </button>

              {/* Fullscreen Toggle */}
              <button
                onClick={toggleFullscreen}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors cursor-pointer"
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PLAYBACK SPEED MODAL */}
      {showSpeedMenu && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl text-white space-y-5 animate-scaleUp">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Gauge className="w-5 h-5" style={{ color: 'var(--theme-primary)' }} />
                <h3 className="font-bold text-base text-white">Playback Speed</h3>
              </div>
              <button
                onClick={() => setShowSpeedMenu(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Speed Display */}
            <div className="text-center py-2">
              <span 
                className="text-4xl font-extrabold font-mono tracking-tight"
                style={{ color: 'var(--theme-primary)' }}
              >
                {playbackSpeed.toFixed(2)}x
              </span>
              <p className="text-xs text-slate-400 mt-1">
                Fine-tune from 0.25x up to 5.0x in 0.01 increments
              </p>
            </div>

            {/* Continuous Precision Slider: 0.25 to 5.0 with step 0.01 */}
            <div className="space-y-2">
              <input
                type="range"
                min={0.25}
                max={5.0}
                step={0.01}
                value={playbackSpeed}
                onChange={(e) => handleSetSpeed(Number(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: 'var(--theme-primary)' }}
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>0.25x</span>
                <span>1.0x</span>
                <span>2.5x</span>
                <span>5.0x</span>
              </div>
            </div>

            {/* Minus / Plus fine-tuning buttons */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => handleSetSpeed(playbackSpeed - 0.05)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" /> -0.05
              </button>
              <button
                onClick={() => handleSetSpeed(1.0)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                Normal (1.0x)
              </button>
              <button
                onClick={() => handleSetSpeed(playbackSpeed + 0.05)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> +0.05
              </button>
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-800">
              {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5].map((preset) => {
                const isMatch = Math.abs(playbackSpeed - preset) < 0.005;
                return (
                  <button
                    key={preset}
                    onClick={() => handleSetSpeed(preset)}
                    className="py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer"
                    style={{
                      backgroundColor: isMatch ? 'var(--theme-primary)' : 'rgba(30, 41, 59, 0.9)',
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
