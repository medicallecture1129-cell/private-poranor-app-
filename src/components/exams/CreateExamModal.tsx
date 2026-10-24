import React, { useState, useEffect } from 'react';
import { Course, Question, Exam } from '../../types';
import { createExam } from '../../services/db';
import { parseBulkMCQText } from '../../utils/mcqParser';
import { useToast } from '../../context/ToastContext';
import { ModernSelect } from '../ui/ModernSelect';
import { X, Plus, Trash2, Sparkles, FileText, CheckCircle2, AlertCircle, Check, HelpCircle } from 'lucide-react';

interface CreateExamModalProps {
  courses: Course[];
  isOffline?: boolean;
  onClose: () => void;
  onExamCreated: (exam: Exam) => void;
}

export const CreateExamModal: React.FC<CreateExamModalProps> = ({
  courses,
  isOffline = false,
  onClose,
  onExamCreated
}) => {
  const { success: toastSuccess, error: toastError } = useToast();

  // If no courses exist, provide fallback general course
  const defaultCourseList = courses.length > 0 
    ? courses 
    : [{ id: 'general', name: 'General Batch (All Students)', batch: 'All Students', allowedEmails: [], createdAt: Date.now() }];

  const [selectedCourseId, setSelectedCourseId] = useState(defaultCourseList[0]?.id || 'general');
  const [title, setTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [totalMarks, setTotalMarks] = useState(25);
  const [passMark, setPassMark] = useState(10);
  const [negativeMarkPercentage, setNegativeMarkPercentage] = useState(0.25); // 25%
  const [instructions, setInstructions] = useState('Read each question carefully. Negative marking applies for incorrect answers.');

  // Timing
  // Default: Start now, End in 4 hours, Publish in 5 hours
  const now = new Date();
  const formatForInput = (d: Date) => {
    const pad = (n: number) => (n < 10 ? '0' + n : n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const startTimeDefault = formatForInput(now);
  const endTimeDefault = formatForInput(new Date(now.getTime() + 4 * 60 * 60 * 1000));
  const publishTimeDefault = formatForInput(new Date(now.getTime() + 5 * 60 * 60 * 1000));

  const [startTimeInput, setStartTimeInput] = useState(startTimeDefault);
  const [endTimeInput, setEndTimeInput] = useState(endTimeDefault);
  const [publishTimeInput, setPublishTimeInput] = useState(publishTimeDefault);

  // Questions
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionTab, setQuestionTab] = useState<'single' | 'bulk'>('single');

  // Single Question Input Form
  const [currQText, setCurrQText] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [correctOpt, setCorrectOpt] = useState('A');
  const [currExpl, setCurrExpl] = useState('');

  // Bulk Input Raw Text
  const [bulkText, setBulkText] = useState('');
  const [bulkError, setBulkError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCourseId && defaultCourseList.length > 0) {
      setSelectedCourseId(defaultCourseList[0].id);
    }
  }, [defaultCourseList, selectedCourseId]);

  const handleAddSingleQuestion = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorNotice(null);

    const qText = currQText.trim();
    if (!qText) {
      const msg = 'Please enter the question statement text.';
      setErrorNotice(msg);
      toastError(msg);
      return false;
    }

    if (!optA.trim() || !optB.trim()) {
      const msg = 'Please fill in at least Option A and Option B.';
      setErrorNotice(msg);
      toastError(msg);
      return false;
    }

    const newQ: Question = {
      id: 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      text: qText,
      options: [
        { id: 'A', text: optA.trim() },
        { id: 'B', text: optB.trim() },
        { id: 'C', text: optC.trim() || 'Option C' },
        { id: 'D', text: optD.trim() || 'Option D' }
      ],
      correctOption: correctOpt,
      explanation: currExpl.trim() || ''
    };

    setQuestions(prev => [...prev, newQ]);
    toastSuccess(`Question #${questions.length + 1} added.`);

    // Reset inputs
    setCurrQText('');
    setOptA('');
    setOptB('');
    setOptC('');
    setOptD('');
    setCurrExpl('');
    return true;
  };

  const handleParseBulk = () => {
    setBulkError(null);
    if (!bulkText.trim()) {
      setBulkError('Please paste questions in the text box below.');
      return;
    }

    const parsed = parseBulkMCQText(bulkText);
    if (parsed.length === 0) {
      setBulkError('Could not identify questions. Please ensure each question has number, options (A, B, C, D), and Answer.');
      return;
    }

    setQuestions(prev => [...prev, ...parsed]);
    toastSuccess(`Imported ${parsed.length} questions successfully.`);
    setBulkText('');
    setQuestionTab('single');
  };

  const handleRemoveQuestion = (idx: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitExam = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorNotice(null);

    if (!title.trim()) {
      const msg = 'Please enter an exam title.';
      setErrorNotice(msg);
      toastError(msg);
      return;
    }

    // Auto-bundle in-progress single question if user typed text but forgot to click "+ Add Question"
    let readyQuestions = [...questions];
    if (currQText.trim()) {
      if (optA.trim() || optB.trim()) {
        const autoQ: Question = {
          id: 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          text: currQText.trim(),
          options: [
            { id: 'A', text: optA.trim() || 'Option A' },
            { id: 'B', text: optB.trim() || 'Option B' },
            { id: 'C', text: optC.trim() || 'Option C' },
            { id: 'D', text: optD.trim() || 'Option D' }
          ],
          correctOption: correctOpt,
          explanation: currExpl.trim() || ''
        };
        readyQuestions.push(autoQ);
        setQuestions(readyQuestions);
        setCurrQText('');
        setOptA('');
        setOptB('');
        setOptC('');
        setOptD('');
        setCurrExpl('');
      }
    }

    if (readyQuestions.length === 0) {
      const msg = 'Please add at least 1 question. Type question and options, then click "+ Add Question to Exam".';
      setErrorNotice(msg);
      toastError(msg);
      return;
    }

    const selectedCourse = defaultCourseList.find(c => c.id === selectedCourseId) || defaultCourseList[0];

    const startMs = new Date(startTimeInput).getTime();
    const endMs = new Date(endTimeInput).getTime();
    const pubMs = new Date(publishTimeInput).getTime();

    if (endMs <= startMs) {
      const msg = 'End time must be after Start time.';
      setErrorNotice(msg);
      toastError(msg);
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createExam({
        courseId: selectedCourse.id,
        courseName: selectedCourse.name,
        title: title.trim(),
        durationMinutes: Number(durationMinutes) || 30,
        totalMarks: Number(totalMarks) || readyQuestions.length,
        totalQuestions: readyQuestions.length,
        passMark: Number(passMark) || 1,
        negativeMarkPercentage: Number(negativeMarkPercentage) || 0,
        instructions: instructions.trim(),
        startTime: startMs,
        endTime: endMs,
        resultPublishTime: pubMs,
        questions: readyQuestions,
        isOffline: Boolean(isOffline),
        examType: isOffline ? 'offline' : 'live'
      });

      toastSuccess(`${isOffline ? 'অফলাইন' : ''} Exam "${created.title}" published successfully!`);
      onExamCreated(created);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish exam';
      setErrorNotice(msg);
      toastError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <span>{isOffline ? 'নিউ অফলাইন এক্সাম তৈরি করুন' : 'Create New Exam'}</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                isOffline
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
              }`}>
                {isOffline ? 'Offline Exam' : 'Live & Practice'}
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isOffline
                ? 'অফলাইন পরীক্ষার নাম, কোর্স, মোট মার্কস ও প্রশ্নপত্র যুক্ত করুন'
                : 'Set schedules, negative marking, question banks, and result publishing time'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorNotice && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs sm:text-sm text-red-700 dark:text-red-300 flex items-start gap-2.5 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="font-medium">{errorNotice}</span>
            </div>
          )}

          {/* Basic Exam Meta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Target Course / Batch (কোর্স / ব্যাচ)
              </label>
              <ModernSelect
                value={selectedCourseId}
                onChange={setSelectedCourseId}
                options={defaultCourseList.map(c => ({
                  value: c.id,
                  label: c.name,
                  badge: c.batch
                }))}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Exam Title (পরীক্ষার নাম) *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Model Test 01 - Physics & Vectors"
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-white/[0.1] bg-white dark:bg-[#121622] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Exam Duration (পরীক্ষার সময়কাল - মিনিটে)
              </label>
              <input
                type="number"
                min="1"
                required
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-white/[0.1] bg-white dark:bg-[#121622] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Total Marks (মোট মার্কস)
              </label>
              <input
                type="number"
                min="1"
                required
                value={totalMarks}
                onChange={(e) => setTotalMarks(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-white/[0.1] bg-white dark:bg-[#121622] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Pass Mark (পাস মার্ক)
              </label>
              <input
                type="number"
                min="0"
                required
                value={passMark}
                onChange={(e) => setPassMark(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#121622] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Negative Marking (নেগেটিভ মার্কিং)
              </label>
              <ModernSelect
                value={String(negativeMarkPercentage)}
                onChange={(v) => setNegativeMarkPercentage(Number(v))}
                options={[
                  { value: '0', label: '0% (কোনো নেগেটিভ মার্কিং নেই)' },
                  { value: '0.25', label: '25% (-0.25 কর্তন প্রতি ভুল উত্তরে)' },
                  { value: '0.33', label: '33.3% (-0.33 কর্তন প্রতি ভুল উত্তরে)' },
                  { value: '0.50', label: '50% (-0.50 কর্তন প্রতি ভুল উত্তরে)' },
                ]}
              />
            </div>
          </div>

          {/* Real-time Marks & Negative Marking Summary Banner (Requirement 1) */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                মোট প্রশ্ন সংখ্যা: <strong className="font-mono">{questions.length}</strong>
              </span>
              <span className="text-slate-400">|</span>
              <span>
                প্রতি প্রশ্নে বরাদ্দ: <strong className="font-mono text-theme-primary">
                  {questions.length > 0 ? (totalMarks / questions.length).toFixed(2) : (totalMarks > 0 ? totalMarks : '1.00')}
                </strong> মার্ক
              </span>
            </div>

            <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
              নেগেটিভ মার্কিং: {negativeMarkPercentage > 0 ? `${(negativeMarkPercentage * 100).toFixed(0)}% (${questions.length > 0 ? ((totalMarks / questions.length) * negativeMarkPercentage).toFixed(2) : '0.25'} মার্ক)` : 'নেই (0%)'}
            </div>
          </div>

          {/* Schedule Configuration */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Exam Schedule & Result Publishing
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Start Date & Time (Live Begins)
                </label>
                <input
                  type="datetime-local"
                  required
                  value={startTimeInput}
                  onChange={(e) => setStartTimeInput(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  End Date & Time (Live Closes)
                </label>
                <input
                  type="datetime-local"
                  required
                  value={endTimeInput}
                  onChange={(e) => setEndTimeInput(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Result Publish Date & Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={publishTimeInput}
                  onChange={(e) => setPublishTimeInput(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              Students can start live exam between Start and End time. After End Time passes, the exam shifts automatically to Practice mode.
            </p>
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Instructions
            </label>
            <textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* QUESTION BUILDER SECTION */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Questions Bank</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-bold">
                    {questions.length} ready
                  </span>
                </h4>
                <p className="text-xs text-slate-500">
                  Add questions one-by-one or import in bulk using formatted text
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setQuestionTab('single')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    questionTab === 'single'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  Single MCQ
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionTab('bulk')}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                    questionTab === 'bulk'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Bulk Text / AI Parser</span>
                </button>
              </div>
            </div>

            {/* TAB: SINGLE MCQ ADDITION */}
            {questionTab === 'single' && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Question Statement
                    </label>
                    {currQText.includes('\n') && (
                      <span className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                        Multi-line text detected
                      </span>
                    )}
                  </div>
                  <textarea
                    rows={currQText.includes('\n') ? 3 : 2}
                    value={currQText}
                    onChange={(e) => setCurrQText(e.target.value)}
                    placeholder="Enter question text (or paste multiple questions here for auto-detection)..."
                    className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Auto-detect if user accidentally pasted multiple MCQs into the single question box! */}
                {currQText.includes('\n') && parseBulkMCQText(currQText).length > 1 && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 animate-in fade-in">
                    <div className="text-xs text-blue-900 dark:text-blue-300">
                      ⚡ <strong>{parseBulkMCQText(currQText).length} questions detected!</strong> Would you like to import them all at once?
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const parsed = parseBulkMCQText(currQText);
                        setQuestions(prev => [...prev, ...parsed]);
                        toastSuccess(`${parsed.length} questions imported successfully!`);
                        setCurrQText('');
                        setOptA('');
                        setOptB('');
                        setOptC('');
                        setOptD('');
                        setCurrExpl('');
                      }}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer shadow-xs"
                    >
                      Add all {parseBulkMCQText(currQText).length} questions
                    </button>
                  </div>
                )}

                {/* MCQ Options with Modern Sleek Badge Buttons (Replaced raw radio bullets) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Options & Correct Answer
                    </label>
                    <span className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      Click letter badge to set correct answer
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(['A', 'B', 'C', 'D'] as const).map((optKey) => {
                      const val = optKey === 'A' ? optA : optKey === 'B' ? optB : optKey === 'C' ? optC : optD;
                      const setter = optKey === 'A' ? setOptA : optKey === 'B' ? setOptB : optKey === 'C' ? setOptC : setOptD;
                      const isCorrect = correctOpt === optKey;

                      return (
                        <div 
                          key={optKey} 
                          className={`flex items-center gap-2 p-1.5 rounded-xl border transition-all ${
                            isCorrect 
                              ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 ring-1 ring-emerald-500/40 shadow-xs' 
                              : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          {/* Tactile modern option button with check indicator */}
                          <button
                            type="button"
                            onClick={() => setCorrectOpt(optKey)}
                            className={`h-9 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                              isCorrect
                                ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400/40'
                                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                            title={`Click to mark option ${optKey} as correct`}
                          >
                            <span>{optKey}</span>
                            {isCorrect ? (
                              <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
                            ) : (
                              <span className="text-[10px] opacity-40 font-normal">Set</span>
                            )}
                          </button>

                          <input
                            type="text"
                            value={val}
                            onChange={(e) => setter(e.target.value)}
                            placeholder={`Option ${optKey} text...`}
                            className="flex-1 px-2.5 py-1.5 text-xs sm:text-sm bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Solution Explanation (Optional)
                  </label>
                  <input
                    type="text"
                    value={currExpl}
                    onChange={(e) => setCurrExpl(e.target.value)}
                    placeholder="Why this answer is correct..."
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => handleAddSingleQuestion()}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Question to Exam</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB: BULK TEXT / AI PARSER */}
            {questionTab === 'bulk' && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Paste Raw MCQs (Word / PDF / Plain text)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkText(`1. What is the number of chromosomes in humans?
A) 44
B) 46
C) 48
D) 50
Ans: B
Explanation: Humans have 23 pairs or 46 chromosomes in somatic cells.

