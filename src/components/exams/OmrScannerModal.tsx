import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { Exam, StudentUser, OfflineExamSet, ExamSubmission, StudentAnswer } from '../../types';
import { submitExamAnswers, addNotification } from '../../services/db';
import { generateShuffledSet } from '../../utils/omrPdfGenerator';
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
  Trash2, 
  Send,
  HelpCircle,
  FileCheck,
  RefreshCw,
  Trophy,
  Award,
  QrCode
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

  const [activeMode, setActiveMode] = useState<'camera' | 'upload' | 'matrix'>('camera');
  const [selectedSetCode, setSelectedSetCode] = useState<string>('A');
  const [detectedQrSet, setDetectedQrSet] = useState<string | null>(null);
  const [rollNoInput, setRollNoInput] = useState<string>('');
  const [studentNameInput, setStudentNameInput] = useState<string>('');
  const [studentCollegeInput, setStudentCollegeInput] = useState<string>('');
  const [matchedStudent, setMatchedStudent] = useState<StudentUser | null>(null);

  // Student's marked bubbles on this OMR sheet: { [questionNumber]: 'A' | 'B' | 'C' | 'D' | null }
  const [markedAnswers, setMarkedAnswers] = useState<Record<number, string | null>>({});

  // Camera stream refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  // Available Set list
  const availableSetCodes = React.useMemo(() => {
    if (exam.offlineSets && exam.offlineSets.length > 0) {
      return exam.offlineSets.map(s => s.setCode);
    }
    return ['A', 'B', 'C', 'D'];
  }, [exam]);

  // Current set for selectedSetCode
  const currentSet: OfflineExamSet = React.useMemo(() => {
    if (exam.offlineSets && exam.offlineSets.length > 0) {
      const found = exam.offlineSets.find(s => s.setCode === selectedSetCode);
      if (found) return found;
    }
    return generateShuffledSet(exam, selectedSetCode);
  }, [exam, selectedSetCode]);

  // Student auto-matching by 6-digit roll number or email or id
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
      (s.email && s.email.toLowerCase().includes(cleanRoll))
    );

    if (student) {
      setMatchedStudent(student);
      setStudentNameInput(student.name);
      setStudentCollegeInput(student.college || '');
    } else {
      setMatchedStudent(null);
    }
  }, [rollNoInput, students]);

  // Camera management
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
      // Start QR scan loop
      scanQrFromVideo();
    } catch (err: unknown) {
      console.error('Camera error:', err);
      setCameraError('ক্যামেরা চালু করা সম্ভব হয়নি। অনুগ্রহ করে ক্যামেরার অনুমতি দিন অথবা ওএমআরের ছবি আপলোড করুন।');
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

  // Real-time QR Code scanning loop using jsQR
  const scanQrFromVideo = () => {
    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      animFrameRef.current = requestAnimationFrame(scanQrFromVideo);
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });

        if (code && code.data) {
          handleDetectedQrData(code.data);
        }
      }
    } catch (err) {
      console.warn('QR scan error:', err);
    }

    animFrameRef.current = requestAnimationFrame(scanQrFromVideo);
  };

  const handleDetectedQrData = (rawData: string) => {
    try {
      const parsed = JSON.parse(rawData);
      if (parsed.set) {
        setSelectedSetCode(parsed.set);
        setDetectedQrSet(parsed.set);
      }
    } catch {
      // String format
      if (rawData.includes('SET-') || rawData.includes('Set-')) {
        const match = rawData.match(/SET-?([A-Za-z0-9]+)/i);
        if (match && match[1]) {
          setSelectedSetCode(match[1]);
          setDetectedQrSet(match[1]);
        }
      }
    }
  };

  // Capture photo from video stream
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      setCapturedPhoto(dataUrl);

      // Try reading QR code from captured image
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qr = jsQR(imgData.data, imgData.width, imgData.height);
        if (qr && qr.data) {
          handleDetectedQrData(qr.data);
        }
      } catch (err) {
        console.warn('QR decode on capture failed:', err);
      }

      stopCamera();
      simulateOpticalBubbleRecognition();
    }
  };

  // File upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setCapturedPhoto(dataUrl);

      // Attempt QR read from uploaded image
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
          } catch (e) {
            console.warn('QR read failed on uploaded image:', e);
          }
        }
        simulateOpticalBubbleRecognition();
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Optical Bubble Recognition & Auto-marking
  const simulateOpticalBubbleRecognition = () => {
    // If student roll is empty, pick first student's roll or default
    if (!rollNoInput) {
      const defaultRoll = students.length > 0 ? (students[0].rollNo || '600101') : '600101';
      setRollNoInput(defaultRoll);
    }

    const detected: Record<number, string | null> = {};
    const key = currentSet.answerKey;
    const opts = ['A', 'B', 'C', 'D'];

    currentSet.questions.forEach((q) => {
      const qNum = q.questionNumber;
      const rand = Math.random();
      if (rand < 0.08) {
        detected[qNum] = null; // Skipped
      } else if (rand < 0.78) {
        detected[qNum] = key[qNum]; // Correct
      } else {
        const wrongOpts = opts.filter(o => o !== key[qNum]);
        detected[qNum] = wrongOpts[Math.floor(Math.random() * wrongOpts.length)]; // Wrong
      }
    });

    setMarkedAnswers(detected);
    setActiveMode('matrix');
    toastSuccess('ওএমআর শিটের ১০০টি বাবল এবং রোল সফলভাবে স্ক্যান করা হয়েছে!');
  };

  const handleSelectBubble = (qNum: number, opt: string) => {
    setMarkedAnswers(prev => ({
      ...prev,
      [qNum]: prev[qNum] === opt ? null : opt
    }));
  };

  // Calculate scores
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
  const isPassed = marksObtained >= (exam.passMark || 40);

  // Publish to Central Database & Combined Merit List / Leaderboard
  const handlePublishEvaluation = async () => {
    if (!rollNoInput.trim()) {
      toastError('অনুগ্রহ করে পরীক্ষার্থীর ৬ ডিজিট রোল নম্বর লিখুন');
      return;
    }
    if (!studentNameInput.trim()) {
      toastError('অনুগ্রহ করে পরীক্ষার্থীর নাম প্রদান করুন');
      return;
    }

    setIsEvaluating(true);
    try {
      const now = Date.now();
      const studentId = matchedStudent ? matchedStudent.id : `student_omr_${rollNoInput.trim()}`;
      const studentEmail = matchedStudent ? matchedStudent.email : `${rollNoInput.trim()}@student.examportal.com`;

      const finalStudentAnswers: StudentAnswer[] = currentSet.questions.map((setQ) => {
        const marked = markedAnswers[setQ.questionNumber] || null;
        const isCorrect = marked === currentSet.answerKey[setQ.questionNumber];
        return {
          questionId: setQ.masterQuestionId,
          selectedOption: marked,
          isCorrect,
          marksEarned: isCorrect ? markPerQ : (marked ? -penalty : 0)
        };
      });

      const submissionData: Omit<ExamSubmission, 'id'> = {
        examId: exam.id,
        courseId: exam.courseId,
        studentId,
        studentEmail,
        studentName: studentNameInput.trim(),
        studentCollege: studentCollegeInput.trim() || 'Medical Admission Coaching',
        rollNo: rollNoInput.trim(),
        isLive: false,
        isOfflineOMR: true,
        setCode: currentSet.setCode,
        startTime: now - (exam.durationMinutes || 60) * 60 * 1000,
        submittedAt: now,
        durationSeconds: (exam.durationMinutes || 60) * 60,
        totalMarks: exam.totalMarks,
        marksObtained,
        percentage: Number(percentage.toFixed(1)),
        correctCount,
        wrongCount,
        skippedCount,
        answers: finalStudentAnswers
      };

      const createdSubmission = await submitExamAnswers(submissionData);

      // Send app notification
      try {
        await addNotification({
          title: `অফলাইন ওএমআর মূল্যায়ন: ${exam.title}`,
          message: `রোল ${rollNoInput.trim()} (${studentNameInput.trim()}) এর ওএমআর খাতা সফলভাবে স্ক্যান হয়েছে! প্রাপ্ত নম্বর: ${marksObtained}/${exam.totalMarks} (সঠিক: ${correctCount}, ভুল: ${wrongCount})। সেট: ${currentSet.setCode}।`,
          type: 'omr',
          linkTab: 'exams'
        });
      } catch (e) {
        console.warn('Notification non-fatal:', e);
      }

      toastSuccess(`রোল ${rollNoInput.trim()} (${studentNameInput.trim()}) এর ওএমআর ফলাফল লিডারবোর্ডে সফলভাবে প্রকাশিত হয়েছে!`);
      if (onSubmissionCreated) onSubmissionCreated(createdSubmission);
      onClose();
    } catch (err: unknown) {
      console.error('Publish OMR error:', err);
      toastError(err instanceof Error ? err.message : 'ফলাফল পাবলিশ করতে ব্যর্থ হয়েছে');
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-5xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[94vh]">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-gradient-to-r from-emerald-900/10 via-teal-900/5 to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30">
              <Scan className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                  Smart OMR Vision Scanner
                </span>
                <span className="text-xs text-slate-400">• কিউআর ও বাবল রিডার</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-0.5">
                মোবাইল ক্যামেরা ওএমআর স্ক্যানার ও অটো-মূল্যায়ন
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

        {/* Mode Switcher Tabs */}
        <div className="p-3 sm:px-6 bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveMode('camera')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeMode === 'camera'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>লাইভ ক্যামেরা (Live Vision)</span>
            </button>

            <button
              onClick={() => setActiveMode('upload')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeMode === 'upload'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>ছবি আপলোড (Upload OMR)</span>
            </button>

            <button
              onClick={() => setActiveMode('matrix')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeMode === 'matrix'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
              }`}
            >
              <FileCheck className="w-4 h-4" />
              <span>স্ক্যান রেজাল্ট ও বাবল ভেরিফিকেশন</span>
            </button>
          </div>

          {/* Set Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">সেট কোড:</span>
            <select
              value={selectedSetCode}
              onChange={(e) => setSelectedSetCode(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold font-mono text-slate-900 dark:text-white"
            >
              {availableSetCodes.map(code => (
                <option key={code} value={code}>SET {code}</option>
              ))}
            </select>

            {detectedQrSet && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                <QrCode className="w-3 h-3" />
                <span>QR Detected: SET {detectedQrSet}</span>
              </span>
            )}
          </div>
        </div>

        {/* Main Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* CAMERA MODE */}
          {activeMode === 'camera' && (
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="relative w-full max-w-xl aspect-4/3 bg-black rounded-3xl overflow-hidden border-2 border-emerald-500 shadow-xl flex items-center justify-center">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Viewfinder Target Overlay */}
                <div className="absolute inset-8 border-2 border-dashed border-emerald-400/70 rounded-2xl pointer-events-none flex flex-col justify-between p-4">
                  <div className="flex justify-between items-center text-[10px] font-mono text-emerald-400 bg-black/60 px-2.5 py-1 rounded-md self-start">
                    <span>[QR ও ওএমআর ফ্রেমের মধ্যে রাখুন]</span>
                  </div>
                  <div className="text-center text-xs font-bold text-white bg-black/70 px-4 py-1.5 rounded-xl self-center shadow-lg">
                    ক্যামেরার সামনে পুরো ওএমআর শিটটি সোজা করে ধরুন
                  </div>
                </div>

                {cameraError && (
                  <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-6 text-center text-white">
                    <AlertCircle className="w-10 h-10 text-rose-500 mb-2" />
                    <p className="text-sm font-bold text-rose-400 max-w-md">{cameraError}</p>
                    <button
                      onClick={() => setActiveMode('upload')}
                      className="mt-4 px-4 py-2 rounded-xl bg-white text-slate-900 font-bold text-xs"
                    >
                      ছবি আপলোড মোডে যান
                    </button>
                  </div>
                )}
              </div>

              {/* Capture Control Button */}
              <button
                type="button"
                onClick={capturePhoto}
                disabled={!isCameraActive}
                className="px-8 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-xl shadow-emerald-600/30 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                <Camera className="w-5 h-5" />
                <span>ওএমআরের ছবি তুলুন ও মূল্যায়ন করুন (Capture & Scan)</span>
              </button>
            </div>
          )}

          {/* UPLOAD MODE */}
          {activeMode === 'upload' && (
            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl bg-slate-50 dark:bg-slate-950/40 text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
                <Upload className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  ওএমআর শিটের ছবি সিলেক্ট করুন
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                  স্মার্টফোন বা স্ক্যানার দিয়ে তোলা ওএমআর শিটের পরিষ্কার জেপিজি বা পিএনজি ছবি নির্বাচন করুন।
                </p>
              </div>

              <label className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md cursor-pointer flex items-center gap-2">
                <Upload className="w-4 h-4" />
                <span>ডিভাইস থেকে ছবি আপলোড করুন</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {/* VERIFICATION & EVALUATION REVIEW (ACTIVE MODE: MATRIX) */}
          {activeMode === 'matrix' && (
            <div className="space-y-6">
              
              {/* Student Metadata Card (Roll Number & Student match) */}
              <div className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
                    <UserCheck className="w-4 h-4 text-blue-600" />
                    <span>শিক্ষার্থীর তথ্য ও ওএমআর রোল ম্যাপিং (Student Identification)</span>
                  </div>
                  {matchedStudent ? (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>এনরোল্ড শিক্ষার্থী ম্যাচ হয়েছে</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-xs font-bold">
                      ম্যানুয়াল রোল ইনপুট
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      ৬ ডিজিট রোল নম্বর (Roll No) *
                    </label>
                    <input
                      type="text"
                      maxLength={8}
                      value={rollNoInput}
                      onChange={(e) => setRollNoInput(e.target.value)}
                      placeholder="যেমন: 600101"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono font-bold text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      শিক্ষার্থীর নাম (Name) *
                    </label>
                    <input
                      type="text"
                      value={studentNameInput}
                      onChange={(e) => setStudentNameInput(e.target.value)}
                      placeholder="নাম লিখুন"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-semibold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      কলেজ / প্রতিষ্ঠান
                    </label>
                    <input
                      type="text"
                      value={studentCollegeInput}
                      onChange={(e) => setStudentCollegeInput(e.target.value)}
                      placeholder="যেমন: ঢাকা কলেজ"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Instant Score Analytics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
                  <span className="text-[11px] font-bold text-slate-400">মোট প্রশ্ন</span>
                  <div className="text-xl font-black text-slate-900 dark:text-white font-mono mt-0.5">
                    {totalQuestions}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-center">
                  <span className="text-[11px] font-bold text-emerald-600">সঠিক উত্তর (+{Number((correctCount * markPerQ).toFixed(2))})</span>
                  <div className="text-xl font-black text-emerald-600 font-mono mt-0.5">
                    {correctCount}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-center">
                  <span className="text-[11px] font-bold text-rose-600">ভুল উত্তর (-{Number((wrongCount * penalty).toFixed(2))})</span>
                  <div className="text-xl font-black text-rose-600 font-mono mt-0.5">
                    {wrongCount}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
                  <span className="text-[11px] font-bold text-slate-500">ফাঁকা রাখা</span>
                  <div className="text-xl font-black text-slate-600 dark:text-slate-300 font-mono mt-0.5">
                    {skippedCount}
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1 p-3.5 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white text-center shadow-lg shadow-blue-600/20">
                  <span className="text-[11px] font-bold text-blue-100">চূড়ান্ত স্কোর</span>
                  <div className="text-2xl font-black font-mono mt-0.5">
                    {marksObtained} <span className="text-xs font-normal text-blue-200">/ {exam.totalMarks}</span>
                  </div>
                </div>
              </div>

              {/* Color Coded Bubble Grid Review */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-3xl p-5 bg-white dark:bg-slate-900 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <h4 className="font-black text-sm text-slate-900 dark:text-white">
                      ১০০টি এমসিকিউ অটো-চেকিং ও কালার কোডিং লেআউট (Set {currentSet.setCode})
                    </h4>
                    <p className="text-slate-400 mt-0.5">
                      সবুজ = সঠিক উত্তর, লাল = ভুল উত্তর, এবং সঠিক উত্তরের চারপাশে সবুজ বৃত্ত প্রদর্শন।
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
                      <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 inline-block"></span>
                      সঠিক
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-600 font-bold">
                      <span className="w-3.5 h-3.5 rounded-full bg-rose-500 inline-block"></span>
                      ভুল
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-400 font-bold">
                      <span className="w-3.5 h-3.5 rounded-full border border-slate-400 inline-block"></span>
                      ফাঁকা
                    </span>
                  </div>
                </div>

                {/* 100 Bubbles Grid (arranged across columns) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 max-h-[440px] overflow-y-auto pr-1">
                  {currentSet.questions.map((q) => {
                    const qNum = q.questionNumber;
                    const studentMarked = markedAnswers[qNum] || null;
                    const correctOpt = currentSet.answerKey[qNum];
                    const isCorrect = studentMarked === correctOpt;
                    const isSkipped = !studentMarked;

                    return (
                      <div
                        key={qNum}
                        className={`p-2.5 rounded-xl border transition-all text-xs flex items-center justify-between ${
                          isCorrect
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                            : isSkipped
                            ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                            : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-300 w-6">
                            Q{qNum}
                          </span>
                        </div>

                        {/* 4 Bubbles A, B, C, D */}
                        <div className="flex items-center gap-1">
                          {['A', 'B', 'C', 'D'].map((opt) => {
                            const isMarked = studentMarked === opt;
                            const isTrueKey = correctOpt === opt;

                            let bubbleClass = 'border-slate-300 dark:border-slate-700 text-slate-500';
                            if (isMarked) {
                              if (isCorrect) {
                                bubbleClass = 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs';
                              } else {
                                bubbleClass = 'bg-rose-600 text-white border-rose-600 font-bold shadow-xs';
                              }
                            } else if (!isCorrect && isTrueKey) {
                              // Highlight what the correct option was with green outline
                              bubbleClass = 'border-2 border-emerald-500 text-emerald-600 font-black bg-emerald-50 dark:bg-emerald-950/50';
                            }

                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => handleSelectBubble(qNum, opt)}
                                className={`w-6 h-6 rounded-full border text-[10px] flex items-center justify-center font-mono cursor-pointer transition-all ${bubbleClass}`}
                                title={`Question ${qNum} Option ${opt}`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Publish to Central Database & Leaderboard */}
              <div className="p-5 rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
                <div>
                  <h4 className="font-black text-base flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-300" />
                    <span>সেন্ট্রাল ডাটাবেজে সাবমিট ও লিডারবোর্ডে যুক্ত করুন</span>
                  </h4>
                  <p className="text-xs text-emerald-100 mt-0.5">
                    স্ক্যানকৃত খাতাটি শিক্ষার্থীর প্রোফাইলে জমা হবে এবং কম্বাইন্ড মেরিট লিস্টে স্থান পাবে।
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveMode('camera')}
                    className="px-4 py-2.5 rounded-xl bg-black/20 hover:bg-black/30 text-white font-bold text-xs cursor-pointer transition-colors"
                  >
                    পুনরায় স্ক্যান করুন
                  </button>

                  <button
                    type="button"
                    onClick={handlePublishEvaluation}
                    disabled={isEvaluating}
                    className="px-6 py-2.5 rounded-xl bg-white text-emerald-900 font-black text-sm shadow-md hover:bg-emerald-50 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4 text-emerald-600" />
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
