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
  const [skipNotice, setSkipNotice] = useState<'-10s' | '+10s' | null>(null);

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

  // Initialize player with complete YouTube branding suppression
  useEffect(() => {
    if (!isApiReady || !videoId) return;

    playerRef.current = new window.YT.Player('yt-portal-player-frame', {
      videoId: videoId,
      playerVars: {
        controls: 0, // hide native YouTube player controls completely
        modestbranding: 1, // remove YouTube logo
        rel: 0, // don't show external channel recommendations
        iv_load_policy: 3, // hide video annotations
        disablekb: 1, // disable native keyboard shortcuts
        fs: 0, // hide native fullscreen
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
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

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
      }, 3500);
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
    setSkipNotice('-10s');
    setTimeout(() => setSkipNotice(null), 700);
    handleUserActivity();
  };

  // 10 Seconds Forward Skip
  const handleSkipForward = () => {
    if (!playerRef.current || !playerRef.current.seekTo) return;
    const newTime = Math.min(duration, currentTime + 10);
    setCurrentTime(newTime);
    playerRef.current.seekTo(newTime, true);
    setSkipNotice('+10s');
    setTimeout(() => setSkipNotice(null), 700);
    handleUserActivity();
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

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      const el = containerRef.current as any;
      if (el.requestFullscreen) {
        el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      } else if (el.msRequestFullscreen) {
        el.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${mins}:${s < 10 ? '0' + s : s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/95 backdrop-blur-md">
      <div 
        ref={containerRef}
        onMouseMove={handleUserActivity}
        onTouchStart={handleUserActivity}
        className={`relative w-full bg-black flex flex-col select-none overflow-hidden ${
          isFullscreen 
            ? 'h-screen w-screen max-w-none rounded-none' 
            : 'max-w-5xl rounded-2xl border border-slate-800 shadow-2xl max-h-[96vh]'
        }`}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Header with Title & Exam Portal Branding (floats in fullscreen) */}
        <div 
          className={`flex items-center justify-between px-4 py-3 z-30 transition-all duration-300 ${
            isFullscreen 
              ? `absolute top-0 inset-x-0 bg-gradient-to-b from-black/90 via-black/50 to-transparent border-none ${
                  controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
                }`
              : 'bg-slate-900 border-b border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <GraduationCap className="w-4 h-4" />
            </div>
            <span className="font-semibold text-sm text-white truncate max-w-md">
              {title}
            </span>
          </div>

          <div className="flex items-center gap-2">
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

        {/* Video Canvas Container - fills full display in fullscreen */}
        <div 
          className={`relative w-full bg-black overflow-hidden flex items-center justify-center group ${
            isFullscreen ? 'h-full flex-1' : 'flex-1 min-h-[300px] aspect-video'
          }`}
        >
          {/* Iframe wrapper - scaled by 1.14 to completely crop out YouTube title, channel badge and watermark */}
          <div 
            id="yt-portal-player-frame" 
            className="w-full h-full pointer-events-none scale-[1.14] origin-center" 
          />

          {/* Transparent click blocker on top of frame so students interact only with custom player */}
          <div 
            onClick={togglePlay}
            className="absolute inset-0 z-10 cursor-pointer bg-transparent"
          />

          {/* Visual Skip Notification Animation */}
          {skipNotice && (
            <div className="absolute inset-0 z-25 flex items-center justify-center pointer-events-none">
              <div className="px-5 py-3 rounded-2xl bg-black/80 backdrop-blur-md text-white font-bold text-lg flex items-center gap-2 animate-bounce shadow-2xl border border-white/20">
                {skipNotice === '-10s' ? <RotateCcw className="w-6 h-6 text-blue-400" /> : <RotateCw className="w-6 h-6 text-blue-400" />}
                <span>{skipNotice}</span>
              </div>
            </div>
          )}

          {/* Center Play Button Overlay when paused */}
          {!isPlaying && (
            <div 
              onClick={togglePlay}
              className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
            >
              <div className="w-16 h-16 rounded-full bg-blue-600/95 text-white flex items-center justify-center shadow-2xl transition-transform hover:scale-105 pointer-events-auto cursor-pointer">
                <Play className="w-8 h-8 fill-current ml-1" />
              </div>
            </div>
          )}
        </div>

        {/* CUSTOM VIDEO CONTROLS - floating overlay in fullscreen with auto-hide */}
        <div 
          onMouseEnter={() => setControlsVisible(true)}
          className={`p-3 space-y-2.5 z-30 transition-all duration-300 ${
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
            {/* Left Controls: Play/Pause, 10s Rewind, 10s Forward, Mute, Timer */}
            <div className="flex items-center gap-1.5 sm:gap-3">
              <button
                onClick={togglePlay}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-800 text-white cursor-pointer transition-colors"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
              </button>

              {/* 10 Sec Backward Button */}
              <button
                onClick={handleSkipBackward}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 hover:text-white text-slate-200 flex items-center gap-1 cursor-pointer text-xs font-bold transition-colors shadow-xs"
                title="Rewind 10 Seconds (Left Arrow)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>10s</span>
              </button>

              {/* 10 Sec Forward Button */}
              <button
                onClick={handleSkipForward}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 hover:text-white text-slate-200 flex items-center gap-1 cursor-pointer text-xs font-bold transition-colors shadow-xs"
                title="Forward 10 Seconds (Right Arrow)"
              >
                <span>10s</span>
                <RotateCw className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={toggleMute}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-800 text-white cursor-pointer transition-colors"
                title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
              >
                {isMuted ? <VolumeX className="w-5 h-5 text-rose-400" /> : <Volume2 className="w-5 h-5" />}
              </button>

              <span className="font-mono text-[11px] text-slate-400 ml-1">
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
                title={isFullscreen ? 'Exit Fullscreen (F)' : 'Enter Fullscreen (F)'}
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
