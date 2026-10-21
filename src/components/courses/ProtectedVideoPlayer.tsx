import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  Maximize, 
  Minimize, 
  X, 
  RotateCcw, 
  RotateCw, 
  Gauge, 
  Sun, 
  Minus, 
  Plus, 
  Settings, 
  Check,
  Bookmark,
  Trash2,
  Clock,
  Volume2
} from 'lucide-react';
import { extractYouTubeId, getGoogleDriveEmbedUrl } from '../../utils/mediaUrl';
import { useAuth } from '../../context/AuthContext';
import { subscribeVideoNotes, addVideoNote, deleteVideoNote } from '../../services/db';
import { VideoNote } from '../../types';
import { useTheme } from '../../context/ThemeContext';

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
  { id: 'auto', label: 'Auto', desc: 'Automatic' },
  { id: 'hd1080', label: '1080p', desc: 'Full HD' },
  { id: 'hd720', label: '720p', desc: 'HD Quality' },
  { id: 'large', label: '480p', desc: 'SD 480p' },
  { id: 'medium', label: '360p', desc: 'Medium 360p' },
  { id: 'small', label: '240p', desc: 'Data Saver' },
  { id: 'tiny', label: '144p', desc: 'Low Data' }
];

// Presets capped at 3.0x as requested (0.5x to 3.0x)
const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];

