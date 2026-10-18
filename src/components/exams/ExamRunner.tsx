import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Exam, ExamSubmission, StudentAnswer } from '../../types';
import { submitExamAnswers } from '../../services/db';
import { Clock, AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Send, AlertCircle } from 'lucide-react';

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
  const { user } = useAuth();

  // Timer: Duration in seconds
  const totalSeconds = exam.durationMinutes * 60;
  const [secondsRemaining, setSecondsRemaining] = useState(totalSeconds);
  const [startTime] = useState(Date.now());

  // Current Question Index
  const [currentQIndex, setCurrentQIndex] = useState(0);

  // Selected Answers: map from questionId to optionId ('A', 'B', 'C', 'D') or null
  const [answers, setAnswers] = useState<Record<string, string | null>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [liveSuccessMsg, setLiveSuccessMsg] = useState(false);

  // Timer countdown
  useEffect(() => {
    if (secondsRemaining <= 0) {
      // Auto-submit when time expires!
      handleFinalSubmit();
      return;
    }

    const interval = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsRemaining]);

  const formatTimer = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n: number) => (n < 10 ? '0' + n : n);
    return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
  };

  const handleSelectOption = (qId: string, optId: string) => {
    setAnswers(prev => ({
      ...prev,
      [qId]: prev[qId] === optId ? null : optId // toggle
    }));
  };

  const handleClearAnswer = (qId: string) => {
    setAnswers(prev => ({
      ...prev,
      [qId]: null
    }));
  };

  // Submit and Calculate Scores
  const handleFinalSubmit = async () => {
    if (isSubmitting || !user) return;
    setIsSubmitting(true);

    const now = Date.now();
    const durationTakenSeconds = Math.min(
      Math.round((now - startTime) / 1000),
      totalSeconds
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
      startTime,
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

      if (isLive) {
        // As per prompt: Live exam results are NOT shown immediately.
        // It shows: "Live exam results will be officially published on [Result Publish Date & Time]."
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

  const currQuestion = exam.questions[currentQIndex];
  const answeredCount = Object.values(answers).filter(Boolean).length;
  const publishDateFormatted = new Date(exam.resultPublishTime).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  if (liveSuccessMsg) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
            <CheckCircle className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">
            Exam Submitted Successfully
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Your answers have been securely synced to the cloud. As this was an official Live Exam, the leaderboard and detailed answer scripts will be published on:
          </p>
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 font-semibold text-blue-700 dark:text-blue-300 text-sm">
            {publishDateFormatted}
          </div>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors cursor-pointer"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 dark:bg-black overflow-y-auto flex flex-col">
      {/* Top Runner Header */}
      <header className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3 shadow-xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="min-w-0 pr-4">
            <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white truncate">
              {exam.title}
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {isLive ? 'Official Live Exam' : 'Practice Mode'} • Question {currentQIndex + 1} of {exam.questions.length}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Countdown Timer */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-mono font-bold ${
                secondsRemaining < 300
                  ? 'bg-red-500/10 text-red-600 border border-red-500/30 animate-pulse'
                  : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{formatTimer(secondsRemaining)}</span>
            </div>

            {/* Submit Button */}
            <button
              onClick={() => setShowConfirmSubmit(true)}
              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left 2 Cols: Current Question */}
        <div className="md:col-span-2 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
            {/* Question Text */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                <span className="font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                  Question {currentQIndex + 1}
                </span>
                {exam.negativeMarkPercentage > 0 && (
                  <span className="text-red-500">
                    -{Math.round(exam.negativeMarkPercentage * 100)}% on wrong answer
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-relaxed">
                {currQuestion.text}
              </h2>
            </div>

            {/* Options */}
            <div className="space-y-3 pt-2">
              {currQuestion.options.map((opt) => {
                const isSelected = answers[currQuestion.id] === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => handleSelectOption(currQuestion.id, opt.id)}
                    className={`p-3.5 rounded-xl border text-sm transition-all cursor-pointer flex items-center gap-3 ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-white font-medium ring-1 ring-blue-500'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/30'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {opt.id}
                    </div>
                    <span className="flex-1 leading-snug">{opt.text}</span>
                  </div>
                );
              })}
            </div>

            {/* Navigation & Clear */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleClearAnswer(currQuestion.id)}
                className="text-xs text-slate-500 hover:text-red-500 underline cursor-pointer"
              >
                Clear Selection
              </button>

              <div className="flex items-center gap-2">
                <button
                  disabled={currentQIndex === 0}
                  onClick={() => setCurrentQIndex(prev => prev - 1)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold disabled:opacity-30 flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <button
                  disabled={currentQIndex === exam.questions.length - 1}
                  onClick={() => setCurrentQIndex(prev => prev + 1)}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-30 flex items-center gap-1 cursor-pointer"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Question Navigation Palette */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                Questions Palette
              </h4>
              <span className="text-xs font-semibold text-slate-500">
                {answeredCount}/{exam.questions.length} Answered
              </span>
            </div>

            {/* Grid of question buttons */}
            <div className="grid grid-cols-5 gap-2">
              {exam.questions.map((q, idx) => {
                const isAnswered = !!answers[q.id];
                const isCurrent = currentQIndex === idx;

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentQIndex(idx)}
                    className={`h-9 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isCurrent
                        ? 'ring-2 ring-blue-500 bg-blue-600 text-white'
                        : isAnswered
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0" />
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700 shrink-0" />
                <span>Unanswered</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Confirmation Modal */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-amber-500">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                Confirm Submission
              </h4>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              You have answered <strong>{answeredCount}</strong> out of{' '}
              <strong>{exam.questions.length}</strong> questions.
              {isLive
                ? ' You can only attempt this Live Exam once. Are you ready to submit?'
                : ' Are you ready to complete this practice exam?'}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmSubmit(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Back to Exam
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
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
