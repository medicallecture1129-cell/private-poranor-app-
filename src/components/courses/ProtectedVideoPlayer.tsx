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
  Settings,
  GraduationCap
} from 'lucide-react';

interface ProtectedVideoPlayerProps {
  title: string;
  url: string;
  onClose?: () => void;
}

// Declare YouTube global API
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
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [quality, setQuality] = useState<string>('Auto');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [isApiReady, setIsApiReady] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [skipFeedback, setSkipFeedback] = useState<{ side: 'left' | 'right'; text: string } | null>(null);

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

  // Initialize player with uncropped standard aspect ratio
  useEffect(() => {
    if (!isApiReady || !videoId) return;

    playerRef.current = new window.YT.Player('yt-portal-player-frame', {
      videoId: videoId,
      playerVars: {
        controls: 0, // hide native controls
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
    }, 500);

    const handleFullscreenChange = () => {
      const isNowFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isNowFullscreen);

      if (!isNowFullscreen && (screen.orientation as any)?.unlock) {
        (screen.orientation as any).unlock().catch(() => {});
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    // Keyboard Shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleSkipBackward();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleSkipForward();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(interval);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
      }
    };
  }, [isApiReady, videoId]);

  // Controls auto-hide timeout during playback
  const handleUserActivity = () => {
    setControlsVisible(true);
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }
    if (isPlaying) {
      hideControlsTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    }
  };

  const togglePlay = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
      setControlsVisible(true);
    } else {
      playerRef.current.playVideo();
      setIsPlaying(true);
      handleUserActivity();
    }
  };

  // 10 Seconds Backward Skip
  const handleSkipBackward = () => {
    if (!playerRef.current || !playerRef.current.seekTo) return;
    const newTime = Math.max(0, currentTime - 10);
    setCurrentTime(newTime);
    playerRef.current.seekTo(newTime, true);
    setSkipFeedback({ side: 'left', text: '-10s' });
    setTimeout(() => setSkipFeedback(null), 650);
    handleUserActivity();
  };

  // 10 Seconds Forward Skip
  const handleSkipForward = () => {
    if (!playerRef.current || !playerRef.current.seekTo) return;
    const newTime = Math.min(duration, currentTime + 10);
    setCurrentTime(newTime);
    playerRef.current.seekTo(newTime, true);
    setSkipFeedback({ side: 'right', text: '+10s' });
    setTimeout(() => setSkipFeedback(null), 650);
    handleUserActivity();
  };

  // YouTube-style double-tap detection on Left / Right of screen
  const handleScreenTouchOrClick = (e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    let clientX = 0;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
    } else if ('clientX' in e) {
      clientX = e.clientX;
    }

    const clickPositionX = clientX - rect.left;
    const isLeftHalf = clickPositionX < rect.width * 0.45;
    const isRightHalf = clickPositionX > rect.width * 0.55;

    if (now - lastTapRef.current.time < 300) {
      // Double tap detected!
      if (isLeftHalf) {
        handleSkipBackward();
      } else if (isRightHalf) {
        handleSkipForward();
      } else {
        togglePlay();
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      lastTapRef.current = { time: now, x: clientX };
      // Single tap: toggle controls
      setControlsVisible(prev => !prev);
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
    setPlaybackSpeed(speed);
    if (playerRef.current && playerRef.current.setPlaybackRate) {
      playerRef.current.setPlaybackRate(speed);
    }
    setShowSpeedMenu(false);
  };

  const handleSetQuality = (q: string) => {
    setQuality(q);
    if (playerRef.current && playerRef.current.setPlaybackQuality) {
      const ytQuality = q === '1080p' ? 'hd1080' : q === '720p' ? 'hd720' : q === '480p' ? 'large' : q === '360p' ? 'medium' : 'default';
      playerRef.current.setPlaybackQuality(ytQuality);
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
        } else if (el.msRequestFullscreen) {
          await el.msRequestFullscreen();
        }
        setIsFullscreen(true);
        if ((screen.orientation as any)?.lock) {
          (screen.orientation as any).lock('landscape').catch(() => {});
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
        setIsFullscreen(false);
        if ((screen.orientation as any)?.unlock) {
          (screen.orientation as any).unlock().catch(() => {});
        }
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
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${isFullscreen ? 'p-0 bg-black' : 'p-2 sm:p-4 bg-black/95 backdrop-blur-md'}`}>
      <div 
        ref={containerRef}
        onMouseMove={handleUserActivity}
        onTouchStart={handleUserActivity}
        className={`relative w-full bg-black flex flex-col select-none overflow-hidden ${
          isFullscreen 
            ? 'fixed inset-0 w-screen h-screen max-w-none rounded-none z-[9999]' 
            : 'max-w-5xl rounded-2xl border border-slate-800 shadow-2xl max-h-[96vh]'
        }`}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Header with Title & Portal Branding (Floats in fullscreen) */}
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

          <div className="flex items-center gap-2 shrink-0">
            {isFullscreen && (
              <button
                onClick={toggleFullscreen}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium cursor-pointer"
              >
                Exit Fullscreen
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close Player"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Video Canvas Container (100% Uncropped, Clean Aspect Ratio) */}
        <div 
          className={`relative w-full bg-black overflow-hidden flex items-center justify-center ${
            isFullscreen ? 'h-full flex-1' : 'flex-1 min-h-[300px] aspect-video'
          }`}
        >
          {/* Iframe wrapper - scale 100% with object-contain so NO text/header is ever cropped */}
          <div 
            id="yt-portal-player-frame" 
            className="w-full h-full pointer-events-none object-contain" 
          />

          {/* Interactive Screen Click / Double-tap Overlay */}
          <div 
            onClick={handleScreenTouchOrClick}
            className="absolute inset-0 z-10 cursor-pointer bg-transparent"
          />

          {/* Double Tap Skip Animation - YouTube style left & right ripple */}
          {skipFeedback && (
            <div 
              className={`absolute top-0 bottom-0 z-25 flex items-center justify-center pointer-events-none transition-all duration-300 w-1/3 ${
                skipFeedback.side === 'left' ? 'left-4' : 'right-4'
              }`}
            >
              <div className="p-4 rounded-full bg-black/75 backdrop-blur-md text-white font-black text-sm sm:text-base flex items-center gap-1.5 shadow-2xl border border-white/20 animate-pulse">
                {skipFeedback.side === 'left' ? <RotateCcw className="w-5 h-5 text-blue-400" /> : <RotateCw className="w-5 h-5 text-blue-400" />}
                <span>{skipFeedback.text}</span>
              </div>
            </div>
          )}

          {/* Center Play/Pause Indicator (Only shows when paused or controls toggled) */}
          <div 
            className={`absolute inset-0 z-20 flex items-center justify-center transition-all duration-300 pointer-events-none ${
              !isPlaying || controlsVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
            }`}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="pointer-events-auto w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-blue-600/90 hover:bg-blue-600 text-white flex items-center justify-center shadow-2xl transition-all hover:scale-105 active:scale-95 cursor-pointer ring-4 ring-white/20"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-8 h-8 sm:w-10 sm:h-10 fill-current" />
              ) : (
                <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-current ml-1" />
              )}
            </button>
          </div>
        </div>

        {/* BOTTOM VIDEO CONTROLS (No separate 10s forward/backward as requested) */}
        <div 
          onMouseEnter={() => setControlsVisible(true)}
          className={`p-3 space-y-2 z-30 transition-all duration-300 ${
            isFullscreen 
              ? `absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent pb-6 pt-10 px-4 sm:px-6 ${
                  controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
                }`
              : 'bg-slate-950 border-t border-slate-900'
          }`}
        >
          {/* Seek Bar */}
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-300">
            {/* Left Controls: Mini Play/Pause, Mute, Timer */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={togglePlay}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-white cursor-pointer transition-colors"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-4 h-4 sm:w-5 sm:h-5" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />}
              </button>

              <button
                onClick={toggleMute}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-white cursor-pointer transition-colors"
                title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>

              <span className="font-mono text-[11px] sm:text-xs text-slate-400">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Right Controls: Playback Speed, Quality, Fullscreen */}
            <div className="flex items-center gap-2">
              {/* Speed Menu */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowSpeedMenu(!showSpeedMenu);
                    setShowQualityMenu(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Gauge className="w-3.5 h-3.5" />
                  <span>{playbackSpeed}x</span>
                </button>

                {showSpeedMenu && (
                  <div className="absolute bottom-full right-0 mb-2 w-28 bg-slate-900 border border-slate-800 rounded-xl shadow-xl py-1 z-40">
                    {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((spd) => (
                      <button
                        key={spd}
                        onClick={() => handleSetSpeed(spd)}
                        className={`w-full px-3 py-1.5 text-left text-xs hover:bg-slate-800 flex items-center justify-between cursor-pointer ${
                          playbackSpeed === spd ? 'text-blue-400 font-bold' : 'text-slate-300'
                        }`}
                      >
                        <span>{spd}x</span>
                        {playbackSpeed === spd && <span className="text-[10px]">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quality Menu */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowQualityMenu(!showQualityMenu);
                    setShowSpeedMenu(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{quality}</span>
                </button>

                {showQualityMenu && (
                  <div className="absolute bottom-full right-0 mb-2 w-28 bg-slate-900 border border-slate-800 rounded-xl shadow-xl py-1 z-40">
                    {['Auto', '1080p', '720p', '480p', '360p'].map((q) => (
                      <button
                        key={q}
                        onClick={() => handleSetQuality(q)}
                        className={`w-full px-3 py-1.5 text-left text-xs hover:bg-slate-800 flex items-center justify-between cursor-pointer ${
                          quality === q ? 'text-blue-400 font-bold' : 'text-slate-300'
                        }`}
                      >
                        <span>{q}</span>
                        {quality === q && <span className="text-[10px]">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-800 text-white cursor-pointer transition-colors"
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              >
                {isFullscreen ? <Minimize className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
