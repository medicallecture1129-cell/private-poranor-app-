import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import { Exam, OfflineExamSet } from '../../types';
import { 
  generateShuffledSet, 
  generateBatchSets, 
  generateAdmissionStylePDF, 
  generateSolutionKeyPDF,
  buildUnmeshStyleHtml,
  toBengaliNumber
} from '../../utils/omrPdfGenerator';
import { updateExam } from '../../services/db';
import { useToast } from '../../context/ToastContext';
import { 
  X, 
  Download, 
  Layers, 
  CheckCircle2, 
  FileText, 
  QrCode, 
  RefreshCw, 
  Printer, 
  KeyRound,
  Check,
  Sparkles,
  Info,
  Plus,
  Trash2,
  Eye,
  Sliders,
  AlertCircle,
  Save,
  Edit2
} from 'lucide-react';

interface OmrGeneratorModalProps {
  exam: Exam;
  isOpen: boolean;
  onClose: () => void;
  onSetsUpdated?: (sets: OfflineExamSet[]) => void;
}

export const OmrGeneratorModal: React.FC<OmrGeneratorModalProps> = ({
  exam,
  isOpen,
  onClose,
  onSetsUpdated
}) => {
  const { success: toastSuccess, error: toastError } = useToast();

  // Normalize exam so title and questions are always safe and defined
  const normalizedExam = useMemo<Exam>(() => {
    const qList = (exam.questions && exam.questions.length > 0)
      ? exam.questions
      : (exam as any).masterQuestions && (exam as any).masterQuestions.length > 0
      ? (exam as any).masterQuestions.map((q: any, i: number) => ({
          id: q.id || `mq_${i + 1}`,
          text: q.questionText || q.text || `Question ${i + 1}`,
          options: (q.options || []).map((opt: any, oIdx: number) => ({
            id: String.fromCharCode(65 + oIdx),
            text: typeof opt === 'string' ? opt : (opt.text || `Option ${oIdx + 1}`)
          })),
          correctOption: typeof q.answer === 'number' 
            ? String.fromCharCode(65 + q.answer) 
            : typeof q.correctAnswer === 'number' 
            ? String.fromCharCode(65 + q.correctAnswer)
            : String(q.correctOption || 'A').toUpperCase(),
          explanation: q.explanation || ''
        }))
      : (exam as any).sets && (exam as any).sets.length > 0 && (exam as any).sets[0].questions
      ? (exam as any).sets[0].questions.map((q: any, i: number) => ({
          id: q.id || `q_${i + 1}`,
          text: q.questionText || q.text || `Question ${i + 1}`,
          options: (q.options || []).map((opt: any, oIdx: number) => ({
            id: String.fromCharCode(65 + oIdx),
            text: typeof opt === 'string' ? opt : (opt.text || `Option ${oIdx + 1}`)
          })),
          correctOption: typeof q.correctAnswer === 'number'
            ? String.fromCharCode(65 + q.correctAnswer)
            : String(q.correctOption || 'A').toUpperCase(),
          explanation: q.explanation || ''
        }))
      : [];

    return {
      ...exam,
      title: exam.title || (exam as any).examName || 'Offline Exam',
      courseName: exam.courseName || 'General Batch',
      questions: qList
    };
  }, [exam]);

  const [availableSetCodes, setAvailableSetCodes] = useState<string[]>([]);
  const [selectedSetCode, setSelectedSetCode] = useState<string>('');
  const [generatedSets, setGeneratedSets] = useState<Record<string, OfflineExamSet>>({});
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSavingSets, setIsSavingSets] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'sets_list' | 'preview' | 'answer_key' | 'master_set'>('sets_list');

  // Preview page toggle (Page 1 vs Page 2)
  const [previewPage, setPreviewPage] = useState<1 | 2>(1);
  const [previewQrUrl, setPreviewQrUrl] = useState<string>('');

  // Batch generation input (e.g. 15 sets)
  const [batchCountInput, setBatchCountInput] = useState<number>(15);
  // Rename state
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState<string>('');

  // Initialize sets from exam
  useEffect(() => {
    if (!isOpen) return;

    const setsMap: Record<string, OfflineExamSet> = {};
    const codes: string[] = [];

    // Support both offlineSets and (exam as any).sets (created via OfflineOmrManager)
    const rawSets = (normalizedExam.offlineSets && normalizedExam.offlineSets.length > 0)
      ? normalizedExam.offlineSets
      : (normalizedExam as any).sets && (normalizedExam as any).sets.length > 0
      ? (normalizedExam as any).sets.map((s: any) => ({
          setCode: s.setCode || s.setName || 'A',
          qrData: s.qrData || `OMR:${normalizedExam.id}:${s.setCode || 'A'}`,
          questions: (s.questions || []).map((q: any, qIdx: number) => ({
            questionNumber: q.qNo || q.questionNumber || (qIdx + 1),
            masterQuestionId: `mq_${qIdx + 1}`,
            text: q.questionText || q.text || `Question ${qIdx + 1}`,
            options: Array.isArray(q.options)
              ? q.options.map((opt: any, oIdx: number) => ({
                  id: String.fromCharCode(65 + oIdx),
                  text: typeof opt === 'string' ? opt : (opt.text || String(opt))
                }))
              : [],
            correctOption: typeof q.correctAnswer === 'number'
              ? String.fromCharCode(65 + q.correctAnswer)
              : String(q.correctOption || 'A').toUpperCase()
          })),
          answerKey: s.answerKey || {},
          createdAt: s.createdAt || Date.now()
        }))
      : [];

    if (rawSets.length > 0) {
      rawSets.forEach((s: OfflineExamSet) => {
        if (!s.answerKey || Object.keys(s.answerKey).length === 0) {
          s.answerKey = {};
          s.questions.forEach((q) => {
            s.answerKey[q.questionNumber] = q.correctOption;
          });
        }
        setsMap[s.setCode] = s;
        codes.push(s.setCode);
      });
    }

    setGeneratedSets(setsMap);
    setAvailableSetCodes(codes);
    setSelectedSetCode(codes[0] || '');
    setHasUnsavedChanges(false);
  }, [isOpen, exam]);

  // Generate QR data URL for selected set preview
  useEffect(() => {
    if (!selectedSetCode || !generatedSets[selectedSetCode]) return;
    const currentSet = generatedSets[selectedSetCode];
    QRCode.toDataURL(currentSet.qrData, {
      margin: 1,
      width: 256,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' }
    }).then(url => setPreviewQrUrl(url)).catch(() => {});
  }, [selectedSetCode, generatedSets]);

  if (!isOpen) return null;

  // Add 1 single unique shuffled set
  const handleAddSingleSet = () => {
    const nextCode = `Set ${availableSetCodes.length + 1}`;
    if (generatedSets[nextCode]) {
      toastError(`"${nextCode}" সেটটি আগেই বিদ্যমান!`);
      return;
    }

    const newSet = generateShuffledSet(normalizedExam, nextCode);
    const updatedMap = { ...generatedSets, [nextCode]: newSet };
    const updatedCodes = [...availableSetCodes, nextCode];

    setGeneratedSets(updatedMap);
    setAvailableSetCodes(updatedCodes);
    setSelectedSetCode(nextCode);
    setHasUnsavedChanges(true);
    toastSuccess(`নতুন ইউনিক কোশ্চেন সেট "${nextCode}" যুক্ত করা হয়েছে! সেভ করতে 'সেভ করুন' বাটনে চাপুন।`);
  };

  // Generate batch unique sets in 1-click (e.g. 15 sets as requested)
  const handleGenerateBatch = () => {
    const count = Math.min(Math.max(1, batchCountInput), 100);
    const newBatch = generateBatchSets(normalizedExam, count, 1);

    const updatedMap: Record<string, OfflineExamSet> = {};
    const updatedCodes: string[] = [];

    newBatch.forEach(s => {
      updatedMap[s.setCode] = s;
      updatedCodes.push(s.setCode);
    });

    setGeneratedSets(updatedMap);
    setAvailableSetCodes(updatedCodes);
    setSelectedSetCode(newBatch[0]?.setCode || '');
    setHasUnsavedChanges(true);
    toastSuccess(`এক ক্লিকে ${count}টি ইউনিক কোশ্চেন সেট জেনারেট হয়েছে! নিচে তালিকা থেকে রিনেম ও প্রিভিউ করতে পারেন।`);
  };

  // Start inline rename
  const handleStartRename = (code: string) => {
    setEditingCode(code);
    setEditingNameValue(code);
  };

  // Commit rename
  const handleSaveRename = (oldCode: string) => {
    const newName = editingNameValue.trim();
    if (!newName || newName === oldCode) {
      setEditingCode(null);
      return;
    }

    if (generatedSets[newName] && newName !== oldCode) {
      toastError(`"${newName}" নামের সেট ইতিমধ্যে বিদ্যমান! অন্য নাম দিন।`);
      return;
    }

    const oldSet = generatedSets[oldCode];
    if (!oldSet) {
      setEditingCode(null);
      return;
    }

    const updatedSet: OfflineExamSet = {
      ...oldSet,
      setCode: newName,
      qrData: `OMR:${normalizedExam.id}:${newName}`
    };

    const updatedMap = { ...generatedSets };
    delete updatedMap[oldCode];
    updatedMap[newName] = updatedSet;

    const updatedCodes = availableSetCodes.map(c => c === oldCode ? newName : c);

    setGeneratedSets(updatedMap);
    setAvailableSetCodes(updatedCodes);
    if (selectedSetCode === oldCode) {
      setSelectedSetCode(newName);
    }
    setEditingCode(null);
    setHasUnsavedChanges(true);
    toastSuccess(`সেট রিনেম করে "${newName}" রাখা হয়েছে!`);
  };

  // Delete a set
  const handleDeleteSet = (codeToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`আপনি কি "${codeToDelete}" সেটটি মুছে ফেলতে চান?`)) {
      const updatedMap = { ...generatedSets };
      delete updatedMap[codeToDelete];
      const updatedCodes = availableSetCodes.filter(c => c !== codeToDelete);

      setGeneratedSets(updatedMap);
      setAvailableSetCodes(updatedCodes);
      if (selectedSetCode === codeToDelete) {
        setSelectedSetCode(updatedCodes[0] || '');
      }
      setHasUnsavedChanges(true);
      toastSuccess(`"${codeToDelete}" সেটটি মুছে ফেলা হয়েছে।`);
    }
  };

  // Explicit Save Sets to Database
  const handleSaveAllSetsToDb = async () => {
    setIsSavingSets(true);
    try {
      const setsList = availableSetCodes.map(c => generatedSets[c]).filter(Boolean);
      await updateExam(normalizedExam.id, { offlineSets: setsList });
      if (onSetsUpdated) onSetsUpdated(setsList);
      setHasUnsavedChanges(false);
      toastSuccess(`মোট ${setsList.length}টি ইউনিক কোশ্চেন সেট ক্লাউডে সফলভাবে সেভ হয়েছে!`);
    } catch (err: unknown) {
      console.error('Failed to sync sets to db:', err);
      toastError(err instanceof Error ? err.message : 'সেট সংরক্ষণ করতে ব্যর্থ হয়েছে');
    } finally {
      setIsSavingSets(false);
    }
  };

  // Current active set
  const currentSet = selectedSetCode && generatedSets[selectedSetCode] 
    ? generatedSets[selectedSetCode] 
    : (availableSetCodes.length > 0 ? generatedSets[availableSetCodes[0]] : null);

  // Download 2-Page 8-Column Admission Style PDF
  const handleDownloadAdmissionPDF = async (set: OfflineExamSet) => {
    setIsGeneratingPdf(true);
    try {
      const blob = await generateAdmissionStylePDF(normalizedExam, set, {
        appName: 'মেডিকেল ও বিশ্ববিদ্যালয় ভর্তি পরীক্ষা পোর্টাল'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `OMR_${(normalizedExam.title || 'Exam').replace(/\s+/g, '_')}_${set.setCode}_2Page_8Col.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toastSuccess(`সেট "${set.setCode}" এর ২-পেজ ৮-কলাম ওএমআর ও প্রশ্ন পিডিএফ ডাউনলোড শুরু হয়েছে!`);
    } catch (err: unknown) {
      console.error('PDF generation error:', err);
      toastError(err instanceof Error ? err.message : 'পিডিএফ তৈরি করতে ব্যর্থ হয়েছে');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Download Solution Key PDF
  const handleDownloadSolutionKey = async (set: OfflineExamSet) => {
    setIsGeneratingPdf(true);
    try {
      const blob = await generateSolutionKeyPDF(normalizedExam, set);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Solution_Key_${(normalizedExam.title || 'Exam').replace(/\s+/g, '_')}_${set.setCode}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toastSuccess(`সেট "${set.setCode}" এর শিক্ষক সলিউশন কি পিডিএফ ডাউনলোড হয়েছে!`);
    } catch (err: unknown) {
      console.error('Solution Key PDF error:', err);
      toastError('সলিউশন কি তৈরি করতে ব্যর্থ হয়েছে');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-5xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        
        {/* Header */}
        {/* Header Action & Status */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-gradient-to-r from-blue-900/10 via-indigo-900/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[10px] font-extrabold uppercase tracking-wider">
                  ২-পৃষ্ঠার ওএমআর ও কোশ্চেন পেপার
                </span>
                <span className="text-xs text-slate-400">• মাস্টার সেট: {normalizedExam.questions?.length || 0} টি প্রশ্ন</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-0.5">
                {normalizedExam.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveAllSetsToDb}
              disabled={isSavingSets}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all ${
                hasUnsavedChanges
                  ? 'bg-amber-500 hover:bg-amber-600 text-white animate-pulse'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
              title="সব সেট ডাটাবেজে সংরক্ষণ করুন"
            >
              <Save className="w-4 h-4" />
              <span>{isSavingSets ? 'সেভ হচ্ছে...' : hasUnsavedChanges ? 'সেটগুলো সেভ করুন *' : 'সেট সেভ করা আছে ✓'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-slate-50/50 dark:bg-slate-900/50 overflow-x-auto">
          <button
            onClick={() => setActiveTab('sets_list')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'sets_list'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>ইউনিক কোশ্চেন সেটসমূহ</span>
            <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[11px] font-extrabold">
              {availableSetCodes.length}
            </span>
          </button>

          {currentSet && (
            <button
              onClick={() => setActiveTab('preview')}
              className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                activeTab === 'preview'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>ডিজিটাল ২-পৃষ্ঠা লেআউট প্রিভিউ ({currentSet.setCode})</span>
            </button>
          )}

          {currentSet && (
            <button
              onClick={() => setActiveTab('answer_key')}
              className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                activeTab === 'answer_key'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>অ্যানসার কি ও সলিউশন ({currentSet.setCode})</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('master_set')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'master_set'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>মাস্টার কোশ্চেন ব্যাংক</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-extrabold">
              {normalizedExam.questions?.length || 0}
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          
          {/* TAB 1: UNIQUE SETS LIST (WITH 1-CLICK GENERATOR & RENAME) */}
          {activeTab === 'sets_list' && (
            <div className="space-y-5">
              
              {/* 1-Click Batch Generation Bar */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-900/40 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-extrabold text-sm text-blue-950 dark:text-blue-200 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>এক ক্লিকে একাধিক ইউনিক কোশ্চেন সেট তৈরি করুন (Batch Generation)</span>
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      প্রতিটি সেটের জন্য ১০০টি প্রশ্নের সিরিয়াল এলোমেলো (Shuffle) হবে এবং অপশনগুলোও (A, B, C, D) ইন্টারচেঞ্জ হবে। কিন্তু প্রতিটি সেটে ওই ১০০টি প্রশ্নই থাকবে।
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">সেট সংখ্যা:</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={batchCountInput}
                        onChange={(e) => setBatchCountInput(Number(e.target.value))}
                        className="w-14 text-xs font-mono font-bold text-slate-900 dark:text-white bg-transparent focus:outline-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleGenerateBatch}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/30 flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{batchCountInput}টি ইউনিক সেট জেনারেট করুন</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleAddSingleSet}
                      className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+১টি সেট</span>
                    </button>
                  </div>
                </div>

                {hasUnsavedChanges && (
                  <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>আপনার তৈরি বা রিনেম করা সেটগুলো এখনও ডাটাবেজে সেভ হয়নি।</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveAllSetsToDb}
                      className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer shadow-xs"
                    >
                      এখনই সেভ করুন
                    </button>
                  </div>
                )}
              </div>

              {/* Set Cards Grid */}
              {availableSetCodes.length === 0 ? (
                <div className="p-12 text-center rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                    <Layers className="w-7 h-7" />
                  </div>
                  <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">
                    এখনও কোনো ইউনিক সেট তৈরি করা হয়নি
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    উপরের বক্সে সংখ্যা লিখে <strong>"ইউনিক সেট জেনারেট করুন"</strong> বাটনে চাপলেই স্বয়ংক্রিয়ভাবে সবগুলো ইউনিক সেট তৈরি হয়ে যাবে।
                  </p>
                  <button
                    onClick={() => handleGenerateBatch()}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shadow-md transition-all"
                  >
                    ১৫টি ইউনিক সেট তৈরি করুন
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {availableSetCodes.map((code) => {
                    const setObj = generatedSets[code];
                    if (!setObj) return null;
                    const isSelected = selectedSetCode === code;
                    const isRenaming = editingCode === code;

                    return (
                      <div
                        key={code}
                        onClick={() => setSelectedSetCode(code)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-blue-50/60 dark:bg-blue-950/40 border-blue-500 shadow-md ring-2 ring-blue-500/30'
                            : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-blue-300'
                        }`}
                      >
                        <div className="space-y-2.5">
                          {/* Top: Set Code & Rename Control */}
                          <div className="flex items-center justify-between gap-2">
                            {isRenaming ? (
                              <div className="flex items-center gap-1.5 flex-1" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={editingNameValue}
                                  onChange={(e) => setEditingNameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveRename(code);
                                  }}
                                  autoFocus
                                  className="w-full px-2 py-1 text-xs font-mono font-bold rounded-lg border border-blue-400 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveRename(code)}
                                  className="p-1 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                                  title="সেভ রিনেম"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-sm px-2.5 py-1 rounded-lg bg-blue-600 text-white shadow-xs">
                                  {code}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartRename(code);
                                  }}
                                  className="p-1 text-slate-400 hover:text-blue-600 rounded-md"
                                  title="সেট রিনেম করুন"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}

                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-slate-400">
                                {setObj.questions.length} MCQs
                              </span>
                              <button
                                onClick={(e) => handleDeleteSet(code, e)}
                                className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
                                title="মুছে ফেলুন"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="text-xs text-slate-600 dark:text-slate-300">
                            <div>কোশ্চেন ও অপশন: <strong>সম্পূর্ণ এলোমেলো (Shuffled)</strong></div>
                            <div className="truncate">কিউআর কোড: <code className="text-[10px] font-mono text-blue-600 dark:text-blue-400">{setObj.qrData}</code></div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-700/60 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isGeneratingPdf}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadAdmissionPDF(setObj);
                            }}
                            className="flex-1 py-2 px-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                            title="২-পেজ ওএমআর ও কোশ্চেন পেপার ডাউনলোড"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>২-পেজ PDF</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSetCode(code);
                              setActiveTab('preview');
                            }}
                            className="p-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                            title="ডিজিটাল লেআউট প্রিভিউ দেখুন"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadSolutionKey(setObj);
                            }}
                            className="p-2 rounded-xl border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                            title="শিক্ষক সমাধান কি"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bottom Save Bar */}
              {availableSetCodes.length > 0 && (
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="text-xs text-slate-500">
                    মোট তৈরি করা ইউনিক সেট: <strong>{availableSetCodes.length}টি</strong>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveAllSetsToDb}
                    disabled={isSavingSets}
                    className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/30 flex items-center gap-2 cursor-pointer transition-all"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingSets ? 'সেভ হচ্ছে...' : 'সব ইউনিক সেট সেভ করুন'}</span>
                  </button>
                </div>
              )}

            </div>
          )}

          {/* TAB 2: DIGITAL 2-PAGE LAYOUT PREVIEW (EXACT REFERENCE IMAGE MATCH) */}
          {activeTab === 'preview' && currentSet && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-black text-lg px-3 py-1 rounded-xl bg-blue-600 text-white">
                    {currentSet.setCode}
                  </span>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      {exam.title} ({currentSet.setCode})
                    </h4>
                    <p className="text-xs text-slate-500">
                      কিউআর পেলোড: <code className="font-mono text-blue-600 dark:text-blue-400">{currentSet.qrData}</code>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Page Toggle */}
                  <div className="flex items-center p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setPreviewPage(1)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        previewPage === 1 ? 'bg-blue-600 text-white' : 'text-slate-500'
                      }`}
                    >
                      ১ম পৃষ্ঠা (OMR + প্রশ্ন ১-৫৩)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewPage(2)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        previewPage === 2 ? 'bg-blue-600 text-white' : 'text-slate-500'
                      }`}
                    >
                      ২য় পৃষ্ঠা (প্রশ্ন ৫৪-১০০ + নির্দেশাবলী)
                    </button>
                  </div>

                  <button
                    onClick={() => handleDownloadAdmissionPDF(currentSet)}
                    disabled={isGeneratingPdf}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>{isGeneratingPdf ? 'পিডিএফ তৈরি হচ্ছে...' : '২-পেজ প্রিন্ট-রেডি PDF ডাউনলোড'}</span>
                  </button>

                  <button
                    onClick={() => handleDownloadSolutionKey(currentSet)}
                    className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
                    <span>টিচার কি</span>
                  </button>
                </div>
              </div>

              {/* Exact HTML Render Container (Scaled to Fit On-Screen) */}
              <div className="p-4 bg-slate-200 dark:bg-slate-950 rounded-2xl overflow-x-auto flex justify-center border border-slate-300 dark:border-slate-800">
                <div 
                  className="bg-white shadow-2xl origin-top transition-transform"
                  style={{
                    width: '1122px',
                    minWidth: '1122px',
                    height: '793px',
                    boxSizing: 'border-box'
                  }}
                  dangerouslySetInnerHTML={{
                    __html: previewPage === 1 
                      ? buildUnmeshStyleHtml(exam, currentSet, previewQrUrl).page1Html 
                      : buildUnmeshStyleHtml(exam, currentSet, previewQrUrl).page2Html
                  }}
                />
              </div>
            </div>
          )}

          {/* TAB 3: ANSWER KEY */}
          {activeTab === 'answer_key' && currentSet && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    সেট {currentSet.setCode} এর সঠিক উত্তর তালিকা (Answer Key)
                  </h4>
                  <p className="text-xs text-slate-500">
                    স্ক্যানার এই সেটের কিউআর কোড ডিটেক্ট করার সাথে সাথে নিচের উত্তরগুলো দিয়ে মূল্যায়ন করবে।
                  </p>
                </div>
                <button
                  onClick={() => handleDownloadSolutionKey(currentSet)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>ব্যাখ্যাসহ PDF ডাউনলোড</span>
                </button>
              </div>

              {/* 100 Answer Key Grid */}
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 font-mono text-xs">
                {currentSet.questions.map(q => (
                  <div key={q.questionNumber} className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-slate-400">{q.questionNumber}.</span>
                    <span className="font-black text-blue-600 dark:text-blue-400">{q.correctOption}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: MASTER SET */}
          {activeTab === 'master_set' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>মাস্টার কোশ্চেন ব্যাংক (Master Question Bank)</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    এই মূল সেট থেকেই যেকোনো সংখ্যক ইউনিক ও এলোমেলো (Shuffled) প্রশ্ন সেট এবং সংশ্লিষ্ট ওএমআর তৈরি হয়।
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-3 py-1 rounded-xl bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-mono text-xs font-black">
                    মোট প্রশ্ন: {normalizedExam.questions?.length || 0} টি
                  </span>
                </div>
              </div>

              {/* Master Questions Grid */}
              <div className="space-y-2.5 max-h-[52vh] overflow-y-auto pr-1">
                {(normalizedExam.questions || []).map((q, idx) => (
                  <div
                    key={q.id || idx}
                    className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 text-xs shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-slate-900 dark:text-white flex items-start gap-2">
                        <span className="text-blue-600 font-mono font-black shrink-0">
                          {toBengaliNumber(idx + 1)}.
                        </span>
                        <span>{q.text}</span>
                      </div>
                      {q.topic && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold shrink-0">
                          {q.topic}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                      {q.options.map((opt) => {
                        const isCorrect = opt.id === q.correctOption;
                        return (
                          <div
                            key={opt.id}
                            className={`px-2.5 py-1.5 rounded-xl border text-[11px] ${
                              isCorrect
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 text-emerald-800 dark:text-emerald-300 font-bold'
                                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            <span className="font-bold">({opt.id})</span> {opt.text}
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation && (
                      <div className="mt-2 text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-900/40 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                        <strong className="text-slate-700 dark:text-slate-300">ব্যাখ্যা:</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>মোট ইউনিক সেট: <strong>{availableSetCodes.length}</strong> টি</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              বন্ধ করুন
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
