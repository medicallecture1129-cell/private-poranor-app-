import React from 'react';
import { Exam, ExamSubmission } from '../../types';
import { 
  Trophy, 
  CheckCircle2, 
  XCircle, 
  MinusCircle, 
  Clock, 
  TrendingUp, 
  X, 
  RotateCcw, 
  Download 
} from 'lucide-react';
import { exportAnswerScriptPDF } from '../../utils/pdfExport';

interface PracticeResultModalProps {
  exam: Exam;
  submission: ExamSubmission;
  liveSubmissions: ExamSubmission[];
  onClose: () => void;
  onRetake: () => void;
}

export const PracticeResultModal: React.FC<PracticeResultModalProps> = ({
  exam,
  submission,
  liveSubmissions,
  onClose,
  onRetake
}) => {
  // Calculate Predictive Merit Position
  // If the student had scored this in the live exam, what rank would they achieve?
  const sortedLiveScores = [...liveSubmissions].sort((a, b) => {
    if (b.marksObtained !== a.marksObtained) {
      return b.marksObtained - a.marksObtained;
    }
    return a.durationSeconds - b.durationSeconds;
  });

  let predictedRank = 1;
  for (const liveSub of sortedLiveScores) {
    if (
      liveSub.marksObtained > submission.marksObtained ||
      (liveSub.marksObtained === submission.marksObtained && liveSub.durationSeconds < submission.durationSeconds)
    ) {
      predictedRank++;
    }
  }

  const totalParticipants = sortedLiveScores.length;
  const minutes = Math.floor(submission.durationSeconds / 60);
  const seconds = submission.durationSeconds % 60;
  const durationFormatted = `${minutes}m ${seconds}s`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600 text-white">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Practice Exam Result & Analytics
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {exam.title} • {exam.courseName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => exportAnswerScriptPDF(exam, submission, submission.studentName, submission.studentCollege)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer text-slate-700 dark:text-slate-300"
              title="Download Answer Sheet PDF"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scroll Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Predictive Ranking Banner */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-violet-600/10 dark:from-blue-950/40 dark:via-indigo-950/40 dark:to-violet-950/40 border border-blue-200 dark:border-blue-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-wider">
                <TrendingUp className="w-4 h-4" />
                <span>Predictive Merit Evaluation</span>
              </div>
              <h4 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                Predicted Rank: #{predictedRank}
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {' '}out of {totalParticipants > 0 ? `${totalParticipants + 1} candidates` : '1 (first participant)'}
                </span>
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                If you had scored these same marks in the original Live Exam, your merit position would be #{predictedRank} on the official leaderboard.
              </p>
            </div>

            <div className="text-right sm:border-l sm:border-slate-200 dark:sm:border-slate-800 sm:pl-6 shrink-0">
              <span className="text-xs text-slate-500 dark:text-slate-400">Your Score</span>
              <div className="text-2xl font-black text-blue-600 dark:text-blue-400">
                {submission.marksObtained}
                <span className="text-sm font-semibold text-slate-400">/{submission.totalMarks}</span>
              </div>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {submission.percentage.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-center">
              <div className="flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-semibold">Correct</span>
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">
                {submission.correctCount}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-center">
              <div className="flex items-center justify-center gap-1.5 text-red-600 dark:text-red-400 mb-1">
                <XCircle className="w-4 h-4" />
                <span className="text-xs font-semibold">Wrong</span>
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">
                {submission.wrongCount}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-center">
              <div className="flex items-center justify-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
                <MinusCircle className="w-4 h-4" />
                <span className="text-xs font-semibold">Skipped</span>
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-white">
                {submission.skippedCount}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-center">
              <div className="flex items-center justify-center gap-1.5 text-blue-500 mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-xs font-semibold">Time Taken</span>
              </div>
              <div className="text-base font-bold text-slate-900 dark:text-white">
                {durationFormatted}
              </div>
            </div>
          </div>

          {/* Detailed Question Review */}
          <div className="space-y-4">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
              Questions & Solutions Review
            </h4>

            <div className="space-y-3">
              {exam.questions.map((q, idx) => {
                const ans = submission.answers.find(a => a.questionId === q.id);
                const isCorrect = ans?.isCorrect;
                const isSkipped = !ans || ans.selectedOption === null;

                return (
                  <div
                    key={q.id}
                    className={`p-4 rounded-xl border text-xs space-y-2.5 transition-colors ${
                      isCorrect
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40'
                        : isSkipped
                        ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                        : 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-semibold text-slate-900 dark:text-white text-sm">
                        Q{idx + 1}. {q.text}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${
                          isCorrect
                            ? 'bg-emerald-600 text-white'
                            : isSkipped
                            ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            : 'bg-red-600 text-white'
                        }`}
                      >
                        {isCorrect ? 'Correct' : isSkipped ? 'Skipped' : 'Wrong'}
                      </span>
                    </div>

                    {/* Options list */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {q.options.map((opt) => {
                        const isStudentChoice = ans?.selectedOption === opt.id;
                        const isCorrectOption = q.correctOption === opt.id;

                        let badge = '';
                        let styleClass = 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300';

                        if (isCorrectOption) {
                          badge = ' (Correct Answer)';
                          styleClass = 'border-emerald-500 bg-emerald-100/60 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 font-semibold';
                        } else if (isStudentChoice && !isCorrect) {
                          badge = ' (Your Choice)';
                          styleClass = 'border-red-500 bg-red-100/60 dark:bg-red-950/60 text-red-800 dark:text-red-200 font-semibold';
                        }

                        return (
                          <div
                            key={opt.id}
                            className={`p-2 rounded-lg border text-xs ${styleClass}`}
                          >
                            <span className="font-bold mr-1.5">{opt.id})</span>
                            <span>{opt.text}</span>
                            {badge && <span className="text-[10px] ml-1">{badge}</span>}
                          </div>
                        );
                      })}
                    </div>

                    {/* Explanation */}
                    {q.explanation && (
                      <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">Explanation: </span>
                        {q.explanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between">
          <button
            onClick={onRetake}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer text-slate-700 dark:text-slate-300"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retake Practice Exam</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
