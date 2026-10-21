import React, { useState, useEffect } from 'react';
import { 
  FileText, Plus, Trash2, Download, Layers, 
  CheckCircle2, RefreshCw, AlertCircle, Sparkles, BookOpen, 
  ArrowLeft, Wifi, Scan, Trophy, Eye, Check, Edit3, HelpCircle
} from 'lucide-react';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocs 
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useToast } from '../../context/ToastContext';
import { 
  generateAdmissionStylePDF, 
  generateSolutionKeyPDF,
  downloadExamPdfSmart,
  downloadPdfBlob
} from '../../utils/omrPdfGenerator';
import { Exam, OfflineExamSet, StudentUser, ExamSubmission } from '../../types';
import { 
  DEMO_100_QUESTIONS, 
  getDemo100QuestionsRawText, 
  createSample100Questions 
} from '../../utils/sampleOfflineExam';
import { OmrScannerModal } from './OmrScannerModal';
import { OfflineLeaderboardModal } from './OfflineLeaderboardModal';

interface QuestionOption {
  text: string;
  isCorrect: boolean;
}

interface QuestionInput {
  questionText: string;
  options: QuestionOption[];
  explanation?: string;
}

interface GeneratedSetQuestion {
  qNo: number;
  questionText: string;
  options: string[];
  correctAnswer: number;
}

interface GeneratedExamSet {
  setName: string;
  setCode: string;
  qrData?: string;
  questions: GeneratedSetQuestion[];
}

export interface StoredExam {
  id: string;
  examId: string;
  examName: string;
  title: string;
  courseName: string;
  courseId: string;
  masterQuestions: any[];
  sets: GeneratedExamSet[];
  questions?: any[];
  offlineSets?: any[];
  totalSets?: number;
  totalQuestions?: number;
  totalMarks?: number;
  durationMinutes?: number;
  passMark?: number;
  negativeMarkPercentage?: number;
  isOffline?: boolean;
  examType?: string;
  isActive?: boolean;
  createdAt: number;
  updatedAt?: number;
}

interface OfflineOmrManagerProps {
  students?: StudentUser[];
  submissions?: ExamSubmission[];
  onBack?: () => void;
  registerBackHandler?: (fn: (() => boolean) | null) => void;
}