2. What is the speed of light in vacuum?
A) 3 x 10^8 m/s
B) 3 x 10^6 m/s
C) 3 x 10^4 m/s
D) 3 x 10^2 m/s
Ans: A
Explanation: The speed of light in vacuum is approximately 300,000 km/s.`);
                    }}
                    className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                  >
                    Load Sample Questions
                  </button>
                </div>

                <textarea
                  rows={8}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={`1. What is the unit of electric current?
A) Volt
B) Ampere
C) Ohm
D) Watt
Ans: B
Explanation: Ampere is the SI unit of electric current.

2. Which organelle produces ATP?
A) Nucleus
B) Mitochondria
C) Ribosome
D) Vacuole
Ans: B`}
                  className="w-full p-3 font-mono text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                {bulkError && (
                  <p className="text-xs text-red-500 font-medium">
                    {bulkError}
                  </p>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleParseBulk}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Parse & Add All Questions</span>
                  </button>
                </div>
              </div>
            )}

            {/* LIST OF CURRENTLY ADDED QUESTIONS */}
            {questions.length > 0 && (
              <div className="space-y-2 pt-2">
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Ready Questions ({questions.length})
                </h5>

                {questions.map((q, idx) => (
                  <div
                    key={q.id || idx}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {idx + 1}. {q.text}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                        {q.options.map((opt) => (
                          <span
                            key={opt.id}
                            className={`px-1.5 py-0.5 rounded ${opt.id === q.correctOption ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-800' : ''}`}
                          >
                            {opt.id}) {opt.text}
                          </span>
                        ))}
                      </div>
                      {q.explanation && (
                        <div className="text-[11px] text-slate-400 italic">
                          Exp: {q.explanation}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(idx)}
                      className="text-slate-400 hover:text-red-500 p-1 cursor-pointer shrink-0 transition-colors"
                      title="Remove question"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              questions.length > 0 || currQText.trim()
                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}>
              {questions.length + (currQText.trim() ? 1 : 0)} Question{questions.length === 1 && !currQText.trim() ? '' : 's'} Ready
            </span>
            {currQText.trim() && (
              <span className="text-[11px] text-blue-600 dark:text-blue-400 hidden sm:inline">
                (Current question will be auto-saved)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSubmitExam()}
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl btn-theme-primary text-xs sm:text-sm font-bold shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer transition-all flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Publishing...' : 'Publish Exam'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