export const ProtectedVideoPlayer: React.FC<ProtectedVideoPlayerProps> = ({
  title,
  url,
  onClose,
  isInline = false
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const html5VideoRef = useRef<HTMLVideoElement | null>(null);
  const ytMountContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const isPlayerReadyRef = useRef<boolean>(false);
  const hideControlsTimerRef = useRef<any>(null);
  const pollTimerRef = useRef<any>(null);
  const hyperSpeedIntervalRef = useRef<any>(null);
  const uniquePlayerId = useRef(`yt-player-${Math.random().toString(36).substring(2, 9)}`);
  
  // Tap tracker
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });
  const lastTouchEndTimeRef = useRef<number>(0);

  // Gesture tracking refs for real-time smoothness
  const currentBrightnessRef = useRef<number>(1);
  const currentVolumeRef = useRef<number>(100);
  const touchStartRef = useRef<{ x: number; y: number; time: number; brightness: number; volume: number }>({
    x: 0,
    y: 0,
    time: 0,
    brightness: 1,
    volume: 100
  });
  const isDraggingRef = useRef(false);
  const isPlayingRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState<number>(0);
  const [volume, setVolume] = useState(100);
  const [brightness, setBrightness] = useState(1); // 0.2 to 1.5
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [selectedQuality, setSelectedQuality] = useState<string>('auto');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showRemainingTime, setShowRemainingTime] = useState(false);
  const { customColors } = useTheme();
  const themePrimary = customColors?.primaryColor || '#2563eb';

  // Video Timestamp Notes & Bookmarks State
  const { user } = useAuth();
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [videoNotes, setVideoNotes] = useState<VideoNote[]>([]);
  const [newNoteInput, setNewNoteInput] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Gesture HUD indicators
  const [skipFeedback, setSkipFeedback] = useState<{ side: 'left' | 'right'; text: string } | null>(null);
  const [gestureFeedback, setGestureFeedback] = useState<{ type: 'brightness' | 'volume'; value: number } | null>(null);

  // Parse media URL
  const videoId = extractYouTubeId(url);
  const isDriveVideo = !videoId && url.includes('drive.google.com');
  const isDirectVideo = !videoId && !isDriveVideo;
  const videoIdentifier = videoId || url;

  // Sync ref values with state
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentBrightnessRef.current = brightness;
  }, [brightness]);

  useEffect(() => {
    currentVolumeRef.current = volume;
  }, [volume]);

  // Subscribe to Video Notes
  useEffect(() => {
    const unsub = subscribeVideoNotes(videoIdentifier, user?.id || 'anon', (loadedNotes) => {
      setVideoNotes(loadedNotes);
    });
    return () => unsub();
  }, [videoIdentifier, user?.id]);

  // Jump Video Playback to specific timestamp
  const jumpToTime = (targetSec: number) => {
    setCurrentTime(targetSec);
    if (isDirectVideo && html5VideoRef.current) {
      html5VideoRef.current.currentTime = targetSec;
      html5VideoRef.current.play().catch(() => {});
    } else if (videoId) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
        try {
          ytPlayerRef.current.seekTo(targetSec, true);
          ytPlayerRef.current.playVideo();
        } catch (e) {}
      }
    }
    setIsPlaying(true);
  };

  const handleCreateNote = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newNoteInput.trim()) return;

    setIsSavingNote(true);
    try {
      const snapSec = Math.floor(currentTime);
      await addVideoNote({
        videoId: videoIdentifier,
        studentId: user?.id || 'anon',
        studentName: user?.name || 'Student',
        studentEmail: user?.email || '',
        timestampSeconds: snapSec,
        timestampFormatted: formatTime(snapSec),
        noteText: newNoteInput.trim()
      });
      setNewNoteInput('');
    } catch (err) {
      console.error('Save video note error:', err);
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteVideoNote(noteId, videoIdentifier, user?.id || 'anon');
    } catch (err) {
      console.error('Delete note error:', err);
    }
  };

  // Autohide controls after 5 seconds while playing
  const resetHideTimer = useCallback(() => {
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
    }
    if (isPlaying) {
      hideControlsTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 5000);
    }
  }, [isPlaying]);

  const showControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    resetHideTimer();
  }, [resetHideTimer]);

  const handleMouseMove = useCallback(() => {
    if (Date.now() - lastTouchEndTimeRef.current < 700) return;
    if (isPlaying) {
      showControlsTemporarily();
    }
  }, [isPlaying, showControlsTemporarily]);

  // Handle hardware back button to dismiss modals
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

      // Keep video playing smoothly without freeze or stall upon entering/exiting fullscreen
      if (isPlayingRef.current) {
        setTimeout(() => {
          if (ytPlayerRef.current && typeof ytPlayerRef.current.getPlayerState === 'function') {
            try {
              const state = ytPlayerRef.current.getPlayerState();
              if (state === 2) { // 2 = paused
                ytPlayerRef.current.playVideo();
              }
            } catch (e) {}
          } else if (html5VideoRef.current && html5VideoRef.current.paused) {
            html5VideoRef.current.play().catch(() => {});
          }
        }, 80);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    const handleKeyDown = (e: KeyboardEvent) => {
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

  // =========================================================================
  // Robust YouTube IFrame Player API Initialization
  // =========================================================================
  useEffect(() => {
    if (!videoId) return;

    let isMounted = true;
    let pollInterval: any = null;

    setIsPlaying(false);
    setHasStarted(false);

    // 1. Clean up previous player instance
    if (ytPlayerRef.current) {
      try {
        if (typeof ytPlayerRef.current.destroy === 'function') {
          ytPlayerRef.current.destroy();
        }
      } catch (err) {
        console.debug('Error destroying previous YT player:', err);
      }
      ytPlayerRef.current = null;
      isPlayerReadyRef.current = false;
    }

    // 2. Prepare clean mount container (w-full h-full, zero cropping)
    const mountContainer = ytMountContainerRef.current;
    if (mountContainer) {
      mountContainer.innerHTML = '';
      const targetDiv = document.createElement('div');
      targetDiv.id = uniquePlayerId.current;
      targetDiv.style.width = '100%';
      targetDiv.style.height = '100%';
      targetDiv.style.pointerEvents = 'none';
      mountContainer.appendChild(targetDiv);
    }

    // 3. Instantiate YT.Player using the official API
    const initPlayer = () => {
      if (!isMounted || !window.YT || !window.YT.Player) return;
      if (!document.getElementById(uniquePlayerId.current)) return;

      try {
        ytPlayerRef.current = new window.YT.Player(uniquePlayerId.current, {
          videoId: videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: hasStarted ? 1 : 0,
            controls: 0,        // Completely hide native YouTube controls
            disablekb: 1,       // Disables native YouTube keyboard shortcuts
            fs: 0,              // Disables native YouTube fullscreen button
            iv_load_policy: 3,  // Hides video annotations
            modestbranding: 1,  // Minimal YouTube branding
            rel: 0,             // Prevents related videos from external channels
            showinfo: 0,        // Hides video title and channel info
            playsinline: 1,     // Inline playback on iOS/mobile
            enablejsapi: 1,     // Full programmatic API control
            origin: typeof window !== 'undefined' ? window.location.origin : ''
          },
          events: {
            onReady: (event: any) => {
              if (!isMounted) return;
              ytPlayerRef.current = event.target;
              isPlayerReadyRef.current = true;
              
              const dur = event.target.getDuration();
              if (typeof dur === 'number' && dur > 0) {
                setDuration(dur);
              }

              if (hasStarted) {
                event.target.playVideo();
              }

              const baseSpeed = Math.min(2.0, playbackSpeed);
              event.target.setPlaybackRate(baseSpeed);

              if (selectedQuality !== 'auto') {
                event.target.setPlaybackQuality(selectedQuality);
              }
            },
            onStateChange: (event: any) => {
              if (!isMounted) return;
              // YouTube Player States: 1 = PLAYING, 2 = PAUSED, 0 = ENDED, 3 = BUFFERING
              if (event.data === 1) {
                setIsPlaying(true);
                setHasStarted(true);
                setIsBuffering(false);
                resetHideTimer();
              } else if (event.data === 2) {
                setIsPlaying(false);
                setIsBuffering(false);
                setControlsVisible(true);
              } else if (event.data === 0) {
                // =============================================================
                // 4. PREVENT YOUTUBE END-SCREEN "MORE VIDEOS" RECOMMENDATIONS:
                // Immediately seek back to time 0, pause, and reset hasStarted
                // so the solid black cover permanently blocks end-screen grid!
                // =============================================================
                setIsPlaying(false);
                setHasStarted(false);
                setIsBuffering(false);
                setControlsVisible(true);
                try {
                  event.target.seekTo(0, true);
                  event.target.pauseVideo();
                  setCurrentTime(0);
                } catch (e) {}
              } else if (event.data === 3) {
                setIsBuffering(true);
              }
            },
            onError: (err: any) => {
              console.warn('YouTube Player error event:', err);
              if (isMounted) setIsBuffering(false);
            }
          }
        });
      } catch (err) {
        console.warn('Failed to construct YT.Player:', err);
      }
    };

    // 4. Ensure YouTube IFrame API script is available
    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      if (!document.getElementById('yt-iframe-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }

      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prevCallback === 'function') prevCallback();
        if (isMounted) initPlayer();
      };

      pollInterval = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(pollInterval);
          if (isMounted) initPlayer();
        }
      }, 200);
    }

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
      if (ytPlayerRef.current) {
        try {
          if (typeof ytPlayerRef.current.destroy === 'function') {
            ytPlayerRef.current.destroy();
          }
        } catch (e) {}
        ytPlayerRef.current = null;
        isPlayerReadyRef.current = false;
      }
    };
  }, [videoId]);

  // Periodic polling for YouTube player state, duration & buffered progress
  useEffect(() => {
    if (videoId && isPlaying) {
      pollTimerRef.current = setInterval(() => {
        if (ytPlayerRef.current) {
          try {
            if (typeof ytPlayerRef.current.getCurrentTime === 'function') {
              const cur = ytPlayerRef.current.getCurrentTime();
              if (typeof cur === 'number' && !isNaN(cur)) {
                setCurrentTime(cur);
              }
            }
            if (typeof ytPlayerRef.current.getDuration === 'function') {
              const dur = ytPlayerRef.current.getDuration();
              if (typeof dur === 'number' && dur > 0) {
                setDuration(dur);
              }
            }
            if (typeof ytPlayerRef.current.getVideoLoadedFraction === 'function') {
              const frac = ytPlayerRef.current.getVideoLoadedFraction();
              if (typeof frac === 'number') {
                setBufferedPercent(Math.min(100, Math.max(0, frac * 100)));
              }
            }
          } catch (err) {}
        }
      }, 500);
    } else {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [videoId, isPlaying]);

  // =========================================================================
  // 2.5x & 3.0x YouTube Speed Optimization (Max 3.0x, smooth keyframe stepping)
  // =========================================================================
  useEffect(() => {
    if (hyperSpeedIntervalRef.current) {
      clearInterval(hyperSpeedIntervalRef.current);
      hyperSpeedIntervalRef.current = null;
    }

    if (videoId && isPlaying && playbackSpeed > 2.0) {
      const intervalMs = 1200;
      const extraSpeed = playbackSpeed - 2.0;
      const deltaSeconds = extraSpeed * (intervalMs / 1000);

      hyperSpeedIntervalRef.current = setInterval(() => {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function' && typeof ytPlayerRef.current.seekTo === 'function') {
          try {
            const cur = ytPlayerRef.current.getCurrentTime();
            const dur = ytPlayerRef.current.getDuration() || 999999;
            if (typeof cur === 'number' && cur < dur - 1) {
              const nextTime = Math.min(dur, cur + deltaSeconds);
              ytPlayerRef.current.seekTo(nextTime, true);
              setCurrentTime(nextTime);
            }
          } catch (e) {}
        }
      }, intervalMs);
    }

    return () => {
      if (hyperSpeedIntervalRef.current) {
        clearInterval(hyperSpeedIntervalRef.current);
        hyperSpeedIntervalRef.current = null;
      }
    };
  }, [videoId, isPlaying, playbackSpeed, duration]);

  const prevPlayingRef = useRef(isPlaying);
  // Controls auto-hide timer management
  useEffect(() => {
    if (isPlaying) {
      resetHideTimer();
    } else {
      if (hideControlsTimerRef.current) {
        clearTimeout(hideControlsTimerRef.current);
        hideControlsTimerRef.current = null;
      }
      if (prevPlayingRef.current && !isPlaying) {
        setControlsVisible(true);
      }
    }
    prevPlayingRef.current = isPlaying;
  }, [isPlaying, resetHideTimer]);

  // Instant Play / Pause toggle
  const togglePlay = () => {
    setHasStarted(true);

    if (isDirectVideo && html5VideoRef.current) {
      if (html5VideoRef.current.paused) {
        html5VideoRef.current.play();
        setIsPlaying(true);
        setControlsVisible(true);
        resetHideTimer();
      } else {
        html5VideoRef.current.pause();
        setIsPlaying(false);
        setControlsVisible(true);
        if (hideControlsTimerRef.current) {
          clearTimeout(hideControlsTimerRef.current);
          hideControlsTimerRef.current = null;
        }
      }
      return;
    }

    if (videoId) {
      if (isPlaying) {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === 'function') {
          try {
            ytPlayerRef.current.pauseVideo();
          } catch (e) {}
        }
        setIsPlaying(false);
        setControlsVisible(true);
        if (hideControlsTimerRef.current) {
          clearTimeout(hideControlsTimerRef.current);
          hideControlsTimerRef.current = null;
        }
      } else {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.playVideo === 'function') {
          try {
            ytPlayerRef.current.playVideo();
          } catch (e) {}
        }
        setIsPlaying(true);
        setControlsVisible(true);
        resetHideTimer();
      }
    }
  };

  // 10s Skip Backward
  const handleSkipBackward = () => {
    if (isDirectVideo && html5VideoRef.current) {
      const newTime = Math.max(0, html5VideoRef.current.currentTime - 10);
      html5VideoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      setSkipFeedback({ side: 'left', text: '-10s' });
      setTimeout(() => setSkipFeedback(null), 500);
      showControlsTemporarily();
      return;
    }

    if (videoId) {
      const newTime = Math.max(0, currentTime - 10);
      if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
        try {
          ytPlayerRef.current.seekTo(newTime, true);
        } catch (e) {}
      }
      setCurrentTime(newTime);
      setSkipFeedback({ side: 'left', text: '-10s' });
      setTimeout(() => setSkipFeedback(null), 500);
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
      setTimeout(() => setSkipFeedback(null), 500);
      showControlsTemporarily();
      return;
    }

    if (videoId) {
      const newTime = Math.min(duration || 999999, currentTime + 10);
      if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
        try {
          ytPlayerRef.current.seekTo(newTime, true);
        } catch (e) {}
      }
      setCurrentTime(newTime);
      setSkipFeedback({ side: 'right', text: '+10s' });
      setTimeout(() => setSkipFeedback(null), 500);
      showControlsTemporarily();
    }
  };

  // =========================================================================
  // 3. SWIPE GESTURES: Right Side = Volume, Left Side = Brightness
  // =========================================================================
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      brightness: currentBrightnessRef.current,
      volume: currentVolumeRef.current
    };
    isDraggingRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX)) {
      isDraggingRef.current = true;
      const rect = containerRef.current?.getBoundingClientRect();
      const isLeftSide = rect ? (touchStartRef.current.x < rect.left + rect.width / 2) : true;

      if (isLeftSide) {
        // Brightness swipe (Left side): 0.2 to 1.5
        const newBright = Math.min(1.5, Math.max(0.2, touchStartRef.current.brightness - deltaY * 0.004));
        currentBrightnessRef.current = newBright;
        setBrightness(newBright);
        setGestureFeedback({ type: 'brightness', value: Math.round(newBright * 100) });
      } else {
        // Volume swipe (Right side): 0 to 100
        const newVol = Math.min(100, Math.max(0, Math.round(touchStartRef.current.volume - deltaY * 0.35)));
        currentVolumeRef.current = newVol;
        setVolume(newVol);

        if (isDirectVideo && html5VideoRef.current) {
          html5VideoRef.current.volume = newVol / 100;
        } else if (videoId) {
          if (ytPlayerRef.current && typeof ytPlayerRef.current.setVolume === 'function') {
            try {
              ytPlayerRef.current.setVolume(newVol);
              if (newVol > 0 && typeof ytPlayerRef.current.unMute === 'function') {
                ytPlayerRef.current.unMute();
              }
            } catch (e) {}
          }
        }
        setGestureFeedback({ type: 'volume', value: newVol });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    lastTouchEndTimeRef.current = Date.now();

    if (isDraggingRef.current) {
      setTimeout(() => {
        isDraggingRef.current = false;
        setGestureFeedback(null);
      }, 600);
      return;
    }

    if (e.changedTouches.length === 1) {
      const touch = e.changedTouches[0];
      handleScreenTap(touch.clientX, touch.clientY);
    }
  };

  const handleMouseClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (Date.now() - lastTouchEndTimeRef.current < 650) {
      return;
    }
    handleScreenTap(e.clientX, e.clientY);
  };

  // =========================================================================
  // 2. INSTANT CONTROLS TOGGLE ON TAP (ZERO LAG, SNAPPY SHOW/HIDE)
  // =========================================================================
  const handleScreenTap = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const relX = (clientX - rect.left) / rect.width;
    const now = Date.now();
    const timeSinceLast = now - lastTapRef.current.time;
    const deltaX = Math.abs(clientX - lastTapRef.current.x);
    const deltaY = Math.abs(clientY - lastTapRef.current.y);
    const dist = Math.hypot(deltaX, deltaY);

    // Double Tap detection (< 280ms)
    if (timeSinceLast >= 50 && timeSinceLast < 280 && dist < 70) {
      lastTapRef.current = { time: 0, x: 0, y: 0 };

      if (relX < 0.35) {
        handleSkipBackward();
      } else if (relX > 0.65) {
        handleSkipForward();
      } else {
        togglePlay();
      }
      return;
    }

    // Single Tap: INSTANT toggle without waiting
    lastTapRef.current = { time: now, x: clientX, y: clientY };

    setControlsVisible(prev => {
      const next = !prev;
      if (next && isPlaying) {
        resetHideTimer();
      }
      return next;
    });
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = Number(e.target.value);
    setCurrentTime(targetTime);
    if (isDirectVideo && html5VideoRef.current) {
      html5VideoRef.current.currentTime = targetTime;
    } else if (videoId) {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === 'function') {
        try {
          ytPlayerRef.current.seekTo(targetTime, true);
        } catch (e) {}
      }
    }
    showControlsTemporarily();
  };

  // Playback speed setter capped at 3.0x max
  const handleSetSpeed = (speed: number) => {
    const clamped = Math.round(Math.min(3.0, Math.max(0.5, speed)) * 100) / 100;
    setPlaybackSpeed(clamped);

    if (isDirectVideo && html5VideoRef.current) {
      html5VideoRef.current.playbackRate = clamped;
    } else if (videoId) {
      const baseRate = Math.min(2.0, clamped);
      if (ytPlayerRef.current && typeof ytPlayerRef.current.setPlaybackRate === 'function') {
        try {
          ytPlayerRef.current.setPlaybackRate(baseRate);
        } catch (e) {}
      }
    }
  };

  // Video Quality handler
  const handleSetQuality = (qualityId: string) => {
    setSelectedQuality(qualityId);
    if (videoId && ytPlayerRef.current) {
      try {
        if (typeof ytPlayerRef.current.setPlaybackQuality === 'function') {
          ytPlayerRef.current.setPlaybackQuality(qualityId);
        }
        if (typeof ytPlayerRef.current.setPlaybackQualityRange === 'function') {
          ytPlayerRef.current.setPlaybackQualityRange(qualityId);
        }
      } catch (e) {}
    }
    setShowQualityMenu(false);
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      const isCurrentlyFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );

      if (!isCurrentlyFs && !isFullscreen) {
        const el = containerRef.current as any;
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        } else if (el.mozRequestFullScreen) {
          await el.mozRequestFullScreen();
        } else if (el.msRequestFullscreen) {
          await el.msRequestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch {
      setIsFullscreen(!isFullscreen);
    }
  };

  // Smart Timer Display: MM:SS under 1 hour, H:MM:SS at 1+ hours
  const formatTime = (secs: number, totalDuration: number = duration) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const totalSecs = Math.floor(secs);
    const pad = (n: number) => (n < 10 ? '0' + n : '' + n);

    if (totalDuration < 3600) {
      const m = Math.floor(totalSecs / 60);
      const s = totalSecs % 60;
      return `${pad(m)}:${pad(s)}`;
    }

    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h}:${pad(m)}:${pad(s)}`;
  };

  const currentQualityLabel = QUALITY_OPTIONS.find(q => q.id === selectedQuality)?.label || 'Auto';

  // Video player DOM
  const videoPlayerMarkup = (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={`relative w-full bg-black flex flex-col select-none overflow-hidden ${
        isFullscreen 
          ? 'fixed inset-0 w-screen h-screen max-w-none rounded-none z-[9999] justify-center items-center' 
          : 'w-full rounded-2xl overflow-hidden justify-center'
      }`}
      style={{ borderRadius: isFullscreen ? 0 : '16px' }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* =========================================================================
          1. YOUTUBE-STYLE TOP BAR WITH SOFT DARK GRADIENT BACKDROP
          - Gentle top-to-bottom dark gradient: from-black/85 via-black/40 to-transparent
          - Absolutely no hard borders! Soft subtle gradient for high visibility
          - Smooth toggle with controlsVisible
         ========================================================================= */}
      <div 
        className={`absolute top-0 inset-x-0 z-30 pt-3 sm:pt-4 pb-8 sm:pb-10 px-3 sm:px-5 flex items-center justify-between text-white bg-gradient-to-b from-black/85 via-black/40 to-transparent transition-opacity duration-200 ease-in-out pointer-events-auto ${
          controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
          {/* Dynamic Theme-Aware App Logo */}
          <div 
            className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0 drop-shadow-md"
            style={{ color: themePrimary }}
          >
            <svg 
              viewBox="0 0 24 24" 
              fill="currentColor"
              className="w-4 h-4 sm:w-5 sm:h-5"
              style={{ color: themePrimary }}
            >
              <path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/>
            </svg>
          </div>
          
          <div className="flex items-center min-w-0">
            <span 
              className="font-bold text-xs sm:text-sm text-white truncate max-w-[220px] sm:max-w-md drop-shadow-md tracking-tight" 
              title={title}
            >
              {title || 'ভিডিও লেকচার'}
            </span>
          </div>
        </div>

        {/* Close Button */}
        {onClose && !isInline && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1 sm:p-1.5 text-white/90 hover:text-white hover:bg-white/20 active:bg-white/30 rounded-full transition-colors cursor-pointer shrink-0 drop-shadow-md"
            title="Close Player"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        )}
      </div>

      {/* Video Stage Container: Seamless, uncropped, zero dark border letterboxing */}
      <div 
        className={`w-full flex items-center justify-center relative overflow-hidden bg-black ${
          isFullscreen ? 'w-full h-full' : ''
        }`}
      >
        {/* Video Canvas Container (16:9 natural aspect ratio, 100% uncropped fit) */}
        <div 
          className={`relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden ${
            isFullscreen ? 'max-h-full max-w-full my-auto' : 'max-w-full'
          }`}
          style={{ 
            maxWidth: isFullscreen ? 'min(100vw, calc(100vh * 16 / 9))' : '100%',
            maxHeight: isFullscreen ? 'min(100vh, calc(100vw * 9 / 16))' : 'none'
          }}
        >
          {/* Non-blocking Hardware Brightness Overlays (zero video decode stall) */}
          {brightness < 1 && (
            <div 
              className="absolute inset-0 z-12 bg-black pointer-events-none transition-opacity duration-75"
              style={{ opacity: (1 - brightness) * 0.85 }}
            />
          )}
          {brightness > 1 && (
            <div 
              className="absolute inset-0 z-12 bg-white pointer-events-none mix-blend-screen transition-opacity duration-75"
              style={{ opacity: (brightness - 1) * 0.45 }}
            />
          )}

          {/* =========================================================================
              Case 1: YouTube Video Player
              - Managed via YouTube IFrame Player API
              - 100% Width & 100% Height: ZERO Cropping! Fits lecture completely!
              - NO hard borders, unhindered video output
              - pointer-events: none prevents any external clicks
             ========================================================================= */}
          {videoId && (
            <div className="absolute inset-0 w-full h-full overflow-hidden select-none pointer-events-none flex items-center justify-center bg-black">
              <div 
                ref={ytMountContainerRef}
                className="absolute inset-0 w-full h-full pointer-events-none select-none flex items-center justify-center"
                style={{
                  pointerEvents: 'none',
                  userSelect: 'none'
                }}
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

          {/* Case 3: Direct video file */}
          {isDirectVideo && (
            <video
              ref={html5VideoRef}
              src={url}
              preload="auto"
              playsInline
              controlsList="nodownload nofullscreen noplaybackrate"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
              onProgress={() => {
                if (html5VideoRef.current && html5VideoRef.current.duration) {
                  const v = html5VideoRef.current;
                  const cur = v.currentTime;
                  for (let i = 0; i < v.buffered.length; i++) {
                    if (v.buffered.start(i) <= cur && cur <= v.buffered.end(i)) {
                      const pct = (v.buffered.end(i) / v.duration) * 100;
                      setBufferedPercent(Math.min(100, Math.max(0, pct)));
                      break;
                    }
                  }
                }
              }}
              onTimeUpdate={() => {
                if (html5VideoRef.current) {
                  const cur = html5VideoRef.current.currentTime;
                  setCurrentTime(cur);
                  if (html5VideoRef.current.duration) {
                    const v = html5VideoRef.current;
                    for (let i = 0; i < v.buffered.length; i++) {
                      if (v.buffered.start(i) <= cur && cur <= v.buffered.end(i)) {
                        const pct = (v.buffered.end(i) / v.duration) * 100;
                        setBufferedPercent(Math.min(100, Math.max(0, pct)));
                        break;
                      }
                    }
                  }
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

          {/* Paused state clean mask: obscures YouTube's pause cards & related video shelf */}
          {videoId && !isPlaying && hasStarted && (
            <div 
              className="absolute inset-0 z-15 bg-black/45 backdrop-blur-[2px] pointer-events-none transition-opacity duration-200" 
            />
          )}

          {/* Solid pure black cover to hide initial YouTube thumbnail & red button */}
          {videoId && !hasStarted && (
            <div 
              className="absolute inset-0 bg-black z-15 pointer-events-none"
            />
          )}

          {/* =========================================================================
              CRITICAL: Transparent Touch Shield
              - Covers entire player canvas at z-20 (above video)
              - pointer-events: auto captures clicks and swipe gestures
              - Prevents any redirect to YouTube
             ========================================================================= */}
          {!isDriveVideo && (
            <div 
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onClick={handleMouseClick}
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
              }}
              className="absolute inset-0 z-20 cursor-pointer pointer-events-auto bg-transparent select-none touch-none"
              style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
              aria-label="Video playback surface shield"
            />
          )}

          {/* Buffering Indicator */}
          {isBuffering && (
            <div className="absolute inset-0 z-25 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-2 px-4 py-3 rounded-2xl bg-black/85 backdrop-blur-md border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                <div 
                  className="w-8 h-8 border-3 border-white/20 rounded-full animate-spin" 
                  style={{ borderTopColor: themePrimary }}
                />
                <span className="text-[11px] font-semibold text-slate-300">লোড হচ্ছে...</span>
              </div>
            </div>
          )}

          {/* Center Play/Pause Button */}
          {!isDriveVideo && (
            <div 
              className={`absolute inset-0 z-30 flex items-center justify-center transition-opacity duration-200 ease-in-out ${
                controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
              }`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-xs border border-white/20 text-white flex items-center justify-center shadow-2xl transition-transform hover:scale-105 active:scale-95 cursor-pointer drop-shadow-lg"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-7 h-7 sm:w-8 sm:h-8 fill-white" />
                ) : (
                  <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-white ml-0.5" />
                )}
              </button>
            </div>
          )}

          {/* Double-Tap 10s Skip Feedback Overlay */}
          {skipFeedback && (
            <div 
              className={`absolute top-0 bottom-0 z-30 w-1/3 flex items-center justify-center pointer-events-none ${
                skipFeedback.side === 'left' ? 'left-0 bg-blue-600/20' : 'right-0 bg-blue-600/20'
              }`}
            >
              <div className="flex flex-col items-center text-white bg-black/90 px-4 py-2.5 rounded-2xl backdrop-blur-md shadow-2xl border border-white/15 animate-in fade-in zoom-in duration-150">
                {skipFeedback.side === 'left' ? (
                  <RotateCcw className="w-6 h-6 mb-1 text-blue-400" />
                ) : (
                  <RotateCw className="w-6 h-6 mb-1 text-blue-400" />
                )}
                <span className="text-xs font-bold font-mono tracking-wider">{skipFeedback.text}</span>
              </div>
            </div>
          )}

          {/* Brightness & Volume HUD Feedback */}
          {gestureFeedback && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-black/90 backdrop-blur-md text-white shadow-2xl pointer-events-none border border-white/15 animate-in fade-in duration-150">
              {gestureFeedback.type === 'brightness' ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold font-mono">ব্রাইটনেস: {gestureFeedback.value}%</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold font-mono">ভলিউম: {gestureFeedback.value}%</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          1 & 5. YOUTUBE-STYLE BOTTOM CONTROL BAR WITH SOFT DARK GRADIENT BACKDROP
          - Gentle bottom-to-top dark gradient: from-black/85 via-black/45 to-transparent
          - Absolutely no hard borders!
          - Responsive single-row layout where Fullscreen button is never cut off
          - Smooth toggle with controlsVisible
         ========================================================================= */}
      {!isDriveVideo && (
        <div 
          className={`absolute bottom-0 inset-x-0 z-30 pt-8 sm:pt-10 pb-2.5 sm:pb-3 px-2 sm:px-4 flex flex-col gap-1.5 text-white bg-gradient-to-t from-black/85 via-black/45 to-transparent transition-opacity duration-200 ease-in-out pointer-events-auto ${
            controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          } ${isFullscreen ? 'pb-4 sm:pb-5' : ''}`}
          style={{
            paddingLeft: 'max(10px, env(safe-area-inset-left))',
            paddingRight: 'max(10px, env(safe-area-inset-right))',
            paddingBottom: isFullscreen ? 'max(10px, env(safe-area-inset-bottom))' : 'max(6px, env(safe-area-inset-bottom))'
          }}
        >
          {/* Timeline Track */}
          <div className="relative flex items-center w-full h-4 cursor-pointer group">
            {/* Multi-layered Track Base */}
            <div className="absolute inset-x-0 flex items-center h-[4px]">
              {/* Unplayed Portion */}
              <div className="absolute inset-x-0 h-[2px] bg-white/25 rounded-full overflow-hidden" />

              {/* Buffered Portion */}
              <div 
                className="absolute left-0 h-[3px] bg-white/50 rounded-full transition-[width] duration-300"
                style={{ width: `${bufferedPercent}%` }}
              />

              {/* Played Portion */}
              <div 
                className="absolute left-0 h-[4px] rounded-full transition-[width] duration-75 shadow-sm"
                style={{ 
                  width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                  backgroundColor: themePrimary,
                  boxShadow: `0 0 8px ${themePrimary}`
                }}
              />
            </div>

            {/* Draggable Scrubber Thumb */}
            <div 
              className="absolute top-1/2 w-3.5 h-3.5 rounded-full border border-white shadow-md pointer-events-none transition-transform duration-75 -translate-x-1/2 -translate-y-1/2 z-10 group-hover:scale-125"
              style={{ 
                left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                backgroundColor: themePrimary
              }}
            />

            {/* Range Input */}
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            />
          </div>

          {/* Controls Row: Compact, Responsive, Never Overflowing */}
          <div className="flex items-center justify-between gap-1 w-full min-w-0">
            {/* Left Section: Single-Line Timer Display (MM:SS if under 1h) */}
            <div className="flex items-center min-w-0 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowRemainingTime(prev => !prev);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
                className="font-mono text-[11px] sm:text-xs text-slate-100 tracking-tight font-medium cursor-pointer hover:text-white transition-colors px-1 py-0.5 rounded select-none whitespace-nowrap shrink-0 drop-shadow-md"
                title={showRemainingTime ? 'ক্লিক করে অতিক্রান্ত সময় দেখুন' : 'ক্লিক করে অবশিষ্ট সময় দেখুন'}
              >
                <span 
                  style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    whiteSpace: 'nowrap', 
                    gap: '3px' 
                  }}
                  className="whitespace-nowrap"
                >
                  {showRemainingTime ? (
                    <>
                      <span className="font-bold whitespace-nowrap drop-shadow-md" style={{ color: themePrimary }}>
                        -{formatTime(Math.max(0, duration - currentTime), duration)}
                      </span>
                      <span className="text-slate-300 whitespace-nowrap drop-shadow-md">/</span>
                      <span className="text-slate-300 whitespace-nowrap drop-shadow-md">{formatTime(duration, duration)}</span>
                    </>
                  ) : (
                    <>
                      <span className="whitespace-nowrap drop-shadow-md">{formatTime(currentTime, duration)}</span>
                      <span className="text-slate-300 whitespace-nowrap drop-shadow-md">/</span>
                      <span className="text-slate-300 whitespace-nowrap drop-shadow-md">{formatTime(duration, duration)}</span>
                    </>
                  )}
                </span>
              </button>
            </div>

            {/* Right Section: Compact buttons that fit effortlessly on any mobile screen */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* Quality Selector Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.history.pushState({ modal: 'quality' }, '');
                  setShowQualityMenu(true);
                }}
                className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-white font-mono text-[10px] sm:text-xs flex items-center gap-1 transition-colors cursor-pointer hover:bg-white/15 shrink-0 drop-shadow-md"
                title="Resolution & Quality"
              >
                <Settings className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-400 shrink-0" />
                <span className="hidden xs:inline whitespace-nowrap">{currentQualityLabel}</span>
              </button>

              {/* Playback Speed Button (0.5x to 3.0x) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.history.pushState({ modal: 'speed' }, '');
                  setShowSpeedMenu(true);
                }}
                className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-white font-mono text-[10px] sm:text-xs flex items-center gap-1 transition-colors cursor-pointer hover:bg-white/15 shrink-0 drop-shadow-md"
                title="Playback Speed"
              >
                <Gauge className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400 shrink-0" />
                <span className="whitespace-nowrap">{playbackSpeed}x</span>
              </button>

              {/* Video Notes & Timestamp Bookmarks */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNotesPanel(prev => !prev);
                }}
                className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-white text-[10px] sm:text-xs flex items-center gap-1 transition-colors cursor-pointer shrink-0 drop-shadow-md ${
                  showNotesPanel
                    ? 'text-amber-300 bg-amber-500/25'
                    : 'hover:bg-white/15'
                }`}
                title="Timestamp Notes & Bookmarks"
              >
                <Bookmark className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 shrink-0" />
                <span className="hidden sm:inline">নোটস</span>
                <span className="text-[10px]">({videoNotes.length})</span>
              </button>

              {/* Fullscreen Toggle Button (Safely bounded, never cut off on mobile) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                className="p-1 sm:p-1.5 rounded-md hover:bg-white/15 text-white transition-colors cursor-pointer shrink-0 drop-shadow-md"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Maximize className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIDEO NOTES & TIMESTAMP BOOKMARKS DRAWER */}
      {showNotesPanel && (
        <div 
          onClick={(e) => e.stopPropagation()}
          className={`absolute right-2 sm:right-4 w-72 sm:w-80 max-w-[88%] max-h-[82vh] bg-slate-900/98 backdrop-blur-md border border-white/15 rounded-2xl shadow-2xl z-40 flex flex-col overflow-hidden text-white animate-in slide-in-from-right duration-150 ${
            isFullscreen ? 'top-12 bottom-14' : 'top-10 bottom-12'
          }`}
        >
          {/* Panel Header */}
          <div className="p-3 border-b border-white/10 flex items-center justify-between bg-black/40 shrink-0">
            <div className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-amber-400" />
              <h4 className="font-bold text-xs sm:text-sm">ক্লাস নোটস ও বুকমার্ক</h4>
            </div>
            <button
              onClick={() => setShowNotesPanel(false)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Input Form to Capture current second */}
          <form onSubmit={handleCreateNote} className="p-2.5 border-b border-white/10 space-y-2 bg-black/20 shrink-0">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>টাইমস্ট্যাম্প:</span>
              <span className="font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20">
                ⏱ {formatTime(currentTime)}
              </span>
            </div>
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="এই সময়ে নোট লিখুন..."
                value={newNoteInput}
                onChange={(e) => setNewNoteInput(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                maxLength={120}
              />
              <button
                type="submit"
                disabled={isSavingNote || !newNoteInput.trim()}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs disabled:opacity-50 cursor-pointer shrink-0 transition-colors"
              >
                {isSavingNote ? '...' : 'যোগ'}
              </button>
            </div>
          </form>

          {/* Notes List */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {videoNotes.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs space-y-1">
                <Clock className="w-5 h-5 mx-auto text-slate-600 mb-1" />
                <p>কোনো নোট যোগ করা হয়নি।</p>
                <p className="text-[10px]">লেকচার চলাকালে যেকোনো মুহূর্তে নোট নিন।</p>
              </div>
            ) : (
              videoNotes.map((note) => (
                <div
                  key={note.id}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 hover:border-amber-400/40 transition-colors group space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => jumpToTime(note.timestampSeconds)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-400/15 hover:bg-amber-400/30 text-amber-300 font-mono font-bold text-[10px] border border-amber-400/30 cursor-pointer transition-all"
                      title="ক্লিক করে এই অংশে জাম্প করুন"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      <span>{note.timestampFormatted}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteNote(note.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-400 transition-opacity cursor-pointer"
                      title="মুছে ফেলুন"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <p 
                    onClick={() => jumpToTime(note.timestampSeconds)}
                    className="text-xs text-slate-200 cursor-pointer hover:text-white leading-relaxed break-words"
                  >
                    {note.noteText}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          PLAYBACK SPEED MODAL - Responsive & Compact for Landscape/Fullscreen
         ========================================================================= */}
      {showSpeedMenu && (
        <div 
          onClick={() => setShowSpeedMenu(false)}
          className="fixed inset-0 z-[10000] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm sm:max-w-md max-h-[88vh] bg-slate-900/98 border border-slate-700/80 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-2xl text-white flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 my-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 shrink-0">
              <div className="flex items-center gap-2">
                <Gauge className="w-4.5 h-4.5 text-emerald-400" />
                <h3 className="font-bold text-sm sm:text-base text-white">Playback Speed</h3>
              </div>
              <button
                onClick={() => setShowSpeedMenu(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto pr-1 py-2 space-y-3 sm:space-y-4 flex-1">
              {/* Current Speed Display */}
              <div className="text-center py-0.5">
                <span 
                  className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight"
                  style={{ color: 'var(--theme-primary)' }}
                >
                  {playbackSpeed}x
                </span>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                  Precision speed control (0.5x – 3.0x)
                </p>
              </div>

              {/* Continuous Precision Slider: 0.5 to 3.0 */}
              <div className="space-y-1">
                <input
                  type="range"
                  min={0.5}
                  max={3.0}
                  step={0.05}
                  value={playbackSpeed}
                  onChange={(e) => handleSetSpeed(Number(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  style={{ accentColor: 'var(--theme-primary)' }}
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono pt-0.5">
                  <span>0.5x</span>
                  <span>1.0x</span>
                  <span>1.5x</span>
                  <span>2.0x</span>
                  <span>2.5x</span>
                  <span>3.0x</span>
                </div>
              </div>

              {/* Minus / Plus fine-tuning */}
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => handleSetSpeed(playbackSpeed - 0.05)}
                  className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Minus className="w-3 h-3" /> -0.05
                </button>
                <button
                  onClick={() => handleSetSpeed(1.0)}
                  className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Normal (1x)
                </button>
                <button
                  onClick={() => handleSetSpeed(playbackSpeed + 0.05)}
                  className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> +0.05
                </button>
              </div>

              {/* Quick Presets Grid (0.5x to 3.0x) */}
              <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-slate-800">
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
                      {preset}x
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Done button */}
            <div className="pt-2 border-t border-slate-800 shrink-0">
              <button
                onClick={() => setShowSpeedMenu(false)}
                className="w-full py-2 sm:py-2.5 rounded-xl text-white font-bold text-xs sm:text-sm cursor-pointer shadow-md transition-all"
                style={{ backgroundColor: 'var(--theme-primary)' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          VIDEO QUALITY MODAL - Responsive & Compact for Landscape/Fullscreen
         ========================================================================= */}
      {showQualityMenu && (
        <div 
          onClick={() => setShowQualityMenu(false)}
          className="fixed inset-0 z-[10000] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm sm:max-w-md max-h-[88vh] bg-slate-900/98 border border-slate-700/80 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-2xl text-white flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 my-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 shrink-0">
              <div className="flex items-center gap-2">
                <Settings className="w-4.5 h-4.5 text-blue-400" />
                <h3 className="font-bold text-sm sm:text-base text-white">Video Quality</h3>
              </div>
              <button
                onClick={() => setShowQualityMenu(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Quality List (Scrollable) */}
            <div className="space-y-1.5 overflow-y-auto pr-1 py-2 flex-1 max-h-[55vh] sm:max-h-64">
              {QUALITY_OPTIONS.map((q) => {
                const isSelected = selectedQuality === q.id;
                return (
                  <button
                    key={q.id}
                    onClick={() => handleSetQuality(q.id)}
                    className={`w-full p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-600/20 text-white font-bold ring-1 ring-blue-500/30'
                        : 'border-slate-800 bg-slate-800/40 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div>
                      <span className="text-xs sm:text-sm font-semibold block">{q.label}</span>
                      <span className="text-[10px] sm:text-[11px] text-slate-400 block">{q.desc}</span>
                    </div>
                    {isSelected && (
                      <div 
                        className="w-5 h-5 sm:w-6 sm:h-6 rounded-full text-white flex items-center justify-center shadow-xs shrink-0"
                        style={{ backgroundColor: 'var(--theme-primary)' }}
                      >
                        <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Close button */}
            <div className="pt-2 border-t border-slate-800 shrink-0">
              <button
                onClick={() => setShowQualityMenu(false)}
                className="w-full py-2 sm:py-2.5 rounded-xl text-white font-bold text-xs sm:text-sm cursor-pointer shadow-md transition-all"
                style={{ backgroundColor: 'var(--theme-primary)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Preserve component DOM hierarchy across fullscreen toggles to prevent iframe recreation
  if (isInline) {
    return videoPlayerMarkup;
  }

  // If standalone modal
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-0 ${isFullscreen ? 'bg-black' : 'sm:p-4 bg-black/95 backdrop-blur-md'}`}>
      {videoPlayerMarkup}
    </div>
  );
};