export const OfflineOmrManager: React.FC<OfflineOmrManagerProps> = ({ 
  students = [],
  submissions: initialSubmissions,
  onBack,
  registerBackHandler 
}) => {
  const { success: toastSuccess, error: toastError } = useToast();

  const [exams, setExams] = useState<StoredExam[]>([]);
  const [liveSubmissions, setLiveSubmissions] = useState<ExamSubmission[]>(initialSubmissions || []);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isParsingAi, setIsParsingAi] = useState(false);
  const [downloadingSetCode, setDownloadingSetCode] = useState<string | null>(null);

  // Form State
  const [examName, setExamName] = useState('Weekly Exam - 01');
  const [courseName, setCourseName] = useState('Biology 1st Paper (Chapter-01)');
  const [totalSets, setTotalSets] = useState('10');
  const [negativeMark, setNegativeMark] = useState('0.25');
  const [singleExplanation, setSingleExplanation] = useState('');

  const [questions, setQuestions] = useState<QuestionInput[]>([
    {
      questionText: 'What is the SI unit of electric current?',
      options: [
        { text: 'Volt', isCorrect: false },
        { text: 'Ampere', isCorrect: true },
        { text: 'Ohm', isCorrect: false },
        { text: 'Watt', isCorrect: false }
      ],
      explanation: 'Ampere (A) is the base SI unit of electric current.'
    }
  ]);

  // Bulk import modal/toggle
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // Modals for Scanner and Leaderboard
  const [activeScanningExam, setActiveScanningExam] = useState<Exam | null>(null);
  const [activeLeaderboardExam, setActiveLeaderboardExam] = useState<Exam | null>(null);

  // Selected set to preview
  const [previewingSet, setPreviewingSet] = useState<{ examName: string; set: GeneratedExamSet } | null>(null);

  // Scroll to top when entering
  useEffect(() => {
    try {
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch {
      window.scrollTo(0, 0);
    }
  }, []);

  // 1-step backward navigation handler
  useEffect(() => {
    if (registerBackHandler) {
      registerBackHandler(() => {
        if (activeScanningExam) {
          setActiveScanningExam(null);
          return true;
        }
        if (activeLeaderboardExam) {
          setActiveLeaderboardExam(null);
          return true;
        }
        if (previewingSet) {
          setPreviewingSet(null);
          return true;
        }
        if (showBulkImport) {
          setShowBulkImport(false);
          return true;
        }
        if (onBack) {
          onBack();
          return true;
        }
        return false;
      });
    }
    return () => {
      if (registerBackHandler) registerBackHandler(null);
    };
  }, [registerBackHandler, activeScanningExam, activeLeaderboardExam, previewingSet, showBulkImport, onBack]);

  // ========================================================
  // 1. REAL-TIME FIREBASE FIRESTORE SUBSCRIPTION
  // ========================================================
  useEffect(() => {
    setIsLoading(true);
    const examsCollectionRef = collection(db, 'exams');

    const unsubscribe = onSnapshot(
      examsCollectionRef,
      (snapshot) => {
        const list: StoredExam[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.sets || data.masterQuestions || data.isOffline || data.examType === 'offline') {
            list.push({
              id: docSnap.id,
              examId: data.examId || docSnap.id,
              examName: data.examName || data.title || 'Untitled Exam',
              title: data.title || data.examName || 'Untitled Exam',
              courseName: data.courseName || 'General',
              courseId: data.courseId || 'general',
              masterQuestions: data.masterQuestions || [],
              sets: data.sets || [],
              totalSets: data.totalSets || (data.sets ? data.sets.length : 0),
              totalQuestions: data.totalQuestions || (data.masterQuestions ? data.masterQuestions.length : 0),
              isOffline: Boolean(data.isOffline),
              examType: data.examType || 'offline',
              isActive: data.isActive !== false,
              createdAt: data.createdAt || 0,
              updatedAt: data.updatedAt || data.createdAt || 0
            });
          }
        });

        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setExams(list);
        setIsLoading(false);
      },
      (error) => {
        console.error('Firebase Firestore listener error:', error);
        setIsLoading(false);
        toastError('Firestore sync error: ' + error.message);
      }
    );

    return () => unsubscribe();
  }, [toastError]);

  // Manual refresh / sync query from Firestore
  const handleManualSync = async () => {
    setIsLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'exams'));
      const list: StoredExam[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.sets || data.masterQuestions || data.isOffline || data.examType === 'offline') {
          list.push({
            id: d.id,
            examId: data.examId || d.id,
            examName: data.examName || data.title || 'Untitled Exam',
            title: data.title || data.examName || 'Untitled Exam',
            courseName: data.courseName || 'General',
            courseId: data.courseId || 'general',
            masterQuestions: data.masterQuestions || [],
            sets: data.sets || [],
            totalSets: data.totalSets || (data.sets ? data.sets.length : 0),
            totalQuestions: data.totalQuestions || (data.masterQuestions ? data.masterQuestions.length : 0),
            isOffline: Boolean(data.isOffline),
            createdAt: data.createdAt || 0
          });
        }
      });
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setExams(list);
      toastSuccess('Cloud Firestore এর সাথে সম্পূর্ণ সিঙ্ক হয়েছে!');
    } catch (err: any) {
      console.error('Manual Firestore sync error:', err);
      toastError('Sync failed: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 1-Click Load 100 Demo MCQs matching the demo PDF
  const handleLoadDemo100Questions = () => {
    const demoQuestions: QuestionInput[] = DEMO_100_QUESTIONS.map(item => ({
      questionText: item.q,
      options: [
        { text: item.a, isCorrect: item.ans === 'A' },
        { text: item.b, isCorrect: item.ans === 'B' },
        { text: item.c, isCorrect: item.ans === 'C' },
        { text: item.d, isCorrect: item.ans === 'D' }
      ],
      explanation: item.exp || ''
    }));

    setQuestions(demoQuestions);
    setExamName('Weekly Exam - 01');
    setCourseName('Biology 1st Paper (Chapter-01)');
    setTotalSets('10');
    toastSuccess('সফল! ডেমো পিডিএফ এর হুবহু ১০০টি প্রশ্ন (Biology, Chemistry, Physics & GK) লোড হয়েছে!');
  };

  // Add Question Manually
  const handleAddQuestion = () => {
    setQuestions([
      ...questions,
      {
        questionText: '',
        options: [
          { text: '', isCorrect: true },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false },
          { text: '', isCorrect: false }
        ],
        explanation: singleExplanation.trim()
      }
    ]);
    setSingleExplanation('');
  };

  // Delete Question
  const handleDeleteQuestion = (index: number) => {
    if (questions.length <= 1) {
      toastError('কমপক্ষে একটি প্রশ্ন থাকতে হবে!');
      return;
    }
    const updated = questions.filter((_, i) => i !== index);
    setQuestions(updated);
  };

  // Update Option text
  const handleOptionChange = (qIndex: number, optIndex: number, text: string) => {
    const updated = [...questions];
    updated[qIndex].options[optIndex].text = text;
    setQuestions(updated);
  };

  // Mark Option as Correct
  const handleSetCorrectOption = (qIndex: number, optIndex: number) => {
    const updated = [...questions];
    updated[qIndex].options = updated[qIndex].options.map((opt, i) => ({
      ...opt,
      isCorrect: i === optIndex
    }));
    setQuestions(updated);
  };

  // AI & Regex Bulk Question Parser
  const handleApplyBulkImport = async () => {
    if (!bulkText.trim()) {
      toastError('টেক্সট বক্সে প্রশ্ন পেস্ট করুন!');
      return;
    }

    setIsParsingAi(true);

    try {
      // 1. Try backend AI parser endpoint
      const res = await fetch('/api/ai/parse-mcqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: bulkText })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.questions) && data.questions.length > 0) {
          const parsedList: QuestionInput[] = data.questions.map((q: any) => ({
            questionText: q.questionText,
            options: (q.options || []).map((opt: any) => ({
              text: opt.text,
              isCorrect: Boolean(opt.isCorrect)
            })),
            explanation: q.explanation || ''
          }));

          setQuestions(parsedList);
          setShowBulkImport(false);
          setBulkText('');
          toastSuccess(`অভিনন্দন! AI দ্বারা মোট ${parsedList.length}টি প্রশ্ন সঠিকভাবে পার্স ও যুক্ত হয়েছে!`);
          return;
        }
      }
    } catch (err) {
      console.warn('Backend parse error, using client regex:', err);
    } finally {
      setIsParsingAi(false);
    }

    // Client-side Regex Parser Fallback
    const lines = bulkText.split('\n').map(l => l.trim()).filter(l => l !== '');
    const parsed: QuestionInput[] = [];

    let currentQ = '';
    let currentOpts: string[] = [];
    let currentAnsIdx = 0;
    let currentExp = '';

    const isQLine = (l: string) => /^(\d+|[০-৯]+)[\.\)\-:]/i.test(l) || /^(?:Q|প্রশ্ন)\s*(\d+|[০-৯]+)[\.\)\-:]/i.test(l);
    const isOptLine = (l: string) => /^(?:\(?)?([A-Da-d]|[কখগঘ])[\.\)\-:]/.test(l);

    lines.forEach((line) => {
      if (isQLine(line)) {
        if (currentQ && currentOpts.length >= 2) {
          while (currentOpts.length < 4) currentOpts.push(`Option ${currentOpts.length + 1}`);
          parsed.push({
            questionText: currentQ,
            options: currentOpts.slice(0, 4).map((text, idx) => ({
              text,
              isCorrect: idx === currentAnsIdx
            })),
            explanation: currentExp
          });
        }
        currentQ = line.replace(/^(?:(?:Q|প্রশ্ন)\s*)?(\d+|[০-৯]+)[\.\)\-:]\s*/i, '');
        currentOpts = [];
        currentAnsIdx = 0;
        currentExp = '';
      } else if (isOptLine(line)) {
        const text = line.replace(/^(?:\(?)?([A-Da-d]|[কখগঘ])[\.\)\-:]\s*/, '');
        currentOpts.push(text);
      } else if (line.toLowerCase().includes('ans') || line.toLowerCase().includes('সঠিক') || line.includes('উত্তর')) {
        const up = line.toUpperCase();
        if (up.includes('B') || line.includes('খ')) currentAnsIdx = 1;
        else if (up.includes('C') || line.includes('গ')) currentAnsIdx = 2;
        else if (up.includes('D') || line.includes('ঘ')) currentAnsIdx = 3;
        else currentAnsIdx = 0;
      } else if (line.toLowerCase().startsWith('explanation') || line.startsWith('ব্যাখ্যা')) {
        currentExp = line.replace(/^(?:explanation|ব্যাখ্যা)[\:\-\=]\s*/i, '');
      } else if (currentQ && currentOpts.length === 0) {
        currentQ += ' ' + line;
      }
    });

    if (currentQ && currentOpts.length >= 2) {
      while (currentOpts.length < 4) currentOpts.push(`Option ${currentOpts.length + 1}`);
      parsed.push({
        questionText: currentQ,
        options: currentOpts.slice(0, 4).map((text, idx) => ({
          text,
          isCorrect: idx === currentAnsIdx
        })),
        explanation: currentExp
      });
    }

    if (parsed.length > 0) {
      setQuestions(parsed);
      setShowBulkImport(false);
      setBulkText('');
      toastSuccess(`${parsed.length}টি প্রশ্ন সফলভাবে পার্স ও যুক্ত করা হয়েছে!`);
    } else {
      toastError('কোনো সঠিক প্রশ্ন শনাক্ত করা যায়নি। ফরম্যাট চেক করুন।');
    }
  };

  // ========================================================
  // 2. SAVE MASTER EXAM & GENERATE UNIQUE SETS DIRECTLY INTO FIRESTORE
  // ========================================================
  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examName.trim() || !courseName.trim()) {
      toastError('Exam Name ও Course Name আবশ্যক!');
      return;
    }

    const validQuestions = questions.filter(q => q.questionText.trim() !== '');
    if (validQuestions.length === 0) {
      toastError('কমপক্ষে একটি প্রশ্ন লিখুন!');
      return;
    }

    setIsSubmitting(true);
    const setsCount = Math.min(Math.max(parseInt(totalSets, 10) || 1, 1), 20);
    const examId = 'offline_' + Date.now();
    const negVal = parseFloat(negativeMark) || 0.25;

    try {
      // 1. Generate unique randomized sets (Set-01 to Set-XX)
      const generatedSets: GeneratedExamSet[] = [];
      for (let i = 1; i <= setsCount; i++) {
        const setCode = `Set-${String(i).padStart(2, '0')}`;

        // Shuffle questions
        const shuffledQuestions = [...validQuestions].sort(() => Math.random() - 0.5);

        const finalQuestions: GeneratedSetQuestion[] = shuffledQuestions.map((q, idx) => {
          // Shuffle options
          const shuffledOpts = [...q.options].sort(() => Math.random() - 0.5);
          const correctIdx = shuffledOpts.findIndex(opt => opt.isCorrect);

          return {
            qNo: idx + 1,
            questionText: q.questionText,
            options: shuffledOpts.map(o => o.text),
            correctAnswer: correctIdx >= 0 ? correctIdx : 0
          };
        });

        generatedSets.push({
          setName: setCode,
          setCode,
          qrData: `OMR:${examId}:${setCode}`,
          questions: finalQuestions
        });
      }

      // 2. Prepare comprehensive Firestore document
      const now = Date.now();
      const examDocData: StoredExam = {
        id: examId,
        examId,
        examName: examName.trim(),
        title: examName.trim(),
        courseName: courseName.trim(),
        courseId: 'general',
        masterQuestions: validQuestions,
        questions: validQuestions.map((q, idx) => {
          const correctIdx = q.options.findIndex(opt => opt.isCorrect);
          return {
            id: `q_${idx + 1}`,
            text: q.questionText,
            options: q.options.map((opt, oIdx) => ({
              id: String.fromCharCode(65 + oIdx),
              text: opt.text
            })),
            correctOption: String.fromCharCode(65 + (correctIdx >= 0 ? correctIdx : 0)),
            explanation: q.explanation || ''
          };
        }),
        sets: generatedSets,
        offlineSets: generatedSets.map((s) => ({
          setCode: s.setCode,
          qrData: `OMR:${examId}:${s.setCode}`,
          questions: s.questions.map((q, qIdx) => ({
            questionNumber: q.qNo || (qIdx + 1),
            masterQuestionId: `mq_${qIdx + 1}`,
            text: q.questionText,
            options: q.options.map((opt, oIdx) => ({
              id: String.fromCharCode(65 + oIdx),
              text: opt
            })),
            correctOption: String.fromCharCode(65 + (q.correctAnswer || 0))
          })),
          answerKey: s.questions.reduce((acc, q, qIdx) => {
            acc[q.qNo || (qIdx + 1)] = String.fromCharCode(65 + (q.correctAnswer || 0));
            return acc;
          }, {} as Record<number, string>),
          createdAt: now
        })),
        totalSets: setsCount,
        totalQuestions: validQuestions.length,
        totalMarks: validQuestions.length * 1,
        durationMinutes: 90,
        passMark: Math.ceil(validQuestions.length * 0.4),
        negativeMarkPercentage: negVal,
        isOffline: true,
        examType: 'offline',
        isActive: true,
        createdAt: now,
        updatedAt: now
      };

      // 3. STORE DIRECTLY INTO FIREBASE CLOUD FIRESTORE
      await setDoc(doc(db, 'exams', examId), examDocData);
      console.log('[Firestore] Document saved successfully:', examId);

      toastSuccess(`অভিনন্দন! "${examName}" এবং ${setsCount}টি ইউনিক সেট সরাসরি Firebase Firestore এ সেভ হয়েছে!`);
    } catch (err: any) {
      console.error('[Firestore Error] Save exam failed:', err);
      toastError('Firebase Firestore এ সেভ করতে সমস্যা হয়েছে: ' + (err.message || 'Database error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Permanent Delete Using Firestore deleteDoc
  const handleDeleteExam = async (examId: string) => {
    if (!window.confirm('আপনি কি নিশ্চিত যে এই পরীক্ষা এবং এর সকল ইউনিক সেট ক্লাউড ডাটাবেজ (Firestore) থেকে মুছে ফেলতে চান?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'exams', examId));
      fetch(`/api/exams/${examId}`, { method: 'DELETE' }).catch(() => {});
      toastSuccess('পরীক্ষাটি ডাটাবেজ থেকে মুছে ফেলা হয়েছে।');
    } catch (err: any) {
      console.error('[Firestore Error] Delete failed:', err);
      toastError('ডিলিট করতে সমস্যা হয়েছে: ' + err.message);
    }
  };

  // Convert StoredExam to normal Exam object
  const toExamModel = (stored: StoredExam): Exam => {
    const rawSets = stored.sets || (stored.offlineSets as any) || [];
    return {
      id: stored.id,
      courseId: stored.courseId || 'general',
      courseName: stored.courseName || 'General',
      title: stored.examName || stored.title || 'Offline Exam',
      durationMinutes: stored.durationMinutes || 90,
      totalMarks: stored.totalMarks || stored.totalQuestions || 100,
      totalQuestions: stored.totalQuestions || 100,
      passMark: stored.passMark || 40,
      negativeMarkPercentage: stored.negativeMarkPercentage !== undefined ? stored.negativeMarkPercentage : 0.25,
      startTime: stored.createdAt || Date.now(),
      endTime: (stored.createdAt || Date.now()) + 3600000,
      resultPublishTime: (stored.createdAt || Date.now()) + 7200000,
      isOffline: true,
      examType: 'offline',
      isActive: stored.isActive !== false,
      questions: (stored.questions && stored.questions.length > 0)
        ? stored.questions
        : (stored.masterQuestions || []).map((q, idx) => ({
            id: `q_${idx + 1}`,
            text: q.questionText,
            options: (q.options || []).map((o: any, oIdx: number) => ({
              id: String.fromCharCode(65 + oIdx),
              text: o.text
            })),
            correctOption: String.fromCharCode(65 + (q.options?.findIndex((o: any) => o.isCorrect) || 0))
          })),
      offlineSets: rawSets.map((s: any) => ({
        setCode: s.setCode,
        qrData: s.qrData || `OMR:${stored.id}:${s.setCode}`,
        questions: (s.questions || []).map((q: any, qIdx: number) => ({
          questionNumber: q.qNo || (qIdx + 1),
          masterQuestionId: `mq_${qIdx + 1}`,
          text: q.questionText,
          options: (q.options || []).map((optText: string, oIdx: number) => ({
            id: String.fromCharCode(65 + oIdx),
            text: optText
          })),
          correctOption: String.fromCharCode(65 + (q.correctAnswer || 0))
        })),
        answerKey: s.answerKey || (s.questions || []).reduce((acc: any, q: any, qIdx: number) => {
          acc[q.qNo || (qIdx + 1)] = String.fromCharCode(65 + (q.correctAnswer || 0));
          return acc;
        }, {}),
        createdAt: s.createdAt || Date.now()
      })),
      createdAt: stored.createdAt || Date.now()
    };
  };

  // Download PDF matching Demo Layout (Portrait 3-Pages)
  const handleDownloadSetPdf = async (exam: StoredExam, targetSet: GeneratedExamSet) => {
    setDownloadingSetCode(targetSet.setCode);
    const setLetter = targetSet.setCode;

    try {
      const normalizedExam = toExamModel(exam);
      const normalizedSet: OfflineExamSet = {
        setCode: setLetter,
        qrData: targetSet.qrData || `OMR:${exam.id}:${setLetter}`,
        questions: (targetSet.questions || []).map((q, idx) => ({
          questionNumber: q.qNo || idx + 1,
          masterQuestionId: `mq_${idx + 1}`,
          text: q.questionText,
          options: (q.options || []).map((optText, oIdx) => ({
            id: String.fromCharCode(65 + oIdx),
            text: optText
          })),
          correctOption: String.fromCharCode(65 + (q.correctAnswer || 0))
        })),
        answerKey: (targetSet.questions || []).reduce((acc, q, idx) => {
          acc[q.qNo || idx + 1] = String.fromCharCode(65 + (q.correctAnswer || 0));
          return acc;
        }, {} as Record<number, string>),
        createdAt: exam.createdAt || Date.now()
      };

      await downloadExamPdfSmart(normalizedExam, normalizedSet, setLetter);
      toastSuccess(`সেট "${setLetter}" এর ওএমআর ও ৩-পৃষ্ঠার প্রশ্নপত্র PDF ডাউনলোড শুরু হয়েছে!`);
    } catch (pdfErr: any) {
      console.error('PDF Generation Error:', pdfErr);
      toastError(pdfErr?.message || 'পিডিএফ ডাউনলোড করতে ব্যর্থ হয়েছে');
    } finally {
      setDownloadingSetCode(null);
    }
  };

  // Download Teacher Solution Sheet
  const handleDownloadSolutionKey = async (exam: StoredExam, targetSet: GeneratedExamSet) => {
    try {
      const normalizedExam = toExamModel(exam);
      const normalizedSet: OfflineExamSet = {
        setCode: targetSet.setCode,
        qrData: targetSet.qrData || `OMR:${exam.id}:${targetSet.setCode}`,
        questions: (targetSet.questions || []).map((q, idx) => ({
          questionNumber: q.qNo || idx + 1,
          masterQuestionId: `mq_${idx + 1}`,
          text: q.questionText,
          options: (q.options || []).map((optText, oIdx) => ({
            id: String.fromCharCode(65 + oIdx),
            text: optText
          })),
          correctOption: String.fromCharCode(65 + (q.correctAnswer || 0))
        })),
        answerKey: (targetSet.questions || []).reduce((acc, q, idx) => {
          acc[q.qNo || idx + 1] = String.fromCharCode(65 + (q.correctAnswer || 0));
          return acc;
        }, {} as Record<number, string>),
        createdAt: exam.createdAt || Date.now()
      };

      const blob = await generateSolutionKeyPDF(normalizedExam, normalizedSet);
      const safeExamTitle = (exam.examName || exam.title || 'Exam').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `Solution_Key_${safeExamTitle}_${targetSet.setCode}.pdf`;
      downloadPdfBlob(blob, filename);
      toastSuccess(`সেট "${targetSet.setCode}" এর শিক্ষক সলিউশন শিট ডাউনলোড সম্পন্ন হয়েছে!`);
    } catch (err: any) {
      toastError('সলিউশন কি ডাউনলোড ব্যর্থ হয়েছে');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 pt-4 pb-52 sm:pb-44 space-y-8 min-h-screen">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-theme-border">
        <div>
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white mb-2 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Portal</span>
            </button>
          )}
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-600/20 text-blue-500 border border-blue-500/30">
              <Layers className="w-6 h-6" />
            </span>
            <span>Offline Exam Management & Smart OMR Evaluation</span>
          </h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              ১০০টি এমসিকিউ বাল্ক আপলোড, ইউনিক শাফেল্ড সেট জেনারেশন (Set-01 to Set-XX) ও মোবাইল ক্যামেরা ওএমআর স্ক্যানার।
            </p>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
              <Wifi className="w-3 h-3 text-emerald-400" />
              <span>Cloud Firestore Connected</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={handleLoadDemo100Questions}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 text-xs font-bold cursor-pointer transition-all"
            title="ডেমো পিডিএফ এর হুবহু ১০০টি প্রশ্ন ১ ক্লিকে লোড করুন"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>ডেমো ১০০ প্রশ্ন লোড করুন</span>
          </button>

          <button
            onClick={() => setShowBulkImport(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/30 text-xs font-semibold cursor-pointer transition-all"
          >
            <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
            <span>বাল্ক প্রশ্ন পেস্ট (AI Parser)</span>
          </button>

          <button
            onClick={handleManualSync}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-theme-surface border border-theme-border hover:bg-slate-800 text-xs font-medium text-slate-300 cursor-pointer transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-theme-card border border-theme-border-card rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <span>বাল্ক টেক্সট পেস্ট ও AI পার্সিং (Up to 100 MCQs)</span>
              </h3>
              <button
                onClick={() => setShowBulkImport(false)}
                className="text-slate-400 hover:text-white text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-300">
              নিচের ফরম্যাটে একসাথে ১০০টি পর্যন্ত প্রশ্ন পেস্ট করুন (Question stem, Options A/B/C/D, Correct Answer, Explanation):
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="1. What is the SI unit of electric current?
A. Volt
B. Ampere
C. Ohm
D. Watt
Ans: B
Explanation: Ampere (A) is the base SI unit of electric current.

2. Which gas is most abundant in Earth's atmosphere?
A. Oxygen
B. Hydrogen
C. Nitrogen
D. Carbon Dioxide
Ans: C"
              rows={10}
              className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-slate-100 focus:outline-hidden focus:border-indigo-500"
            />
            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => setBulkText(getDemo100QuestionsRawText())}
                className="text-xs text-indigo-400 hover:underline cursor-pointer font-medium"
              >
                + ইনসার্ট ডেমো ১০০ প্রশ্ন ফরম্যাট
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkImport(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  onClick={handleApplyBulkImport}
                  disabled={isParsingAi}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isParsingAi ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>AI পার্সিং চলছে...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>প্রশ্ন পার্স ও ভ্যালিডেট করুন</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ১. এক্সাম ও মাস্টার প্রশ্ন তৈরির ফর্ম */}
      <form 
        onSubmit={handleSaveExam}
        className="p-6 rounded-2xl bg-theme-card border border-theme-border-card shadow-lg space-y-6"
      >
        <div className="flex items-center justify-between pb-3 border-b border-theme-border">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-500" />
            <span>Master Exam Creation & Unique Set Generation</span>
          </h3>
          <span className="text-xs text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/60 px-3 py-1 rounded-full">
            মাস্টার সেট: {questions.length} / 100 প্রশ্ন প্রস্তুত
          </span>
        </div>

        {/* Input Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Exam Title (পরীক্ষার নাম) *
            </label>
            <input
              type="text"
              placeholder="e.g. Weekly Exam - 01"
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Course / Subject Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Biology 1st Paper (Chapter-01)"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Number of Unique Sets (১ থেকে ২০) *
            </label>
            <input
              type="number"
              min="1"
              max="20"
              placeholder="1 to 20"
              value={totalSets}
              onChange={(e) => setTotalSets(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Set-01 থেকে Set-10 পর্যন্ত স্বয়ংক্রিয় শাফেল্ড সেট
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Negative Mark / Wrong Answer
            </label>
            <input
              type="text"
              placeholder="0.25"
              value={negativeMark}
              onChange={(e) => setNegativeMark(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Master Questions List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-300">
              Master Questions Bank ({questions.length} Items)
            </h4>
            <span className="text-xs text-slate-400">
              প্রতিটি অপশন নির্বাচন করে সঠিক উত্তর চিহ্নিত করুন
            </span>
          </div>

          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
            {questions.map((q, qIndex) => (
              <div 
                key={qIndex} 
                className="p-3.5 sm:p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 relative group hover:border-slate-700 transition-all"
              >
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <span className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-500/30">
                    {qIndex + 1}
                  </span>
                  <input
                    type="text"
                    placeholder={`Question ${qIndex + 1} Stem (প্রশ্ন)`}
                    value={q.questionText}
                    onChange={(e) => {
                      const updated = [...questions];
                      updated[qIndex].questionText = e.target.value;
                      setQuestions(updated);
                    }}
                    required
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs sm:text-sm text-slate-100 focus:border-blue-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteQuestion(qIndex)}
                    className="p-2 rounded-lg bg-rose-600/20 text-rose-400 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
                    title="Delete Question"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* 4 Options Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-0 sm:pl-9">
                  {q.options.map((opt, optIndex) => {
                    const label = String.fromCharCode(65 + optIndex);
                    return (
                      <div 
                        key={optIndex}
                        onClick={() => handleSetCorrectOption(qIndex, optIndex)}
                        className={`flex items-center gap-2 p-2 px-3 rounded-xl border transition-all cursor-pointer ${
                          opt.isCorrect 
                            ? 'bg-emerald-950/50 border-emerald-500/60 shadow-xs' 
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetCorrectOption(qIndex, optIndex);
                          }}
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 cursor-pointer ${
                            opt.isCorrect
                              ? 'bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-400/40'
                              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                          }`}
                        >
                          {label}
                        </button>
                        <input
                          type="text"
                          placeholder={`Option ${label}`}
                          value={opt.text}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleOptionChange(qIndex, optIndex, e.target.value)}
                          required
                          className="flex-1 bg-transparent border-0 text-xs sm:text-sm text-slate-200 focus:outline-hidden"
                        />
                        {opt.isCorrect && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleAddQuestion}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold cursor-pointer transition-all border border-slate-700"
            >
              <Plus className="w-4 h-4 text-blue-400" />
              <span>+ Add Single Question Form</span>
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-950/40 cursor-pointer transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving & Generating Sets...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Generate Shuffled Sets & Save (Firestore)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* ড্যাশবোর্ড: ক্লাউড ফায়ারস্টোরে সংরক্ষিত অফলাইন এক্সাম লিস্ট */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            <span>Dashboard: Offline Exams & OMR Sets</span>
          </h3>
          <span className="text-xs px-2.5 py-1 rounded-full bg-theme-surface border border-theme-border text-slate-400 font-semibold">
            {exams.length} Cloud Exams
          </span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center rounded-2xl bg-theme-card border border-theme-border-card text-slate-400 space-y-2">
            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Firebase Firestore থেকে ডাটা লোড হচ্ছে...</p>
          </div>
        ) : exams.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-theme-card border border-theme-border-card text-slate-400 space-y-2">
            <FileText className="w-12 h-12 mx-auto text-slate-600 opacity-60" />
            <h4 className="text-base font-semibold text-slate-300">কোনো অফলাইন এক্সাম তৈরি করা হয়নি</h4>
            <p className="text-xs text-slate-500">
              উপরের "ডেমো ১০০ প্রশ্ন লোড করুন" বাটনে চাপুন অথবা নতুন প্রশ্ন পেস্ট করে এক্সাম তৈরি করুন।
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {exams.map((exam) => {
              const examModel = toExamModel(exam);
              return (
                <div
                  key={exam.id}
                  className="p-5 rounded-2xl bg-theme-card border border-theme-border-card shadow-md space-y-4 hover:border-blue-500/40 transition-all"
                >
                  {/* Exam Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-theme-border">
                    <div>
                      <h4 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                        <span>{exam.examName || exam.title}</span>
                        <span className="px-2 py-0.5 rounded-md bg-blue-600/20 text-blue-400 text-xs font-mono">
                          {exam.sets?.length || exam.totalSets || 0} Sets
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        <b>Course:</b> {exam.courseName} | <b>Total MCQs:</b> {exam.masterQuestions?.length || exam.totalQuestions || 0} | <b>Negative:</b> -{exam.negativeMarkPercentage || 0.25}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                      {/* Mobile OMR Scanner Button */}
                      <button
                        onClick={() => setActiveScanningExam(examModel)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors"
                        title="এই পরীক্ষার খাতা স্ক্যান ও মূল্যায়ন করুন"
                      >
                        <Scan className="w-3.5 h-3.5" />
                        <span>ক্যামেরা OMR স্ক্যানার</span>
                      </button>

                      {/* Combined Leaderboard */}
                      <button
                        onClick={() => setActiveLeaderboardExam(examModel)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600/20 text-amber-300 border border-amber-500/30 hover:bg-amber-600 hover:text-white text-xs font-bold cursor-pointer transition-colors"
                      >
                        <Trophy className="w-3.5 h-3.5 text-amber-400" />
                        <span>মেরিট লিস্ট</span>
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDeleteExam(exam.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white text-xs font-semibold cursor-pointer transition-colors border border-rose-500/30"
                        title="মুছে ফেলুন"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Unique Sets Download Grid (Strictly matching Demo Layout) */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-blue-400" />
                      <span>ইউনিক প্রশ্ন সেটসমূহ (হুবহু ডেমো পিডিএফ লেআউট ডাউনলোড ও প্রিন্ট):</span>
                    </div>

                    {(!exam.sets || exam.sets.length === 0) ? (
                      <div className="text-xs text-slate-500 italic p-3 bg-slate-900/40 rounded-xl">
                        কোনো সেট পাওয়া যায়নি।
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {exam.sets.map((set) => (
                          <div
                            key={set.setCode}
                            className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3 group hover:border-slate-700 transition-all"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 font-extrabold text-xs flex items-center justify-center shrink-0">
                                {set.setCode}
                              </span>
                              <div>
                                <div className="text-xs font-bold text-slate-200">
                                  {set.setName || set.setCode}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {set.questions?.length || 100} MCQs শাফেল্ড
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* 3-Page Demo Matching PDF Download */}
                              <button
                                type="button"
                                disabled={downloadingSetCode === set.setCode}
                                onClick={() => handleDownloadSetPdf(exam, set)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors disabled:opacity-60"
                                title="হুবহু ডেমো লেআউট ওএমআর ও প্রশ্ন PDF ডাউনলোড"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>PDF</span>
                              </button>

                              {/* Solution Key */}
                              <button
                                type="button"
                                onClick={() => handleDownloadSolutionKey(exam, set)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 cursor-pointer"
                                title="শিক্ষক সলিউশন কি"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>

                              {/* Preview */}
                              <button
                                type="button"
                                onClick={() => setPreviewingSet({ examName: exam.examName || exam.title, set })}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                                title="প্রশ্ন ক্রম দেখুন"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Set Preview Modal */}
      {previewingSet && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-theme-card border border-theme-border-card rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-theme-border">
              <h3 className="font-bold text-white text-base">
                {previewingSet.examName} - {previewingSet.set.setName} ({previewingSet.set.questions?.length} MCQs)
              </h3>
              <button
                onClick={() => setPreviewingSet(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-2 text-xs">
              {previewingSet.set.questions?.map((q, idx) => (
                <div key={idx} className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                  <div className="font-bold text-slate-100 mb-1">
                    {idx + 1}. {q.questionText}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-slate-400">
                    {q.options?.map((opt, oIdx) => (
                      <div
                        key={oIdx}
                        className={`p-1.5 rounded-lg ${
                          oIdx === q.correctAnswer ? 'bg-emerald-950/60 text-emerald-300 font-bold border border-emerald-800/60' : 'bg-slate-950'
                        }`}
                      >
                        ({String.fromCharCode(65 + oIdx)}) {opt}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* OMR Camera Scanner Modal */}
      {activeScanningExam && (
        <OmrScannerModal
          exam={activeScanningExam}
          students={students}
          isOpen={true}
          onClose={() => setActiveScanningExam(null)}
        />
      )}

      {/* Offline Leaderboard Modal */}
      {activeLeaderboardExam && (
        <OfflineLeaderboardModal
          exam={activeLeaderboardExam}
          submissions={initialSubmissions || liveSubmissions}
          isOpen={true}
          onClose={() => setActiveLeaderboardExam(null)}
        />
      )}
    </div>
  );
};
