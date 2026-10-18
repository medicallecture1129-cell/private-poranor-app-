import React, { useState } from 'react';
import { Course, Question, Exam } from '../../types';
import { createExam } from '../../services/db';
import { parseBulkMCQText } from '../../utils/mcqParser';
import { useToast } from '../../context/ToastContext';
import { X, Plus, Trash2, Sparkles, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

interface CreateExamModalProps {
  courses: Course[];
  onClose: () => void;
  onExamCreated: (exam: Exam) => void;
}

export const CreateExamModal: React.FC<CreateExamModalProps> = ({
  courses,
  onClose,
  onExamCreated
}) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id || '');
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

  const handleAddSingleQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currQText.trim() || !optA.trim() || !optB.trim() || !optC.trim() || !optD.trim()) {
      alert('Please fill out the question and all 4 options.');
      return;
    }

    const newQ: Question = {
      id: 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      text: currQText.trim(),
      options: [
        { id: 'A', text: optA.trim() },
        { id: 'B', text: optB.trim() },
        { id: 'C', text: optC.trim() },
        { id: 'D', text: optD.trim() }
      ],
      correctOption: correctOpt,
      explanation: currExpl.trim() || undefined
    };

    setQuestions(prev => [...prev, newQ]);
    // Reset inputs
    setCurrQText('');
    setOptA('');
    setOptB('');
    setOptC('');
    setOptD('');
    setCurrExpl('');
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
    setBulkText('');
    setQuestionTab('single');
  };

  const handleRemoveQuestion = (idx: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice(null);

    if (!title.trim()) {
      setErrorNotice('Please provide an exam title.');
      return;
    }
    if (questions.length === 0) {
      setErrorNotice('Please add at least one question to the exam.');
      return;
    }

    const selectedCourse = courses.find(c => c.id === selectedCourseId);
    if (!selectedCourse) {
      setErrorNotice('Please select a valid course.');
      return;
    }

    const startMs = new Date(startTimeInput).getTime();
    const endMs = new Date(endTimeInput).getTime();
    const pubMs = new Date(publishTimeInput).getTime();

    if (endMs <= startMs) {
      setErrorNotice('End time must be after Start time.');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createExam({
        courseId: selectedCourse.id,
        courseName: selectedCourse.name,
        title: title.trim(),
        durationMinutes: Number(durationMinutes),
        totalMarks: Number(totalMarks),
        totalQuestions: questions.length,
        passMark: Number(passMark),
        negativeMarkPercentage: Number(negativeMarkPercentage),
        instructions: instructions.trim(),
        startTime: startMs,
        endTime: endMs,
        resultPublishTime: pubMs,
        questions
      });

      toastSuccess(`Exam "${created.title}" created successfully.`);
      onExamCreated(created);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create exam';
      setErrorNotice(msg);
      toastError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Create New Exam
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Set schedules, negative marking, question banks, and result publishing time
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
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorNotice}</span>
            </div>
          )}

          {/* Basic Exam Meta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Target Course
              </label>
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.batch})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Exam Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Model Test 01 - Mechanics & Vectors"
                className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Exam Duration (Minutes)
              </label>
              <input
                type="number"
                min="1"
                required
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Total Marks
              </label>
              <input
                type="number"
                min="1"
                required
                value={totalMarks}
                onChange={(e) => setTotalMarks(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Pass Mark
              </label>
              <input
                type="number"
                min="0"
                required
                value={passMark}
                onChange={(e) => setPassMark(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Negative Marking Penalty
              </label>
              <select
                value={negativeMarkPercentage}
                onChange={(e) => setNegativeMarkPercentage(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={0}>0% (No negative marking)</option>
                <option value={0.25}>25% (-0.25 mark per wrong answer)</option>
                <option value={0.33}>33.3% (-0.33 mark per wrong answer)</option>
                <option value={0.50}>50% (-0.50 mark per wrong answer)</option>
              </select>
            </div>
          </div>

          {/* Schedule Configuration */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Exam Schedule & Result Publishing
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Live Start Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={startTimeInput}
                  onChange={(e) => setStartTimeInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Live End Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={endTimeInput}
                  onChange={(e) => setEndTimeInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Leaderboard Publish Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={publishTimeInput}
                  onChange={(e) => setPublishTimeInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
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
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  Questions Bank ({questions.length})
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
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Question Statement
                  </label>
                  <input
                    type="text"
                    value={currQText}
                    onChange={(e) => setCurrQText(e.target.value)}
                    placeholder="Enter question text..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(['A', 'B', 'C', 'D'] as const).map((optKey) => {
                    const val = optKey === 'A' ? optA : optKey === 'B' ? optB : optKey === 'C' ? optC : optD;
                    const setter = optKey === 'A' ? setOptA : optKey === 'B' ? setOptB : optKey === 'C' ? setOptC : setOptD;

                    return (
                      <div key={optKey} className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-300 w-6">
                          <input
                            type="radio"
                            name="correctOpt"
                            checked={correctOpt === optKey}
                            onChange={() => setCorrectOpt(optKey)}
                            className="text-blue-600"
                          />
                          {optKey}
                        </label>
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => setter(e.target.value)}
                          placeholder={`Option ${optKey}`}
                          className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        />
                      </div>
                    );
                  })}
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
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleAddSingleQuestion}
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
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
                    Paste Raw MCQs Text
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Supports Q1. Option A, B, C, D, Ans: B, Explanation: ...
                  </span>
                </div>

                {bulkError && (
                  <div className="text-xs text-red-600 dark:text-red-400">
                    {bulkError}
                  </div>
                )}

                <textarea
                  rows={6}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={`1. What is the SI unit of electric current?&#10;A) Volt&#10;B) Ampere&#10;C) Ohm&#10;D) Watt&#10;Ans: B&#10;Explanation: Ampere is the base unit of electric current in SI.`}
                  className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleParseBulk}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Parse & Populate Questions</span>
                  </button>
                </div>
              </div>
            )}

            {/* LIST OF ADDED QUESTIONS */}
            {questions.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {questions.map((q, idx) => (
                  <div
                    key={q.id || idx}
                    className="p-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {idx + 1}. {q.text}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 text-slate-600 dark:text-slate-300 text-[11px]">
                        {q.options.map(opt => (
                          <span
                            key={opt.id}
                            className={opt.id === q.correctOption ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}
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
                      className="text-slate-400 hover:text-red-500 p-1 cursor-pointer shrink-0"
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
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {questions.length} Question{questions.length === 1 ? '' : 's'} Ready
          </span>

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
              onClick={handleSubmitExam}
              disabled={isSubmitting || questions.length === 0}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Publishing...' : 'Publish Exam'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
