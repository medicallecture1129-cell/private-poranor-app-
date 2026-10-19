import React, { useState, useEffect } from 'react';
import { Exam, OfflineExamSet } from '../../types';
import { 
  generateShuffledSet, 
  generateBatchSets, 
  generateAdmissionStylePDF, 
  generateSolutionKeyPDF,
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
  AlertCircle
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

  const [availableSetCodes, setAvailableSetCodes] = useState<string[]>([]);
  const [selectedSetCode, setSelectedSetCode] = useState<string>('');
  const [generatedSets, setGeneratedSets] = useState<Record<string, OfflineExamSet>>({});
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSavingSets, setIsSavingSets] = useState(false);
  const [activeTab, setActiveTab] = useState<'sets_list' | 'preview' | 'answer_key' | 'batch_generate'>('sets_list');

  const [customSetNameInput, setCustomSetNameInput] = useState('');
  const [batchCountInput, setBatchCountInput] = useState<number>(5);
  const [batchStartInput, setBatchStartInput] = useState<number>(1);

  // Initialize sets from exam or empty (do NOT force 4 default sets!)
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

    setGeneratedSets(setsMap);
    setAvailableSetCodes(codes);
    setSelectedSetCode(codes[0] || '');
  }, [isOpen, exam]);

  if (!isOpen) return null;

  // Add a brand new unique shuffled set (e.g. Set-1, Set-2, or custom name)
  const handleAddNewSet = (customName?: string) => {
    let nextCode = customName?.trim();
    if (!nextCode) {
      nextCode = `Set-${availableSetCodes.length + 1}`;
    }

    if (generatedSets[nextCode]) {
      toastError(`"${nextCode}" নামের সেটটি আগেই তৈরি করা আছে!`);
      setSelectedSetCode(nextCode);
      return;
    }

    const newSet = generateShuffledSet(exam, nextCode);
    const updatedMap = { ...generatedSets, [nextCode]: newSet };
    const updatedCodes = [...availableSetCodes, nextCode];

    setGeneratedSets(updatedMap);
    setAvailableSetCodes(updatedCodes);
    setSelectedSetCode(nextCode);
    setCustomSetNameInput('');
    toastSuccess(`নতুন ইউনিক কোশ্চেন সেট "${nextCode}" সফলভাবে তৈরি হয়েছে!`);

    // Auto sync to Firestore
    syncSetsToDb(Object.values(updatedMap));
  };

  // Generate batch of sets (e.g., 5 or 10 sets)
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
    setSelectedSetCode(newBatch[0]?.setCode || updatedCodes[0]);
    setActiveTab('sets_list');
    toastSuccess(`একসাথে ${newBatch.length} টি ইউনিক কোশ্চেন সেট সফলভাবে জেনারেট হয়েছে!`);

    syncSetsToDb(Object.values(updatedMap));
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
      toastSuccess(`"${codeToDelete}" সেটটি মুছে ফেলা হয়েছে।`);
      syncSetsToDb(Object.values(updatedMap));
    }
  };

  // Sync to database
  const syncSetsToDb = async (setsList: OfflineExamSet[]) => {
    setIsSavingSets(true);
    try {
      await updateExam(exam.id, { offlineSets: setsList });
      if (onSetsUpdated) onSetsUpdated(setsList);
    } catch (err) {
      console.error('Failed to sync sets to db:', err);
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
      const blob = await generateAdmissionStylePDF(exam, set, {
        appName: 'মেডিকেল ও বিশ্ববিদ্যালয় ভর্তি পরীক্ষা পোর্টাল'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `OMR_${exam.title.replace(/\s+/g, '_')}_${set.setCode}_2Page_8Col.pdf`;
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
      const blob = await generateSolutionKeyPDF(exam, set);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Solution_Key_${exam.title.replace(/\s+/g, '_')}_${set.setCode}.pdf`;
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
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-gradient-to-r from-purple-900/10 via-indigo-900/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-lg shadow-purple-600/30">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-[10px] font-extrabold uppercase tracking-wider">
                  ২-পেজ ৮-কলাম ওএমআর ও কোশ্চেন পেপার
                </span>
                <span className="text-xs text-slate-400">• মাস্টার সেট: {exam.questions.length} টি প্রশ্ন</span>
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

        {/* Tab Selector */}
        <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-slate-50/50 dark:bg-slate-900/50 overflow-x-auto">
          <button
            onClick={() => setActiveTab('sets_list')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'sets_list'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>ইউনিক কোশ্চেন সেট তালিকা</span>
            <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-[11px] font-extrabold">
              {availableSetCodes.length}
            </span>
          </button>

          {currentSet && (
            <button
              onClick={() => setActiveTab('preview')}
              className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                activeTab === 'preview'
                  ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>নির্বাচিত সেট প্রিভিউ ({currentSet.setCode})</span>
            </button>
          )}

          {currentSet && (
            <button
              onClick={() => setActiveTab('answer_key')}
              className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                activeTab === 'answer_key'
                  ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>অ্যানসার কি ও ব্যাখ্যা ({currentSet.setCode})</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('batch_generate')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'batch_generate'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>ব্যাচ সেট জেনারেটর</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          
          {/* TAB 1: SETS LIST */}
          {activeTab === 'sets_list' && (
            <div className="space-y-5">
              
              {/* Add New Set Bar */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/20 border border-purple-200 dark:border-purple-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-extrabold text-sm text-purple-900 dark:text-purple-200 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <span>মাস্টার সেট থেকে নতুন ইউনিক সেট তৈরি করুন</span>
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    প্রতিটি সেটে মূল পরীক্ষার ১০০টি প্রশ্নের সিকোয়েন্স এবং প্রতিটা প্রশ্নের ৪টি অপশন সম্পূর্ণ এলোমেলো (Shuffled) থাকবে।
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customSetNameInput}
                    onChange={(e) => setCustomSetNameInput(e.target.value)}
                    placeholder={`e.g. Set-${availableSetCodes.length + 1}`}
                    className="w-32 px-3 py-2 text-xs rounded-xl border border-purple-300 dark:border-purple-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddNewSet(customSetNameInput)}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-600/30 flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>ইউনিক সেট যোগ করুন</span>
                  </button>
                </div>
              </div>

              {/* Set Cards Grid */}
              {availableSetCodes.length === 0 ? (
                <div className="p-12 text-center rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center mx-auto">
                    <Layers className="w-7 h-7" />
                  </div>
                  <h3 className="font-bold text-base text-slate-800 dark:text-slate-200">
                    এখনও কোনো ইউনিক সেট তৈরি করা হয়নি
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    উপরের <strong>"ইউনিক সেট যোগ করুন"</strong> বাটনে ক্লিক করে Set 1, Set 2, Set 3 বা ইচ্ছামতো কোড দিয়ে ইউনিক সেট তৈরি করুন।
                  </p>
                  <button
                    onClick={() => handleAddNewSet('Set-1')}
                    className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs cursor-pointer shadow-md transition-all"
                  >
                    ১ নম্বর কোশ্চেন সেট তৈরি করুন (Set-1)
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {availableSetCodes.map((code) => {
                    const setObj = generatedSets[code];
                    if (!setObj) return null;
                    const isSelected = selectedSetCode === code;

                    return (
                      <div
                        key={code}
                        onClick={() => setSelectedSetCode(code)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-purple-50/60 dark:bg-purple-950/40 border-purple-500 shadow-md ring-2 ring-purple-500/30'
                            : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-black text-sm px-3 py-1 rounded-lg bg-purple-600 text-white shadow-xs">
                              {code}
                            </span>
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
                            <div>কোশ্চেন ও অপশন: <strong>সম্পূর্ণ সাফেল্ড</strong></div>
                            <div>কিউআর কোড: <code className="text-[10px] font-mono text-purple-600 dark:text-purple-400">{setObj.qrData}</code></div>
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
                            className="flex-1 py-2 px-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                            title="২-পেজ ৮-কলাম ওএমআর ও কোশ্চেন পেপার ডাউনলোড"
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
                            title="প্রিভিউ দেখুন"
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

            </div>
          )}

          {/* TAB 2: SELECTED SET PREVIEW */}
          {activeTab === 'preview' && currentSet && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-black text-lg px-3 py-1 rounded-xl bg-purple-600 text-white">
                    {currentSet.setCode}
                  </span>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      {exam.title} (সেট: {currentSet.setCode})
                    </h4>
                    <p className="text-xs text-slate-500">
                      কিউআর পেলোড: <code className="font-mono text-purple-600 dark:text-purple-400">{currentSet.qrData}</code>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownloadAdmissionPDF(currentSet)}
                    disabled={isGeneratingPdf}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>{isGeneratingPdf ? 'পিডিএফ তৈরি হচ্ছে...' : '২-পেজ ৮-কলাম PDF ডাউনলোড'}</span>
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

              {/* Questions List of this Set */}
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {currentSet.questions.map((q) => (
                  <div 
                    key={q.questionNumber} 
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 text-xs"
                  >
                    <div className="font-bold text-slate-900 dark:text-white flex items-start gap-2">
                      <span className="text-purple-600 font-mono font-black">{toBengaliNumber(q.questionNumber)}.</span>
                      <span>{q.text}</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                      {q.options.map(opt => (
                        <div 
                          key={opt.id}
                          className={`px-2 py-1 rounded-lg border text-[11px] ${
                            opt.id === q.correctOption 
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 text-emerald-800 dark:text-emerald-300 font-bold'
                              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <strong>({opt.id})</strong> {opt.text}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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
                    <span className="font-black text-purple-600 dark:text-purple-400">{q.correctOption}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: BATCH GENERATE */}
          {activeTab === 'batch_generate' && (
            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 max-w-lg mx-auto space-y-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center mx-auto shadow-md shadow-purple-600/30">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  একসাথে অনেকগুলো ইউনিক সেট তৈরি করুন
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  একটি ক্লিকেই ১০, ২০ বা ৫০টি ভিন্ন ভিন্ন ইউনিক কোশ্চেন সেট এবং ইউনিক কিউআর কোড জেনারেট হয়ে যাবে।
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-left">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    কতটি সেট তৈরি করবেন?
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={batchCountInput}
                    onChange={(e) => setBatchCountInput(Number(e.target.value))}
                    className="w-full mt-1 px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    শুরুর নম্বর (Start Num)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={batchStartInput}
                    onChange={(e) => setBatchStartInput(Number(e.target.value))}
                    className="w-full mt-1 px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerateBatch}
                className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black text-sm shadow-md shadow-purple-600/30 cursor-pointer transition-all"
              >
                {batchCountInput} টি ইউনিক সেট তৈরি করুন
              </button>
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
