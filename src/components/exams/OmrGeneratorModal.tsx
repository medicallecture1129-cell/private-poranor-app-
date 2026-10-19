import React, { useState, useEffect } from 'react';
import { Exam, OfflineExamSet } from '../../types';
import { 
  generateShuffledSet, 
  generateBatchSets, 
  generateAdmissionStylePDF, 
  generateSolutionKeyPDF 
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
  Sliders,
  Plus
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

  const [availableSetCodes, setAvailableSetCodes] = useState<string[]>(['A', 'B', 'C', 'D']);
  const [selectedSetCode, setSelectedSetCode] = useState<string>('A');
  const [generatedSets, setGeneratedSets] = useState<Record<string, OfflineExamSet>>({});
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSavingSets, setIsSavingSets] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'answer_key' | 'batch_generate'>('preview');

  // Format selection: 2-page 4-column vs 4-page 2-column
  const [pdfFormat, setPdfFormat] = useState<'2-page-4-col' | '4-page-2-col'>('2-page-4-col');
  const [batchCountInput, setBatchCountInput] = useState<number>(10);
  const [batchStartInput, setBatchStartInput] = useState<number>(1001);

  // Initialize sets
  useEffect(() => {
    if (!isOpen) return;

    const setsMap: Record<string, OfflineExamSet> = {};
    const codes: string[] = [];

    if (exam.offlineSets && exam.offlineSets.length > 0) {
      exam.offlineSets.forEach((s) => {
        setsMap[s.setCode] = s;
        codes.push(s.setCode);
      });
    }

    // Default sets A, B, C, D
    ['A', 'B', 'C', 'D'].forEach((code) => {
      if (!setsMap[code]) {
        setsMap[code] = generateShuffledSet(exam, code);
      }
      if (!codes.includes(code)) {
        codes.push(code);
      }
    });

    setGeneratedSets(setsMap);
    setAvailableSetCodes(codes);
    setSelectedSetCode(codes[0] || 'A');
  }, [isOpen, exam]);

  if (!isOpen) return null;

  const currentSet = generatedSets[selectedSetCode] || generateShuffledSet(exam, selectedSetCode);

  // Generate a custom set on the fly (e.g. Set-1001)
  const handleAddNewSet = (codeName?: string) => {
    const nextCode = codeName || `Set-${1000 + availableSetCodes.length + 1}`;
    if (generatedSets[nextCode]) {
      setSelectedSetCode(nextCode);
      return;
    }
    const newSet = generateShuffledSet(exam, nextCode);
    setGeneratedSets(prev => ({ ...prev, [nextCode]: newSet }));
    setAvailableSetCodes(prev => [...prev, nextCode]);
    setSelectedSetCode(nextCode);
    toastSuccess(`নতুন ইউনিক সেট "${nextCode}" সফলভাবে তৈরি হয়েছে!`);
  };

  // Generate batch of sets (e.g., 20 or 50 sets)
  const handleGenerateBatch = () => {
    const count = Math.min(Math.max(1, batchCountInput), 100);
    const start = Math.max(1, batchStartInput);
    const newBatch = generateBatchSets(exam, count, start);

    const updatedMap = { ...generatedSets };
    const updatedCodes = [...availableSetCodes];

    newBatch.forEach(s => {
      updatedMap[s.setCode] = s;
      if (!updatedCodes.includes(s.setCode)) {
        updatedCodes.push(s.setCode);
      }
    });

    setGeneratedSets(updatedMap);
    setAvailableSetCodes(updatedCodes);
    setSelectedSetCode(newBatch[0]?.setCode || 'A');
    setActiveTab('preview');
    toastSuccess(`একসাথে ${count} টি ইউনিক সেট (Set-${start} থেকে Set-${start + count - 1}) তৈরি হয়েছে!`);
  };

  // Download PDF for the selected set
  const handleDownloadPdf = async (setCode: string) => {
    const targetSet = generatedSets[setCode] || generateShuffledSet(exam, setCode);
    setIsGeneratingPdf(true);
    try {
      const blob = await generateAdmissionStylePDF(exam, targetSet, {
        layout: pdfFormat,
        appName: 'মেডিকেল ও বিশ্ববিদ্যালয় ভর্তি পরীক্ষা পোর্টাল'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const formatLabel = pdfFormat === '2-page-4-col' ? '4_Column_2_Page' : '2_Column_4_Page';
      a.download = `OMR_Exam_${formatLabel}_SET_${targetSet.setCode}_${exam.title.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toastSuccess(`সেট ${targetSet.setCode} এর প্রিন্ট-রেডি পিডিএফ ডাউনলোড সফল হয়েছে!`);
    } catch (err: unknown) {
      console.error('PDF error:', err);
      toastError('পিডিএফ জেনারেট করতে সমস্যা হয়েছে');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Download Teacher Master Solution Key PDF
  const handleDownloadSolutionKey = async (setCode: string) => {
    const targetSet = generatedSets[setCode] || generateShuffledSet(exam, setCode);
    setIsGeneratingPdf(true);
    try {
      const blob = await generateSolutionKeyPDF(exam, targetSet);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Teacher_Solution_Key_SET_${targetSet.setCode}_${exam.title.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toastSuccess(`সেট ${targetSet.setCode} এর শিক্ষক সলিউশন কী ডাউনলোড হয়েছে!`);
    } catch (err: unknown) {
      console.error('Solution Key error:', err);
      toastError('সলিউশন কী তৈরি করতে ত্রুটি হয়েছে');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Save all generated sets to Firestore so mobile scanner can verify them
  const handleSaveSetsToServer = async () => {
    setIsSavingSets(true);
    try {
      const allSets = Object.values(generatedSets);
      await updateExam(exam.id, {
        offlineSets: allSets
      });
      if (onSetsUpdated) onSetsUpdated(allSets);
      toastSuccess(`মোট ${allSets.length} টি সেট সার্ভারে ক্লাউড সিঙ্ক হয়েছে! ওএমআর স্ক্যানার এগুলো চিনে ফেলবে।`);
    } catch (err: unknown) {
      console.error('Save sets error:', err);
      toastError('সেট ক্লাউডে সংরক্ষণ করতে ব্যর্থ হয়েছে');
    } finally {
      setIsSavingSets(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-5xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0 bg-slate-50/70 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[10px] font-black uppercase tracking-wider">
                  ৪-কলাম প্রিন্ট-রেডি ইঞ্জিন
                </span>
                <span className="text-xs text-slate-400">• {exam.courseName}</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-0.5">
                অফলাইন প্রশ্নপত্র ও ওএমআর শিট জেনারেটর (Offline Question & OMR)
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
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-4 shrink-0">
          
          {/* Set Selector Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap max-w-xl">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1">
              সেট:
            </span>
            {availableSetCodes.slice(0, 8).map((code) => {
              const isSelected = selectedSetCode === code;
              return (
                <button
                  key={code}
                  onClick={() => setSelectedSetCode(code)}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-2 ring-blue-500/30'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{code.startsWith('Set-') ? code : `SET ${code}`}</span>
                  {generatedSets[code] && <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />}
                </button>
              );
            })}

            {availableSetCodes.length > 8 && (
              <span className="text-xs text-slate-400 font-mono">
                +{availableSetCodes.length - 8} আরও
              </span>
            )}

            <button
              onClick={() => handleAddNewSet()}
              className="px-2.5 py-1.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-blue-600 dark:text-blue-400 text-xs font-bold hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center gap-1 cursor-pointer transition-colors"
              title="নতুন ইউনিক সেট যোগ করুন"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>নতুন সেট</span>
            </button>
          </div>

          {/* Format Selector & Download Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Format toggle */}
            <div className="p-1 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center gap-1 text-xs">
              <button
                onClick={() => setPdfFormat('2-page-4-col')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  pdfFormat === '2-page-4-col'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
                title="এপিট-ওপিট প্রিন্ট করার জন্য ২ পৃষ্ঠার ৪-কলাম ফরম্যাট (ছবির হুবহু ফরম্যাট)"
              >
                ২ পেজ (৪ কলাম)
              </button>
              <button
                onClick={() => setPdfFormat('4-page-2-col')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  pdfFormat === '4-page-2-col'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
                title="৪ পৃষ্ঠার স্ট্যান্ডার্ড বুকলেট ফরম্যাট"
              >
                ৪ পেজ (২ কলাম)
              </button>
            </div>

            {/* Download PDF Button */}
            <button
              onClick={() => handleDownloadPdf(selectedSetCode)}
              disabled={isGeneratingPdf}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{isGeneratingPdf ? 'রেন্ডার হচ্ছে...' : `SET ${selectedSetCode} PDF`}</span>
            </button>

            {/* Solution Key Button */}
            <button
              onClick={() => handleDownloadSolutionKey(selectedSetCode)}
              disabled={isGeneratingPdf}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              <span>টিচার সলিউশন</span>
            </button>
          </div>

        </div>

        {/* Navigation Tabs (Preview, Answer Key, Batch Generation) */}
        <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === 'preview'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              প্রশ্ন ও ওএমআর প্রিভিউ
            </button>
            <button
              onClick={() => setActiveTab('answer_key')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === 'answer_key'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              উত্তরপত্র ও ম্যাপিং কী
            </button>
            <button
              onClick={() => setActiveTab('batch_generate')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                activeTab === 'batch_generate'
                  ? 'bg-white dark:bg-slate-800 text-purple-600 dark:text-purple-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-500" />
              <span>হাজার হাজার ইউনিক সেট জেনারেটর</span>
            </button>
          </div>

          <button
            onClick={handleSaveSetsToServer}
            disabled={isSavingSets}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSavingSets ? 'animate-spin' : ''}`} />
            <span>{isSavingSets ? 'সিঙ্ক হচ্ছে...' : 'সেটসমূহ ক্লাউডে সেভ করুন'}</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5 bg-slate-50 dark:bg-slate-950/40">
          
          {/* TAB 1: PREVIEW */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              
              {/* Info banner */}
              <div className="p-4 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/60 flex items-start justify-between gap-3 text-xs text-blue-900 dark:text-blue-200">
                <div className="flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-extrabold text-sm text-blue-950 dark:text-blue-100">
                      ৪-কলাম প্রিন্ট ফরম্যাট (মেডিকেল ভর্তি পরীক্ষা স্ট্যান্ডার্ড):
                    </div>
                    <div className="mt-1 space-y-0.5 leading-relaxed text-slate-600 dark:text-slate-300">
                      • <strong>১ম কলাম:</strong> ওএমআর শিট, কিউআর কোড (QR Code), এবং শিক্ষার্থীর ৬ ডিজিট রোল পূরণের ঘর।<br />
                      • <strong>২য়, ৩য় ও ৪র্থ কলাম:</strong> প্রশ্ন ও অপশন (ক, খ, গ, ঘ) এবং শেষ অংশে পরীক্ষার্থীদের নির্দেশাবলী।<br />
                      • <strong>২য় পৃষ্ঠা:</strong> ৫১ থেকে ১০০ নম্বর প্রশ্ন এবং রাফ করার নির্ধারিত স্থান।
                    </div>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="px-3 py-1.5 rounded-xl bg-blue-600 text-white font-mono font-bold text-xs inline-block">
                    SET: {currentSet.setCode}
                  </div>
                </div>
              </div>

              {/* Layout Visual Mockup / Grid */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-3xl p-4 bg-white dark:bg-slate-900 space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="font-black text-sm text-slate-900 dark:text-white">
                    সেট {currentSet.setCode} এর প্রশ্ন তালিকা ({currentSet.questions.length} টি এমসিকিউ)
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    প্রশ্ন ও অপশন উভয়ই সাফেল্ড (Shuffled)
                  </span>
                </div>

                {/* Question Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
                  {currentSet.questions.map((q) => (
                    <div
                      key={q.questionNumber}
                      className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2 text-xs"
                    >
                      <div className="flex items-start gap-2">
                        <span className="w-6 h-6 rounded-lg bg-blue-600 text-white font-bold font-mono flex items-center justify-center shrink-0 text-[11px]">
                          {q.questionNumber}
                        </span>
                        <div className="font-bold text-slate-900 dark:text-white leading-snug">
                          {q.text}
                        </div>
                      </div>

                      {/* Options */}
                      <div className="grid grid-cols-2 gap-1.5 pl-8">
                        {q.options.map((opt) => (
                          <div
                            key={opt.id}
                            className={`p-1.5 rounded-lg border text-[11px] flex items-center gap-1.5 ${
                              opt.id === q.correctOption
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-bold'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-800 text-[9px] font-bold flex items-center justify-center">
                              {opt.id}
                            </span>
                            <span className="truncate">{opt.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: ANSWER KEY */}
          {activeTab === 'answer_key' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-900/60 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-amber-600 shrink-0" />
                  <div>
                    <strong>টিচার সিক্রেট সলিউশন কী:</strong> প্রতিটি সেটের অপশন ও প্রশ্ন সাফেল অনুযায়ী সঠিক উত্তর ম্যাপিং নিচে দেখানো হলো।
                  </div>
                </div>
                <button
                  onClick={() => handleDownloadSolutionKey(selectedSetCode)}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>সলিউশন কী PDF</span>
                </button>
              </div>

              {/* Answers Grid */}
              <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-10 gap-2 font-mono text-xs">
                  {currentSet.questions.map((q) => (
                    <div
                      key={q.questionNumber}
                      className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center"
                    >
                      <span className="text-[10px] text-slate-400">Q{q.questionNumber}</span>
                      <span className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
                        {currentSet.answerKey[q.questionNumber] || '-'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BATCH GENERATE THOUSANDS OF SETS */}
          {activeTab === 'batch_generate' && (
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  <span>অটোমেটিক কোশ্চেন সাফলিং ও হাজার হাজার ইউনিক সেট জেনারেশন</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  কেউ যাতে ডেস্কে বসে দেখাদেখি করতে না পারে, প্রতিটি সেটের প্রশ্ন ও অপশন সিকোয়েন্স সম্পূর্ণ আলাদা থাকবে।
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    কতগুলো ইউনিক সেট তৈরি করতে চান?
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={batchCountInput}
                    onChange={(e) => setBatchCountInput(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white text-sm font-mono font-bold"
                  />
                  <p className="text-[11px] text-slate-400">যেমন: 10, 20, 50 বা 100 টি সেট</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    সেট কোড শুরুর নম্বর (Prefix)
                  </label>
                  <input
                    type="number"
                    min="1001"
                    value={batchStartInput}
                    onChange={(e) => setBatchStartInput(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white text-sm font-mono font-bold"
                  />
                  <p className="text-[11px] text-slate-400">যেমন: Set-1001 থেকে শুরু হবে</p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleGenerateBatch}
                  className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm shadow-md shadow-purple-600/30 flex items-center gap-2 cursor-pointer transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{batchCountInput} টি ইউনিক সেট তৈরি করুন</span>
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
