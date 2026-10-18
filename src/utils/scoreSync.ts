import { Exam, ExamSubmission } from '../types';

/**
 * Global Exam Marks Synchronization Utility
 *
 * Ensures that if an admin changes totalMarks, negative marking, or question count,
 * all scores, percentages, and total marks across results, leaderboards, practice,
 * and exports stay strictly synchronized and mathematically accurate.
 */
export interface SynchronizedScore {
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  markPerQuestion: number;
  penaltyPerWrong: number;
}

export function getSynchronizedScore(
  submission: Pick<ExamSubmission, 'correctCount' | 'wrongCount' | 'marksObtained' | 'totalMarks' | 'percentage'>,
  exam?: Pick<Exam, 'totalMarks' | 'questions' | 'totalQuestions' | 'negativeMarkPercentage'> | null
): SynchronizedScore {
  if (!exam || !exam.totalMarks || exam.totalMarks <= 0) {
    return {
      marksObtained: submission.marksObtained ?? 0,
      totalMarks: submission.totalMarks ?? 0,
      percentage: submission.percentage ?? 0,
      markPerQuestion: 1,
      penaltyPerWrong: 0
    };
  }

  const questionCount = (exam.questions && exam.questions.length > 0)
    ? exam.questions.length
    : (exam.totalQuestions && exam.totalQuestions > 0 ? exam.totalQuestions : 1);

  const markPerQuestion = exam.totalMarks / questionCount;
  const negativeRate = exam.negativeMarkPercentage ?? 0;
  const penaltyPerWrong = markPerQuestion * negativeRate;

  const correctMarks = (submission.correctCount ?? 0) * markPerQuestion;
  const wrongDeduction = (submission.wrongCount ?? 0) * penaltyPerWrong;
  const netScore = Math.max(0, correctMarks - wrongDeduction);

  const marksObtained = Math.round(netScore * 100) / 100;
  const percentage = Math.round((marksObtained / exam.totalMarks) * 1000) / 10;

  return {
    marksObtained,
    totalMarks: exam.totalMarks,
    percentage,
    markPerQuestion: Math.round(markPerQuestion * 1000) / 1000,
    penaltyPerWrong: Math.round(penaltyPerWrong * 1000) / 1000
  };
}
