import React, { useState, useEffect } from 'react';
import { Exam, OfflineExamSet } from '../../types';
import { generateShuffledSet, generateAdmissionStylePDF } from '../../utils/omrPdfGenerator';
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
  Info
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

  const [availableSets, setAvailableSets] = useState<string[]>(['A', 'B', 'C', 'D']);
  const [selectedSetCode, setSelectedSetCode] = useState<string>('A');
  const [generatedSets, setGeneratedSets] = useState<Record<string, OfflineExamSet>>({});
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSavingSets, setIsSavingSets] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'answer_key'>('preview');

  // Initialize sets from existing exam.offlineSets or auto-generate Set A, B, C, D
  useEffect(() => {
    if (!isOpen) return;

    const setsMap: Record<string, OfflineExamSet> = {};
    if (exam.offlineSets && exam.offlineSets.length > 0) {
      exam.offlineSets.forEach((s) => {
        setsMap[s.setCode] = s;
      });
    }

    // Ensure all 4 sets A, B, C, D are prepared
    ['A', 'B', 'C', 'D'].forEach((code) => {
      if (!setsMap[code]) {
        setsMap[code] = generateShuffledSet(exam, code);
      }
    });

    setGeneratedSets(setsMap);
  }, [isOpen, exam]);

  if (!isOpen) return null;

  const currentSet = generatedSets[selectedSetCode] || generateShuffledSet(exam, selectedSetCode);

  const handleDownloadPdf = async (setCode: string) => {
    const targetSet = generatedSets[setCode] || generateShuffledSet(exam, setCode);
    setIsGeneratingPdf(true);
    try {
      const blob = await generateAdmissionStylePDF(exam, targetSet);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Medical_Admission_OMR_SET_${targetSet.setCode}_${exam.title.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toastSuccess(`Set ${targetSet.setCode} ওএমআর ও প্রশ্নপত্রের প্রিন্ট-রেডি পিডিএফ ডাউনলোড হয়েছে!`);
    } catch (err: unknown) {
      console.error('PDF error:', err);
      toastError('পিডিএফ জেনারেট করতে সমস্যা হয়েছে');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadAllSets = async () => {
    for (const code of ['A', 'B', 'C', 'D']) {
      await handleDownloadPdf(code);
    }
  };

  const handleSaveSetsToServer = async () => {
    setIsSavingSets(true);
    try {
      const allSets = Object.values(generatedSets);
      await updateExam(exam.id, {
        offlineSets: allSets
      });
      if (onSetsUpdated) onSetsUpdated(allSets);
      toastSuccess('সকল সেট ও তাদের উত্তরপত্র সার্ভারে নিরাপদে সংরক্ষিত হয়েছে!');
    } catch (err: unknown) {
      console.error('Save sets error:', err);
      toastError('সেট সংরক্ষণ করতে ব্যর্থ হয়েছে');
    } finally {
      setIsSavingSets(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-[10px] font-bold uppercase tracking-wider">
                  Medical Admission OMR System
                </span>
                <span className="text-xs text-slate-400">• {exam.courseName}</span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-0.5">
                অফলাইন প্রশ্নপত্র ও ওএমআর শিট জেনারেটর (Printable Question & OMR)
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

        {/* Action Controls Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Set Selector Tabs (A, B, C, D) */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1 hidden sm:inline">
              সেট নির্বাচন:
            </span>
            {['A', 'B', 'C', 'D'].map((code) => {
              const isSelected = selectedSetCode === code;
              return (
                <button
                  key={code}
                  onClick={() => setSelectedSetCode(code)}
                  className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-2 ring-blue-500/30'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>SET {code}</span>
                  {generatedSets[code] && <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />}
                </button>
              );
            })}
          </div>

          {/* View Modes (Preview vs Answer Key) & Action Buttons */}
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center gap-1">
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'preview'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                প্রশ্ন প্রিভিউ
              </button>
              <button
                onClick={() => setActiveTab('answer_key')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'answer_key'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                টিচার সলিউশন কী
              </button>
            </div>

            <button
              onClick={() => handleDownloadPdf(selectedSetCode)}
              disabled={isGeneratingPdf}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>SET {selectedSetCode} PDF</span>
            </button>
          </div>
        </div>

        {/* Feature Highlights Info Banner */}
        <div className="px-5 py-3 bg-blue-50/70 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/50 flex items-center justify-between text-xs text-blue-900 dark:text-blue-300">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500 shrink-0" />
            <span>
              <strong>মেডিকেল ভর্তি পরীক্ষা ফরম্যাট:</strong> প্রশ্ন ও অপশন স্বয়ংক্রিয়ভাবে এলোমেলো (Shuffle) করা এবং প্রতি ওএমআরে নির্দিষ্ট কিউআর কোড সংযুক্ত রয়েছে।
            </span>
          </div>
          <button
            onClick={handleSaveSetsToServer}
            disabled={isSavingSets}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 underline hover:no-underline cursor-pointer ml-3 shrink-0"
          >
            {isSavingSets ? 'সংরক্ষণ হচ্ছে...' : 'সেটসমূহ ক্লাউডে সেভ করুন'}
          </button>
        </div>

        {/* Modal Scrollable Content Area */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5 bg-slate-50 dark:bg-slate-950/40">
          
          {activeTab === 'preview' ? (
            /* ======================================================== */
            /* QUESTIONS PREVIEW FOR SELECTED SET */
            /* ======================================================== */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                    <span>SET - {currentSet.setCode} এর প্রশ্ন তালিকা ({currentSet.questions.length} টি)</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px] font-mono text-slate-700 dark:text-slate-300">
                      QR Connected
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    মাস্টার প্রশ্নের সাথে সংযুক্ত উত্তরপত্র এবং পরিবর্তিত ক্রম
                  </p>
                </div>
              </div>

              {/* Two Column Grid of Questions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {currentSet.questions.map((q) => (
                  <div
                    key={q.questionNumber}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <span className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-black flex items-center justify-center shrink-0">
                          {q.questionNumber}
                        </span>
                        <p className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white leading-relaxed">
                          {q.text}
                        </p>
                      </div>
                      {q.topic && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-400 shrink-0">
                          {q.topic}
                        </span>
                      )}
                    </div>

                    {/* Options list */}
                    <div className="grid grid-cols-1 gap-1.5 pt-1">
                      {q.options.map((opt) => {
                        const isCorrect = opt.id === q.correctOption;
                        return (
                          <div
                            key={opt.id}
                            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl border text-xs transition-colors ${
                              isCorrect
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 font-bold'
                                : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span className="w-4 font-mono font-black">{opt.id})</span>
                            <span className="flex-1">{opt.text}</span>
                            {isCorrect && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-600 text-white font-extrabold uppercase">
                                Ans
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* ======================================================== */
            /* TEACHER ANSWER KEY VIEW */
            /* ======================================================== */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-amber-500" />
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                    SET {selectedSetCode} - মাস্টার সলিউশন কী গ্রিড
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  এই উত্তরমালার উপর ভিত্তি করে স্ক্যান করা ওএমআর শিটের মূল্যায়ন সম্পন্ন হবে।
                </p>
              </div>

              {/* Solution Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {currentSet.questions.map((q) => (
                  <div
                    key={q.questionNumber}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs"
                  >
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      Q#{q.questionNumber}
                    </span>
                    <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white font-mono font-black text-sm flex items-center justify-center shadow-xs">
                      {q.correctOption}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            বন্ধ করুন
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadAllSets}
              disabled={isGeneratingPdf}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
            >
              সব সেট (A, B, C, D) একসাথে ডাউনলোড
            </button>
            <button
              onClick={() => handleDownloadPdf(selectedSetCode)}
              disabled={isGeneratingPdf}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              <span>SET {selectedSetCode} ওএমআর ও প্রশ্ন প্রিন্ট করুন</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
