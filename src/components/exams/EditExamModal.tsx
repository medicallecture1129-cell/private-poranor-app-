import React, { useState } from 'react';
import { Course, Question, Exam } from '../../types';
import { updateExam } from '../../services/db';
import { parseBulkMCQText } from '../../utils/mcqParser';
import { useToast } from '../../context/ToastContext';
import { X, Plus, Trash2, Sparkles, Check, CheckCircle2, AlertCircle, Save, Power } from 'lucide-react';

interface EditExamModalProps {
  exam: Exam;
  courses: Course[];
  onClose: () => void;
  onExamUpdated: (updatedExam: Exam) => void;
}

export const EditExamModal: React.FC<EditExamModalProps> = ({
  exam,
  courses,
  onClose,
  onExamUpdated
}) => {
  const { success: toastSuccess, error: toastError } = useToast();

  const [title, setTitle] = useState(exam.title);
  const [courseId, setCourseId] = useState(exam.courseId);
  const [durationMinutes, setDurationMinutes] = useState(exam.durationMinutes);
  const [totalMarks, setTotalMarks] = useState(exam.totalMarks);
  const [passMark, setPassMark] = useState(exam.passMark);
  const [negativeMarkPercentage, setNegativeMarkPercentage] = useState(exam.negativeMarkPercentage || 0);
  const [instructions, setInstructions] = useState(exam.instructions || '');
  const [isActive, setIsActive] = useState<boolean>(exam.isActive !== false);

  const formatForInput = (ms: number) => {
    const d = new Date(ms);
    const pad = (n: number) => (n < 10 ? '0' + n : n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [startTimeInput, setStartTimeInput] = useState(formatForInput(exam.startTime));
  const [endTimeInput, setEndTimeInput] = useState(formatForInput(exam.endTime));
  const [publishTimeInput, setPublishTimeInput] = useState(formatForInput(exam.resultPublishTime));

  const [questions, setQuestions] = useState<Question[]>(exam.questions || []);
  const [activeTab, setActiveTab] = useState<'details' | 'questions'>('details');

  // Question adding state
  const [currQText, setCurrQText] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [correctOpt, setCorrectOpt] = useState('A');
  const [currExpl, setCurrExpl] = useState('');

  // Bulk parser state
  const [bulkText, setBulkText] = useState('');
  const [showBulkInput, setShowBulkInput] = useState(false);

  const [isSaving, setIsSaving] = useState(false);

  const handleAddQuestion = () => {
    if (!currQText.trim()) {
      toastError('Please enter question text');
      return;
    }
    const newQ: Question = {
      id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: currQText.trim(),
      options: [
        { id: 'A', text: optA.trim() || 'Option A' },
        { id: 'B', text: optB.trim() || 'Option B' },
        { id: 'C', text: optC.trim() || 'Option C' },
        { id: 'D', text: optD.trim() || 'Option D' }
      ],
      correctOption: correctOpt,
      explanation: currExpl.trim()
    };
    setQuestions(prev => [...prev, newQ]);
    toastSuccess('Question added');
    setCurrQText('');
    setOptA('');
    setOptB('');
    setOptC('');
    setOptD('');
    setCurrExpl('');
  };

  const handleBulkParse = () => {
    if (!bulkText.trim()) return;
    const parsed = parseBulkMCQText(bulkText);
    if (parsed.length === 0) {
      toastError('Could not parse questions. Check format.');
      return;
    }
    setQuestions(prev => [...prev, ...parsed]);
    toastSuccess(`Added ${parsed.length} questions from text.`);
    setBulkText('');
    setShowBulkInput(false);
  };

  const handleRemoveQuestion = (idx: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toastError('Exam title is required');
      return;
    }
    if (questions.length === 0) {
      toastError('Exam must have at least 1 question');
      return;
    }

    const startMs = new Date(startTimeInput).getTime();
    const endMs = new Date(endTimeInput).getTime();
    const pubMs = new Date(publishTimeInput).getTime();

    if (endMs <= startMs) {
      toastError('End time must be after Start time');
      return;
    }

    const selectedCourse = courses.find(c => c.id === courseId);

    setIsSaving(true);
    try {
      const updates: Partial<Exam> = {
        title: title.trim(),
        courseId,
        courseName: selectedCourse ? selectedCourse.name : exam.courseName,
        durationMinutes: Number(durationMinutes),
        totalMarks: Number(totalMarks),
        passMark: Number(passMark),
        negativeMarkPercentage: Number(negativeMarkPercentage),
        instructions: instructions.trim(),
        startTime: startMs,
        endTime: endMs,
        resultPublishTime: pubMs,
        isActive,
        questions
      };

      await updateExam(exam.id, updates);
      toastSuccess('Exam updated successfully');
      onExamUpdated({ ...exam, ...updates } as Exam);
      onClose();
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to update exam');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <span>Manage & Edit Exam</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                }`}>
                  {isActive ? 'Active (ON)' : 'Paused (OFF)'}
                </span>
              </h3>
              <p className="text-xs text-slate-500">Edit exam timings, toggle active status, and modify questions</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="px-6 pt-3 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900">
          <button
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'details' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Exam Schedule & Settings
          </button>
          <button
            onClick={() => setActiveTab('questions')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'questions' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <span>Questions Bank</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px]">
              {questions.length}
            </span>
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {activeTab === 'details' && (
            <div className="space-y-4">
              {/* Active Toggle Switch */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <Power className="w-4 h-4 text-blue-600" />
                    <span>Exam Active Status (পরীক্ষা চালু / বন্ধ)</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    বন্ধ থাকলে শিক্ষার্থীরা পরীক্ষা দিতে পারবে না। চালু রাখলে নির্ধারিত সময়ে লাইভ পরীক্ষা দেওয়া যাবে।
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsActive(prev => !prev)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                    isActive 
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs' 
                      : 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{isActive ? 'Exam ON (সক্রিয়)' : 'Exam OFF (স্থগিত)'}</span>
                </button>
              </div>

              {/* Title & Course */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Exam Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Course / Batch
                  </label>
                  <select
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({c.batch})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Marks, Duration, Penalty */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Duration (Min)</label>
                  <input
                    type="number"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Total Marks</label>
                  <input
                    type="number"
                    value={totalMarks}
                    onChange={(e) => setTotalMarks(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Pass Mark</label>
                  <input
                    type="number"
                    value={passMark}
                    onChange={(e) => setPassMark(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Negative Marking</label>
                  <select
                    value={negativeMarkPercentage}
                    onChange={(e) => setNegativeMarkPercentage(Number(e.target.value))}
                    className="w-full px-2 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value={0}>0%</option>
                    <option value={0.25}>25% (-0.25)</option>
                    <option value={0.33}>33.3% (-0.33)</option>
                    <option value={0.50}>50% (-0.50)</option>
                  </select>
                </div>
              </div>

              {/* Time Configuration & Make Live Again */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700/60 pb-2.5">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span>Exam Timing & Live Schedule (পুনরায় লাইভ করার অপশন)</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      পূর্বে শেষ হওয়া পরীক্ষা পুনরায় লাইভ করতে চাইলে নতুন সময়সূচী নির্ধারণ করুন। নতুন পরীক্ষার্থীদের রেজাল্ট একই লিডারবোর্ডে যুক্ত হবে।
                    </p>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const now = Date.now();
                        setStartTimeInput(formatForInput(now));
                        setEndTimeInput(formatForInput(now + 2 * 60 * 60 * 1000));
                        setPublishTimeInput(formatForInput(now + 3 * 60 * 60 * 1000));
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-950/70 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 transition-colors"
                    >
                      +২ ঘণ্টা লাইভ
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = Date.now();
                        setStartTimeInput(formatForInput(now));
                        setEndTimeInput(formatForInput(now + 4 * 60 * 60 * 1000));
                        setPublishTimeInput(formatForInput(now + 5 * 60 * 60 * 1000));
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/70 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 transition-colors"
                    >
                      +৪ ঘণ্টা লাইভ
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = Date.now();
                        setStartTimeInput(formatForInput(now));
                        setEndTimeInput(formatForInput(now + 24 * 60 * 60 * 1000));
                        setPublishTimeInput(formatForInput(now + 25 * 60 * 60 * 1000));
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/70 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 transition-colors"
                    >
                      ২৪ ঘণ্টা লাইভ
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Start Time (Live Begins)</label>
                    <input
                      type="datetime-local"
                      value={startTimeInput}
                      onChange={(e) => setStartTimeInput(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">End Time (Live Closes)</label>
                    <input
                      type="datetime-local"
                      value={endTimeInput}
                      onChange={(e) => setEndTimeInput(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Result Publish Time</label>
                    <input
                      type="datetime-local"
                      value={publishTimeInput}
                      onChange={(e) => setPublishTimeInput(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Instructions</label>
                <textarea
                  rows={2}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}

          {activeTab === 'questions' && (
            <div className="space-y-4">
              {/* Add New Question Section */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="font-bold text-xs text-slate-700 dark:text-slate-300">
                    Add New Question to this Exam
                  </h5>
                  <button
                    type="button"
                    onClick={() => setShowBulkInput(!showBulkInput)}
                    className="text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>{showBulkInput ? 'Single Form' : 'Bulk Paste'}</span>
                  </button>
                </div>

                {showBulkInput ? (
                  <div className="space-y-2">
                    <textarea
                      rows={5}
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      placeholder="Paste questions here with options and answer..."
                      className="w-full p-3 font-mono text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={handleBulkParse}
                        className="px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
                      >
                        Parse & Add
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <input
                      type="text"
                      value={currQText}
                      onChange={(e) => setCurrQText(e.target.value)}
                      placeholder="Question text..."
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      {(['A', 'B', 'C', 'D'] as const).map(k => {
                        const val = k === 'A' ? optA : k === 'B' ? optB : k === 'C' ? optC : optD;
                        const setter = k === 'A' ? setOptA : k === 'B' ? setOptB : k === 'C' ? setOptC : setOptD;
                        const isCorrect = correctOpt === k;
                        return (
                          <div key={k} className="flex items-center gap-1.5 p-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                            <button
                              type="button"
                              onClick={() => setCorrectOpt(k)}
                              className={`h-7 px-2 rounded font-bold text-[11px] cursor-pointer ${
                                isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600'
                              }`}
                            >
                              {k} {isCorrect && '✓'}
                            </button>
                            <input
                              type="text"
                              value={val}
                              onChange={(e) => setter(e.target.value)}
                              placeholder={`Option ${k}`}
                              className="flex-1 text-xs bg-transparent outline-none text-slate-900 dark:text-white"
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleAddQuestion}
                        className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Question</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Questions List */}
              <div className="space-y-2">
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Current Questions ({questions.length})
                </h5>
                {questions.map((q, idx) => (
                  <div
                    key={q.id || idx}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/50 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {idx + 1}. {q.text}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[11px]">
                        {q.options.map(opt => (
                          <span
                            key={opt.id}
                            className={`px-1.5 py-0.5 rounded ${opt.id === q.correctOption ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold' : 'text-slate-500'}`}
                          >
                            {opt.id}) {opt.text}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveQuestion(idx)}
                      className="p-1 text-slate-400 hover:text-red-500 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {questions.length} Questions in Exam
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
