import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { Exam, StudentUser, OfflineExamSet, ExamSubmission, StudentAnswer } from '../../types';
import { submitExamAnswers, addNotification } from '../../services/db';
import { generateShuffledSet } from '../../utils/omrPdfGenerator';
import { 
  processOmrImageComputerVision, 
  detectCornerRegistrationMarkers, 
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
  Send,
  Trophy,
  ShieldCheck,
  Check,
  Edit2,
  User,
  RotateCcw
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
  const [isEditingStudentId, setIsEditingStudentId] = useState<boolean>(false);

  // Student's marked bubbles: { [questionNumber]: 'A' | 'B' | 'C' | 'D' | null }
  const [markedAnswers, setMarkedAnswers] = useState<Record<number, 'A' | 'B' | 'C' | 'D' | null>>({});
  const [, setMultipleMarkedList] = useState<number[]>([]);
  const [scanConfidence, setScanConfidence] = useState<number>(0);
  const [cvErrorMessage, setCvErrorMessage] = useState<string | null>(null);

  // Camera stream refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [liveMarkersFound, setLiveMarkersFound] = useState<boolean>(false);
  const [, setCapturedPhotoUrl] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  // Determine available set codes from exam
  const availableSetCodes = React.useMemo(() => {
    if (exam.offlineSets && exam.offlineSets.length > 0) {
      return exam.offlineSets.map(s => s.setCode);
    }
    return ['Set-01', 'Set-02', 'Set-03', 'Set-04'];
  }, [exam]);

  // Set default set code
  useEffect(() => {
    if (!selectedSetCode && availableSetCodes.length > 0) {
      setSelectedSetCode(availableSetCodes[0]);
    }
  }, [availableSetCodes, selectedSetCode]);

  // Current set for selectedSetCode
  const currentSet: OfflineExamSet = React.useMemo(() => {
    const code = selectedSetCode || availableSetCodes[0] || 'Set-01';
    if (exam.offlineSets && exam.offlineSets.length > 0) {
      const found = exam.offlineSets.find(s => 
        s.setCode.toUpperCase() === code.toUpperCase() ||
        s.setCode.replace(/^Set-?/i, 'Set-').toUpperCase() === code.replace(/^Set-?/i, 'Set-').toUpperCase()
      );
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
      console.warn('Camera start notice:', err);
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

        // Check corner markers
        const markers = detectCornerRegistrationMarkers(canvas);
        setLiveMarkersFound(!!markers);
      }
    } catch (err) {
      console.warn('Live loop notice:', err);
    }

    animFrameRef.current = requestAnimationFrame(runLiveFrameLoop);
  };

  // Process decoded QR payload
  const handleDetectedQrData = (rawData: string) => {
    if (detectedQrData === rawData) return;
    setDetectedQrData(rawData);

    let setCode: string | null = null;

    // Format: OMR:examId:setCode
    if (rawData.startsWith('OMR:')) {
      const parts = rawData.split(':');
      if (parts.length >= 3) {
        setCode = parts[2];
      } else {
        setCode = parts[parts.length - 1];
      }
    } else {
      try {
        const parsed = JSON.parse(rawData);
        if (parsed.set || parsed.s || parsed.setCode) {
          setCode = parsed.set || parsed.s || parsed.setCode;
        }
      } catch {
        const match = rawData.match(/SET-?([A-Za-z0-9_-]+)/i);
        if (match && match[1]) {
          setCode = `Set-${match[1]}`;
        }
      }
    }

    if (setCode) {
      setSelectedSetCode(setCode);
      toastSuccess(`✓ কিউআর কোড স্ক্যান সম্পন্ন! সেট: ${setCode}`);
    }
  };

  // Capture photo from video stream
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
      console.warn('QR decode on capture notice:', e);
    }

    stopCamera();
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
            console.warn('QR read notice:', err);
          }

          executeComputerVisionPipeline(canvas);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Computer Vision Evaluation
  const executeComputerVisionPipeline = (sourceCanvas: HTMLCanvasElement) => {
    const cvResult: OmrScanDetectionResult = processOmrImageComputerVision(sourceCanvas);

    if (!cvResult.success || !cvResult.markersFound) {
      setCvErrorMessage(
        cvResult.errorMessage || 
        'ওএমআর শিটের ফ্রেম বা মার্কার সনাক্ত করা যায়নি। অনুগ্রহ করে শিটটি সমতলভাবে ক্যামেরার সামনে ধরুন।'
      );
      toastError('ওএমআর কর্নার মার্কার সনাক্ত করা যায়নি!');
      return;
    }

    if (cvResult.studentId && cvResult.studentId !== '000000') {
      setRollNoInput(cvResult.studentId);
    }

    setMarkedAnswers(cvResult.markedAnswers);
    setMultipleMarkedList(cvResult.multipleMarkedQuestions);
    setScanConfidence(cvResult.confidenceScore);
    setActiveMode('results');
    toastSuccess('✓ ওএমআর শিট সফলভাবে মূল্যায়ন সম্পন্ন হয়েছে!');
  };

  // Teacher manual override for a question bubble (if faintly filled)
  const handleToggleAnswer = (qNum: number, opt: 'A' | 'B' | 'C' | 'D') => {
    setMarkedAnswers(prev => ({
      ...prev,
      [qNum]: prev[qNum] === opt ? null : opt
    }));
  };

  // Score Calculation based on exact Answer Key mapping
  const totalQuestions = currentSet.questions.length || 100;
  const markPerQ = exam.markPerQuestion || 1.0;
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
  const totalMarks = exam.totalMarks || totalQuestions;
  const percentage = (marksObtained / (totalMarks || 1)) * 100;
  const isPassed = marksObtained >= (exam.passMark || (totalMarks * 0.4));

  // Submit Result: Save to Database & Student Profile
  const handlePublishEvaluation = async () => {
    if (!rollNoInput.trim()) {
      toastError('অনুগ্রহ করে শিক্ষার্থীর রোল নম্বর বা আইডি প্রদান করুন');
      return;
    }

    setIsEvaluating(true);
    try {
      const targetStudent = matchedStudent || students.find(s => s.rollNo === rollNoInput.trim());
      const studentId = targetStudent ? targetStudent.id : `student_roll_${rollNoInput.trim()}`;
      const studentName = targetStudent ? targetStudent.name : `শিক্ষার্থী (রোল: ${rollNoInput.trim()})`;
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
        totalMarks: totalMarks,
        correctCount: correctCount,
        wrongCount: wrongCount,
        skippedCount: skippedCount,
        percentage: Number(percentage.toFixed(1)),
        isLive: false,
        isOfflineOMR: true,
        setCode: currentSet.setCode,
        startTime: Date.now() - (exam.durationMinutes * 60 * 1000),
        submittedAt: Date.now(),
        durationSeconds: exam.durationMinutes * 60,
        answers: answers
      };

      const savedSub = await submitExamAnswers(submissionData);

      // In-app notification to student profile
      await addNotification({
        title: `ওএমআর রেজাল্ট প্রকাশিত: ${exam.title}`,
        message: `আপনার অফলাইন ওএমআর শিট (${currentSet.setCode}) মূল্যায়ন সম্পন্ন হয়েছে! প্রাপ্ত নম্বর: ${marksObtained} / ${totalMarks} (${isPassed ? 'পাস' : 'ফেল'})।`,
        type: 'result',
        linkTab: 'results',
        read: false
      });

      toastSuccess(`ফলাফল সফলভাবে "${studentName}" এর প্রোফাইল ও অফলাইন রেজাল্ট ডাটাবেজে সংরক্ষণ করা হয়েছে!`);
      if (onSubmissionCreated) onSubmissionCreated(savedSub);
      
      // Reset for next student
      setRollNoInput('');
      setMatchedStudent(null);
      setActiveMode('camera');
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
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-gradient-to-r from-blue-900/10 via-indigo-900/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Scan className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[10px] font-extrabold uppercase tracking-wider">
                  Mobile Camera OMR & QR Evaluation Engine
                </span>
                <span className="text-xs text-slate-400">• ইউনিক সেট কিউআর ও ৬-ডিজিট রোল ভেরিফিকেশন</span>
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
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>ক্যামেরা OMR স্ক্যানার</span>
          </button>

          <button
            onClick={() => setActiveMode('upload')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeMode === 'upload'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>ছবি আপলোড করুন</span>
          </button>

          {activeMode === 'results' && (
            <button
              onClick={() => setActiveMode('results')}
              className="pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 border-emerald-600 text-emerald-600 dark:text-emerald-400 flex items-center gap-2 cursor-pointer shrink-0"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>ইভালুয়েশন ও ফলাফল রিভিউ</span>
            </button>
          )}
        </div>

        {/* Body Content */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          
          {/* Error Message if Marker Missing */}
          {cvErrorMessage && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 flex items-start gap-3 text-amber-800 dark:text-amber-200 text-xs">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
              <div className="space-y-1">
                <span className="font-extrabold text-sm block">ওএমআর অ্যালাইনমেন্ট নোটিশ</span>
                <p className="leading-relaxed">{cvErrorMessage}</p>
              </div>
            </div>
          )}

          {/* MODE 1: CAMERA SCANNER */}
          {activeMode === 'camera' && (
            <div className="space-y-4">
              <div className="relative aspect-video max-w-2xl mx-auto rounded-3xl overflow-hidden bg-black border-2 border-slate-800 shadow-2xl flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Viewfinder Overlay */}
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-6">
                  <div className="w-full flex justify-between">
                    <div className={`w-8 h-8 border-t-4 border-l-4 rounded-tl-lg transition-colors ${liveMarkersFound ? 'border-emerald-400 bg-emerald-400/20' : 'border-blue-500'}`} />
                    <div className={`w-8 h-8 border-t-4 border-r-4 rounded-tr-lg transition-colors ${liveMarkersFound ? 'border-emerald-400 bg-emerald-400/20' : 'border-blue-500'}`} />
                  </div>

                  <div className="border border-white/40 bg-black/50 backdrop-blur-xs px-4 py-2 rounded-2xl text-center text-white text-xs max-w-sm">
                    {selectedSetCode ? (
                      <span className="text-emerald-300 font-extrabold flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>ডিটেক্টেড সেট: {selectedSetCode}</span>
                      </span>
                    ) : (
                      <span>ওএমআর শিটের উপরের QR কোড ও বৃত্তগুলো ফ্রেমের সোজা রাখুন</span>
                    )}
                  </div>

                  <div className="w-full flex justify-between">
                    <div className={`w-8 h-8 border-b-4 border-l-4 rounded-bl-lg transition-colors ${liveMarkersFound ? 'border-emerald-400 bg-emerald-400/20' : 'border-blue-500'}`} />
                    <div className={`w-8 h-8 border-b-4 border-r-4 rounded-br-lg transition-colors ${liveMarkersFound ? 'border-emerald-400 bg-emerald-400/20' : 'border-blue-500'}`} />
                  </div>
                </div>

                {!isCameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-white p-6 text-center space-y-3">
                    <Camera className="w-12 h-12 text-slate-500 animate-pulse" />
                    <p className="text-sm font-semibold">{cameraError || 'ক্যামেরা চালু করা হচ্ছে...'}</p>
                    <button
                      onClick={startCamera}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shadow-md"
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
                  className="w-full py-3 px-6 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm shadow-xl shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Scan className="w-5 h-5" />
                  <span>ওএমআর শিট স্ক্যান ও রেজাল্ট বের করুন</span>
                </button>
              </div>
            </div>
          )}

          {/* MODE 2: UPLOAD IMAGE */}
          {activeMode === 'upload' && (
            <div className="max-w-xl mx-auto space-y-4">
              <label className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-blue-500 bg-slate-50/50 dark:bg-slate-800/40 transition-colors">
                <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3 shadow-md">
                  <Upload className="w-8 h-8" />
                </div>
                <h4 className="font-bold text-base text-slate-900 dark:text-white">
                  ওএমআর শিটের ছবি আপলোড করুন
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                  কম্পিউটার ভিশন স্বয়ংক্রিয়ভাবে কিউআর কোড (সেট নম্বর), ৬-ডিজিট স্টুডেন্ট আইডি ও ১০০টি উত্তর বৃত্ত পড়ে রেজাল্ট বের করবে।
                </p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <span className="mt-4 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md">
                  গ্যালারি / ডিভাইস থেকে ছবি বাছুন
                </span>
              </label>
            </div>
          )}

          {/* MODE 3: RESULTS REVIEW & SUBMISSION */}
          {activeMode === 'results' && (
            <div className="space-y-5">
              
              {/* Summary Banner */}
              <div className="p-4 rounded-2xl bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border border-slate-700 shadow-md">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span className="font-bold text-slate-200">
                    ওএমআর স্ক্যান সফল: সঠিক উত্তর ও ভরাটকৃত বৃত্ত স্বয়ংক্রিয়ভাবে মেলানো হয়েছে।
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-emerald-300 font-bold bg-emerald-950/80 px-2.5 py-1 rounded-lg border border-emerald-800/60">
                    Accuracy Score: {Math.round(scanConfidence * 100)}%
                  </span>
                </div>
              </div>

              {/* Student Identification & Set Selector */}
              <div className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  
                  {/* Set Selector */}
                  <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">সেট কোড (QR Decoded Set)</span>
                    <div className="flex items-center gap-2 mt-1">
                      <select
                        value={selectedSetCode}
                        onChange={(e) => setSelectedSetCode(e.target.value)}
                        className="w-full bg-slate-100 dark:bg-slate-800 font-black font-mono text-blue-600 dark:text-blue-400 text-sm py-1 px-2 rounded-lg border border-slate-300 dark:border-slate-700 focus:outline-hidden"
                      >
                        {availableSetCodes.map(code => (
                          <option key={code} value={code}>{code}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Student ID */}
                  <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">স্টুডেন্ট আইডি (৬-ডিজিট)</span>
                      <button
                        type="button"
                        onClick={() => setIsEditingStudentId(!isEditingStudentId)}
                        className="text-[10px] text-blue-500 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>{isEditingStudentId ? 'সম্পন্ন' : 'পরিবর্তন'}</span>
                      </button>
                    </div>
                    {isEditingStudentId ? (
                      <input
                        type="text"
                        value={rollNoInput}
                        onChange={(e) => setRollNoInput(e.target.value)}
                        placeholder="রোল নম্বর লিখুন"
                        className="w-full mt-1 px-2.5 py-1 text-sm font-mono font-bold rounded-lg border border-blue-500 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                        autoFocus
                      />
                    ) : (
                      <span className="text-base font-black font-mono text-slate-900 dark:text-white mt-1 block">
                        {rollNoInput || 'আইডি পাওয়া যায়নি (ম্যানুয়াল দিন)'}
                      </span>
                    )}
                  </div>

                  {/* Matched Profile */}
                  <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">শিক্ষার্থীর তথ্য</span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 flex items-center justify-center font-bold text-xs shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {matchedStudent ? matchedStudent.name : 'অফলাইন পরীক্ষার্থী'}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {matchedStudent?.college || 'প্রতিষ্ঠান'}
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Score Breakdown (Evaluation Engine) */}
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
                  <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
                    <span className="text-[10px] text-blue-700 dark:text-blue-300 font-bold block">চূড়ান্ত প্রাপ্ত নম্বর</span>
                    <span className="text-xl font-black text-blue-600 dark:text-blue-400 font-mono">
                      {marksObtained} / {totalMarks}
                    </span>
                  </div>
                </div>

              </div>

              {/* 100 QUESTIONS OMR BUBBLE GRID BREAKDOWN */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <span>১০০টি প্রশ্নের বাবল ও সঠিক উত্তর ব্রেকডাউন ({currentSet.setCode})</span>
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
                        className={`p-2 rounded-xl border text-xs flex flex-col justify-between transition-all ${
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
                          <span className="text-[10px] font-bold text-slate-500">
                            সঠিক: <strong className="text-emerald-600">{correctOpt}</strong>
                          </span>
                        </div>

                        {/* 4 Interactive Bubbles for Review/Adjust */}
                        <div className="flex items-center justify-between gap-1">
                          {(['A', 'B', 'C', 'D'] as const).map((opt) => {
                            const isMarkedThis = marked === opt;
                            const isThisCorrectOpt = correctOpt === opt;

                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => handleToggleAnswer(qNum, opt)}
                                className={`w-5 h-5 min-w-5 min-h-5 rounded-full font-mono text-[9px] font-black leading-none flex items-center justify-center shrink-0 overflow-hidden cursor-pointer transition-all ${
                                  isMarkedThis && isThisCorrectOpt
                                    ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-400/50'
                                    : isMarkedThis && !isThisCorrectOpt
                                    ? 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-400/50'
                                    : 'border border-slate-300 dark:border-slate-700 text-slate-400 hover:border-blue-400'
                                }`}
                                title={`Mark option ${opt}`}
                              >
                                <span className="leading-none select-none">{opt}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Submit Result Button */}
              <div className="p-5 rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
                <div>
                  <h4 className="font-black text-base flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-300" />
                    <span>Submit Result & Push to Student Profile</span>
                  </h4>
                  <p className="text-xs text-blue-100 mt-0.5">
                    রোল <strong>{rollNoInput || '...'}</strong> এর প্রোফাইলে ও অফলাইন এক্সাম মেরিট লিস্টে প্রাপ্ত নম্বর যুক্ত হবে।
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveMode('camera')}
                    className="px-4 py-2.5 rounded-xl bg-black/20 hover:bg-black/30 text-white font-bold text-xs cursor-pointer transition-colors flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>পরবর্তী খাতা স্ক্যান</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePublishEvaluation}
                    disabled={isEvaluating}
                    className="px-6 py-2.5 rounded-xl bg-white text-blue-950 font-black text-sm shadow-md hover:bg-blue-50 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4 text-blue-600" />
                    <span>{isEvaluating ? 'সংরক্ষণ হচ্ছে...' : 'Submit Result'}</span>
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
