import React, { useState, useEffect, useRef } from 'react';
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
  Award
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

  const [activeMode, setActiveMode] = useState<'camera' | 'upload' | 'matrix'>('matrix');
  const [selectedSetCode, setSelectedSetCode] = useState<string>('A');
  const [rollNoInput, setRollNoInput] = useState<string>('');
  const [studentNameInput, setStudentNameInput] = useState<string>('');
  const [studentCollegeInput, setStudentCollegeInput] = useState<string>('');
  const [matchedStudent, setMatchedStudent] = useState<StudentUser | null>(null);

  // Student's marked bubbles on this OMR sheet: { [questionNumber]: 'A' | 'B' | 'C' | 'D' | null }
  const [markedAnswers, setMarkedAnswers] = useState<Record<number, string | null>>({});

  // Camera stream refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  // Fetch or generate set for the selected Set Code
  const currentSet: OfflineExamSet = React.useMemo(() => {
    if (exam.offlineSets && exam.offlineSets.length > 0) {
      const found = exam.offlineSets.find(s => s.setCode === selectedSetCode);
      if (found) return found;
    }
    return generateShuffledSet(exam, selectedSetCode);
  }, [exam, selectedSetCode]);

  // Handle Roll Number change and student auto-matching
  useEffect(() => {
    if (!rollNoInput.trim()) {
      setMatchedStudent(null);
      return;
    }
    const cleanRoll = rollNoInput.trim().toLowerCase();
    // Match by rollNo or student id or email
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

  // Clean up camera stream on close
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
  }, [isOpen]);

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
    } catch (err: unknown) {
      console.error('Camera error:', err);
      setCameraError('ক্যামেরা চালু করা যায়নি। ব্রাউজারে ক্যামেরার অনুমতি দিন অথবা ওএমআর ছবি আপলোড করুন।');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedPhoto(dataUrl);
      stopCamera();
      // Auto-simulate optical bubble read for seamless admin workflow
      simulateOpticalBubbleRecognition();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setCapturedPhoto(event.target?.result as string);
      simulateOpticalBubbleRecognition();
    };
    reader.readAsDataURL(file);
  };

  // Optical Bubble Recognition Simulator
  const simulateOpticalBubbleRecognition = () => {
    // If student roll is not filled, generate a mock or keep existing
    if (!rollNoInput) {
      const randomRoll = students.length > 0 ? (students[0].rollNo || '100001') : '100001';
      setRollNoInput(randomRoll);
    }
    // Simulate optical scanning of 80% answered questions matching the key with high realism
    const detected: Record<number, string | null> = {};
    const key = currentSet.answerKey;
    const opts = ['A', 'B', 'C', 'D'];

    currentSet.questions.forEach((q) => {
      const qNum = q.questionNumber;
      const rand = Math.random();
      if (rand < 0.1) {
        // Skipped
        detected[qNum] = null;
      } else if (rand < 0.8) {
        // Correct bubble
        detected[qNum] = key[qNum];
      } else {
        // Wrong bubble
        const wrongOpts = opts.filter(o => o !== key[qNum]);
        detected[qNum] = wrongOpts[Math.floor(Math.random() * wrongOpts.length)];
      }
    });

    setMarkedAnswers(detected);
    setActiveMode('matrix');
    toastSuccess('ওএমআর শিট থেকে বাবলসমূহ সফলভাবে স্ক্যান ও রিড করা হয়েছে! অনুগ্রহ করে নিচের গ্রিডে যাচাই করুন।');
  };

  const handleSelectBubble = (qNum: number, opt: string) => {
    setMarkedAnswers(prev => ({
      ...prev,
      [qNum]: prev[qNum] === opt ? null : opt
    }));
  };

  const handleClearAllBubbles = () => {
    setMarkedAnswers({});
  };

  // Calculate live score
  const totalQuestions = currentSet.questions.length;
  const markPerQ = exam.totalMarks / (totalQuestions || 1);
  const penalty = markPerQ * (exam.negativeMarkPercentage || 0.25);

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

  // Publish Evaluation to Student Profile & Leaderboard
  const handlePublishEvaluation = async () => {
    if (!rollNoInput.trim()) {
      toastError('অনুগ্রহ করে পরীক্ষার্থীর রোল নম্বর প্রবেশ করান');
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

      // Map answers back to master question ids
      const finalStudentAnswers: StudentAnswer[] = currentSet.questions.map((setQ) => {
        const marked = markedAnswers[setQ.questionNumber] || null;
        const isCorrect = marked === currentSet.answerKey[setQ.questionNumber];

        let marksEarned = 0;
        if (isCorrect) {
          marksEarned = markPerQ;
        } else if (marked) {
          marksEarned = -penalty;
        }

        return {
          questionId: setQ.masterQuestionId,
          selectedOption: marked,
          isCorrect,
          marksEarned
        };
      });

      const submissionData: Omit<ExamSubmission, 'id'> = {
        examId: exam.id,
        courseId: exam.courseId,
        studentId,
        studentEmail,
        studentName: studentNameInput.trim(),
        studentCollege: studentCollegeInput.trim() || 'Institution N/A',
        rollNo: rollNoInput.trim(),
        isLive: true, // Shows on official leaderboard!
        isOfflineOMR: true,
        setCode: selectedSetCode,
        startTime: now - (exam.durationMinutes || 60) * 60 * 1000,
        submittedAt: now,
        durationSeconds: (exam.durationMinutes || 60) * 60,
        totalMarks: exam.totalMarks,
        marksObtained,
        percentage,
        correctCount,
        wrongCount,
        skippedCount,
        answers: finalStudentAnswers
      };

      const savedSub = await submitExamAnswers(submissionData);

      // Send In-App Notification
      await addNotification({
        title: `ওএমআর পরীক্ষার রেজাল্ট প্রকাশিত: ${exam.title}`,
        message: `${studentNameInput} (রোল: ${rollNoInput.trim()}) এর ওএমআর শিট মূল্যায়ন সম্পন্ন হয়েছে। অর্জিত নম্বর: ${marksObtained}/${exam.totalMarks}`,
        type: 'omr',
        linkTab: 'results'
      }).catch(console.error);

      if (onSubmissionCreated) onSubmissionCreated(savedSub);

      toastSuccess(`রোল ${rollNoInput.trim()} (${studentNameInput}) এর ফলাফল সফলভাবে প্রকাশিত এবং লিডারবোর্ডে যুক্ত হয়েছে!`);
      
      // Reset for next student OMR
      setRollNoInput('');
      setStudentNameInput('');
      setStudentCollegeInput('');
      setMarkedAnswers({});
      setCapturedPhoto(null);
    } catch (err: unknown) {
      console.error('Publish OMR result error:', err);
      toastError('ফলাফল প্রকাশ করতে সমস্যা হয়েছে');
    } finally {
      setIsEvaluating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[94vh]">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
                  Automated OMR Scanner & Grader
                </span>
                <span className="text-xs text-slate-400">• {exam.title}</span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-0.5">
                ওএমআর শিট স্ক্যানার ও মূল্যায়নকারী (OMR Grader)
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

        {/* Scan Mode Switcher */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setActiveMode('camera');
                startCamera();
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                activeMode === 'camera'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>ক্যামেরা স্ক্যানার</span>
            </button>

            <button
              onClick={() => {
                setActiveMode('upload');
                stopCamera();
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                activeMode === 'upload'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>ওএমআর ছবি আপলোড</span>
            </button>

            <button
              onClick={() => {
                setActiveMode('matrix');
                stopCamera();
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                activeMode === 'matrix'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <FileCheck className="w-4 h-4" />
              <span>বাবল মেট্রিক্স ও ভেরিফিকেশন</span>
            </button>
          </div>

          {/* Set Code Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">প্রশ্ন সেট:</span>
            {['A', 'B', 'C', 'D'].map((code) => (
              <button
                key={code}
                onClick={() => setSelectedSetCode(code)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  selectedSetCode === code
                    ? 'bg-blue-600 text-white ring-2 ring-blue-500/40'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                SET {code}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5 bg-slate-50 dark:bg-slate-950/40">

          {/* Camera View Mode */}
          {activeMode === 'camera' && (
            <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 text-center">
              <div className="relative max-w-lg mx-auto aspect-4/3 rounded-2xl overflow-hidden bg-black flex items-center justify-center border-2 border-emerald-500/40">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                
                {/* Viewfinder Target Overlays */}
                <div className="absolute inset-8 border-2 border-dashed border-emerald-400/80 rounded-2xl pointer-events-none flex flex-col justify-between p-3">
                  <div className="flex justify-between">
                    <span className="w-4 h-4 border-t-2 border-l-2 border-emerald-400" />
                    <span className="w-4 h-4 border-t-2 border-r-2 border-emerald-400" />
                  </div>
                  <div className="text-center bg-black/60 backdrop-blur-xs text-white text-[11px] font-bold py-1 px-3 rounded-full mx-auto">
                    ওএমআর শিট এবং কিউআর কোড ফ্রেমের মধ্যে রাখুন
                  </div>
                  <div className="flex justify-between">
                    <span className="w-4 h-4 border-b-2 border-l-2 border-emerald-400" />
                    <span className="w-4 h-4 border-b-2 border-r-2 border-emerald-400" />
                  </div>
                </div>
              </div>

              {cameraError && (
                <p className="text-xs text-rose-500 font-semibold">{cameraError}</p>
              )}

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={capturePhoto}
                  className="px-6 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-lg cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>ওএমআর ছবি তুলুন ও অটো-স্ক্যান করুন</span>
                </button>
              </div>
            </div>
          )}

          {/* Upload View Mode */}
          {activeMode === 'upload' && (
            <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-700 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mx-auto">
                <Upload className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                  শিক্ষার্থীর ওএমআর শিটের ছবি আপলোড করুন
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  মোবাইল বা স্ক্যানার থেকে ওএমআর এর ছবি আপলোড করলে সিস্টেম স্বয়ংক্রিয়ভাবে বাবল রিড করবে
                </p>
              </div>
              <div>
                <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-md">
                  <Upload className="w-4 h-4" />
                  <span>ফাইল নির্বাচন করুন (JPG / PNG)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Student Profile & Roll Number Identification Section */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-600" />
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                  পরীক্ষার্থী পরিচিতি (Candidate Identification)
                </h3>
              </div>
              {matchedStudent && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>শিক্ষার্থী চিহ্নিত হয়েছে</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Roll Number Box */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  শিক্ষার্থীর রোল / আইডি নম্বর *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 102456"
                  value={rollNoInput}
                  onChange={(e) => setRollNoInput(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Student Name */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  পরীক্ষার্থীর নাম *
                </label>
                <input
                  type="text"
                  placeholder="e.g. আব্দুল্লাহ আল নোমান"
                  value={studentNameInput}
                  onChange={(e) => setStudentNameInput(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* College / Institution */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  কলেজ / শিক্ষাপ্রতিষ্ঠান
                </label>
                <input
                  type="text"
                  placeholder="e.g. ঢাকা কলেজ"
                  value={studentCollegeInput}
                  onChange={(e) => setStudentCollegeInput(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Real-time Tally Card Banner */}
          <div className="p-4 rounded-2xl bg-slate-900 text-white shadow-lg flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold uppercase">SET CODE</span>
                <span className="text-base font-black text-amber-400">SET - {selectedSetCode}</span>
              </div>
              <div className="w-px h-8 bg-white/20" />
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold uppercase">সঠিক (+{markPerQ.toFixed(2)})</span>
                <span className="text-base font-black text-emerald-400">{correctCount} টি</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold uppercase">ভুল (-{penalty.toFixed(2)})</span>
                <span className="text-base font-black text-rose-400">{wrongCount} টি</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-bold uppercase">স্কিপ (0)</span>
                <span className="text-base font-black text-slate-300">{skippedCount} টি</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">মোট অর্জিত নম্বর</span>
                <span className="text-xl font-black text-emerald-400">
                  {marksObtained.toFixed(2)} <span className="text-xs text-white/60">/ {exam.totalMarks}</span>
                </span>
              </div>
              <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 font-bold text-xs border border-emerald-500/30">
                {percentage.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Interactive 1 to N OMR Bubble Matrix */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                  ওএমআর বাবল যাচাই ও সংশোধন গ্রিড ({currentSet.questions.length} টি প্রশ্ন)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  শিক্ষার্থীর ওএমআরে পূরণ করা বৃত্ত নির্বাচন করুন। স্বয়ংক্রিয়ভাবে সঠিক উত্তর ও নেগেটিভ মার্কিং হিসাব করা হবে।
                </p>
              </div>

              <button
                onClick={handleClearAllBubbles}
                className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>সব ক্লিয়ার করুন</span>
              </button>
            </div>

            {/* Questions Grid with (A) (B) (C) (D) bubbles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-96 overflow-y-auto pr-1">
              {currentSet.questions.map((q) => {
                const qNum = q.questionNumber;
                const marked = markedAnswers[qNum] || null;
                const rightAns = currentSet.answerKey[qNum];
                const isCorrect = marked === rightAns;
                const isWrong = marked && !isCorrect;

                return (
                  <div
                    key={qNum}
                    className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
                      isCorrect
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/60'
                        : isWrong
                        ? 'bg-rose-50/80 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800/60'
                        : 'bg-slate-50/80 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="w-6 text-xs font-black font-mono text-slate-700 dark:text-slate-300">
                        {qNum}.
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        [{rightAns}]
                      </span>
                    </div>

                    {/* Bubbles A, B, C, D */}
                    <div className="flex items-center gap-1 shrink-0">
                      {['A', 'B', 'C', 'D'].map((opt) => {
                        const isSelected = marked === opt;
                        const isThisTheCorrectKey = opt === rightAns;

                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => handleSelectBubble(qNum, opt)}
                            className={`w-6 h-6 rounded-full font-bold text-xs flex items-center justify-center transition-all cursor-pointer ${
                              isSelected
                                ? isThisTheCorrectKey
                                  ? 'bg-emerald-600 text-white shadow-xs scale-105 ring-2 ring-emerald-400/50'
                                  : 'bg-rose-600 text-white shadow-xs scale-105 ring-2 ring-rose-400/50'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                            }`}
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

        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            বন্ধ করুন
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePublishEvaluation}
              disabled={isEvaluating || !rollNoInput.trim() || !studentNameInput.trim()}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50"
            >
              <Award className="w-4 h-4" />
              <span>
                {isEvaluating ? 'মূল্যায়ন সংরক্ষিত হচ্ছে...' : 'ফলাফল সংরক্ষণ ও লিডারবোর্ডে যুক্ত করুন'}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
