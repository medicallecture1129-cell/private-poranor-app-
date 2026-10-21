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
  Sparkles
} from 'lucide-react';
import { extractYouTubeId, getGoogleDriveEmbedUrl } from '../../utils/mediaUrl';
import { useAuth } from '../../context/AuthContext';
import { subscribeVideoNotes, addVideoNote, deleteVideoNote } from '../../services/db';
import { VideoNote } from '../../types';

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

// Presets including 0.5x, 1.0x, 1.25x, 1.5x, 2.0x, 3.0x, 4.0x
const SPEED_PRESETS = [0.5, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0];

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
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [brightness, setBrightness] = useState(1); // 0.25 to 1.5
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [selectedQuality, setSelectedQuality] = useState<string>('auto');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

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
      dispatchCommand('seekTo', [targetSec, true]);
      dispatchCommand('playVideo', []);
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

  // Universal Player Command Dispatcher (Calls YT.Player API + postMessage fallback)
  const dispatchCommand = useCallback((func: string, args: any[] = []) => {
    if (ytPlayerRef.current && typeof ytPlayerRef.current[func] === 'function') {
      try {
        ytPlayerRef.current[func](...args);
      } catch (err) {
        console.debug('YT.Player call failed:', err);
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

  // Autohide controls after 3 seconds while playing
  const resetHideTimer = useCallback(() => {
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    if (isPlaying) {
      hideControlsTimerRef.current = setTimeout(() => {
        setControlsVisible(false);
      }, 3000);
    }
  }, [isPlaying]);

  const showControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    resetHideTimer();
  }, [resetHideTimer]);

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

  // Initialize YouTube Iframe API
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
                const baseSpeed = Math.min(2.0, playbackSpeed);
                e.target.setPlaybackRate(baseSpeed);
                if (selectedQuality !== 'auto') {
                  e.target.setPlaybackQuality(selectedQuality);
                }
              },
              onStateChange: (e: any) => {
                // 1 = PLAYING, 2 = PAUSED, 0 = ENDED
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

  // Periodic polling for YouTube player state & duration
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

  // 3.0x & 4.0x YouTube Speed Engine:
  // Since YouTube iframe API caps setPlaybackRate at 2.0x, when user selects > 2.0x (e.g. 3.0x or 4.0x):
  // We keep the player at 2.0x (maintaining audio decoding) and smoothly nudge the playhead forward
  // by (targetSpeed - 2.0) * intervalSeconds every 400ms!
  useEffect(() => {
    if (hyperSpeedIntervalRef.current) {
      clearInterval(hyperSpeedIntervalRef.current);
      hyperSpeedIntervalRef.current = null;
    }

    if (videoId && isPlaying && playbackSpeed > 2.0) {
      const intervalMs = 400;
      const extraSpeed = playbackSpeed - 2.0; // e.g. 1.0 for 3x, 2.0 for 4x
      const deltaSeconds = extraSpeed * (intervalMs / 1000);

      hyperSpeedIntervalRef.current = setInterval(() => {
        setCurrentTime((prevTime) => {
          const nextTime = Math.min(duration || 999999, prevTime + deltaSeconds);
          dispatchCommand('seekTo', [nextTime, true]);
          return nextTime;
        });
      }, intervalMs);
    }

    return () => {
      if (hyperSpeedIntervalRef.current) {
        clearInterval(hyperSpeedIntervalRef.current);
        hyperSpeedIntervalRef.current = null;
      }
    };
  }, [videoId, isPlaying, playbackSpeed, duration, dispatchCommand]);

  // Controls auto-hide timer management
  useEffect(() => {
    if (isPlaying) {
      resetHideTimer();
    } else {
      setControlsVisible(true);
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    }
  }, [isPlaying, resetHideTimer]);

  // Instant Play / Pause toggle with immediate 3s control bar visibility
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
      }
      return;
    }

    if (videoId) {
      if (isPlaying) {
        dispatchCommand('pauseVideo');
        setIsPlaying(false);
        setControlsVisible(true);
      } else {
        dispatchCommand('playVideo');
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
      dispatchCommand('seekTo', [newTime, true]);
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
      dispatchCommand('seekTo', [newTime, true]);
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
          dispatchCommand('setVolume', [newVol]);
        }
        setGestureFeedback({ type: 'volume', value: newVol });
      }
    }
  };

  // Screen Tap Engine:
  // 1. Single Tap: Toggles play/pause smoothly and shows control bar without any skip.
  // 2. Double Tap: ONLY when tapped twice in rapid succession (< 300ms):
  //    - Left side (< 48%): Rewind 10s (-10s)
  //    - Right side (> 52%): Fast-forward 10s (+10s)
  //    - Center: Toggle play/pause
  const handleScreenTap = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

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

      const relX = clientX - rect.left;
      if (relX < rect.width * 0.48) {
        // Double tap left: Rewind 10s
        handleSkipBackward();
      } else if (relX > rect.width * 0.52) {
        // Double tap right: Fast Forward 10s
        handleSkipForward();
      } else {
        // Double tap center: toggle controls visibility without pausing
        setControlsVisible(prev => {
          const next = !prev;
          if (next && isPlaying) resetHideTimer();
          return next;
        });
      }
      return;
    }

    // First tap: register timestamp and position, wait 280ms for potential second tap
    lastTapRef.current = { time: now, x: clientX, y: clientY };

    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current);
    }

    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null;
      lastTapRef.current = { time: 0, x: 0, y: 0 };
      // Single tap: Strictly toggle controls visibility! NEVER toggle play/pause!
      setControlsVisible(prev => {
        const next = !prev;
        if (next && isPlaying) {
          resetHideTimer();
        }
        return next;
      });
    }, 280);
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

  // Playback speed setter supporting 0.5x, 1.0x, 1.25x, 1.5x, 2.0x, 3.0x, 4.0x
  const handleSetSpeed = (speed: number) => {
    const clamped = Math.round(Math.min(4.0, Math.max(0.25, speed)) * 100) / 100;
    setPlaybackSpeed(clamped);

    if (isDirectVideo && html5VideoRef.current) {
      html5VideoRef.current.playbackRate = clamped;
    } else if (videoId) {
      // In YouTube iframe, set base rate up to 2.0x (max supported natively by YouTube API)
      const baseRate = Math.min(2.0, clamped);
      dispatchCommand('setPlaybackRate', [baseRate]);
    }
  };

  // Video Quality handler
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

  // Video player DOM
  const videoPlayerMarkup = (
    <div 
      ref={containerRef}
      onMouseMove={showControlsTemporarily}
      className={`relative w-full bg-black flex flex-col select-none overflow-hidden transition-all duration-300 ${
        isFullscreen 
          ? 'fixed inset-0 w-screen h-screen max-w-none rounded-none z-[9999] justify-between' 
          : 'w-full rounded-2xl border border-slate-800 shadow-2xl justify-center'
      }`}
      style={{ borderRadius: isFullscreen ? 0 : '16px' }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* Top Header Bar */}
      <div 
        className={`flex items-center justify-between px-4 py-3 z-30 transition-all duration-200 ${
          controlsVisible 
            ? 'opacity-100 translate-y-0' 
            : 'opacity-0 -translate-y-full pointer-events-none'
        } ${
          isFullscreen 
            ? 'absolute top-0 inset-x-0 bg-gradient-to-b from-black via-black/90 to-transparent pt-3 sm:pt-4' 
            : 'absolute top-0 inset-x-0 bg-gradient-to-b from-black via-black/90 to-transparent border-b border-white/5'
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
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Protected In-App Player</span>
            <span className="sm:hidden">Protected</span>
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

      {/* Video Stage Container: In Fullscreen, takes all vertical space and centers the 16:9 video box vertically and horizontally */}
      <div 
        className={`w-full flex items-center justify-center relative overflow-hidden bg-black ${
          isFullscreen ? 'flex-1 h-full' : ''
        }`}
      >
        {/* Video Canvas Container (16:9 aspect ratio, 100% width, centered) */}
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
          {/* Case 1: YouTube video - In-App Playback with 100% Brand Shielding */}
          {videoId && (
            <div className="absolute inset-0 w-full h-full overflow-hidden select-none pointer-events-none flex items-center justify-center bg-black">
              <iframe
                ref={iframeRef}
                id={uniquePlayerId.current}
                src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${hasStarted ? 1 : 0}&enablejsapi=1&rel=0&playsinline=1&modestbranding=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`}
                title={title}
                className="border-0 pointer-events-none select-none"
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  transform: 'scale(1.32)',
                  transformOrigin: 'center center',
                  pointerEvents: 'none',
                  userSelect: 'none'
                }}
                sandbox="allow-scripts allow-same-origin allow-presentation"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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

          {/* Case 3: Direct video file */}
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

          {/* Permanent Top Protective Mask: Prevents any background YouTube title or channel header bleed */}
          <div className="absolute top-0 inset-x-0 h-12 sm:h-14 bg-gradient-to-b from-black via-black/85 to-transparent pointer-events-none z-10" />

          {/* Permanent Bottom Protective Mask: Prevents any background YouTube logo or card shelf bleed */}
          <div className="absolute bottom-0 inset-x-0 h-12 sm:h-14 bg-gradient-to-t from-black via-black/85 to-transparent pointer-events-none z-10" />

          {/* Transparent DOM Shield Overlay: Captures Taps/Gestures and Blocks Third-Party Extension Interception */}
          {!isDriveVideo && (
            <div 
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onClick={handleMouseClick}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
              }}
              className="absolute inset-0 z-15 cursor-pointer pointer-events-auto"
              style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
            />
          )}

          {/* Initial Compact Start Button before starting (Smaller size, No 'Tap to Play Video' text) */}
          {!hasStarted && !isDriveVideo && (
            <div 
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-[1px] cursor-pointer group"
            >
              <div 
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full text-white flex items-center justify-center shadow-xl transition-all transform group-hover:scale-110 active:scale-95"
                style={{ 
                  backgroundColor: 'var(--theme-primary)',
                  boxShadow: '0 0 24px var(--theme-primary-glow)' 
                }}
              >
                <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-white ml-0.5" />
              </div>
            </div>
          )}

          {/* Double-Tap 10s Skip Feedback Overlay */}
          {skipFeedback && (
            <div 
              className={`absolute top-0 bottom-0 z-20 w-1/3 flex items-center justify-center pointer-events-none ${
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
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-black/85 backdrop-blur-md text-white shadow-2xl pointer-events-none border border-white/10 animate-in fade-in duration-150">
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

      {/* Bottom Control Bar - Auto-hides after 3s, reveals on screen tap */}
      {!isDriveVideo && (
        <div 
          className={`absolute bottom-0 inset-x-0 z-30 px-3 sm:px-5 py-2.5 sm:py-3 bg-gradient-to-t from-black/95 via-black/85 to-transparent text-white transition-all duration-200 ${
            controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none'
          } ${isFullscreen ? 'pb-3 sm:pb-5' : ''}`}
        >
          {/* Timeline Scrubber */}
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

          {/* Clean Controls Row (Separate 10s buttons removed for clean design) */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 sm:gap-3">
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

              {/* Volume & Mute */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMute();
                  }}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title={isMuted ? 'Unmute' : 'Mute'}
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

              {/* Time display */}
              <span className="font-mono text-[11px] text-slate-300">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Quality Selector Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.history.pushState({ modal: 'quality' }, '');
                  setShowQualityMenu(true);
                }}
                className="px-2 sm:px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono text-[11px] sm:text-xs flex items-center gap-1 transition-all cursor-pointer border border-white/10"
                title="Resolution & Quality"
              >
                <Settings className="w-3.5 h-3.5 text-blue-400" />
                <span>{currentQualityLabel}</span>
              </button>

              {/* Playback Speed Button (0.5x, 1.0x, 1.25x, 1.5x, 2.0x, 3.0x, 4.0x) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.history.pushState({ modal: 'speed' }, '');
                  setShowSpeedMenu(true);
                }}
                className="px-2 sm:px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-mono text-[11px] sm:text-xs flex items-center gap-1 transition-all cursor-pointer border border-white/10"
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
                className={`px-2 sm:px-2.5 py-1 rounded-lg text-white font-medium text-[11px] sm:text-xs flex items-center gap-1 transition-all cursor-pointer border ${
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
                className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors cursor-pointer"
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
          className={`absolute right-3 sm:right-5 w-80 max-w-[85%] bg-slate-900/95 backdrop-blur-md border border-white/15 rounded-2xl shadow-2xl z-40 flex flex-col overflow-hidden text-white animate-in slide-in-from-right duration-200 ${
            isFullscreen ? 'top-16 bottom-20' : 'top-12 bottom-16'
          }`}
        >
          {/* Panel Header */}
          <div className="p-3.5 border-b border-white/10 flex items-center justify-between bg-black/30">
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
          <form onSubmit={handleCreateNote} className="p-3 border-b border-white/10 space-y-2 bg-black/20">
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

      {/* PLAYBACK SPEED MODAL - Supports 0.5x, 1.0x, 1.25x, 1.5x, 2.0x, 3.0x, 4.0x accurately */}
      {showSpeedMenu && (
        <div 
          onClick={() => setShowSpeedMenu(false)}
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl text-white space-y-5 animate-in zoom-in-95 duration-150"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Gauge className="w-5 h-5 text-emerald-400" />
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
            <div className="text-center py-1">
              <span 
                className="text-4xl font-extrabold font-mono tracking-tight"
                style={{ color: 'var(--theme-primary)' }}
              >
                {playbackSpeed.toFixed(2)}x
              </span>
              <p className="text-xs text-slate-400 mt-1">
                Precision speed control from 0.5x up to 4.0x
              </p>
            </div>

            {/* Continuous Precision Slider: 0.25 to 4.0 */}
            <div className="space-y-1.5">
              <input
                type="range"
                min={0.25}
                max={4.0}
                step={0.05}
                value={playbackSpeed}
                onChange={(e) => handleSetSpeed(Number(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: 'var(--theme-primary)' }}
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono pt-1">
                <span>0.5x</span>
                <span>1.0x</span>
                <span>2.0x</span>
                <span>3.0x</span>
                <span>4.0x</span>
              </div>
            </div>

            {/* Minus / Plus fine-tuning */}
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

            {/* Quick Presets Grid (0.5x, 1.0x, 1.25x, 1.5x, 2.0x, 3.0x, 4.0x) */}
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

      {/* VIDEO QUALITY MODAL */}
      {showQualityMenu && (
        <div 
          onClick={() => setShowQualityMenu(false)}
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl text-white space-y-4 animate-in zoom-in-95 duration-150"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-base text-white">Video Quality</h3>
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

            {/* Close button */}
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
