import React, { useState, useEffect } from 'react';
import { 
  FileText, Plus, Trash2, Download, Printer, Layers, 
  CheckCircle2, RefreshCw, AlertCircle, Sparkles, BookOpen, 
  ChevronRight, ArrowLeft, ExternalLink, HelpCircle, CloudCheck, Wifi
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
import { jsPDF } from 'jspdf';

interface QuestionOption {
  text: string;
  isCorrect: boolean;
}

interface QuestionInput {
  questionText: string;
  options: QuestionOption[];
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
  totalSets?: number;
  totalQuestions?: number;
  isOffline?: boolean;
  examType?: string;
  isActive?: boolean;
  createdAt: number;
  updatedAt?: number;
}

interface OfflineOmrManagerProps {
  onBack?: () => void;
}

export const OfflineOmrManager: React.FC<OfflineOmrManagerProps> = ({ onBack }) => {
  const { success: toastSuccess, error: toastError } = useToast();

  const [exams, setExams] = useState<StoredExam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dbConnected, setDbConnected] = useState(true);

  // Form State
  const [examName, setExamName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [totalSets, setTotalSets] = useState('4');
  const [questions, setQuestions] = useState<QuestionInput[]>([
    {
      questionText: '',
      options: [
        { text: '', isCorrect: true },
        { text: '', isCorrect: false },
        { text: '', isCorrect: false },
        { text: '', isCorrect: false }
      ]
    }
  ]);

  // Bulk import modal/toggle
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // Selected set to preview
  const [previewingSet, setPreviewingSet] = useState<{ examName: string; set: GeneratedExamSet } | null>(null);

  // ========================================================
  // 1. REAL-TIME FIREBASE FIRESTORE SUBSCRIPTION (Zero "Failed to fetch")
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
          // Filter or map exams with sets / offline configuration
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

        // Sort descending by creation date
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setExams(list);
        setIsLoading(false);
        setDbConnected(true);
      },
      (error) => {
        console.error('Firebase Firestore listener error:', error);
        setDbConnected(false);
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
      setDbConnected(true);
      toastSuccess('Cloud Firestore এর সাথে সম্পূর্ণ সিঙ্ক হয়েছে!');
    } catch (err: any) {
      console.error('Manual Firestore sync error:', err);
      toastError('Sync failed: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Add Question
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
        ]
      }
    ]);
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

  // Bulk Question Parser
  const handleApplyBulkImport = () => {
    if (!bulkText.trim()) return;
    const lines = bulkText.split('\n').map(l => l.trim()).filter(l => l !== '');
    const parsed: QuestionInput[] = [];

    let currentQ = '';
    let currentOpts: string[] = [];
    let currentAnsIdx = 0;

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
            }))
          });
        }
        currentQ = line.replace(/^(?:(?:Q|প্রশ্ন)\s*)?(\d+|[০-৯]+)[\.\)\-:]\s*/i, '');
        currentOpts = [];
        currentAnsIdx = 0;
      } else if (isOptLine(line)) {
        const text = line.replace(/^(?:\(?)?([A-Da-d]|[কখগঘ])[\.\)\-:]\s*/, '');
        currentOpts.push(text);
      } else if (line.toLowerCase().includes('ans') || line.toLowerCase().includes('সঠিক') || line.includes('উত্তর')) {
        const up = line.toUpperCase();
        if (up.includes('B') || line.includes('খ')) currentAnsIdx = 1;
        else if (up.includes('C') || line.includes('গ')) currentAnsIdx = 2;
        else if (up.includes('D') || line.includes('ঘ')) currentAnsIdx = 3;
        else currentAnsIdx = 0;
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
        }))
      });
    }

    if (parsed.length > 0) {
      setQuestions(parsed);
      setShowBulkImport(false);
      setBulkText('');
      toastSuccess(`${parsed.length} টি প্রশ্ন সফলভাবে ইমপোর্ট করা হয়েছে!`);
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

    try {
      // 1. Generate unique randomized sets (Set A to Set T)
      const generatedSets: GeneratedExamSet[] = [];
      for (let i = 1; i <= setsCount; i++) {
        const setCode = String.fromCharCode(64 + i); // Set A, B, C...

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
          setName: `Set ${setCode}`,
          setCode,
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
        sets: generatedSets,
        totalSets: setsCount,
        totalQuestions: validQuestions.length,
        isOffline: true,
        examType: 'offline',
        isActive: true,
        createdAt: now,
        updatedAt: now
      };

      // 3. STORE DIRECTLY INTO FIREBASE CLOUD FIRESTORE
      await setDoc(doc(db, 'exams', examId), examDocData);
      console.log('[Firestore] Document saved successfully:', examId);

      // 4. Background notification to backend API for sync (optional & non-blocking)
      fetch('/api/exams/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examName: examName.trim(),
          courseName: courseName.trim(),
          totalSets: setsCount,
          masterQuestions: validQuestions
        })
      }).catch(() => {
        // Safe to ignore because Firestore is already updated
      });

      toastSuccess(`অভিনন্দন! "${examName}" এবং ${setsCount} টি ইউনিক সেট সরাসরি Firebase Firestore এ সেভ হয়েছে!`);
      
      // Reset form
      setExamName('');
      setCourseName('');
      setTotalSets('4');
      setQuestions([
        {
          questionText: '',
          options: [
            { text: '', isCorrect: true },
            { text: '', isCorrect: false },
            { text: '', isCorrect: false },
            { text: '', isCorrect: false }
          ]
        }
      ]);
    } catch (err: any) {
      console.error('[Firestore Error] Save exam failed:', err);
      toastError('Firebase Firestore এ সেভ করতে সমস্যা হয়েছে: ' + (err.message || 'Database error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ========================================================
  // 3. PERMANENT DELETE USING FIRESTORE deleteDoc
  // ========================================================
  const handleDeleteExam = async (examId: string) => {
    if (!window.confirm('আপনি কি নিশ্চিত যে এই পরীক্ষা এবং এর সকল ইউনিক সেট ক্লাউড ডাটাবেজ (Firestore) থেকে স্থায়ীভাবে মুছে ফেলতে চান?')) {
      return;
    }

    try {
      // 1. Delete directly from Firebase Cloud Firestore
      await deleteDoc(doc(db, 'exams', examId));
      console.log('[Firestore] Exam deleted:', examId);

      // 2. Also notify backend API (non-blocking)
      fetch(`/api/exams/${examId}`, { method: 'DELETE' }).catch(() => {});

      toastSuccess('পরীক্ষাটি ক্লাউড ডাটাবেজ (Firestore) থেকে স্থায়ীভাবে মুছে ফেলা হয়েছে।');
    } catch (err: any) {
      console.error('[Firestore Error] Delete failed:', err);
      toastError('ডিলিট করতে সমস্যা হয়েছে: ' + err.message);
    }
  };

  // ========================================================
  // 4. CLIENT-SIDE PDF DOWNLOAD FALLBACK (100% Reliable Offline/Online)
  // ========================================================
  const handleDownloadSetPdf = async (exam: StoredExam, targetSet: GeneratedExamSet) => {
    try {
      // First attempt direct backend download route
      const pdfUrl = `/api/exams/${exam.examId}/set/${targetSet.setCode}/pdf`;
      const response = await fetch(pdfUrl, { method: 'HEAD' });

      if (response.ok) {
        // Trigger browser download directly
        const link = document.createElement('a');
        link.href = pdfUrl;
        link.download = `Exam_${exam.examName.replace(/\s+/g, '_')}_${targetSet.setName}.pdf`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
    } catch (e) {
      console.debug('Backend PDF streaming unavailable, generating via client-side jsPDF engine...');
    }

    // Client-side jsPDF generator fallback
    try {
      const pdf = new jsPDF({ format: 'a4', unit: 'mm' });
      const pageWidth = pdf.internal.pageSize.getWidth();

      // PAGE 1: OMR ANSWER SHEET
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.text("DOCTORS' CARE ACADEMY - MEDICAL ADMISSION MODEL TEST", pageWidth / 2, 16, { align: 'center' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.text(`Course: ${exam.courseName} | Exam: ${exam.examName} | Set: ${targetSet.setCode}`, pageWidth / 2, 23, { align: 'center' });

      // Student info box
      pdf.setDrawColor(40, 40, 40);
      pdf.setLineWidth(0.4);
      pdf.rect(12, 28, pageWidth - 24, 22);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text(`STUDENT ID: [                      ]   |   ROLL NO: [                      ]   |   SET CODE: [ ${targetSet.setCode} ]`, 16, 35);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.text('Instructions: 1. Use black ballpoint pen only. 2. Fill the bubbles completely. 3. Negative marking -0.25 per wrong answer.', 16, 42);
      pdf.text('Nirdeshaboli: 1. Kalo ballpoint kolom bebohar korun. 2. Shothik uttorer britto shompurno bhorat korun.', 16, 46);

      // OMR Grid Header
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text('OMR Answer Sheet (100 Questions Grid)', pageWidth / 2, 57, { align: 'center' });

      // Draw 25 rows x 4 columns = 100 questions grid
      let startY = 64;
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(7.5);

      for (let i = 1; i <= 25; i++) {
        const col1 = `${String(i).padStart(2, ' ')}. [A] [B] [C] [D]`;
        const col2 = `${String(i + 25).padStart(2, ' ')}. [A] [B] [C] [D]`;
        const col3 = `${String(i + 50).padStart(2, ' ')}. [A] [B] [C] [D]`;
        const col4 = `${String(i + 75).padStart(2, ' ')}. [A] [B] [C] [D]`;

        pdf.text(`${col1}   ${col2}   ${col3}   ${col4}`, 14, startY);
        startY += 5.2;
      }

      // PAGE 2: QUESTION PAPER
      pdf.addPage();
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.text(`Question Paper - ${exam.examName} (${targetSet.setName})`, pageWidth / 2, 16, { align: 'center' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(`Total Questions: ${targetSet.questions.length} | Set Code: ${targetSet.setCode}`, pageWidth / 2, 22, { align: 'center' });

      let qY = 30;
      targetSet.questions.forEach((q) => {
        if (qY > 270) {
          pdf.addPage();
          qY = 20;
        }

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        const qLines = pdf.splitTextToSize(`${q.qNo}. ${q.questionText}`, pageWidth - 24);
        pdf.text(qLines, 12, qY);
        qY += qLines.length * 4.5;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        const optA = q.options[0] || '';
        const optB = q.options[1] || '';
        const optC = q.options[2] || '';
        const optD = q.options[3] || '';
        const optsText = `   (A) ${optA}    (B) ${optB}    (C) ${optC}    (D) ${optD}`;
        const optLines = pdf.splitTextToSize(optsText, pageWidth - 24);
        pdf.text(optLines, 12, qY);
        qY += optLines.length * 4.5 + 2;
      });

      pdf.save(`Exam_${exam.examName.replace(/\s+/g, '_')}_${targetSet.setName}.pdf`);
      toastSuccess(`"${targetSet.setName}" এর মেডিকেল ওএমআর ও প্রশ্নপত্র সফলভাবে ডাউনলোড হয়েছে!`);
    } catch (pdfErr: any) {
      toastError('পিডিএফ ডাউনলোড করতে সমস্যা হয়েছে: ' + pdfErr.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
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
            <span>EdTech Offline Exam & OMR Manager</span>
          </h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              মাস্টার প্রশ্ন ইনপুট ও সর্বোচ্চ ২০টি ইউনিক শাফেল্ড সেট (Set A-T) সহ সরাসরি Firebase Cloud Firestore এ সংরক্ষণ।
            </p>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
              <Wifi className="w-3 h-3 text-emerald-400" />
              <span>Firestore Connected</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleManualSync}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-theme-surface border border-theme-border hover:bg-slate-800 text-xs font-medium text-slate-300 cursor-pointer transition-all"
            title="Firebase Firestore থেকে রিফ্রেশ করুন"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
            <span>Sync Firestore</span>
          </button>
          <button
            onClick={() => setShowBulkImport(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/30 text-xs font-semibold cursor-pointer transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>বাল্ক প্রশ্ন পেস্ট করুন</span>
          </button>
        </div>
      </div>

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-theme-card border border-theme-border-card rounded-2xl p-6 max-w-xl w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <span>বাল্ক টেক্সট থেকে প্রশ্ন ইমপোর্ট</span>
              </h3>
              <button
                onClick={() => setShowBulkImport(false)}
                className="text-slate-400 hover:text-white text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400">
              নিচের ফরম্যাটে একসাথে ৫০-১০০টি প্রশ্ন পেস্ট করুন:
              <br />
              <code>১. প্রশ্ন এখানে? A) অপশন ১ B) অপশন ২ C) অপশন ৩ D) অপশন ৪ Ans: B</code>
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="১. রক্তে হিমোগ্লোবিনের প্রধান উপাদান কোনটি?
A. লোহা
B. ক্যালসিয়াম
C. ম্যাগনেসিয়াম
D. জিঙ্ক
Ans: A

২. মানবদেহের বৃহত্তম অঙ্গ কোনটি?
A. যকৃত
B. ত্বক
C. ফুসফুস
D. হৃৎপিণ্ড
Ans: B"
              rows={8}
              className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono text-slate-200 focus:outline-hidden focus:border-indigo-500"
            />
            <div className="flex justify-end gap-2">
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
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
              >
                প্রশ্ন পার্স ও যুক্ত করুন
              </button>
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
            <span>Create Master Exam & Generate Sets</span>
          </h3>
          <span className="text-xs text-slate-400 font-medium">
            মোট প্রশ্ন: {questions.length} টি
          </span>
        </div>

        {/* Input Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Exam Name (পরীক্ষার নাম) *
            </label>
            <input
              type="text"
              placeholder="e.g. MEDICAL MODEL TEST 2026"
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Course / Batch Name (কোর্স বা ব্যাচ) *
            </label>
            <input
              type="text"
              placeholder="e.g. HSC Biology & Medical Special Batch"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Number of Sets (সর্বোচ্চ ২০টি সেট) *
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
              Set A থেকে শুরু করে ক্রমানুসারে শাফেল্ড সেট তৈরি হবে
            </span>
          </div>
        </div>

        {/* Master Questions List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-300">
              Master Questions List
            </h4>
            <span className="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-md">
              সবুজ বৃত্তটি সঠিক উত্তর নির্দেশ করে
            </span>
          </div>

          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {questions.map((q, qIndex) => (
              <div 
                key={qIndex} 
                className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 relative group hover:border-slate-700 transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-500/30">
                    {qIndex + 1}
                  </span>
                  <input
                    type="text"
                    placeholder={`Question ${qIndex + 1} (প্রশ্ন লিখুন)`}
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

                {/* 4 Options Grid with Correct Answer selection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-10">
                  {q.options.map((opt, optIndex) => {
                    const label = String.fromCharCode(65 + optIndex); // A, B, C, D
                    return (
                      <div 
                        key={optIndex}
                        className={`flex items-center gap-2 p-1.5 px-2.5 rounded-lg border transition-all ${
                          opt.isCorrect 
                            ? 'bg-emerald-950/40 border-emerald-500/50' 
                            : 'bg-slate-950/50 border-slate-800'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSetCorrectOption(qIndex, optIndex)}
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 cursor-pointer transition-colors ${
                            opt.isCorrect
                              ? 'bg-emerald-500 text-white shadow-xs shadow-emerald-500/50'
                              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                          }`}
                          title={`Mark ${label} as correct answer`}
                        >
                          {label}
                        </button>
                        <input
                          type="text"
                          placeholder={`Option ${label}`}
                          value={opt.text}
                          onChange={(e) => handleOptionChange(qIndex, optIndex, e.target.value)}
                          required
                          className="flex-1 bg-transparent border-0 text-xs text-slate-200 focus:outline-hidden"
                        />
                        {opt.isCorrect && (
                          <span className="text-[10px] text-emerald-400 font-semibold px-1 rounded-sm bg-emerald-900/50 shrink-0">
                            সঠিক উত্তর
                          </span>
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
              <span>+ Add More Question</span>
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-950/40 cursor-pointer transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving to Firestore...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Save Exam & Generate Sets (To Firestore)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* ড্যাশবোর্ড: ক্লাউড ফায়ারস্টোরে সংরক্ষিত এক্সাম ও ইউনিক সেটের পিডিএফ ডাউনলোড লিস্ট */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            <span>Dashboard - Saved Exams & Sets (Firestore)</span>
          </h3>
          <span className="text-xs px-2.5 py-1 rounded-full bg-theme-surface border border-theme-border text-slate-400 font-semibold">
            {exams.length} Cloud Saved Exams
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
              উপরের ফর্ম ব্যবহার করে নতুন এক্সাম তৈরি করুন। এটি সরাসরি আপনার Firebase Firestore ডাটাবেজে স্থায়ীভাবে সেভ হবে।
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {exams.map((exam) => (
              <div
                key={exam.id}
                className="p-5 rounded-2xl bg-theme-card border border-theme-border-card shadow-md space-y-4 hover:border-blue-500/40 transition-all"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-theme-border">
                  <div>
                    <h4 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                      <span>{exam.examName || exam.title}</span>
                    </h4>
                    <p className="text-xs text-slate-400">
                      <b>Course:</b> {exam.courseName} | <b>Total Questions:</b> {exam.masterQuestions?.length || exam.totalQuestions || 0} | <b>Sets:</b> {exam.sets?.length || exam.totalSets || 0}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteExam(exam.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white text-xs font-semibold cursor-pointer transition-colors self-start sm:self-auto border border-rose-500/30"
                    title="Firebase Firestore থেকে এই পরীক্ষা সম্পূর্ণ মুছে ফেলুন"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Entire Exam</span>
                  </button>
                </div>

                {/* Unique Sets Download Links */}
                <div>
                  <div className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-blue-400" />
                    <span>Unique Sets Download Links (মেডিকেল ওএমআর + প্রশ্নপত্র):</span>
                  </div>

                  {(!exam.sets || exam.sets.length === 0) ? (
                    <div className="text-xs text-slate-500 italic p-2 bg-slate-900/40 rounded-lg">
                      কোনো সেট পাওয়া যায়নি।
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {exam.sets.map((set) => (
                        <div
                          key={set.setCode}
                          className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3 group hover:border-slate-700 transition-all"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 font-extrabold text-sm flex items-center justify-center shrink-0">
                              {set.setCode}
                            </span>
                            <div>
                              <div className="text-xs font-bold text-slate-200">
                                {set.setName}
                              </div>
                              <button
                                type="button"
                                onClick={() => setPreviewingSet({ examName: exam.examName || exam.title, set })}
                                className="text-[11px] text-blue-400 hover:underline cursor-pointer"
                              >
                                প্রশ্ন ক্রম দেখুন ({set.questions?.length || 0} Q)
                              </button>
                            </div>
                          </div>

                          {/* Direct PDF Download with Fallback */}
                          <button
                            type="button"
                            onClick={() => handleDownloadSetPdf(exam, set)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer transition-colors shrink-0"
                            title="ডাউনলোড ওএমআর শিট ও প্রশ্নপত্র"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>PDF</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Set Questions Preview Modal */}
      {previewingSet && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-theme-card border border-theme-border-card rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-theme-border shrink-0">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-xs">
                    {previewingSet.set.setName}
                  </span>
                  <span>{previewingSet.examName}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  এই সেটের জন্য প্রশ্ন ও অপশনগুলো বিশেষভাবে শাফেল করা হয়েছে।
                </p>
              </div>
              <button
                onClick={() => setPreviewingSet(null)}
                className="text-slate-400 hover:text-white text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              {previewingSet.set.questions?.map((q) => (
                <div key={q.qNo} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1.5">
                  <div className="font-semibold text-slate-200">
                    {q.qNo}. {q.questionText}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-slate-400 pl-4">
                    {q.options.map((opt, oIdx) => (
                      <div
                        key={oIdx}
                        className={`p-1 px-2 rounded-md ${
                          oIdx === q.correctAnswer
                            ? 'bg-emerald-950/60 text-emerald-300 font-bold border border-emerald-800/60'
                            : 'bg-slate-950/40 text-slate-300'
                        }`}
                      >
                        ({String.fromCharCode(65 + oIdx)}) {opt}
                        {oIdx === q.correctAnswer && ' ✓'}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-theme-border shrink-0">
              <span className="text-xs text-slate-400">
                মোট প্রশ্ন: {previewingSet.set.questions?.length || 0} টি
              </span>
              <button
                onClick={() => setPreviewingSet(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
