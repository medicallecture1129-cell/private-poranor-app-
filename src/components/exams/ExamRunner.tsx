import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Exam, ExamSubmission, StudentAnswer } from '../../types';
import { submitExamAnswers } from '../../services/db';
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  Send, 
  AlertCircle, 
  LayoutGrid, 
  X, 
  ChevronUp, 
  HelpCircle,
  ShieldAlert,
  ArrowLeft
} from 'lucide-react';

interface ExamRunnerProps {
  exam: Exam;
  isLive: boolean;
  onClose: () => void;
  onFinished: (submission: ExamSubmission) => void;
}

export const ExamRunner: React.FC<ExamRunnerProps> = ({
  exam,
  isLive,
  onClose,
  onFinished
}) => {
  const { user, role } = useAuth();

  // Block Admins from taking exams
  if (role === 'admin') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">
              Admin Cannot Take Student Exams
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              শুধুমাত্র শিক্ষার্থীরা পরীক্ষা দিতে পারবে। এডমিন অ্যাকাউন্টের স্কোর বা এটেম্পট লিডারবোর্ডে যুক্ত হবে না। আপনি এডমিন প্যানেল থেকে পরীক্ষা এডিট বা মনিটর করতে পারবেন।
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer transition-colors"
          >
            Back to Exam Hub
          </button>
        </div>
      </div>
    );
  }

  // Persistent Timer: Real-world countdown across reloads/exits
  const sessionKey = `exam_session_${exam.id}_${user?.id || 'anon'}`;
  
  const [session, setSession] = useState<{
    startedAt: number;
    expiresAt: number;
    answers: Record<string, string | null>;
    submitted?: boolean;
  }>(() => {
    try {
      const saved = localStorage.getItem(sessionKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.expiresAt && parsed.startedAt) return parsed;
      }
    } catch {}

    const now = Date.now();
    const durationMs = (exam.durationMinutes || 30) * 60 * 1000;
    const newSession = {
      startedAt: now,
      expiresAt: now + durationMs,
      answers: {}
    };
    try {
      localStorage.setItem(sessionKey, JSON.stringify(newSession));
    } catch {}
    return newSession;
  });

  const [answers, setAnswers] = useState<Record<string, string | null>>(session.answers || {});
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    const diff = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));
    return diff;
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [liveSuccessMsg, setLiveSuccessMsg] = useState(false);

  // Shortcut Question Palette panel state (Toggleable, default open on desktop, minimizable on mobile)
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [paletteSide, setPaletteSide] = useState<'right' | 'left'>('right');

  // Strict Real-time countdown timer loop
  useEffect(() => {
    const checkTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((session.expiresAt - now) / 1000));
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        // Auto-submit immediately when timer reaches 0, even if user left or returned!
        handleFinalSubmit();
      }
    };

    checkTimer();
    const interval = setInterval(checkTimer, 1000);
    return () => clearInterval(interval);
  }, [session.expiresAt]);

  const formatTimer = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n: number) => (n < 10 ? '0' + n : n);
    return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
  };

  const handleSelectOption = (qId: string, optId: string) => {
    setAnswers(prev => {
      const newAnswers = {
        ...prev,
        [qId]: prev[qId] === optId ? null : optId
      };
      // Persist answers to session
      try {
        const updatedSession = { ...session, answers: newAnswers };
        localStorage.setItem(sessionKey, JSON.stringify(updatedSession));
        setSession(updatedSession);
      } catch {}
      return newAnswers;
    });
  };

  const handleClearAnswer = (qId: string) => {
    setAnswers(prev => {
      const newAnswers = { ...prev, [qId]: null };
      try {
        const updatedSession = { ...session, answers: newAnswers };
        localStorage.setItem(sessionKey, JSON.stringify(updatedSession));
        setSession(updatedSession);
      } catch {}
      return newAnswers;
    });
  };

  const scrollToQuestion = (idx: number) => {
    const el = document.getElementById(`q-card-${idx}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Submit and Calculate Scores
  const handleFinalSubmit = async () => {
    if (isSubmitting || !user) return;
    setIsSubmitting(true);

    const now = Date.now();
    const durationTakenSeconds = Math.min(
      Math.max(1, Math.round((now - session.startedAt) / 1000)),
      exam.durationMinutes * 60
    );

    const markPerQ = exam.totalMarks / (exam.questions.length || 1);
    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;

    const studentAnswers: StudentAnswer[] = exam.questions.map((q) => {
      const selected = answers[q.id] || null;
      if (!selected) {
        skippedCount++;
        return {
          questionId: q.id,
          selectedOption: null,
          isCorrect: false,
          marksEarned: 0
        };
      } else if (selected === q.correctOption) {
        correctCount++;
        return {
          questionId: q.id,
          selectedOption: selected,
          isCorrect: true,
          marksEarned: markPerQ
        };
      } else {
        wrongCount++;
        const penalty = markPerQ * (exam.negativeMarkPercentage || 0);
        return {
          questionId: q.id,
          selectedOption: selected,
          isCorrect: false,
          marksEarned: -penalty
        };
      }
    });

    const netScore = studentAnswers.reduce((sum, a) => sum + a.marksEarned, 0);
    const marksObtained = Math.max(0, Number(netScore.toFixed(2)));
    const percentage = (marksObtained / (exam.totalMarks || 1)) * 100;

    const submissionData: Omit<ExamSubmission, 'id'> = {
      examId: exam.id,
      courseId: exam.courseId,
      studentId: user.id,
      studentEmail: user.email,
      studentName: user.name,
      studentCollege: user.college || 'N/A',
      isLive,
      startTime: session.startedAt,
      submittedAt: now,
      durationSeconds: durationTakenSeconds,
      totalMarks: exam.totalMarks,
      marksObtained,
      percentage,
      correctCount,
      wrongCount,
      skippedCount,
      answers: studentAnswers
    };

    try {
      const savedSub = await submitExamAnswers(submissionData);

      // Mark session finished
      try {
        localStorage.removeItem(sessionKey);
      } catch {}

      if (isLive) {
        setLiveSuccessMsg(true);
      } else {
        onFinished(savedSub);
      }
    } catch (err) {
      console.error('Submission failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const answeredCount = Object.values(answers).filter(Boolean).length;
  const isUrgentTimer = secondsRemaining <= 180; // under 3 mins

  if (liveSuccessMsg) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
        <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              Live Exam Paper Submitted Successfully!
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              আপনার উত্তরপত্র ফায়ারবেস ক্লাউডে সফলভাবে সেভ হয়েছে। অফিশিয়াল নিয়ম অনুযায়ী লাইভ পরীক্ষার ফলাফল নির্ধারিত সময়ে প্রকাশিত হবে।
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs text-blue-800 dark:text-blue-300">
            <strong>রেজাল্ট প্রকাশের সময়:</strong> {new Date(exam.resultPublishTime).toLocaleString('bn-BD', { dateStyle: 'full', timeStyle: 'short' })}
          </div>

          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors cursor-pointer"
          >
            Back to Exam Hub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 dark:bg-slate-950 flex flex-col overflow-hidden">
      {/* Top Bar: Exam Title, Course, Countdown Timer, Submit */}
      <header className="px-4 sm:px-6 py-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 shadow-xs z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              {isLive ? '🔴 Live Official Exam' : 'Practice Exam'} • {exam.courseName}
            </span>
            <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
              {exam.title}
            </h1>
          </div>
        </div>

        {/* Center/Right Timer & Submit Action */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {/* Real-time Countdown Timer Badge */}
          <div className={`flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl border font-mono font-bold text-xs sm:text-sm shadow-xs transition-colors ${
            isUrgentTimer
              ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-900 text-rose-600 dark:text-rose-400 animate-pulse'
              : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300'
          }`}>
            <Clock className="w-4 h-4" />
            <span>{formatTimer(secondsRemaining)}</span>
          </div>

          {/* Palette Toggle Button */}
          <button
            type="button"
            onClick={() => setPaletteOpen(prev => !prev)}
            className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
              paletteOpen 
                ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white border-slate-300 dark:border-slate-700'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
            }`}
            title="Toggle Questions Palette Shortcut"
          >
            <LayoutGrid className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="hidden sm:inline">Palette</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-600 text-white font-bold">
              {answeredCount}/{exam.questions.length}
            </span>
          </button>

          {/* Final Submit Button */}
          <button
            onClick={() => setShowConfirmSubmit(true)}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Send className="w-4 h-4" />
            <span>Submit</span>
          </button>
        </div>
      </header>

      {/* Main Container: Continuous Question Scroll + Side Palette */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* LEFT PALETTE (if paletteSide === 'left' and open) */}
        {paletteOpen && paletteSide === 'left' && (
          <aside className="w-64 sm:w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4 overflow-y-auto hidden md:flex flex-col gap-3 shrink-0 z-20">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Questions Shortcut ({answeredCount}/{exam.questions.length})
              </span>
              <button 
                onClick={() => setPaletteOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {exam.questions.map((q, idx) => {
                const isAns = !!answers[q.id];
                return (
                  <button
                    key={q.id}
                    onClick={() => scrollToQuestion(idx)}
                    className={`h-9 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isAns 
                        ? 'bg-emerald-600 text-white shadow-xs' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </aside>
        )}

        {/* CENTER: CONTINUOUS VERTICAL QUESTION FEED (Scroll to view all questions) */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6 max-w-4xl mx-auto w-full">
          {/* Exam Instructions Banner */}
          {exam.instructions && (
            <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 text-xs text-blue-900 dark:text-blue-300 flex items-start gap-3">
              <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>নির্দেশনা:</strong> {exam.instructions}
              </div>
            </div>
          )}

          {/* ALL QUESTIONS LIST */}
          <div className="space-y-6 pb-20">
            {exam.questions.map((q, idx) => {
              const selectedOpt = answers[q.id] || null;

              return (
                <div
                  key={q.id || idx}
                  id={`q-card-${idx}`}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-4 scroll-mt-20"
                >
                  {/* Question Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="w-8 h-8 rounded-xl bg-blue-600 text-white text-xs font-extrabold flex items-center justify-center shrink-0 shadow-xs">
                        {idx + 1}
                      </span>
                      <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-relaxed pt-0.5">
                        {q.text}
                      </h3>
                    </div>

                    {selectedOpt && (
                      <button
                        type="button"
                        onClick={() => handleClearAnswer(q.id)}
                        className="text-[11px] text-slate-400 hover:text-red-500 underline shrink-0 cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {/* Options List */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {q.options.map((opt) => {
                      const isSelected = selectedOpt === opt.id;

                      return (
                        <div
                          key={opt.id}
                          onClick={() => handleSelectOption(q.id, opt.id)}
                          className={`p-3 rounded-xl border text-xs sm:text-sm transition-all cursor-pointer flex items-center gap-3 ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/50 text-blue-950 dark:text-white font-medium ring-2 ring-blue-500/30 shadow-xs'
                              : 'border-slate-200 dark:border-slate-800/90 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-50/40 dark:bg-slate-800/20'
                          }`}
                        >
                          <div
                            className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 transition-all ${
                              isSelected
                                ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-400/30'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {opt.id}
                          </div>
                          <span className="flex-1 leading-snug">{opt.text}</span>
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                              isSelected
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-slate-300 dark:border-slate-600'
                            }`}
                          >
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        {/* RIGHT PALETTE (Default side shortcut) */}
        {paletteOpen && paletteSide === 'right' && (
          <aside className="w-64 sm:w-72 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 p-4 overflow-y-auto hidden lg:flex flex-col gap-3 shrink-0 z-20">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Question Palette
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPaletteSide(prev => prev === 'right' ? 'left' : 'right')}
                  className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline px-1 cursor-pointer"
                  title="Switch to left side"
                >
                  Move Left
                </button>
                <button 
                  onClick={() => setPaletteOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                  title="Hide palette"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 flex items-center justify-between">
              <span>{answeredCount} Answered</span>
              <span>{exam.questions.length - answeredCount} Remaining</span>
            </div>

            <div className="grid grid-cols-5 gap-2 pt-1">
              {exam.questions.map((q, idx) => {
                const isAns = !!answers[q.id];
                return (
                  <button
                    key={q.id}
                    onClick={() => scrollToQuestion(idx)}
                    className={`h-9 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isAns 
                        ? 'bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-500' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 text-[11px] text-slate-500">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-md bg-emerald-600 shrink-0" />
                <span>Answered ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-md bg-slate-200 dark:bg-slate-700 shrink-0" />
                <span>Unanswered ({exam.questions.length - answeredCount})</span>
              </div>
            </div>
          </aside>
        )}

        {/* Mobile Floating Palette Drawer (when open on small screens) */}
        {paletteOpen && (
          <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 p-4 max-h-56 overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-xs text-slate-700 dark:text-slate-300">
                Questions Shortcut ({answeredCount}/{exam.questions.length})
              </span>
              <button 
                onClick={() => setPaletteOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
              {exam.questions.map((q, idx) => {
                const isAns = !!answers[q.id];
                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      scrollToQuestion(idx);
                      setPaletteOpen(false);
                    }}
                    className={`h-8 rounded-lg text-xs font-bold ${
                      isAns ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Submit Modal */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-500">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <h4 className="font-bold text-base text-slate-900 dark:text-white">
                Submit Examination?
              </h4>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-2">
              <p>
                আপনি মোট <strong>{answeredCount}</strong> টি প্রশ্নের উত্তর দিয়েছেন।
                বাকি <strong>{exam.questions.length - answeredCount}</strong> টি প্রশ্নের উত্তর এখনো দেওয়া হয়নি।
              </p>
              <p className="text-[11px] text-slate-500">
                একবার সাবমিট করার পর আর পরিবর্তন করা সম্ভব হবে না।
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmSubmit(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Continue Exam
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmSubmit(false);
                  handleFinalSubmit();
                }}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm cursor-pointer"
              >
                {isSubmitting ? 'Submitting...' : 'Yes, Submit Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
