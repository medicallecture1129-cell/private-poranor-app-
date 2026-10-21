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
  Volume2,
  GraduationCap
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
  const lastExplicitHideTimeRef = useRef<number>(0);

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

  // Autohide controls after 3 seconds of inactivity
  const resetHideTimer = useCallback(() => {
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
    }
    hideControlsTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 3000);
  }, []);

  const showControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    resetHideTimer();
  }, [resetHideTimer]);

  const handleMouseMove = useCallback(() => {
    if (Date.now() - lastTouchEndTimeRef.current < 700) return;
    if (Date.now() - lastExplicitHideTimeRef.current < 1500) return;
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
          host: 'https://www.youtube-nocookie.com',
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
            autohide: 1,        // Automatically hide controls
            cc_load_policy: 0,  // Hide closed captions
            playsinline: 1,     // Inline playback on iOS/mobile
            enablejsapi: 1,     // Full programmatic API control
            origin: typeof window !== 'undefined' ? window.location.origin : '',
            widget_referrer: typeof window !== 'undefined' ? window.location.origin : ''
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

    // Single Tap: Toggle controls visibility (whether playing or paused)
    lastTapRef.current = { time: now, x: clientX, y: clientY };

    setControlsVisible(prev => {
      const next = !prev;
      if (next) {
        // Controls appeared: start 3-second auto-hide timer
        resetHideTimer();
      } else {
        // Controls hidden: clear timer
        lastExplicitHideTimeRef.current = Date.now();
        if (hideControlsTimerRef.current) {
          clearTimeout(hideControlsTimerRef.current);
          hideControlsTimerRef.current = null;
        }
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

  // Smart Dynamic Timer Display: MM:SS under 1 hour, H:MM:SS at 1+ hours
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const totalSecs = Math.floor(secs);
    const pad = (n: number) => (n < 10 ? '0' + n : '' + n);

    if (totalSecs < 3600) {
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
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleMouseClick(e);
        }
      }}
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
      {/* Video Stage Container: Seamless, uncropped, zero dark border letterboxing */}
      <div 
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleMouseClick(e);
          }
        }}
        className={`w-full flex items-center justify-center relative overflow-hidden bg-black ${
          isFullscreen ? 'w-full h-full' : ''
        }`}
      >
        {/* Video Canvas Container (16:9 natural aspect ratio, 100% clean fit) */}
        <div 
          className={`relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden ${
            isFullscreen ? 'max-h-full max-w-full my-auto' : 'max-w-full'
          }`}
          style={{ 
            maxWidth: isFullscreen ? 'min(100vw, calc(100vh * 16 / 9))' : '100%',
            maxHeight: isFullscreen ? 'min(100vh, calc(100vw * 9 / 16))' : 'none'
          }}
        >
          {/* Hardware Brightness Overlays (zero video decode stall) */}
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
              - 100% natural, uncropped & unzoomed aspect ratio (full video frame visible)
              - ZERO user clicks reach iframe: pointer-events: none
             ========================================================================= */}
          {videoId && (
            <div className="absolute inset-0 w-full h-full overflow-hidden select-none pointer-events-none flex items-center justify-center bg-black">
              <style>{`
                #${uniquePlayerId.current} {
                  width: 100% !important;
                  height: 100% !important;
                  border: 0 !important;
                }
              `}</style>
              <div 
                ref={ytMountContainerRef}
                className="absolute inset-x-0 w-full pointer-events-none select-none flex items-center justify-center overflow-hidden"
                style={{
                  pointerEvents: 'none',
                  userSelect: 'none',
                  top: '-80px',
                  height: 'calc(100% + 160px)',
                  width: '100%'
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

          {/* Solid pure black cover to hide initial YouTube thumbnail & red button until first play */}
          {videoId && !hasStarted && (
            <div 
              className="absolute inset-0 bg-black z-25 pointer-events-none"
            />
          )}

          {/* =========================================================================
              CRITICAL: Transparent Touch Shield
              - Covers entire player canvas at z-26 (above video and masks)
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
              className="absolute inset-0 z-26 cursor-pointer pointer-events-auto bg-transparent select-none touch-none"
              style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
              aria-label="Video playback surface shield"
            />
          )}

          {/* =========================================================================
              TOP TITLE BAR (Directly inside 16:9 canvas, perfectly framing video)
              - Soft top-to-bottom dark gradient: from-black/80 via-black/35 to-transparent
              - Unified toggle with controlsVisible
             ========================================================================= */}
          <div 
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                handleScreenTap(e.clientX, e.clientY);
              }
            }}
            className={`absolute top-0 inset-x-0 z-30 pt-3 sm:pt-4 pb-8 sm:pb-10 px-3 sm:px-4 flex items-center justify-between text-white bg-gradient-to-b from-black from-55% via-black/85 to-transparent transition-opacity duration-200 ease-in-out ${
              controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 pr-2">
              {/* Official Exam Portal App Icon */}
              <div 
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center text-white shadow-md ring-1 ring-white/20 shrink-0"
                style={{ 
                  backgroundColor: 'var(--theme-logo, var(--theme-primary, #2563eb))', 
                  boxShadow: '0 2px 10px -1px var(--theme-logo-glow, var(--theme-primary-glow, rgba(37, 99, 235, 0.5)))' 
                }}
                title="Exam Portal"
              >
                <GraduationCap className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.2]" />
              </div>
              
              <div className="flex items-center min-w-0">
                <span 
                  className="font-bold text-xs sm:text-sm text-white truncate max-w-[200px] sm:max-w-md drop-shadow-md tracking-tight" 
                  title={title}
                >
                  {title || 'Video Lecture'}
                </span>
              </div>
            </div>

            {/* Right side: Protected label + Close Button */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold tracking-wider text-[#00ff88] bg-[#00ff88]/20 border border-[#00ff88]/60 shadow-[0_0_12px_rgba(0,255,136,0.35)] select-none">
                <span className="w-2 h-2 rounded-full bg-[#00ff88] shadow-[0_0_8px_#00ff88] animate-pulse" />
                Protected
              </span>

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
          </div>

          {/* Center Play/Pause Button - 100% Transparent Background, Clean Crisp Icon */}
          {!isDriveVideo && (
            <div 
              className={`absolute inset-0 z-30 flex items-center justify-center transition-opacity duration-200 ease-in-out pointer-events-none ${
                controlsVisible ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div className="relative flex items-center justify-center pointer-events-auto">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePlay();
                  }}
                  className="relative z-10 p-1.5 sm:p-2 text-white flex items-center justify-center transition-transform duration-150 hover:scale-115 active:scale-95 cursor-pointer bg-transparent border-none outline-none focus:outline-none"
                  style={{ backgroundColor: 'transparent' }}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="w-8 h-8 sm:w-10 sm:h-10 fill-white text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]" />
                  ) : (
                    <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-white text-white ml-0.5 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Double-Tap 10s Skip Feedback Overlay */}
          {skipFeedback && (
            <div 
              className={`absolute top-0 bottom-0 z-30 w-1/3 flex items-center justify-center pointer-events-none ${
                skipFeedback.side === 'left' ? 'left-0 bg-blue-600/20' : 'right-0 bg-blue-600/20'
              }`}
            >
              <div className="flex flex-col items-center text-white bg-black/90 px-4 py-2.5 rounded-2xl shadow-2xl border border-white/15 animate-in fade-in zoom-in duration-150">
                {skipFeedback.side === 'left' ? (
                  <RotateCcw className="w-6 h-6 mb-1 text-blue-400" />
                ) : (
                  <RotateCw className="w-6 h-6 mb-1 text-blue-400" />
                )}
                <span className="text-xs font-bold font-mono tracking-wider">{skipFeedback.text}</span>
              </div>
            </div>
          )}

          {/* Brightness & Volume HUD Feedback (Standard English) */}
          {gestureFeedback && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-black/90 text-white shadow-2xl pointer-events-none border border-white/15 animate-in fade-in duration-150">
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

          {/* =========================================================================
              BOTTOM CONTROL BAR (Directly inside 16:9 canvas, perfectly framing video)
              - Soft bottom-to-top dark gradient: from-black/85 via-black/40 to-transparent
              - Unified toggle with controlsVisible
             ========================================================================= */}
          {!isDriveVideo && (
            <div 
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  handleScreenTap(e.clientX, e.clientY);
                }
              }}
              className={`absolute bottom-0 inset-x-0 z-30 pt-8 pb-2 sm:pb-3 px-2 sm:px-4 flex flex-col gap-1 text-white bg-gradient-to-t from-black from-65% via-black/85 to-transparent transition-opacity duration-200 ease-in-out ${
                controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
              }`}
              style={{
                paddingLeft: 'max(8px, env(safe-area-inset-left))',
                paddingRight: 'max(8px, env(safe-area-inset-right))',
                paddingBottom: 'max(4px, env(safe-area-inset-bottom))'
              }}
            >
              {/* Timeline Track */}
              <div className="relative flex items-center w-full h-4 sm:h-5 cursor-pointer group">
                {/* Multi-layered Track Base (Sharp, Crisp, Zero Blur) */}
                <div className="absolute inset-x-0 flex items-center h-[6px] sm:h-[7px]">
                  {/* Unplayed / Remaining Track: Pure Crisp Solid White (100% Opaque, Super Vivid, Zero Blur) */}
                  <div 
                    className="absolute inset-x-0 h-full rounded-full"
                    style={{ 
                      backgroundColor: '#ffffff',
                      boxShadow: '0 0 6px 1px rgba(255, 255, 255, 0.45)'
                    }}
                  />

                  {/* Buffered Portion */}
                  <div 
                    className="absolute left-0 h-full rounded-full transition-[width] duration-300"
                    style={{ 
                      width: `${bufferedPercent}%`,
                      backgroundColor: 'rgba(255, 255, 255, 0.95)'
                    }}
                  />

                  {/* Played Portion: Sharp, Crisp App Theme Color (ZERO BLUR, 100% Solid) */}
                  <div 
                    className="absolute left-0 h-full rounded-full transition-[width] duration-75"
                    style={{ 
                      width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                      backgroundColor: themePrimary
                    }}
                  />
                </div>

                {/* Draggable Scrubber Thumb */}
                <div 
                  className="absolute top-1/2 w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full pointer-events-none transition-transform duration-75 -translate-x-1/2 -translate-y-1/2 z-10 group-hover:scale-125"
                  style={{ 
                    left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                    backgroundColor: themePrimary,
                    border: '2.5px solid #ffffff',
                    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.4)'
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
                {/* Left Section: Single-Line Timer Display (MM:SS if under 1h, H:MM:SS at 1+ hours) */}
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
                    title={showRemainingTime ? 'Click to show elapsed time' : 'Click to show remaining time'}
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
                            -{formatTime(Math.max(0, duration - currentTime))}
                          </span>
                          <span className="text-slate-300 whitespace-nowrap drop-shadow-md">/</span>
                          <span className="text-slate-300 whitespace-nowrap drop-shadow-md">{formatTime(duration)}</span>
                        </>
                      ) : (
                        <>
                          <span className="whitespace-nowrap drop-shadow-md">{formatTime(currentTime)}</span>
                          <span className="text-slate-300 whitespace-nowrap drop-shadow-md">/</span>
                          <span className="text-slate-300 whitespace-nowrap drop-shadow-md">{formatTime(duration)}</span>
                        </>
                      )}
                    </span>
                  </button>
                </div>

                {/* Right Section: Compact buttons with name labels in English */}
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                  {/* Quality Selector Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.history.pushState({ modal: 'quality' }, '');
                      setShowQualityMenu(true);
                    }}
                    className="px-1.5 sm:px-2 py-1 rounded-lg text-white text-[11px] sm:text-xs flex items-center gap-1 transition-colors cursor-pointer hover:bg-white/20 active:bg-white/30 shrink-0 drop-shadow-md font-sans"
                    title="Resolution & Quality"
                  >
                    <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400 shrink-0" />
                    <span className="whitespace-nowrap font-medium">Quality</span>
                    <span className="hidden xs:inline text-[10px] font-mono text-blue-300 font-bold">({currentQualityLabel})</span>
                  </button>

                  {/* Playback Speed Button (0.5x to 3.0x) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.history.pushState({ modal: 'speed' }, '');
                      setShowSpeedMenu(true);
                    }}
                    className="px-1.5 sm:px-2 py-1 rounded-lg text-white text-[11px] sm:text-xs flex items-center gap-1 transition-colors cursor-pointer hover:bg-white/20 active:bg-white/30 shrink-0 drop-shadow-md font-sans"
                    title="Playback Speed"
                  >
                    <Gauge className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#00ff88] drop-shadow-[0_0_8px_rgba(0,255,136,0.6)] shrink-0" />
                    <span className="whitespace-nowrap font-medium text-white">Speed</span>
                    <span className="text-[10px] font-mono text-[#00ff88] font-bold drop-shadow-[0_0_6px_rgba(0,255,136,0.4)]">({playbackSpeed}x)</span>
                  </button>

                  {/* Video Notes & Timestamp Bookmarks */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowNotesPanel(prev => !prev);
                    }}
                    className={`px-1.5 sm:px-2 py-1 rounded-lg text-white text-[11px] sm:text-xs flex items-center gap-1 transition-colors cursor-pointer shrink-0 drop-shadow-md font-sans ${
                      showNotesPanel
                        ? 'text-amber-300 bg-amber-500/30'
                        : 'hover:bg-white/20 active:bg-white/30'
                    }`}
                    title="Timestamp Notes & Bookmarks"
                  >
                    <Bookmark className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
                    <span className="whitespace-nowrap font-medium">Note</span>
                    <span className="hidden xs:inline text-[10px] font-bold text-amber-300">({videoNotes.length})</span>
                  </button>

                  {/* Fullscreen Toggle Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFullscreen();
                    }}
                    className="p-1.5 rounded-lg hover:bg-white/20 active:bg-white/30 text-white transition-colors cursor-pointer shrink-0 drop-shadow-md"
                    title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                  >
                    {isFullscreen ? <Minimize className="w-4 h-4 sm:w-4.5 sm:h-4.5" /> : <Maximize className="w-4 h-4 sm:w-4.5 sm:h-4.5" />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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
              <h4 className="font-bold text-xs sm:text-sm">Class Notes & Bookmarks</h4>
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
              <span>Timestamp:</span>
              <span className="font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20">
                ⏱ {formatTime(currentTime)}
              </span>
            </div>
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="Write a note at this timestamp..."
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
                {isSavingNote ? '...' : 'Add'}
              </button>
            </div>
          </form>

          {/* Notes List */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {videoNotes.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs space-y-1">
                <Clock className="w-5 h-5 mx-auto text-slate-600 mb-1" />
                <p>No notes added yet.</p>
                <p className="text-[10px]">Take notes anytime during the lecture.</p>
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
                      title="Click to jump to this timestamp"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      <span>{note.timestampFormatted}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteNote(note.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-400 transition-opacity cursor-pointer"
                      title="Delete note"
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
          3. PLAYBACK SPEED MODAL - Ultra-Compact & Responsive (Zero Scroll Needed)
         ========================================================================= */}
      {showSpeedMenu && (
        <div 
          onClick={() => setShowSpeedMenu(false)}
          className="fixed inset-0 z-[10000] flex items-center justify-center p-2 sm:p-3 bg-black/85 backdrop-blur-xs animate-in fade-in duration-100"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[280px] sm:max-w-[300px] bg-slate-900/98 border border-slate-700/80 rounded-2xl p-3 sm:p-3.5 shadow-2xl text-white flex flex-col gap-2.5 animate-in zoom-in-95 duration-100 my-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-xs sm:text-sm text-white">Playback Speed</h3>
              </div>
              <button
                onClick={() => setShowSpeedMenu(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Speed Display */}
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] text-slate-400 font-medium">Speed:</span>
              <span 
                className="text-xl sm:text-2xl font-extrabold font-mono tracking-tight"
                style={{ color: 'var(--theme-primary, #3b82f6)' }}
              >
                {playbackSpeed}x
              </span>
            </div>

            {/* Quick Presets Grid (0.5x to 3.0x in 4 columns) */}
            <div className="grid grid-cols-4 gap-1.5">
              {SPEED_PRESETS.map((preset) => {
                const isMatch = Math.abs(playbackSpeed - preset) < 0.005;
                return (
                  <button
                    key={preset}
                    onClick={() => handleSetSpeed(preset)}
                    className="py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer border"
                    style={{
                      backgroundColor: isMatch ? 'var(--theme-primary, #3b82f6)' : 'rgba(30, 41, 59, 0.8)',
                      borderColor: isMatch ? 'var(--theme-primary, #3b82f6)' : 'rgba(51, 65, 85, 0.6)',
                      color: isMatch ? '#ffffff' : '#cbd5e1'
                    }}
                  >
                    {preset}x
                  </button>
                );
              })}
            </div>

            {/* Fine-Tuning Row: Slider + Minus/Plus */}
            <div className="space-y-1 pt-1 border-t border-slate-800/80">
              <input
                type="range"
                min={0.5}
                max={3.0}
                step={0.05}
                value={playbackSpeed}
                onChange={(e) => handleSetSpeed(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: 'var(--theme-primary, #3b82f6)' }}
              />
              <div className="flex items-center justify-between gap-1.5 pt-0.5">
                <button
                  onClick={() => handleSetSpeed(playbackSpeed - 0.05)}
                  className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-semibold flex items-center gap-0.5 cursor-pointer"
                >
                  <Minus className="w-2.5 h-2.5" /> 0.05
                </button>
                <button
                  onClick={() => handleSetSpeed(1.0)}
                  className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-semibold cursor-pointer"
                >
                  Normal (1x)
                </button>
                <button
                  onClick={() => handleSetSpeed(playbackSpeed + 0.05)}
                  className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-semibold flex items-center gap-0.5 cursor-pointer"
                >
                  <Plus className="w-2.5 h-2.5" /> 0.05
                </button>
              </div>
            </div>

            {/* Done button */}
            <div className="pt-1 border-t border-slate-800 shrink-0">
              <button
                onClick={() => setShowSpeedMenu(false)}
                className="w-full py-1.5 rounded-xl text-white font-bold text-xs cursor-pointer shadow-md transition-all"
                style={{ backgroundColor: 'var(--theme-primary, #3b82f6)' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          3. VIDEO QUALITY MODAL - Ultra-Compact & Responsive (Zero Scroll Needed)
         ========================================================================= */}
      {showQualityMenu && (
        <div 
          onClick={() => setShowQualityMenu(false)}
          className="fixed inset-0 z-[10000] flex items-center justify-center p-2 sm:p-3 bg-black/85 backdrop-blur-xs animate-in fade-in duration-100"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[270px] sm:max-w-[290px] bg-slate-900/98 border border-slate-700/80 rounded-2xl p-3 sm:p-3.5 shadow-2xl text-white flex flex-col gap-2 animate-in zoom-in-95 duration-100 my-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-xs sm:text-sm text-white">Video Quality</h3>
              </div>
              <button
                onClick={() => setShowQualityMenu(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quality List (Compact Single-screen Rows) */}
            <div className="space-y-1">
              {QUALITY_OPTIONS.map((q) => {
                const isSelected = selectedQuality === q.id;
                return (
                  <button
                    key={q.id}
                    onClick={() => handleSetQuality(q.id)}
                    className={`w-full py-1.5 px-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-600/20 text-white font-bold ring-1 ring-blue-500/30'
                        : 'border-slate-800/80 bg-slate-800/30 text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{q.label}</span>
                      <span className="text-[10px] text-slate-400">({q.desc})</span>
                    </div>
                    {isSelected && (
                      <div 
                        className="w-4 h-4 rounded-full text-white flex items-center justify-center shrink-0"
                        style={{ backgroundColor: 'var(--theme-primary, #3b82f6)' }}
                      >
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Close button */}
            <div className="pt-1 border-t border-slate-800 shrink-0">
              <button
                onClick={() => setShowQualityMenu(false)}
                className="w-full py-1.5 rounded-xl text-white font-bold text-xs cursor-pointer shadow-md transition-all"
                style={{ backgroundColor: 'var(--theme-primary, #3b82f6)' }}
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
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-0 ${isFullscreen ? 'bg-black' : 'sm:p-4 bg-black/95'}`}>
      {videoPlayerMarkup}
    </div>
  );
};
