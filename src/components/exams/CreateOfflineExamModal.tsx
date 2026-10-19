import React, { useState } from 'react';
import { Course, Question, Exam } from '../../types';
import { createExam, updateExam } from '../../services/db';
import { parseBulkMCQText } from '../../utils/mcqParser';
import { generateBatchSets } from '../../utils/omrPdfGenerator';
import { useToast } from '../../context/ToastContext';
import { ModernSelect } from '../ui/ModernSelect';
import { 
  X, 
  Sparkles, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Printer, 
  Upload, 
  Layers, 
  HelpCircle,
  FileCheck,
  RefreshCw
} from 'lucide-react';

interface CreateOfflineExamModalProps {
  courses: Course[];
  isOpen: boolean;
  onClose: () => void;
  onExamCreated: (exam: Exam) => void;
}

export const CreateOfflineExamModal: React.FC<CreateOfflineExamModalProps> = ({
  courses,
  isOpen,
  onClose,
  onExamCreated
}) => {
  const { success: toastSuccess, error: toastError } = useToast();

  const defaultCourseList = courses.length > 0
    ? courses
    : [{ id: 'general', name: 'General Batch (All Students)', batch: 'Medical / Dental / Varsity', allowedEmails: [], createdAt: Date.now() }];

  const [selectedCourseId, setSelectedCourseId] = useState(defaultCourseList[0]?.id || 'general');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [totalMarks, setTotalMarks] = useState(100);
  const [markPerQuestion, setMarkPerQuestion] = useState(1.0);
  const [negativeMarkPercentage, setNegativeMarkPercentage] = useState(0.25);
  const [instructions, setInstructions] = useState('কালো কালির বলপয়েন্ট কলম দিয়ে বৃত্ত সম্পূর্ণ ভরাট করতে হবে। প্রতিটি ভুল উত্তরের জন্য ০.২৫ নম্বর কাটা যাবে। ওএমআর শিট কাটাকাটি করা যাবে না।');

  // Question Bank / Master Set
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionInputMode, setQuestionInputMode] = useState<'bulk' | 'manual'>('bulk');
  const [bulkText, setBulkText] = useState('');
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Manual Question Input State
  const [manualQText, setManualQText] = useState('');
  const [manualOptA, setManualOptA] = useState('');
  const [manualOptB, setManualOptB] = useState('');
  const [manualOptC, setManualOptC] = useState('');
  const [manualOptD, setManualOptD] = useState('');
  const [manualCorrectOpt, setManualCorrectOpt] = useState('A');
  const [manualTopic, setManualTopic] = useState('');
  const [manualExplanation, setManualExplanation] = useState('');

  if (!isOpen) return null;

  // Add Single Manual Question
  const handleAddManualQuestion = () => {
    if (!manualQText.trim()) {
      toastError('অনুগ্রহ করে প্রশ্নের বিবরণ লিখুন');
      return;
    }
    if (!manualOptA.trim() || !manualOptB.trim() || !manualOptC.trim() || !manualOptD.trim()) {
      toastError('অনুগ্রহ করে ৪টি অপশন (A, B, C, D) লিখুন');
      return;
    }

    const newQ: Question = {
      id: `manual_q_${Date.now()}_${questions.length + 1}`,
      text: manualQText.trim(),
      options: [
        { id: 'A', text: manualOptA.trim() },
        { id: 'B', text: manualOptB.trim() },
        { id: 'C', text: manualOptC.trim() },
        { id: 'D', text: manualOptD.trim() }
      ],
      correctOption: manualCorrectOpt,
      topic: manualTopic.trim() || undefined,
      explanation: manualExplanation.trim() || undefined
    };

    const updated = [...questions, newQ];
    setQuestions(updated);
    setTotalMarks(updated.length * markPerQuestion);

    // Reset manual form
    setManualQText('');
    setManualOptA('');
    setManualOptB('');
    setManualOptC('');
    setManualOptD('');
    setManualTopic('');
    setManualExplanation('');
    toastSuccess(`প্রশ্ন ${updated.length} সফলভাবে যোগ করা হয়েছে!`);
  };

  // Bulk MCQ Parsing
  const handleParseBulk = () => {
    setBulkError(null);
    if (!bulkText.trim()) {
      setBulkError('অনুগ্রহ করে টেক্সট বক্সে প্রশ্ন ও অপশন পেস্ট করুন');
      return;
    }

    try {
      const parsed = parseBulkMCQText(bulkText);
      if (parsed.length === 0) {
        setBulkError('কোনো প্রশ্ন শনাক্ত করা যায়নি। অনুগ্রহ করে ফরম্যাট যাচাই করুন।');
        return;
      }
      setQuestions(parsed);
      setTotalMarks(parsed.length * markPerQuestion);
      toastSuccess(`সফলভাবে ${parsed.length} টি প্রশ্ন মাস্টার সেটে যুক্ত করা হয়েছে!`);
    } catch (err: unknown) {
      setBulkError(err instanceof Error ? err.message : 'প্রশ্ন পার্স করতে ত্রুটি হয়েছে');
    }
  };

  // Load Sample 100 MCQs Master Set for Medical Admission Test
  const handleLoadSample100MedicalMCQs = () => {
    const subjects = [
      { name: 'উদ্ভিদবিজ্ঞান (Botany)', count: 20 },
      { name: 'প্রাণিবিজ্ঞান (Zoology)', count: 20 },
      { name: 'রসায়ন ১ম ও ২য় পত্র (Chemistry)', count: 25 },
      { name: 'পদার্থবিজ্ঞান (Physics)', count: 20 },
      { name: 'ইংরেজি ও সাধারণ জ্ঞান (English & GK)', count: 15 }
    ];

    const sampleQuestions: Question[] = [];
    let qCounter = 1;

    // Standard high quality sample MCQs for instant testing & demo
    const predefinedMCQs = [
      { text: 'মাইটোসিস কোষ বিভাজনের কোন ধাপে ক্রোমোজোমগুলো বিষুবীয় অঞ্চলে অবস্থান করে?', opts: ['প্রোফেজ', 'মেটাফেজ', 'অ্যানাফেজ', 'টেলোফেজ'], ans: 'B', topic: 'উদ্ভিদবিজ্ঞান' },
      { text: 'শালোকসংশ্লেষণের আলোক পর্যায়ে পানির ফটোলাইসিসের ফলে কী উৎপন্ন হয়?', opts: ['CO2 ও গ্লুকোজ', 'অক্সিজেন, প্রোটন ও ইলেকট্রন', 'শুধুমাত্র ATP', 'ল্যাকটিক এসিড'], ans: 'B', topic: 'উদ্ভিদবিজ্ঞান' },
      { text: 'ডিএনএ (DNA) অনুর ডাবল হেলিক্স কাঠামোর আবিষ্কারক কে?', opts: ['ওয়াটসন ও ক্রিক', 'রবার্ট হুক', 'মেন্ডেল', 'ল্যামার্ক'], ans: 'A', topic: 'উদ্ভিদবিজ্ঞান' },
      { text: 'ম্যালপিজিয়ান নালিকা কোন প্রাণীর প্রধান রেচন অঙ্গ?', opts: ['কেঁচো', 'ঘাসফড়িং', 'মানুষ', 'হাইড্রা'], ans: 'B', topic: 'প্রাণিবিজ্ঞান' },
      { text: 'মানবদেহের কোন অঙ্গে ইউরিয়া তৈরি হয়?', opts: ['বৃক্ক (Kidney)', 'যকৃত (Liver)', 'হৃৎপিণ্ড', 'প্লীহা'], ans: 'B', topic: 'প্রাণিবিজ্ঞান' },
      { text: 'রক্তের গ্রুপ "AB" পজিটিভ ব্যক্তিকে কী বলা হয়?', opts: ['সর্বজনীন দাতা', 'সর্বজনীন গ্রহীতা', 'বিরল গ্রুপ', 'অ্যান্টিবডি মুক্ত'], ans: 'B', topic: 'প্রাণিবিজ্ঞান' },
      { text: 'নিচের কোনটি আদর্শ গ্যাসের সমীকরণ?', opts: ['PV = nRT', 'P = VRT', 'PV = mgh', 'PT = nRV'], ans: 'A', topic: 'রসায়ন' },
      { text: 'বিশুদ্ধ পানির pH মান কত?', opts: ['০', '৭', '১৪', '৪.৫'], ans: 'B', topic: 'রসায়ন' },
      { text: 'বেনজিনে কয়টি পাই (π) বন্ধন বিদ্যমান?', opts: ['২ টি', '৩ টি', '৬ টি', '১২ টি'], ans: 'B', topic: 'রসায়ন' },
      { text: 'মহাকর্ষীয় ধ্রুবক G এর মান কত?', opts: ['9.8 ms^-2', '6.673 x 10^-11 N m^2 kg^-2', '3 x 10^8 ms^-1', '1.6 x 10^-19 C'], ans: 'B', topic: 'পদার্থবিজ্ঞান' },
      { text: 'শব্দ তরঙ্গ নিচের কোনটির মধ্য দিয়ে চলাচল করতে পারে না?', opts: ['কঠিন মাধ্যম', 'বায়বীয় মাধ্যম', 'শূন্য মাধ্যম (Vacuum)', 'তরল মাধ্যম'], ans: 'C', topic: 'পদার্থবিজ্ঞান' },
      { text: 'Choose the correct spelling:', opts: ['Liaison', 'Liason', 'Liazon', 'Leison'], ans: 'A', topic: 'English' },
      { text: 'The synonym of "Eloquent" is:', opts: ['Fluent and persuasive', 'Rude and aggressive', 'Silent and calm', 'Timid'], ans: 'A', topic: 'English' },
      { text: 'বাংলাদেশের প্রথম সামুদ্রিক গ্যাসক্ষেত্র কোনটি?', opts: ['সাঙ্গু', 'তিতাস', 'হবিগঞ্জ', 'কৈলাশটিলা'], ans: 'A', topic: 'সাধারণ জ্ঞান' },
      { text: 'মুজিবনগর সরকার কোন তারিখে শপথ গ্রহণ করে?', opts: ['২৬ মার্চ ১৯৭১', '১০ এপ্রিল ১৯৭১', '১৭ এপ্রিল ১৯৭১', '১৬ ডিসেম্বর ১৯৭১'], ans: 'C', topic: 'সাধারণ জ্ঞান' }
    ];

    // Build exactly 100 questions to match Medical Admission model test specs
    for (let i = 0; i < 100; i++) {
      const template = predefinedMCQs[i % predefinedMCQs.length];
      const repeatIdx = Math.floor(i / predefinedMCQs.length);
      const questionText = repeatIdx > 0 ? `${template.text} [মডেল সেট অনুকরণ #${repeatIdx + 1}]` : template.text;

      sampleQuestions.push({
        id: `offline_q_${Date.now()}_${i + 1}`,
        text: questionText,
        options: [
          { id: 'A', text: template.opts[0] },
          { id: 'B', text: template.opts[1] },
          { id: 'C', text: template.opts[2] },
          { id: 'D', text: template.opts[3] }
        ],
        correctOption: template.ans,
        topic: template.topic,
        explanation: `${template.topic} ভিত্তিক সঠিক ব্যাখ্যা: বিকল্প (${template.ans}) হল সঠিক উত্তর।`
      });
    }

    setQuestions(sampleQuestions);
    setTotalMarks(100);
    toastSuccess('১০০টি মেডিকেল ও ডেন্টাল ভর্তি পরীক্ষার আদর্শ প্রশ্ন সফলভাবে লোড করা হয়েছে!');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setBulkText(content);
      try {
        const parsed = parseBulkMCQText(content);
        if (parsed.length > 0) {
          setQuestions(parsed);
          setTotalMarks(parsed.length * markPerQuestion);
          toastSuccess(`ফাইল থেকে ${parsed.length} টি প্রশ্ন সফলভাবে ইমপোর্ট করা হয়েছে!`);
        }
      } catch (err) {
        console.warn('Direct parse fallback:', err);
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toastError('অনুগ্রহ করে পরীক্ষার নাম লিখুন');
      return;
    }
    if (questions.length === 0) {
      toastError('অনুগ্রহ করে অন্তত ১টি বা ১০০টি এমসিকিউ প্রশ্ন আপলোড করুন');
      return;
    }

    setIsSubmitting(true);
    try {
      const course = defaultCourseList.find(c => c.id === selectedCourseId) || defaultCourseList[0];
      
      const newExamData: Omit<Exam, 'id'> = {
        courseId: course.id,
        courseName: course.name,
        title: title.trim(),
        subject: subject.trim() || 'Medical Admission Model Test',
        durationMinutes: Number(durationMinutes),
        totalMarks: Number(totalMarks),
        totalQuestions: questions.length,
        passMark: Math.round(Number(totalMarks) * 0.4),
        markPerQuestion: Number(markPerQuestion),
        negativeMarkPercentage: Number(negativeMarkPercentage),
        instructions: instructions.trim(),
        isOffline: true,
        examType: 'offline',
        isActive: true,
        isPractice: false,
        startTime: 0,
        endTime: 0,
        resultPublishTime: 0,
        questions: questions,
        createdAt: Date.now()
      };

      // Create in Firestore / LocalStorage
      const createdExam = await createExam(newExamData);

      // Pre-generate 4 standard unique sets (Set 1, Set 2, Set 3, Set 4)
      const defaultSets = generateBatchSets(createdExam, 4, 1);
      await updateExam(createdExam.id, { offlineSets: defaultSets });
      createdExam.offlineSets = defaultSets;

      toastSuccess(`"${createdExam.title}" অফলাইন পরীক্ষা এবং মাস্টার সেট (${createdExam.questions.length}টি প্রশ্ন) সফলভাবে তৈরি হয়েছে! ৪টি ইউনিক সেটও স্বয়ংক্রিয়ভাবে প্রস্তুত করা হয়েছে।`);
      onExamCreated(createdExam);
      onClose();
    } catch (err: unknown) {
      console.error('Create offline exam error:', err);
      toastError(err instanceof Error ? err.message : 'অফলাইন পরীক্ষা তৈরি করতে ব্যর্থ হয়েছে');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-gradient-to-r from-blue-900/10 via-indigo-900/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[10px] font-extrabold uppercase tracking-wider">
                  Offline Exam Management
                </span>
                <span className="text-xs text-slate-400">• ৪-কলাম ওএমআর ও কিউআর সিস্টেম</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-0.5">
                নতুন অফলাইন এক্সাম তৈরি করুন (Create Offline Exam)
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* Basic Exam Meta Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            
            {/* Exam Title */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                পরীক্ষার নাম (Exam Title) *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="যেমন: Medical Admission Final Model Test - 01"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-semibold"
              />
            </div>

            {/* Course Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                কোর্স / ব্যাচ নির্বাচন *
              </label>
              <ModernSelect
                value={selectedCourseId}
                onChange={setSelectedCourseId}
                options={defaultCourseList.map(c => ({ value: c.id, label: c.name, badge: c.batch }))}
              />
            </div>

            {/* Subject / Topics */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                বিষয় ও অধ্যায় / সিলেবাস
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="যেমন: জীববিজ্ঞান, রসায়ন, পদার্থ ও সাধারণ জ্ঞান"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                পরীক্ষার সময় (মিনিট) *
              </label>
              <input
                type="number"
                min="5"
                max="300"
                required
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono font-bold"
              />
            </div>

            {/* Full Marks */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                পূর্ণমান (Total Marks) *
              </label>
              <input
                type="number"
                min="1"
                required
                value={totalMarks}
                onChange={(e) => setTotalMarks(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono font-bold"
              />
            </div>

            {/* Mark Per Question */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                প্রতি প্রশ্নের মান
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={markPerQuestion}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMarkPerQuestion(val);
                  if (questions.length > 0) setTotalMarks(questions.length * val);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono font-bold"
              />
            </div>

            {/* Negative Marking */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                নেগেটিভ মার্কিং (ভুল উত্তরের জন্য)
              </label>
              <select
                value={negativeMarkPercentage}
                onChange={(e) => setNegativeMarkPercentage(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value={0.25}>০.২৫ (২৫% - মেডিকেল/ভার্সিটি স্ট্যান্ডার্ড)</option>
                <option value={0.50}>০.৫০ (৫০% - বিশেষ নেগেটিভ)</option>
                <option value={0.20}>০.২০ (২০% নেগেটিভ)</option>
                <option value={0}>০.০০ (কোনো নেগেটিভ নেই)</option>
              </select>
            </div>

            {/* Excluded Fields Note */}
            <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>
                <strong>অফলাইন সুবিধা:</strong> লাইভ এক্সামের মতো এতে কোনো স্টার্ট বা এন্ড টাইমের বাধ্যবাধকতা নেই। খাতা যেকোনো সময় প্রিন্ট ও স্ক্যান করা যাবে।
              </span>
            </div>

          </div>

          {/* Instructions Box */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              পরীক্ষার্থীদের সাধারণ নির্দেশাবলী (ওএমআর ও প্রশ্নপত্রের ৪র্থ কলামে প্রিন্ট হবে)
            </label>
            <textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Master Question Set Uploader */}
          <div className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>মাস্টার কোশ্চেন সেট আপলোড ও তৈরি ({questions.length}টি প্রস্তুত)</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-mono font-bold">
                    {questions.length} / 100 প্রশ্ন প্রস্তুত
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  সব প্রশ্ন একসাথে পেস্ট করে পার্স করতে পারেন অথবা ম্যানুয়ালি একটি একটি করে প্রশ্ন লিখতে পারেন।
                </p>
              </div>

              {/* Mode Toggle: Bulk Paste vs Manual */}
              <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setQuestionInputMode('bulk')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    questionInputMode === 'bulk'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  সব প্রশ্ন একসাথে পেস্ট (Bulk)
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionInputMode('manual')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    questionInputMode === 'manual'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  ম্যানুয়াল একটি একটি (Manual)
                </button>
              </div>
            </div>

            {/* BULK MODE */}
            {questionInputMode === 'bulk' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    একসাথে ১০০টি এমসিকিউ প্রশ্ন ও অপশন পেস্ট করুন:
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleLoadSample100MedicalMCQs}
                      className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>১০০টি মেডিকেল মডেল টেস্ট প্রশ্ন লোড</span>
                    </button>

                    <label className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all">
                      <Upload className="w-3.5 h-3.5" />
                      <span>ফাইল আপলোড (.txt)</span>
                      <input
                        type="file"
                        accept=".txt,.json,.csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <textarea
                  rows={6}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder="প্রশ্ন ও ৪টি অপশন পেস্ট করুন:
1. মাইটোসিস কোষ বিভাজনের কোন ধাপে ক্রোমোজোমগুলো বিষুবীয় অঞ্চলে থাকে?
A. প্রোফেজ
B. মেটাফেজ
C. অ্যানাফেজ
D. টেলোফেজ
Answer: B
Explanation: মেটাফেজ পর্যায়ে ক্রোমোজোম সর্বাধিক খাটো ও মোটা হয়।

2. রক্তের গ্রুপ 'AB' কে কী বলা হয়?
A. সর্বজনীন দাতা
B. সর্বজনীন গ্রহীতা
C. বিশেষ গ্রুপ
D. অ্যান্টিজেন মুক্ত
Answer: B"
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500 leading-relaxed"
                />

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleParseBulk}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <FileCheck className="w-4 h-4" />
                    <span>টেক্সট পার্স ও যুক্ত করুন (Parse MCQs)</span>
                  </button>

                  {bulkError && (
                    <span className="text-xs text-rose-500 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {bulkError}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* MANUAL MODE */}
            {questionInputMode === 'manual' && (
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    প্রশ্ন নম্বর #{questions.length + 1}
                  </span>
                  <input
                    type="text"
                    value={manualTopic}
                    onChange={(e) => setManualTopic(e.target.value)}
                    placeholder="বিষয় / টপিক (e.g. উদ্ভিদবিজ্ঞান)"
                    className="px-3 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white w-44"
                  />
                </div>

                <div>
                  <textarea
                    rows={2}
                    value={manualQText}
                    onChange={(e) => setManualQText(e.target.value)}
                    placeholder="প্রশ্নের বিবরণ লিখুন..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white font-semibold"
                  />
                </div>

                {/* 4 Options Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-600 w-5">A:</span>
                    <input
                      type="text"
                      value={manualOptA}
                      onChange={(e) => setManualOptA(e.target.value)}
                      placeholder="অপশন A"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-600 w-5">B:</span>
                    <input
                      type="text"
                      value={manualOptB}
                      onChange={(e) => setManualOptB(e.target.value)}
                      placeholder="অপশন B"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-600 w-5">C:</span>
                    <input
                      type="text"
                      value={manualOptC}
                      onChange={(e) => setManualOptC(e.target.value)}
                      placeholder="অপশন C"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-blue-600 w-5">D:</span>
                    <input
                      type="text"
                      value={manualOptD}
                      onChange={(e) => setManualOptD(e.target.value)}
                      placeholder="অপশন D"
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">সঠিক উত্তর:</span>
                    <select
                      value={manualCorrectOpt}
                      onChange={(e) => setManualCorrectOpt(e.target.value)}
                      className="px-3 py-1 text-xs font-bold rounded-lg border border-emerald-400 bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200"
                    >
                      <option value="A">বিকল্প A</option>
                      <option value="B">বিকল্প B</option>
                      <option value="C">বিকল্প C</option>
                      <option value="D">বিকল্প D</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddManualQuestion}
                    className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>+ এই প্রশ্নটি যোগ করুন</span>
                  </button>
                </div>
              </div>
            )}

            {/* Questions Summary Preview */}
            {questions.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="font-bold text-slate-900 dark:text-white">
                    মোট {questions.length} টি প্রশ্ন যুক্ত হয়েছে (মাস্টার সেট প্রস্তুত)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setQuestions([])}
                  className="text-xs font-bold text-rose-500 hover:underline cursor-pointer"
                >
                  সব প্রশ্ন মুছুন
                </button>
              </div>
            )}

          </div>

          {/* Footer Submit Buttons */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={isSubmitting || questions.length === 0}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-all"
            >
              <Printer className="w-4 h-4" />
              <span>{isSubmitting ? 'তৈরি হচ্ছে...' : 'অফলাইন এক্সাম সেভ করুন ও সেট তৈরি করুন'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
