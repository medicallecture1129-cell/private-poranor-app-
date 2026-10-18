import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { DiscussionMessage } from '../../types';
import { 
  subscribeDiscussions, 
  sendDiscussionMessage, 
  deleteDiscussionMessage, 
  deleteMultipleDiscussionMessages 
} from '../../services/db';
import { 
  Send, 
  Image as ImageIcon, 
  Camera, 
  Trash2, 
  CheckSquare, 
  Square, 
  RotateCw, 
  Sliders, 
  Crop,
  X, 
  Check, 
  Maximize2,
  UserCircle
} from 'lucide-react';
import { StudentProfileModal } from '../StudentProfileModal';

interface DiscussionRoomProps {
  courseId: string;
  courseName: string;
}

export const DiscussionRoom: React.FC<DiscussionRoomProps> = ({ courseId }) => {
  const { user, role } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [inspectStudentProfile, setInspectStudentProfile] = useState<{ name: string; college?: string; email?: string } | null>(null);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Admin Multi-select Delete Mode
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<string[]>([]);

  // Camera State
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);

  // Image Editor / Preview State
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [imageRotation, setImageRotation] = useState(0);
  const [imageBrightness, setImageBrightness] = useState(100);
  const [imageContrast, setImageContrast] = useState(100);
  const [imageGrayscale, setImageGrayscale] = useState(false);

  // Cropping State
  const [isCropMode, setIsCropMode] = useState(false);
  const [cropAspect, setCropAspect] = useState<'free' | '1:1' | '4:3' | '16:9'>('free');
  const [cropPercent, setCropPercent] = useState({ top: 10, bottom: 10, left: 10, right: 10 });

  // Interactive Crop Container & Drag Refs
  const cropContainerRef = useRef<HTMLDivElement | null>(null);
  const dragHandleRef = useRef<{
    type: 'tl' | 'tr' | 'bl' | 'br' | 'top' | 'bottom' | 'left' | 'right' | 'move';
    startX: number;
    startY: number;
    initialCrop: { top: number; bottom: number; left: number; right: number };
    containerRect: DOMRect;
  } | null>(null);

  const handleCropPointerDown = (
    e: React.PointerEvent,
    type: 'tl' | 'tr' | 'bl' | 'br' | 'top' | 'bottom' | 'left' | 'right' | 'move'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const container = cropContainerRef.current;
    if (!container) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    dragHandleRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: { ...cropPercent },
      containerRect: container.getBoundingClientRect()
    };
  };

  const handleCropPointerMove = (e: React.PointerEvent) => {
    if (!dragHandleRef.current) return;
    const { type, startX, startY, initialCrop, containerRect } = dragHandleRef.current;
    const dxPercent = ((e.clientX - startX) / containerRect.width) * 100;
    const dyPercent = ((e.clientY - startY) / containerRect.height) * 100;

    setCropPercent(() => {
      let { top, bottom, left, right } = initialCrop;

      if (type === 'move') {
        const boxWidth = 100 - left - right;
        const boxHeight = 100 - top - bottom;
        let newLeft = Math.max(0, Math.min(100 - boxWidth, left + dxPercent));
        let newTop = Math.max(0, Math.min(100 - boxHeight, top + dyPercent));
        return {
          left: Math.round(newLeft),
          right: Math.round(100 - newLeft - boxWidth),
          top: Math.round(newTop),
          bottom: Math.round(100 - newTop - boxHeight)
        };
      }

      if (type === 'tl' || type === 'top' || type === 'tr') {
        top = Math.max(0, Math.min(100 - bottom - 10, top + dyPercent));
      }
      if (type === 'bl' || type === 'bottom' || type === 'br') {
        bottom = Math.max(0, Math.min(100 - top - 10, bottom - dyPercent));
      }
      if (type === 'tl' || type === 'left' || type === 'bl') {
        left = Math.max(0, Math.min(100 - right - 10, left + dxPercent));
      }
      if (type === 'tr' || type === 'right' || type === 'br') {
        right = Math.max(0, Math.min(100 - left - 10, right - dxPercent));
      }

      return {
        top: Math.round(top),
        bottom: Math.round(bottom),
        left: Math.round(left),
        right: Math.round(right)
      };
    });
  };

  const handleCropPointerUp = (e: React.PointerEvent) => {
    if (dragHandleRef.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      dragHandleRef.current = null;
    }
  };

  const setPresetAspect = (aspect: 'free' | '1:1' | '4:3' | '16:9') => {
    setCropAspect(aspect);
    if (aspect === 'free') {
      setCropPercent({ top: 10, bottom: 10, left: 10, right: 10 });
    } else if (aspect === '1:1') {
      setCropPercent({ top: 10, bottom: 10, left: 20, right: 20 });
    } else if (aspect === '4:3') {
      setCropPercent({ top: 15, bottom: 15, left: 10, right: 10 });
    } else if (aspect === '16:9') {
      setCropPercent({ top: 20, bottom: 20, left: 8, right: 8 });
    }
  };

  // Fullscreen Image Lightbox
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Real-time Firestore subscription for discussions
  useEffect(() => {
    const unsub = subscribeDiscussions(
      courseId, 
      (msgs) => {
        setMessages(msgs);
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      },
      (err) => {
        toastError('Failed to sync discussion: ' + err.message);
      }
    );

    return () => unsub();
  }, [courseId, toastError]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Format Date for WhatsApp-style dividers
  const formatDateDivider = (timestamp: number): string => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const formatMessageTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  // Group messages by date
  const groupedMessages: { date: string; items: DiscussionMessage[] }[] = [];
  messages.forEach(msg => {
    const dateStr = formatDateDivider(msg.timestamp);
    const existing = groupedMessages.find(g => g.date === dateStr);
    if (existing) {
      existing.items.push(msg);
    } else {
      groupedMessages.push({ date: dateStr, items: [msg] });
    }
  });

  // Handle Text Message Send
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !user || isSending) return;

    const textToSend = inputText.trim();
    setInputText('');
    setIsSending(true);

    try {
      await sendDiscussionMessage({
        courseId,
        senderId: user.id,
        senderName: user.name,
        senderRole: role || (user as any).role || 'student',
        senderCollege: (user as any).college || '',
        text: textToSend
      });
    } catch (err: unknown) {
      console.error('Failed to send message:', err);
      toastError(err instanceof Error ? err.message : 'Failed to send message');
      setInputText(textToSend); // Restore on error
    } finally {
      setIsSending(false);
    }
  };

  // Open Live Camera
  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn('getUserMedia not supported or denied, triggering native camera input:', err);
      stopCamera();
      // Fallback: trigger phone's native camera input
      nativeCameraInputRef.current?.click();
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      stopCamera();
      setRawImageSrc(dataUrl);
      resetImageFilters();
    }
  };

  // File Upload (Gallery or Native Camera Capture)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setRawImageSrc(reader.result as string);
        resetImageFilters();
      };
      reader.readAsDataURL(file);
    }
    if (e.target) e.target.value = '';
  };

  const resetImageFilters = () => {
    setImageRotation(0);
    setImageBrightness(100);
    setImageContrast(100);
    setImageGrayscale(false);
    setIsCropMode(false);
    setCropPercent({ top: 10, bottom: 10, left: 10, right: 10 });
  };

  // Apply Crop on Image
  const applyCrop = () => {
    if (!rawImageSrc) return;
    const img = new Image();
    img.src = rawImageSrc;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const sx = (cropPercent.left / 100) * img.width;
      const sy = (cropPercent.top / 100) * img.height;
      const sw = img.width - sx - ((cropPercent.right / 100) * img.width);
      const sh = img.height - sy - ((cropPercent.bottom / 100) * img.height);

      canvas.width = Math.max(10, sw);
      canvas.height = Math.max(10, sh);

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

      setRawImageSrc(croppedDataUrl);
      setIsCropMode(false);
      setCropPercent({ top: 10, bottom: 10, left: 10, right: 10 });
      toastSuccess('Crop applied successfully.');
    };
  };

  // Apply Image Edits, Compress to Firestore Safe Size (<1MB), and Send
  const handleSendEditedImage = async () => {
    if (!rawImageSrc || !user) return;
    setIsSending(true);

    try {
      const img = new Image();
      img.src = rawImageSrc;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // Calculate compressed dimensions (max 900px to ensure base64 is ~80KB-150KB)
      const maxDim = 900;
      let targetWidth = img.width;
      let targetHeight = img.height;

      if (targetWidth > maxDim || targetHeight > maxDim) {
        if (targetWidth > targetHeight) {
          targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
          targetWidth = maxDim;
        } else {
          targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
          targetHeight = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');

      const isRotated = imageRotation % 180 !== 0;
      canvas.width = isRotated ? targetHeight : targetWidth;
      canvas.height = isRotated ? targetWidth : targetHeight;

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((imageRotation * Math.PI) / 180);

      // Filters
      let filterString = `brightness(${imageBrightness}%) contrast(${imageContrast}%)`;
      if (imageGrayscale) filterString += ' grayscale(100%)';
      ctx.filter = filterString;

      ctx.drawImage(img, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
      ctx.restore();

      // Compress JPEG to quality 0.75 for fast cloud sync
      const finalDataUrl = canvas.toDataURL('image/jpeg', 0.75);

      await sendDiscussionMessage({
        courseId,
        senderId: user.id,
        senderName: user.name,
        senderRole: role || (user as any).role || 'student',
        senderCollege: (user as any).college || '',
        imageUrl: finalDataUrl,
        text: inputText.trim() || ''
      });

      // Automatically close modal & reset
      setRawImageSrc(null);
      setInputText('');
      toastSuccess('Photo sent to discussion.');
    } catch (err: unknown) {
      console.error('Failed to send image:', err);
      toastError(err instanceof Error ? err.message : 'Failed to send image');
    } finally {
      setIsSending(false);
    }
  };

  // Admin Batch Deletion
  const toggleSelectMessage = (id: string) => {
    setSelectedMsgIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = async () => {
    if (selectedMsgIds.length === 0) return;
    if (window.confirm(`Delete ${selectedMsgIds.length} selected message(s)?`)) {
      try {
        await deleteMultipleDiscussionMessages(selectedMsgIds);
        toastSuccess(`${selectedMsgIds.length} message(s) deleted.`);
        setSelectedMsgIds([]);
        setIsSelectMode(false);
      } catch (err: unknown) {
        toastError(err instanceof Error ? err.message : 'Batch deletion failed');
      }
    }
  };

  return (
    <div className="flex flex-col h-[75vh] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
            Course Discussion Room
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {messages.length} message{messages.length === 1 ? '' : 's'} • Real-time cloud sync
          </p>
        </div>

        {/* Admin Controls */}
        {role === 'admin' && (
          <div className="flex items-center gap-2">
            {isSelectMode ? (
              <>
                <button
                  onClick={handleDeleteSelected}
                  disabled={selectedMsgIds.length === 0}
                  className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete ({selectedMsgIds.length})</span>
                </button>
                <button
                  onClick={() => {
                    setIsSelectMode(false);
                    setSelectedMsgIds([]);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsSelectMode(true)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Select multiple messages to delete"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Select to Delete</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <p className="text-sm">No messages yet in this discussion.</p>
            <p className="text-xs mt-1">Start the conversation with your classmates and teachers!</p>
          </div>
        ) : (
          groupedMessages.map((group) => (
            <div key={group.date} className="space-y-3">
              {/* WhatsApp-style Date Divider */}
              <div className="flex items-center justify-center my-3">
                <span className="px-3 py-1 rounded-full text-[11px] font-medium bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shadow-xs">
                  {group.date}
                </span>
              </div>

              {group.items.map((msg) => {
                const isMe = user?.id === msg.senderId;
                const isSelected = selectedMsgIds.includes(msg.id);

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2 group ${
                      isMe ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {/* Admin Multi-select Checkbox */}
                    {role === 'admin' && isSelectMode && (
                      <button
                        onClick={() => toggleSelectMessage(msg.id)}
                        className="mt-2 text-slate-400 hover:text-blue-500 cursor-pointer"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-500" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    )}

                    {/* Single Delete Button for Admin on hover */}
                    {role === 'admin' && !isSelectMode && (
                      <button
                        onClick={() => {
                          if (window.confirm('Delete this message?')) {
                            deleteDiscussionMessage(msg.id)
                              .then(() => toastSuccess('Message deleted.'))
                              .catch(err => toastError(err.message));
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-red-500 cursor-pointer self-center"
                        title="Delete Message"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Message Bubble */}
                    <div
                      className={`max-w-[82%] sm:max-w-md rounded-2xl p-3 shadow-xs transition-colors ${
                        isMe
                          ? 'bg-blue-600 text-white rounded-br-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 rounded-bl-xs'
                      }`}
                    >
                      {/* Sender Info */}
                      {!isMe && (
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-semibold text-blue-500 dark:text-blue-400">
                              {msg.senderName}
                            </span>
                            <button
                              onClick={() => {
                                window.history.pushState({ modal: 'profile' }, '');
                                setInspectStudentProfile({
                                  name: msg.senderName,
                                  college: msg.senderCollege
                                });
                              }}
                              className="p-0.5 text-slate-400 hover:text-blue-500 rounded transition-colors cursor-pointer"
                              title={role === 'admin' ? "শিক্ষার্থীর তথ্য দেখুন" : "প্রোফাইল কার্ড"}
                            >
                              <UserCircle className="w-3.5 h-3.5 text-blue-500/80 hover:text-blue-500" />
                            </button>
                          </div>
                          {msg.senderRole === 'admin' ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-300 font-bold">
                              Teacher
                            </span>
                          ) : msg.senderCollege ? (
                            <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                              • {msg.senderCollege}
                            </span>
                          ) : null}
                        </div>
                      )}

                      {/* Image Preview if present */}
                      {msg.imageUrl && (
                        <div className="relative mb-1.5 rounded-xl overflow-hidden bg-black/10 max-h-72 cursor-pointer">
                          <img
                            src={msg.imageUrl}
                            alt="Attached"
                            className="w-full object-cover rounded-xl hover:opacity-95 transition-opacity"
                            onClick={() => setLightboxImg(msg.imageUrl || null)}
                          />
                          <button
                            onClick={() => setLightboxImg(msg.imageUrl || null)}
                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white text-xs hover:bg-black/80"
                          >
                            <Maximize2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Text content */}
                      {msg.text && (
                        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                          {msg.text}
                        </p>
                      )}

                      {/* Timestamp */}
                      <div
                        className={`text-[10px] text-right mt-1 ${
                          isMe ? 'text-blue-100' : 'text-slate-400'
                        }`}
                      >
                        {formatMessageTime(msg.timestamp)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form
        onSubmit={handleSendMessage}
        className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
      >
        {/* Gallery File Input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Native Mobile Camera Input */}
        <input
          type="file"
          ref={nativeCameraInputRef}
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Camera Button */}
        <button
          type="button"
          onClick={startCamera}
          className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          title="Take Photo with Camera"
        >
          <Camera className="w-5 h-5" />
        </button>

        {/* Gallery / Image Upload */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          title="Upload Image"
        >
          <ImageIcon className="w-5 h-5" />
        </button>

        {/* Message Input */}
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 px-4 py-2 text-sm bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl border border-transparent focus:border-blue-500 focus:outline-none"
        />

        {/* Send Button */}
        <button
          type="submit"
          disabled={!inputText.trim() || isSending}
          className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-40 transition-colors shadow-xs cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      {/* Live Camera Capture Modal */}
      {showCamera && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90">
          <div className="relative w-full max-w-lg bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 p-4 flex flex-col items-center">
            <div className="w-full flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-white text-sm font-semibold">Take Camera Photo</span>
              <button
                onClick={stopCamera}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="w-full aspect-video bg-black rounded-xl overflow-hidden my-4 relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={capturePhoto}
                className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center ring-4 ring-blue-500 hover:scale-105 transition-transform cursor-pointer"
              >
                <Camera className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  nativeCameraInputRef.current?.click();
                }}
                className="text-xs text-blue-400 hover:underline cursor-pointer"
              >
                Use Device Camera App
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Editor Modal with Crop, Filters, and Safe Cloud Send */}
      {rawImageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl p-5 flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-500" />
                <h4 className="font-semibold text-sm text-slate-900 dark:text-white">
                  Edit & Crop Photo
                </h4>
              </div>

              {/* Mode switch: Crop vs Adjustments */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsCropMode(!isCropMode)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                    isCropMode ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Crop className="w-3.5 h-3.5" />
                  <span>{isCropMode ? 'Exit Crop' : 'Crop Image'}</span>
                </button>
                <button
                  onClick={() => setRawImageSrc(null)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Image Preview Canvas Area */}
            <div className="flex-1 my-3 flex items-center justify-center bg-slate-900 rounded-xl overflow-hidden p-2 min-h-[260px] relative select-none">
              <div 
                ref={cropContainerRef} 
                className="relative inline-block max-w-full max-h-[300px]"
                onPointerMove={isCropMode ? handleCropPointerMove : undefined}
                onPointerUp={isCropMode ? handleCropPointerUp : undefined}
                onPointerCancel={isCropMode ? handleCropPointerUp : undefined}
              >
                <img
                  src={rawImageSrc}
                  alt="Editor preview"
                  draggable={false}
                  style={{
                    transform: `rotate(${imageRotation}deg)`,
                    filter: `brightness(${imageBrightness}%) contrast(${imageContrast}%) ${imageGrayscale ? 'grayscale(100%)' : ''}`,
                    maxHeight: '280px',
                    objectFit: 'contain'
                  }}
                  className="transition-all duration-150 rounded pointer-events-none select-none block"
                />

                {/* Hand/Finger Interactive Crop Overlay Box (NO slide bars!) */}
                {isCropMode && (
                  <div className="absolute inset-0 touch-none pointer-events-auto">
                    {/* Dark translucent shaded masks around the crop box */}
                    <div 
                      className="absolute inset-x-0 top-0 bg-black/60 pointer-events-none" 
                      style={{ height: `${cropPercent.top}%` }} 
                    />
                    <div 
                      className="absolute inset-x-0 bottom-0 bg-black/60 pointer-events-none" 
                      style={{ height: `${cropPercent.bottom}%` }} 
                    />
                    <div 
                      className="absolute bg-black/60 pointer-events-none" 
                      style={{
                        top: `${cropPercent.top}%`,
                        bottom: `${cropPercent.bottom}%`,
                        left: 0,
                        width: `${cropPercent.left}%`
                      }} 
                    />
                    <div 
                      className="absolute bg-black/60 pointer-events-none" 
                      style={{
                        top: `${cropPercent.top}%`,
                        bottom: `${cropPercent.bottom}%`,
                        right: 0,
                        width: `${cropPercent.right}%`
                      }} 
                    />

                    {/* Draggable Active Crop Frame */}
                    <div 
                      className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)] cursor-move select-none"
                      style={{
                        top: `${cropPercent.top}%`,
                        bottom: `${cropPercent.bottom}%`,
                        left: `${cropPercent.left}%`,
                        right: `${cropPercent.right}%`
                      }}
                      onPointerDown={(e) => handleCropPointerDown(e, 'move')}
                    >
                      {/* Rule of thirds grid lines */}
                      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
                        <div className="border-r border-b border-white" />
                        <div className="border-r border-b border-white" />
                        <div className="border-b border-white" />
                        <div className="border-r border-b border-white" />
                        <div className="border-r border-b border-white" />
                        <div className="border-b border-white" />
                        <div className="border-r border-white" />
                        <div className="border-r border-white" />
                        <div />
                      </div>

                      {/* Top Edge Handle */}
                      <div
                        className="absolute -top-3 left-1/2 -translate-x-1/2 w-12 h-6 cursor-ns-resize flex items-center justify-center touch-none z-20"
                        onPointerDown={(e) => handleCropPointerDown(e, 'top')}
                        title="Drag Top Margin"
                      >
                        <div className="w-8 h-1.5 bg-white rounded-full shadow-md border border-slate-400" />
                      </div>

                      {/* Bottom Edge Handle */}
                      <div
                        className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-12 h-6 cursor-ns-resize flex items-center justify-center touch-none z-20"
                        onPointerDown={(e) => handleCropPointerDown(e, 'bottom')}
                        title="Drag Bottom Margin"
                      >
                        <div className="w-8 h-1.5 bg-white rounded-full shadow-md border border-slate-400" />
                      </div>

                      {/* Left Edge Handle */}
                      <div
                        className="absolute -left-3 top-1/2 -translate-y-1/2 h-12 w-6 cursor-ew-resize flex items-center justify-center touch-none z-20"
                        onPointerDown={(e) => handleCropPointerDown(e, 'left')}
                        title="Drag Left Margin"
                      >
                        <div className="h-8 w-1.5 bg-white rounded-full shadow-md border border-slate-400" />
                      </div>

                      {/* Right Edge Handle */}
                      <div
                        className="absolute -right-3 top-1/2 -translate-y-1/2 h-12 w-6 cursor-ew-resize flex items-center justify-center touch-none z-20"
                        onPointerDown={(e) => handleCropPointerDown(e, 'right')}
                        title="Drag Right Margin"
                      >
                        <div className="h-8 w-1.5 bg-white rounded-full shadow-md border border-slate-400" />
                      </div>

                      {/* 4 Corner Touch Handles */}
                      <div
                        className="absolute -top-3 -left-3 w-8 h-8 cursor-nwse-resize flex items-center justify-center touch-none z-30"
                        onPointerDown={(e) => handleCropPointerDown(e, 'tl')}
                        title="Drag Corner"
                      >
                        <div className="w-4 h-4 bg-white border-2 border-blue-600 rounded-full shadow-lg" />
                      </div>

                      <div
                        className="absolute -top-3 -right-3 w-8 h-8 cursor-nesw-resize flex items-center justify-center touch-none z-30"
                        onPointerDown={(e) => handleCropPointerDown(e, 'tr')}
                        title="Drag Corner"
                      >
                        <div className="w-4 h-4 bg-white border-2 border-blue-600 rounded-full shadow-lg" />
                      </div>

                      <div
                        className="absolute -bottom-3 -left-3 w-8 h-8 cursor-nesw-resize flex items-center justify-center touch-none z-30"
                        onPointerDown={(e) => handleCropPointerDown(e, 'bl')}
                        title="Drag Corner"
                      >
                        <div className="w-4 h-4 bg-white border-2 border-blue-600 rounded-full shadow-lg" />
                      </div>

                      <div
                        className="absolute -bottom-3 -right-3 w-8 h-8 cursor-nwse-resize flex items-center justify-center touch-none z-30"
                        onPointerDown={(e) => handleCropPointerDown(e, 'br')}
                        title="Drag Corner"
                      >
                        <div className="w-4 h-4 bg-white border-2 border-blue-600 rounded-full shadow-lg" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Crop Mode Controls: Aspect Ratios & Apply (NO Slide Bars!) */}
            {isCropMode ? (
              <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs text-slate-600 dark:text-slate-300">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Ratio:</span>
                    {(['free', '1:1', '4:3', '16:9'] as const).map((asp) => (
                      <button
                        key={asp}
                        type="button"
                        onClick={() => setPresetAspect(asp)}
                        className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                          cropAspect === asp
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {asp === 'free' ? 'Free' : asp}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCropPercent({ top: 10, bottom: 10, left: 10, right: 10 })}
                      className="px-2.5 py-1 text-slate-500 hover:text-slate-800 dark:hover:text-white underline cursor-pointer"
                    >
                      Reset Margin
                    </button>
                    <button
                      type="button"
                      onClick={applyCrop}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Check className="w-4 h-4" />
                      <span>Apply Crop</span>
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                  Tip: Touch and drag the blue-corner dots or edges with your hand to adjust the crop margins freely.
                </p>
              </div>
            ) : (
              /* Filter / Adjustment Tools */
              <div className="space-y-2.5 px-1 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center justify-between gap-4">
                  <span>Brightness ({imageBrightness}%)</span>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={imageBrightness}
                    onChange={(e) => setImageBrightness(Number(e.target.value))}
                    className="w-48 accent-blue-600"
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span>Contrast ({imageContrast}%)</span>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={imageContrast}
                    onChange={(e) => setImageContrast(Number(e.target.value))}
                    className="w-48 accent-blue-600"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setImageRotation((prev) => (prev + 90) % 360)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Rotate 90°</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setImageGrayscale(!imageGrayscale)}
                      className={`px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                        imageGrayscale
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      B&W
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={resetImageFilters}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}

            {/* Actions: Cancel & Send Photo */}
            <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setRawImageSrc(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendEditedImage}
                disabled={isSending}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSending ? 'Compressing & Sending...' : 'Send Photo'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md cursor-zoom-out"
          onClick={() => setLightboxImg(null)}
        >
          <img
            src={lightboxImg}
            alt="Fullscreen view"
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}

      {/* Student Profile Modal */}
      {inspectStudentProfile && (
        <StudentProfileModal
          student={inspectStudentProfile}
          onClose={() => setInspectStudentProfile(null)}
        />
      )}
    </div>
  );
};
