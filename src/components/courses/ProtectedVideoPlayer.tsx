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
  Check,
  Bookmark,
  FileText,
  Trash2,
  ExternalLink,
  Clock,
  Sparkles,
  Loader2
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
  { id: 'auto', label: 'Auto', desc: 'Automatic (Recommended)' },
  { id: 'hd1080', label: '1080p', desc: 'Full HD Quality' },
  { id: 'hd720', label: '720p', desc: 'High Definition' },
  { id: 'large', label: '480p', desc: 'Standard Definition' },
  { id: 'medium', label: '360p', desc: 'Medium Data' },
  { id: 'small', label: '240p', desc: 'Data Saver' },
  { id: 'tiny', label: '144p', desc: 'Ultra Low Data' }
];

// Presets capped at 3.0x as requested (0.5x, 0.75x, 1.0x, 1.25x, 1.5x, 2.0x, 2.5x, 3.0x)
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
  
  // Single-tap vs Double-tap debouncer
  const singleTapTimerRef = useRef<any>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });
  const lastTouchEndTimeRef = useRef<number>(0);

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
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState<number>(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [brightness, setBrightness] = useState(1); // 0.25 to 1.5
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
    // Ignore synthetic mousemove fired by mobile touch events
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
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent browser inspect / save shortcuts for content protection
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

    // Reset started/playing when video ID changes
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

    // 2. Prepare clean mount container
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
                setIsPlaying(false);
                setIsBuffering(false);
                setControlsVisible(true);
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
          } catch (err) {
            // Player transitioning
          }
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
  // YouTube API natively supports up to 2.0x with smooth audio decoding.
  // For speeds > 2.0x (e.g. 2.5x or 3.0x): we keep native playback rate at 2.0x
  // and smoothly nudge forward by (targetSpeed - 2.0) * interval every 1200ms
  // (1.2s cadence aligns with H.264/VP9 keyframes, preventing stutter or decoder stalls)
  useEffect(() => {
    if (hyperSpeedIntervalRef.current) {
      clearInterval(hyperSpeedIntervalRef.current);
      hyperSpeedIntervalRef.current = null;
    }

    if (videoId && isPlaying && playbackSpeed > 2.0) {
      const intervalMs = 1200;
      const extraSpeed = playbackSpeed - 2.0; // e.g. 0.5 for 2.5x, 1.0 for 3x
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
      // When newly paused, display controls initially; student can touch anywhere to hide them cleanly
      if (prevPlayingRef.current && !isPlaying) {
        setControlsVisible(true);
      }
    }
    prevPlayingRef.current = isPlaying;
  }, [isPlaying, resetHideTimer]);

  // Instant Play / Pause toggle with seamless state transition
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

  // 10s Skip Backward (Double-tap left) - Smooth without pausing video
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

  // 10s Skip Forward (Double-tap right) - Smooth without pausing video
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

  // Vertical Touch Swipe: Left side = Brightness, Right side = Volume
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

    if (Math.abs(deltaY) > 14 && Math.abs(deltaY) > Math.abs(deltaX)) {
      isDraggingRef.current = true;
      const rect = containerRef.current?.getBoundingClientRect();
      const isLeftSide = rect ? (touchStartRef.current.x < rect.left + rect.width / 2) : true;
      const sensitivity = 0.005;

      if (isLeftSide) {
        // Brightness (0.25 to 1.5)
        const newBright = Math.min(1.5, Math.max(0.25, touchStartRef.current.brightness - deltaY * sensitivity));
        setBrightness(newBright);
        setGestureFeedback({ type: 'brightness', value: Math.round(newBright * 100) });
      } else {
        // Volume (0 to 100)
        const newVol = Math.min(100, Math.max(0, Math.round(touchStartRef.current.volume - deltaY * 0.4)));
        setVolume(newVol);
        setIsMuted(newVol === 0);

        if (isDirectVideo && html5VideoRef.current) {
          html5VideoRef.current.volume = newVol / 100;
        } else if (videoId) {
          if (ytPlayerRef.current && typeof ytPlayerRef.current.setVolume === 'function') {
            try {
              ytPlayerRef.current.setVolume(newVol);
            } catch (e) {}
          }
        }
        setGestureFeedback({ type: 'volume', value: newVol });
      }
    }
  };

  // Screen Tap Engine:
  // 1. Single Tap: Smoothly toggles visibility of all player controls simultaneously.
  // 2. Double Tap: Outer left = -10s, Outer right = +10s, Center = toggle play/pause.
  const handleScreenTap = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const relX = (clientX - rect.left) / rect.width;

    const now = Date.now();
    const timeSinceLast = now - lastTapRef.current.time;
    const deltaX = Math.abs(clientX - lastTapRef.current.x);
    const deltaY = Math.abs(clientY - lastTapRef.current.y);
    const dist = Math.hypot(deltaX, deltaY);

    // True Double Tap: tapped twice within 50ms - 320ms and within 70px proximity
    if (timeSinceLast >= 50 && timeSinceLast < 320 && dist < 70) {
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapRef.current = { time: 0, x: 0, y: 0 };

      if (relX < 0.35) {
        // Double tap left: Rewind 10s
        handleSkipBackward();
      } else if (relX > 0.65) {
        // Double tap right: Fast Forward 10s
        handleSkipForward();
      } else {
        // Double tap center: toggle play/pause
        togglePlay();
      }
      return;
    }

    // First tap: register timestamp and position, wait 240ms for potential second tap
    lastTapRef.current = { time: now, x: clientX, y: clientY };

    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current);
    }

    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      lastTapRef.current = { time: 0, x: 0, y: 0 };

      setControlsVisible(prev => {
        const next = !prev;
        if (next && isPlaying) {
          resetHideTimer();
        }
        return next;
      });
    }, 240);
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    setTimeout(() => setGestureFeedback(null), 800);
    lastTouchEndTimeRef.current = Date.now();

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
    // Ignore synthetic click generated by touch devices right after touchend
    if (Date.now() - lastTouchEndTimeRef.current < 650) {
      return;
    }
    handleScreenTap(e.clientX, e.clientY);
  };

  const toggleMute = () => {
    if (isDirectVideo && html5VideoRef.current) {
      html5VideoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
      return;
    }

    if (videoId) {
      if (ytPlayerRef.current) {
        try {
          if (isMuted) {
            ytPlayerRef.current.unMute();
          } else {
            ytPlayerRef.current.mute();
          }
        } catch (e) {}
      }
      setIsMuted(!isMuted);
    }
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
      // In YouTube iframe, set base rate up to 2.0x (max supported natively by YouTube API)
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

  const formatTime = (secs: number, totalDuration: number = duration) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const totalSecs = Math.floor(secs);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = Math.floor(totalSecs % 60);
    const pad = (n: number) => (n < 10 ? '0' + n : '' + n);

    // If total duration crosses 60 minutes (>= 3600 sec), format with hours (e.g. 1:27:50)
    if (totalDuration >= 3600 || h > 0) {
      return `${h}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  };

  const currentQualityLabel = QUALITY_OPTIONS.find(q => q.id === selectedQuality)?.label || 'Auto';

  // Video player DOM
  const videoPlayerMarkup = (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={`relative w-full bg-black flex flex-col select-none overflow-hidden transition-all duration-300 ${
        isFullscreen 
          ? 'fixed inset-0 w-screen h-screen max-w-none rounded-none z-[9999] justify-between' 
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
          1. TOP APP BAR: Dynamic Theme-Aware App Logo + Video Lecture Title + Close Button
          - Removed hardcoded "Medical Admission Hub"
          - Displays ONLY user-saved video lecture title
          - Theme-aware app logo dynamically changes color with App Theme
          - Smooth fade-in and fade-out transition
         ========================================================================= */}
      <div 
        className={`absolute top-0 inset-x-0 z-30 px-3 sm:px-6 py-2.5 sm:py-3.5 bg-gradient-to-b from-black/85 via-black/55 to-transparent flex items-center justify-between text-white transition-opacity duration-300 ease-in-out ${
          controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
          {/* Theme-aware App Logo */}
          <div 
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 shadow-md transition-colors border"
            style={{ 
              backgroundColor: `${themePrimary}25`, 
              borderColor: `${themePrimary}60`,
              color: themePrimary 
            }}
          >
            <svg 
              viewBox="0 0 24 24" 
              fill="currentColor"
              className="w-4 h-4 sm:w-4.5 sm:h-4.5"
              style={{ color: themePrimary }}
            >
              <path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/>
            </svg>
          </div>
          
          <div className="flex items-center min-w-0">
            <span 
              className="font-bold text-xs sm:text-sm text-white truncate max-w-[220px] sm:max-w-md lg:max-w-xl" 
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
            className="p-1.5 sm:p-2 bg-white/10 hover:bg-white/20 active:bg-white/30 backdrop-blur-md rounded-full text-white/90 hover:text-white transition-all cursor-pointer border border-white/15 shrink-0 shadow-lg"
            title="Close Player"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        )}
      </div>

      {/* Video Stage Container: Seamless, uncropped, zero dark border letterboxing */}
      <div 
        className={`w-full flex items-center justify-center relative overflow-hidden bg-black ${
          isFullscreen ? 'flex-1 h-full' : ''
        }`}
      >
        {/* Video Canvas Container (16:9 natural aspect ratio, object-fit contain) */}
        <div 
          className={`relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden ${
            isFullscreen ? 'max-h-full max-w-full my-auto' : 'max-w-full'
          }`}
          style={{ 
            filter: `brightness(${brightness})`,
            maxWidth: isFullscreen ? 'min(100vw, calc(100vh * 16 / 9))' : '100%',
            maxHeight: isFullscreen ? 'min(100vh, calc(100vw * 9 / 16))' : 'none'
          }}
        >
          {/* =========================================================================
              Case 1: YouTube Video Player
              - Managed via YouTube IFrame Player API
              - Scaled & positioned with offset to push YouTube's native header, channel title,
                avatar, and bottom watermark OUTSIDE the canvas bounding box
              - ALL dark tint/gradient overlays on the video REMOVED (Crystal clear original video)
              - pointer-events: none on the entire iframe hierarchy prevents any external click
             ========================================================================= */}
          {videoId && (
            <div className="absolute inset-0 w-full h-full overflow-hidden select-none pointer-events-none flex items-center justify-center bg-black">
              {/* YouTube Player Mount Container (Programmatically managed by YT.Player) */}
              <div 
                ref={ytMountContainerRef}
                className="absolute w-[106%] h-[130%] -top-[15%] -left-[3%] pointer-events-none select-none flex items-center justify-center"
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

          {/* Case 3: Direct video file (object-fit: contain, pre-buffering enabled) */}
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

          {/* =========================================================================
              2. PURE SOLID BLACK COVER (Hide Initial Thumbnail, Channel Bar & Red Play Button)
              - Solid black overlay is 100% opaque until video playback actually starts
              - Completely shields the initial YouTube thumbnail and red play button
              - Seamlessly dissolves (fade-out) once playing begins
             ========================================================================= */}
          {videoId && !isPlaying && (
            <div 
              className={`absolute inset-0 bg-black z-15 pointer-events-none transition-opacity duration-500 ${
                hasStarted && isPlaying ? 'opacity-0' : 'opacity-100'
              }`}
            />
          )}

          {/* =========================================================================
              CRITICAL: Transparent Overlay Div (Transparent Shield)
              - Placed over the entire video canvas at z-20 (above video)
              - pointer-events: auto ensures ALL clicks, taps, and gestures are intercepted
              - Physically blocks ANY click from reaching the YouTube iframe underneath
              - Redirection to YouTube or opening channel link is 100% prevented
              - Intercepts single-tap to toggle controls, double-tap for ±10s seek, drag for brightness/volume
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
              <div className="flex flex-col items-center gap-2 px-4 py-3 rounded-2xl bg-black/80 backdrop-blur-md border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                <div 
                  className="w-8 h-8 border-3 border-white/20 rounded-full animate-spin" 
                  style={{ borderTopColor: themePrimary }}
                />
                <span className="text-[11px] font-semibold text-slate-300">লোড হচ্ছে...</span>
              </div>
            </div>
          )}

          {/* DEDICATED CENTER PLAY/PAUSE BUTTON:
              Smoothly fades in and out with all other controls! */}
          {!isDriveVideo && (
            <div 
              className={`absolute inset-0 z-30 flex items-center justify-center transition-opacity duration-300 ease-in-out ${
                controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
              }`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/65 hover:bg-black/85 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-2xl transition-all transform hover:scale-110 active:scale-95 cursor-pointer"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 sm:w-10 sm:h-10 fill-white" />
                ) : (
                  <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-white ml-1" />
                )}
              </button>
            </div>
          )}

          {/* Double-Tap 10s Skip Feedback Overlay */}
          {skipFeedback && (
            <div 
              className={`absolute top-0 bottom-0 z-30 w-1/3 flex items-center justify-center pointer-events-none ${
                skipFeedback.side === 'left' ? 'left-0 bg-gradient-to-r from-blue-600/30 to-transparent' : 'right-0 bg-gradient-to-l from-blue-600/30 to-transparent'
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
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-black/85 backdrop-blur-md text-white shadow-2xl pointer-events-none border border-white/10 animate-in fade-in duration-150">
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
      </div>

      {/* =========================================================================
          4 & 5. CLEAN BOTTOM CONTROL BAR & ADVANCED TIMELINE
          - Smooth fade-in & fade-out with controlsVisible
          - Flexbox single-line timer alignment (no text break/jumping)
         ========================================================================= */}
      {!isDriveVideo && (
        <div 
          className={`absolute bottom-0 inset-x-0 z-30 px-3 sm:px-5 py-2.5 sm:py-3.5 bg-gradient-to-t from-black/90 via-black/60 to-transparent text-white transition-opacity duration-300 ease-in-out ${
            controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          } ${isFullscreen ? 'pb-4 sm:pb-6' : ''}`}
        >
          {/* ADVANCED TIMELINE / PROGRESS BAR STYLING:
              - Played portion: Highlighted with the App's Theme Color (5.5px)
              - Buffered portion: 3.5px translucent white loaded in advance
              - Remaining unplayed portion: 2.5px thin faded line
              - Scrubber dot: Always visible at front of line for intuitive seeking */}
          <div className="relative flex items-center w-full mb-2 h-5 cursor-pointer group">
            {/* Multi-layered Track Base */}
            <div className="absolute inset-x-0 flex items-center h-[5.5px]">
              {/* 1. Unplayed Portion: Thin 2.5px faded background track */}
              <div className="absolute inset-x-0 h-[2.5px] bg-white/20 rounded-full overflow-hidden" />

              {/* 2. Buffered Portion: 3.5px translucent white track loaded ahead */}
              <div 
                className="absolute left-0 h-[3.5px] bg-white/45 rounded-full transition-[width] duration-300"
                style={{ width: `${bufferedPercent}%` }}
              />

              {/* 3. Played Portion: Highlighted using App Theme Color (5.5px) */}
              <div 
                className="absolute left-0 h-[5.5px] rounded-full transition-[width] duration-75 shadow-md"
                style={{ 
                  width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                  backgroundColor: themePrimary,
                  boxShadow: `0 0 10px ${themePrimary}99`
                }}
              />
            </div>

            {/* Draggable Scrubber Dot (Thumb) - Always Visible at the front of played line */}
            <div 
              className="absolute top-1/2 w-4 h-4 rounded-full border-2 border-white shadow-xl pointer-events-none transition-transform duration-75 -translate-x-1/2 -translate-y-1/2 z-10 group-hover:scale-125"
              style={{ 
                left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                backgroundColor: themePrimary,
                boxShadow: `0 0 8px ${themePrimary}, 0 2px 6px rgba(0,0,0,0.6)`
              }}
            />

            {/* Seamless Scrub Range Input */}
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            />
          </div>

          {/* Clean Controls Row */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0 shrink-0">
              {/* =========================================================================
                  4. SINGLE-LINE TIMER ALIGNMENT (CSS Flexbox inline-flex, whitespace-nowrap)
                  - Guaranteed never to wrap or break into two lines in any screen mode
                 ========================================================================= */}
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
                className="font-mono text-xs sm:text-sm text-slate-200 tracking-wide font-medium cursor-pointer hover:text-white transition-colors px-1.5 py-0.5 rounded-md hover:bg-white/10 active:scale-95 select-none border border-transparent hover:border-white/15 whitespace-nowrap shrink-0"
                title={showRemainingTime ? 'ক্লিক করে অতিক্রান্ত সময় দেখুন' : 'ক্লিক করে অবশিষ্ট সময় দেখুন'}
              >
                <span 
                  style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    whiteSpace: 'nowrap', 
                    gap: '4px' 
                  }}
                  className="whitespace-nowrap"
                >
                  {showRemainingTime ? (
                    <>
                      <span className="font-bold whitespace-nowrap" style={{ color: themePrimary }}>
                        -{formatTime(Math.max(0, duration - currentTime), duration)}
                      </span>
                      <span className="text-slate-400 whitespace-nowrap">/</span>
                      <span className="text-slate-400 whitespace-nowrap">{formatTime(duration, duration)}</span>
                    </>
                  ) : (
                    <>
                      <span className="whitespace-nowrap">{formatTime(currentTime, duration)}</span>
                      <span className="text-slate-400 whitespace-nowrap">/</span>
                      <span className="text-slate-400 whitespace-nowrap">{formatTime(duration, duration)}</span>
                    </>
                  )}
                </span>
              </button>

              {/* Mute / Unmute Toggle */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Quality Selector Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.history.pushState({ modal: 'quality' }, '');
                  setShowQualityMenu(true);
                }}
                className="px-2 sm:px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono text-[11px] sm:text-xs flex items-center gap-1 transition-all cursor-pointer border border-white/10 shrink-0"
                title="Resolution & Quality"
              >
                <Settings className="w-3.5 h-3.5 text-blue-400" />
                <span>{currentQualityLabel}</span>
              </button>

              {/* Playback Speed Button (0.5x to 3.0x) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.history.pushState({ modal: 'speed' }, '');
                  setShowSpeedMenu(true);
                }}
                className="px-2 sm:px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono text-[11px] sm:text-xs flex items-center gap-1 transition-all cursor-pointer border border-white/10 shrink-0"
                title="Playback Speed"
              >
                <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                <span>{playbackSpeed.toFixed(2)}x</span>
              </button>

              {/* Video Notes & Timestamp Bookmarks */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNotesPanel(prev => !prev);
                }}
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-white font-medium text-[11px] sm:text-xs flex items-center gap-1 transition-all cursor-pointer border shrink-0 ${
                  showNotesPanel
                    ? 'bg-amber-500/30 border-amber-400 text-amber-300'
                    : 'bg-white/10 hover:bg-white/20 border-white/10'
                }`}
                title="Timestamp Notes & Bookmarks"
              >
                <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">নোটস ({videoNotes.length})</span>
              </button>

              {/* Fullscreen Toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors cursor-pointer shrink-0"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIDEO NOTES & TIMESTAMP BOOKMARKS DRAWER */}
      {showNotesPanel && (
        <div 
          onClick={(e) => e.stopPropagation()}
          className={`absolute right-3 sm:right-5 w-80 max-w-[85%] max-h-[85vh] bg-slate-900/98 backdrop-blur-md border border-white/15 rounded-2xl shadow-2xl z-40 flex flex-col overflow-hidden text-white animate-in slide-in-from-right duration-200 ${
            isFullscreen ? 'top-14 bottom-16' : 'top-12 bottom-14'
          }`}
        >
          {/* Panel Header */}
          <div className="p-3.5 border-b border-white/10 flex items-center justify-between bg-black/30 shrink-0">
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
          <form onSubmit={handleCreateNote} className="p-3 border-b border-white/10 space-y-2 bg-black/20 shrink-0">
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
                className="flex-1 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
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
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {videoNotes.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs space-y-1">
                <Clock className="w-6 h-6 mx-auto text-slate-600 mb-1" />
                <p>কোনো নোট যোগ করা হয়নি।</p>
                <p className="text-[10px]">লেকচার চলাকালে যেকোনো মুহূর্তে নোট নিন।</p>
              </div>
            ) : (
              videoNotes.map((note) => (
                <div
                  key={note.id}
                  className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-amber-400/40 transition-colors group space-y-1"
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
          6 & 7. PLAYBACK SPEED MODAL - Max 3.0x, Responsive & Compact for Landscape/Fullscreen
          - Capped at 3.0x max with optimized smooth steps
          - Bounded by max-h-[88vh] with internal scrolling to prevent cutting off in landscape
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

            {/* Scrollable Content for small heights (e.g. mobile landscape) */}
            <div className="overflow-y-auto pr-1 py-2 space-y-3 sm:space-y-4 flex-1">
              {/* Current Speed Display */}
              <div className="text-center py-0.5">
                <span 
                  className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight"
                  style={{ color: 'var(--theme-primary)' }}
                >
                  {playbackSpeed.toFixed(2)}x
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
                  Normal (1.0x)
                </button>
                <button
                  onClick={() => handleSetSpeed(playbackSpeed + 0.05)}
                  className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> +0.05
                </button>
              </div>

              {/* Quick Presets Grid (0.5x, 0.75x, 1.0x, 1.25x, 1.5x, 2.0x, 2.5x, 3.0x) */}
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
                      {preset.toFixed(2)}x
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
          7. VIDEO QUALITY MODAL - Responsive & Compact for Landscape/Fullscreen
          - Bounded by max-h-[88vh] with internal scrolling to prevent cutting off in landscape
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
