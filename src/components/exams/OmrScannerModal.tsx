import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { Exam, StudentUser, OfflineExamSet, ExamSubmission, StudentAnswer } from '../../types';
import { submitExamAnswers, addNotification } from '../../services/db';
import { generateShuffledSet, toBengaliNumber } from '../../utils/omrPdfGenerator';
import { 
  processOmrImageComputerVision, 
  detectCornerRegistrationMarkers, 
  CANONICAL_WIDTH, 
  CANONICAL_HEIGHT,
  OmrScanDetectionResult
} from '../../utils/omrCvEngine';
import { useToast } from '../../context/ToastContext';
import { 
  Camera, 
  Upload, 
  CheckCircle2, 
  X, 
  AlertCircle, 
  Scan, 
  UserCheck, 
  Sparkles, 
  Check, 
  Send,
  Trophy,
  Award,
  QrCode,
  Lock,
  ShieldCheck,
  Eye,
  FileCheck
} from 'lucide-react';

interface OmrScannerModalProps {
  exam: Exam;
  students: StudentUser[];
  isOpen: boolean;
  onClose: () => void;
  onSubmissionCreated?: (submission: ExamSubmission) => void;
}

export const OmrScannerModal: React.FC<OmrScannerModalProps> = ({
  exam,
  students,
  isOpen,
  onClose,
  onSubmissionCreated
}) => {
  const { success: toastSuccess, error: toastError } = useToast();

  const [activeMode, setActiveMode] = useState<'camera' | 'upload' | 'results'>('camera');
  const [selectedSetCode, setSelectedSetCode] = useState<string>('');
  const [detectedQrData, setDetectedQrData] = useState<string | null>(null);
  
  // Student identification
  const [rollNoInput, setRollNoInput] = useState<string>('');
  const [matchedStudent, setMatchedStudent] = useState<StudentUser | null>(null);

  // Student's marked bubbles on this OMR sheet: { [questionNumber]: 'A' | 'B' | 'C' | 'D' | null }
  // READ-ONLY and LOCKED once evaluated by Computer Vision!
  const [markedAnswers, setMarkedAnswers] = useState<Record<number, 'A' | 'B' | 'C' | 'D' | null>>({});
  const [multipleMarkedList, setMultipleMarkedList] = useState<number[]>([]);
  const [scanConfidence, setScanConfidence] = useState<number>(0);
  const [cvErrorMessage, setCvErrorMessage] = useState<string | null>(null);

  // Camera stream refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [liveMarkersFound, setLiveMarkersFound] = useState<boolean>(false);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  // Determine available set codes from exam
  const availableSetCodes = React.useMemo(() => {
    if (exam.offlineSets && exam.offlineSets.length > 0) {
      return exam.offlineSets.map(s => s.setCode);
    }
    return ['Set-1', 'Set-2', 'Set-A', 'Set-B'];
  }, [exam]);

  // Set default set code
  useEffect(() => {
    if (!selectedSetCode && availableSetCodes.length > 0) {
      setSelectedSetCode(availableSetCodes[0]);
    }
  }, [availableSetCodes, selectedSetCode]);

  // Current set for selectedSetCode
  const currentSet: OfflineExamSet = React.useMemo(() => {
    const code = selectedSetCode || availableSetCodes[0] || 'Set-1';
    if (exam.offlineSets && exam.offlineSets.length > 0) {
      const found = exam.offlineSets.find(s => s.setCode === code);
      if (found) return found;
    }
    return generateShuffledSet(exam, code);
  }, [exam, selectedSetCode, availableSetCodes]);

  // Auto-match student by 6-digit roll number or email or id
  useEffect(() => {
    if (!rollNoInput.trim()) {
      setMatchedStudent(null);
      return;
    }
    const cleanRoll = rollNoInput.trim().toLowerCase();
    const student = students.find(s => 
      (s.rollNo && s.rollNo.toLowerCase() === cleanRoll) ||
      s.id.toLowerCase() === cleanRoll ||
      s.id.toLowerCase().endsWith(cleanRoll) ||
      (s.email && s.email.toLowerCase() === cleanRoll)
    );

    if (student) {
      setMatchedStudent(student);
    } else {
      setMatchedStudent(null);
    }
  }, [rollNoInput, students]);

  // Camera lifecycle
  useEffect(() => {
    if (isOpen && activeMode === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, activeMode]);

  const startCamera = async () => {
    setCameraError(null);
    setCvErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: { ideal: 'environment' }, 
          width: { ideal: 1280 }, 
          height: { ideal: 720 } 
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
      runLiveFrameLoop();
    } catch (err: unknown) {
      console.warn('Camera start error:', err);
      setCameraError('ক্যামেরা চালু করা সম্ভব হয়নি। অনুগ্রহ করে ওএমআরের ছবি আপলোড অপশনটি ব্যবহার করুন।');
      setActiveMode('upload');
    }
  };

  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // Live video frame QR & marker checker
  const runLiveFrameLoop = () => {
    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      animFrameRef.current = requestAnimationFrame(runLiveFrameLoop);
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        
        // Scan QR Code
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height, {
          inversionAttempts: 'dontInvert'
        });

        if (code && code.data) {
          handleDetectedQrData(code.data);
        }

        // Check if 4 registration markers are within view
        const markers = detectCornerRegistrationMarkers(canvas);
        setLiveMarkersFound(!!markers);
      }
    } catch (err) {
      console.warn('Live loop notice:', err);
    }

    animFrameRef.current = requestAnimationFrame(runLiveFrameLoop);
  };

  // Process decoded QR payload with strict validation
  const handleDetectedQrData = (rawData: string) => {
    if (detectedQrData === rawData) return;
    setDetectedQrData(rawData);

    let parsedExamId: string | null = null;
    let setCode: string | null = null;

    // Format: OMR:examId:setCode or UNMESH:SET:examId:setCode
    if (rawData.startsWith('OMR:') || rawData.startsWith('UNMESH:')) {
      const parts = rawData.split(':');
      if (parts.length >= 3) {
        parsedExamId = parts[1];
        setCode = parts[2];
      } else {
        setCode = parts[parts.length - 1];
      }
    } else {
      // JSON format
      try {
        const parsed = JSON.parse(rawData);
        if (parsed.examId) parsedExamId = parsed.examId;
        if (parsed.set || parsed.s) {
          setCode = parsed.set || parsed.s;
        }
      } catch {
        const match = rawData.match(/SET-?([A-Za-z0-9_-]+)/i);
        if (match && match[1]) {
          setCode = `Set-${match[1]}`;
        }
      }
    }

    // Step 2 Validation: Check if QR matches this exam and has a valid answer key
    if (parsedExamId && parsedExamId !== exam.id && !exam.id.includes(parsedExamId) && !parsedExamId.includes(exam.id.slice(0, 16))) {
      toastError(`Invalid or Unregistered Question Set QR: এই কিউআর কোডটি অন্য কোনো পরীক্ষার (ID: ${parsedExamId.slice(0, 8)})!`);
      return;
    }

    if (!setCode) {
      toastError('Invalid or Unregistered Question Set QR: কিউআর কোডে কোনো সেট শনাক্ত করা যায়নি!');
      return;
    }

    setSelectedSetCode(setCode);
    toastSuccess(`✓ কিউআর কোড স্ক্যান সম্পন্ন! সেট: ${setCode}`);
  };

  // Capture photo from video stream and execute Computer Vision evaluation
  const capturePhotoAndEvaluate = () => {
    if (!videoRef.current) return;
    setCvErrorMessage(null);

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const photoUrl = canvas.toDataURL('image/jpeg', 0.95);
    setCapturedPhotoUrl(photoUrl);

    // Check QR in captured photo
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(imgData.data, imgData.width, imgData.height);
      if (qr && qr.data) {
        handleDetectedQrData(qr.data);
      }
    } catch (e) {
      console.warn('QR decode on capture failed:', e);
    }

    stopCamera();

    // Execute Rigid Computer Vision Pipeline
    executeComputerVisionPipeline(canvas);
  };

  // Upload photo handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCvErrorMessage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setCapturedPhotoUrl(dataUrl);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);

          try {
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const qr = jsQR(imgData.data, imgData.width, imgData.height);
            if (qr && qr.data) {
              handleDetectedQrData(qr.data);
            }
          } catch (err) {
            console.warn('QR read failed on uploaded image:', err);
          }

          executeComputerVisionPipeline(canvas);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  /**
   * RIGID COMPUTER VISION EVALUATION PIPELINE:
   * 1. Anchor Point & Grid Detection (4 corner black registration squares).
   * 2. Perspective warp to canonical standard.
   * 3. Student ID evaluation.
   * 4. 100 questions thresholding (>60% dark pixel density).
   * 5. If markers missing/hand in the way: rigid rejection.
   */
  const executeComputerVisionPipeline = (sourceCanvas: HTMLCanvasElement) => {
    const cvResult: OmrScanDetectionResult = processOmrImageComputerVision(sourceCanvas);

    if (!cvResult.success || !cvResult.markersFound) {
      setCvErrorMessage(
        cvResult.errorMessage || 
        'No valid OMR grid detected — ওএমআর শিটের ৪টি কর্নার মার্কার (Black Registration Squares) সঠিকভাবে সনাক্ত করা যায়নি। অনুগ্রহ করে শিটটি সোজাভাবে ফ্রেমে রাখুন (হাতের আঙুল বা ছায়া যেন কোণায় না থাকে)।'
      );
      toastError('ওএমআর কর্নার মার্কার সনাক্ত করা যায়নি!');
      return;
    }

    // Set auto-decoded Student ID if found
    if (cvResult.studentId) {
      setRollNoInput(cvResult.studentId);
    }

    setMarkedAnswers(cvResult.markedAnswers);
    setMultipleMarkedList(cvResult.multipleMarkedQuestions);
    setScanConfidence(cvResult.confidenceScore);
    setActiveMode('results');
    toastSuccess('✓ ওএমআর শিট সফলভাবে মূল্যায়ন ও লক করা হয়েছে!');
  };

  // Score Calculation based on exact Answer Key mapping
  const totalQuestions = currentSet.questions.length;
  const markPerQ = exam.markPerQuestion || (exam.totalMarks / (totalQuestions || 1));
  const penalty = markPerQ * (exam.negativeMarkPercentage !== undefined ? exam.negativeMarkPercentage : 0.25);

  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;

  currentSet.questions.forEach((q) => {
    const marked = markedAnswers[q.questionNumber];
    if (!marked) {
      skippedCount++;
    } else if (marked === currentSet.answerKey[q.questionNumber]) {
      correctCount++;
    } else {
      wrongCount++;
    }
  });

  const rawScore = correctCount * markPerQ - wrongCount * penalty;
  const marksObtained = Math.max(0, Number(rawScore.toFixed(2)));
  const percentage = (marksObtained / (exam.totalMarks || 1)) * 100;
  const isPassed = marksObtained >= (exam.passMark || (exam.totalMarks * 0.4));

  // Publish to Database and Student Profile
  const handlePublishEvaluation = async () => {
    if (!rollNoInput.trim()) {
      toastError('অনুগ্রহ করে শিক্ষার্থীর রোল নম্বর / আইডি যাচাই করুন');
      return;
    }

    setIsEvaluating(true);
    try {
      const targetStudent = matchedStudent || students.find(s => s.rollNo === rollNoInput.trim());
      const studentId = targetStudent ? targetStudent.id : `student_roll_${rollNoInput.trim()}`;
      const studentName = targetStudent ? targetStudent.name : `শিক্ষার্থী (আইডি: ${rollNoInput.trim()})`;
      const studentEmail = targetStudent?.email || `${rollNoInput.trim()}@examportal.com`;

      const answers: StudentAnswer[] = currentSet.questions.map((q) => {
        const selected = markedAnswers[q.questionNumber] || null;
        const correct = currentSet.answerKey[q.questionNumber];
        const isCorrect = selected === correct;
        const marksEarned = !selected ? 0 : isCorrect ? markPerQ : -penalty;
        return {
          questionId: q.masterQuestionId || `q_${q.questionNumber}`,
          selectedOption: selected,
          isCorrect,
          marksEarned
        };
      });

      const submissionData: Omit<ExamSubmission, 'id'> = {
        examId: exam.id,
        studentId: studentId,
        studentName: studentName,
        studentEmail: studentEmail,
        studentCollege: targetStudent?.college || 'অফলাইন পরীক্ষার্থী',
        rollNo: rollNoInput.trim(),
        courseId: exam.courseId,
        marksObtained: marksObtained,
        totalMarks: exam.totalMarks,
        correctCount: correctCount,
        wrongCount: wrongCount,
        skippedCount: skippedCount,
        percentage: Number(percentage.toFixed(1)),
        isLive: true,
        isOfflineOMR: true,
        setCode: currentSet.setCode,
        startTime: Date.now() - (exam.durationMinutes * 60 * 1000),
        submittedAt: Date.now(),
        durationSeconds: exam.durationMinutes * 60,
        answers: answers
      };

      const savedSub = await submitExamAnswers(submissionData);

      // In-app notification to student
      await addNotification({
        title: `ওএমআর রেজাল্ট প্রকাশিত: ${exam.title}`,
        message: `আপনার অফলাইন ওএমআর শিট (সেট: ${currentSet.setCode}) মূল্যায়ন সম্পন্ন হয়েছে! প্রাপ্ত নম্বর: ${marksObtained} / ${exam.totalMarks} (${isPassed ? 'পাস' : 'ফেল'})।`,
        type: 'result',
        linkTab: 'results',
        read: false
      });

      toastSuccess(`ফলাফল সফলভাবে "${studentName}" এর প্রোফাইলে ও লিডারবোর্ডে যুক্ত হয়েছে!`);
      if (onSubmissionCreated) onSubmissionCreated(savedSub);
      onClose();
    } catch (err: unknown) {
      console.error('Publish error:', err);
      toastError(err instanceof Error ? err.message : 'ফলাফল সংরক্ষণ করতে সমস্যা হয়েছে');
    } finally {
      setIsEvaluating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-5xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-gradient-to-r from-red-900/10 via-rose-900/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-600/30">
              <Scan className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 text-[10px] font-extrabold uppercase tracking-wider">
                  Unmesh Style Computer Vision OMR Engine
                </span>
                <span className="text-xs text-slate-400">• ৪-পয়েন্ট অ্যাঙ্কর ডিটেকশন ও লকড রেজাল্ট</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-0.5">
                {exam.title}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-slate-50/50 dark:bg-slate-900/50 overflow-x-auto">
          <button
            onClick={() => setActiveMode('camera')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeMode === 'camera'
                ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>ক্যামেরা ভিউফাইন্ডার ও কর্নার ডিটেক্টর</span>
          </button>

          <button
            onClick={() => setActiveMode('upload')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeMode === 'upload'
                ? 'border-red-600 text-red-600 dark:text-red-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>ওএমআরের ছবি আপলোড</span>
          </button>

          {activeMode === 'results' && (
            <button
              onClick={() => setActiveMode('results')}
              className="pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 border-red-600 text-red-600 dark:text-red-400 flex items-center gap-2 cursor-pointer shrink-0"
            >
              <Lock className="w-4 h-4" />
              <span>লকড ফলাফল ও বাবল প্রিভিউ (Read-Only)</span>
            </button>
          )}
        </div>

        {/* Body Content */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          
          {/* Error Message if Anchor Points / Markers Missing */}
          {cvErrorMessage && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800/60 flex items-start gap-3 text-red-700 dark:text-red-300 text-xs">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
              <div className="space-y-1">
                <span className="font-extrabold text-sm block">ওএমআর গ্রিড সনাক্তকরণ ব্যর্থ (Grid Detection Error)</span>
                <p className="leading-relaxed">{cvErrorMessage}</p>
              </div>
            </div>
          )}

          {/* MODE 1: CAMERA SCANNER WITH RIGID 4-CORNER VIEWFINDER */}
          {activeMode === 'camera' && (
            <div className="space-y-4">
              <div className="relative aspect-video max-w-2xl mx-auto rounded-3xl overflow-hidden bg-black border-2 border-slate-800 shadow-2xl flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Strict 4-Corner Anchor Viewfinder Overlay */}
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-6">
                  
                  {/* 4 Corner Markers Indicators */}
                  <div className="w-full flex justify-between">
                    <div className={`w-8 h-8 border-t-4 border-l-4 rounded-tl-lg transition-colors ${liveMarkersFound ? 'border-emerald-400 bg-emerald-400/20' : 'border-red-500'}`} />
                    <div className={`w-8 h-8 border-t-4 border-r-4 rounded-tr-lg transition-colors ${liveMarkersFound ? 'border-emerald-400 bg-emerald-400/20' : 'border-red-500'}`} />
                  </div>

                  {/* Center Guidance Box */}
                  <div className="border border-white/40 bg-black/40 backdrop-blur-xs px-4 py-2 rounded-2xl text-center text-white text-xs max-w-sm">
                    {liveMarkersFound ? (
                      <span className="text-emerald-300 font-extrabold flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>✓ ৪টি কর্নার মার্কার সনাক্ত হয়েছে! এবার ছবি তুলুন</span>
                      </span>
                    ) : (
                      <span>
                        ওএমআরের ৪টি কোণার <strong>কালো মার্কার বক্স</strong> ফ্রেমের ভেতরে রাখুন
                      </span>
                    )}
                  </div>

                  <div className="w-full flex justify-between">
                    <div className={`w-8 h-8 border-b-4 border-l-4 rounded-bl-lg transition-colors ${liveMarkersFound ? 'border-emerald-400 bg-emerald-400/20' : 'border-red-500'}`} />
                    <div className={`w-8 h-8 border-b-4 border-r-4 rounded-br-lg transition-colors ${liveMarkersFound ? 'border-emerald-400 bg-emerald-400/20' : 'border-red-500'}`} />
                  </div>
                </div>

                {!isCameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-white p-6 text-center space-y-3">
                    <Camera className="w-12 h-12 text-slate-500 animate-pulse" />
                    <p className="text-sm font-semibold">{cameraError || 'ক্যামেরা চালু করা হচ্ছে...'}</p>
                    <button
                      onClick={startCamera}
                      className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs cursor-pointer shadow-md"
                    >
                      ক্যামেরা পুনরায় চালু করুন
                    </button>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
                <button
                  type="button"
                  onClick={capturePhotoAndEvaluate}
                  className="w-full py-3 px-6 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black text-sm shadow-xl shadow-red-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Scan className="w-5 h-5" />
                  <span>ওএমআর শিটের ছবি তুলুন ও মূল্যায়ন করুন</span>
                </button>
              </div>
            </div>
          )}

          {/* MODE 2: UPLOAD IMAGE */}
          {activeMode === 'upload' && (
            <div className="max-w-xl mx-auto space-y-4">
              <label className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-red-500 dark:hover:border-red-400 bg-slate-50/50 dark:bg-slate-800/40 transition-colors">
                <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 flex items-center justify-center mb-3 shadow-md">
                  <Upload className="w-8 h-8" />
                </div>
                <h4 className="font-bold text-base text-slate-900 dark:text-white">
                  ওএমআর শিটের পরিষ্কার ছবি আপলোড করুন
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                  কম্পিউটার ভিশন ইঞ্জিন শিটের ৪টি কর্নার মার্কার ও কিউআর কোড বিশ্লেষণ করে স্বয়ংক্রিয়ভাবে খাতা মূল্যায়ন করবে।
                </p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <span className="mt-4 px-5 py-2.5 rounded-xl bg-red-600 text-white font-bold text-xs shadow-md">
                  গ্যালারি / ডিভাইস থেকে ছবি বাছুন
                </span>
              </label>
            </div>
          )}

          {/* MODE 3: LOCKED RESULTS REVIEW (STRICTLY READ-ONLY) */}
          {activeMode === 'results' && (
            <div className="space-y-5">
              
              {/* UI LOCKING BANNER */}
              <div className="p-3.5 rounded-2xl bg-slate-900 text-white flex items-center justify-between gap-3 text-xs border border-slate-700 shadow-md">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="font-bold text-slate-200">
                    লকড ওএমআর মূল্যায়ন প্রিভিউ (Read-Only): খাতার বৃত্ত ভরাট কম্পিউটার ভিশন দ্বারা লক করা হয়েছে, কোনো ম্যানুয়াল পরিবর্তন প্রযোজ্য নয়।
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-[11px] font-mono text-emerald-300 font-bold">
                    কনফিডেন্স: {Math.round(scanConfidence * 100)}%
                  </span>
                </div>
              </div>

              {/* Student Identification & Score Summary */}
              <div className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  
                  {/* Decoded Set Code */}
                  <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">সেট কোড (Decoded Set)</span>
                    <span className="text-base font-black font-mono text-red-600 dark:text-red-400 mt-0.5 block">
                      {currentSet.setCode}
                    </span>
                  </div>

                  {/* Student ID (Auto-decoded from OMR bubble grid) */}
                  <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">স্টুডেন্ট আইডি (Student ID)</span>
                    <span className="text-base font-black font-mono text-slate-900 dark:text-white mt-0.5 block">
                      {rollNoInput || 'ডিটেক্টেড হয়নি'}
                    </span>
                  </div>

                  {/* Matched Profile */}
                  <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">শিক্ষার্থীর নাম</span>
                    <span className="text-sm font-black text-slate-900 dark:text-white mt-0.5 block truncate">
                      {matchedStudent ? matchedStudent.name : 'অফলাইন পরীক্ষার্থী'}
                    </span>
                    <span className="text-[10px] text-slate-500 block truncate">
                      {matchedStudent?.college || 'প্রতিষ্ঠান'}
                    </span>
                  </div>

                </div>

                {/* Score Breakdown */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-400 font-bold block">সঠিক উত্তর (+{markPerQ.toFixed(1)})</span>
                    <span className="text-lg font-black text-emerald-600">{correctCount} টি</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-400 font-bold block">ভুল উত্তর (-{penalty.toFixed(2)})</span>
                    <span className="text-lg font-black text-rose-600">{wrongCount} টি</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] text-slate-400 font-bold block">বাদ দেওয়া</span>
                    <span className="text-lg font-black text-slate-500">{skippedCount} টি</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800">
                    <span className="text-[10px] text-red-700 dark:text-red-300 font-bold block">চূড়ান্ত প্রাপ্ত নম্বর</span>
                    <span className="text-xl font-black text-red-700 dark:text-red-300 font-mono">
                      {marksObtained} / {exam.totalMarks}
                    </span>
                  </div>
                </div>

              </div>

              {/* 100 QUESTIONS OMR BUBBLE GRID: STRICTLY READ-ONLY AND LOCKED */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <Lock className="w-4 h-4 text-red-600" />
                    <span>১০০টি ওএমআর বাবল শিট (Read-Only Locked Preview)</span>
                  </h4>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1 text-emerald-600 font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                      <span>সঠিক উত্তর</span>
                    </span>
                    <span className="flex items-center gap-1 text-rose-600 font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                      <span>ভুল উত্তর</span>
                    </span>
                    <span className="flex items-center gap-1 text-slate-400 font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700 inline-block"></span>
                      <span>বাদ দেওয়া</span>
                    </span>
                  </div>
                </div>

                {/* 4-Column Grid matching Unmesh Sheet */}
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-[44vh] overflow-y-auto p-3 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/50">
                  {currentSet.questions.map((q) => {
                    const qNum = q.questionNumber;
                    const marked = markedAnswers[qNum];
                    const correctOpt = currentSet.answerKey[qNum];
                    const isCorrect = marked === correctOpt;
                    const isWrong = marked !== null && marked !== undefined && marked !== correctOpt;

                    return (
                      <div
                        key={qNum}
                        className={`p-2 rounded-xl border text-xs flex flex-col justify-between select-none ${
                          isCorrect
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                            : isWrong
                            ? 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
                            : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-mono font-black text-slate-700 dark:text-slate-300 text-[11px]">
                            {qNum}.
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            সঠিক: <strong className="text-emerald-600">{correctOpt}</strong>
                          </span>
                        </div>

                        {/* 4 LOCKED bubbles (pointer-events-none ensures no edits) */}
                        <div className="flex items-center justify-between gap-1 pointer-events-none">
                          {['A', 'B', 'C', 'D'].map((opt) => {
                            const isMarkedThis = marked === opt;
                            const isThisCorrectOpt = correctOpt === opt;

                            return (
                              <div
                                key={opt}
                                className={`w-5 h-5 rounded-full font-mono text-[9px] font-black flex items-center justify-center ${
                                  isMarkedThis && isThisCorrectOpt
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : isMarkedThis && !isThisCorrectOpt
                                    ? 'bg-rose-600 text-white shadow-xs'
                                    : 'border border-slate-300 dark:border-slate-700 text-slate-400'
                                }`}
                              >
                                {opt}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Publish to Database Action */}
              <div className="p-5 rounded-3xl bg-gradient-to-r from-red-600 to-rose-700 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
                <div>
                  <h4 className="font-black text-base flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-300" />
                    <span>ফলাফল সংরক্ষণ ও শিক্ষার্থীর প্রোফাইলে প্রকাশ করুন</span>
                  </h4>
                  <p className="text-xs text-red-100 mt-0.5">
                    রোল <strong>{rollNoInput || '...'}</strong> এর প্রোফাইলে ও সেন্ট্রাল কম্বাইন্ড মেরিট লিস্টে প্রাপ্ত নম্বর যুক্ত হবে।
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveMode('camera')}
                    className="px-4 py-2.5 rounded-xl bg-black/20 hover:bg-black/30 text-white font-bold text-xs cursor-pointer transition-colors"
                  >
                    পরবর্তী খাতা স্ক্যান
                  </button>

                  <button
                    type="button"
                    onClick={handlePublishEvaluation}
                    disabled={isEvaluating}
                    className="px-6 py-2.5 rounded-xl bg-white text-red-950 font-black text-sm shadow-md hover:bg-red-50 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4 text-red-600" />
                    <span>{isEvaluating ? 'সংরক্ষণ হচ্ছে...' : 'ফলাফল প্রকাশ ও সেভ করুন'}</span>
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
