import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Course, Exam, ExamSubmission, LeaderboardRow, StudentUser } from '../../types';
import { exportLeaderboardPDF, exportAnswerScriptPDF, exportStudentSummaryPDF } from '../../utils/pdfExport';
import { 
  Trophy, 
  Search, 
  Download, 
  Eye, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  MinusCircle, 
  FileText, 
  Calendar, 
  User, 
  Mail, 
  Lock, 
  ChevronRight, 
  X 
} from 'lucide-react';

interface ResultsViewProps {
  courses: Course[];
  exams: Exam[];
  submissions: ExamSubmission[];
  students: StudentUser[];
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  courses,
  exams,
  submissions,
  students
}) => {
  const { user, role } = useAuth();

  // Mode: 'leaderboard' or 'student_history'
  const [activeSubTab, setActiveSubTab] = useState<'leaderboard' | 'student_history'>('leaderboard');

  // Course & Exam Selectors
  const [selectedCourseId, setSelectedCourseId] = useState<string>(courses[0]?.id || '');
  
  // Exams for selected course
  const courseExams = exams.filter(e => e.courseId === selectedCourseId);
  const [selectedExamId, setSelectedExamId] = useState<string>(courseExams[0]?.id || '');

  // Filter/Search by Name and College in Leaderboard
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Submission for Answer Script View Modal
  const [inspectSubmission, setInspectSubmission] = useState<{ submission: ExamSubmission; exam: Exam } | null>(null);

  // Student History Search (for Admin search by email or Student's own view)
  const [searchedEmail, setSearchedEmail] = useState('');
  const [targetStudentEmail, setTargetStudentEmail] = useState(user?.role === 'student' ? user.email : '');

  const currentTime = Date.now();
  const selectedCourse = courses.find(c => c.id === selectedCourseId);
  const selectedExam = exams.find(e => e.id === selectedExamId);

  // Check if student is allowed to view results of this exam yet
  const isResultPublished = selectedExam ? (currentTime >= selectedExam.resultPublishTime || role === 'admin') : false;

  // Filter ONLY Live Exam Submissions for the Official Leaderboard
  const liveSubmissions = submissions.filter(s => s.examId === selectedExamId && s.isLive);

  // Sort by marks desc, then duration asc
  const sortedLiveSubmissions = [...liveSubmissions].sort((a, b) => {
    if (b.marksObtained !== a.marksObtained) {
      return b.marksObtained - a.marksObtained;
    }
    return a.durationSeconds - b.durationSeconds;
  });

  // Construct Leaderboard rows with ranks
  const leaderboardRows: LeaderboardRow[] = sortedLiveSubmissions.map((sub, idx) => {
    const mins = Math.floor(sub.durationSeconds / 60);
    const secs = sub.durationSeconds % 60;
    return {
      rank: idx + 1,
      submissionId: sub.id,
      studentId: sub.studentId,
      studentName: sub.studentName,
      studentCollege: sub.studentCollege,
      studentEmail: sub.studentEmail,
      marksObtained: sub.marksObtained,
      percentage: sub.percentage,
      durationSeconds: sub.durationSeconds,
      durationFormatted: `${mins}m ${secs}s`,
      correctCount: sub.correctCount,
      wrongCount: sub.wrongCount,
      skippedCount: sub.skippedCount,
      submittedAt: sub.submittedAt
    };
  });

  // Filter rows by Name or College
  const filteredRows = leaderboardRows.filter(r => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return r.studentName.toLowerCase().includes(q) || r.studentCollege.toLowerCase().includes(q);
  });

  // Student Past Exams History (Chronological)
  const effectiveEmail = role === 'admin' ? targetStudentEmail.trim().toLowerCase() : user?.email?.toLowerCase();
  const targetStudentProfile = students.find(s => s.email.toLowerCase() === effectiveEmail) || {
    name: user?.name || 'Student',
    email: effectiveEmail || '',
    college: user?.college || 'N/A',
    mobile: user?.mobile
  };

  const studentPastSubmissions = submissions
    .filter(s => s.studentEmail.toLowerCase() === effectiveEmail)
    .sort((a, b) => b.submittedAt - a.submittedAt);

  const handleAdminEmailSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchedEmail.trim()) {
      setTargetStudentEmail(searchedEmail.trim().toLowerCase());
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Results & Leaderboards
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Official Live Exam Leaderboards, Detailed Answer Scripts, and Student Performance Summaries
          </p>
        </div>

        {/* Tab switch between Exam Leaderboard and Student Performance Summary */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setActiveSubTab('leaderboard')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSubTab === 'leaderboard'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>Exam Leaderboard</span>
          </button>
          <button
            onClick={() => setActiveSubTab('student_history')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSubTab === 'student_history'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Student Summary Report</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: EXAM LEADERBOARD */}
      {activeSubTab === 'leaderboard' && (
        <div className="space-y-6">
          {/* Selectors: Step 1 Course, Step 2 Exam */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                Step 1: Select Course
              </label>
              <select
                value={selectedCourseId}
                onChange={(e) => {
                  const newCid = e.target.value;
                  setSelectedCourseId(newCid);
                  const matchingExams = exams.filter(ex => ex.courseId === newCid);
                  setSelectedExamId(matchingExams[0]?.id || '');
                }}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.batch})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                Step 2: Select Exam
              </label>
              <select
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(e.target.value)}
                disabled={courseExams.length === 0}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
              >
                {courseExams.length === 0 ? (
                  <option value="">No exams in this course</option>
                ) : (
                  courseExams.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.title}</option>
                  ))
                )}
              </select>
            </div>

            {/* Filter by Name / College */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                Filter by Name or College
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type name or college..."
                  className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Leaderboard Body */}
          {!selectedExam ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-400">
              <p className="text-sm">Please select a course and exam to view the leaderboard.</p>
            </div>
          ) : !isResultPublished ? (
            /* Result not published yet */
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Results Scheduled to be Published Soon
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                As per official exam guidelines, the live leaderboard and answer scripts for <strong>{selectedExam.title}</strong> will be published on:
              </p>
              <div className="inline-block px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-300 font-semibold text-xs sm:text-sm">
                {new Date(selectedExam.resultPublishTime).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs space-y-0">
              {/* Leaderboard Table Action Header */}
              <div className="p-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/60">
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                    Live Leaderboard • {selectedExam.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {leaderboardRows.length} participants ranked by Score & Duration
                  </p>
                </div>

                {/* PDF Export Button */}
                {role === 'admin' && (
                  <button
                    onClick={() => exportLeaderboardPDF(selectedExam.title, selectedExam.courseName, filteredRows)}
                    disabled={filteredRows.length === 0}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-40 transition-colors cursor-pointer self-start sm:self-auto"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Leaderboard PDF</span>
                  </button>
                )}
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/60 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      <th className="py-3 px-4">Rank</th>
                      <th className="py-3 px-4">Student Name</th>
                      <th className="py-3 px-4">College</th>
                      <th className="py-3 px-4 text-center">Marks</th>
                      <th className="py-3 px-4 text-center">Score %</th>
                      <th className="py-3 px-4 text-center">Duration</th>
                      <th className="py-3 px-4 text-center">Breakdown</th>
                      {role === 'admin' && (
                        <th className="py-3 px-4">Submission Date & Time</th>
                      )}
                      <th className="py-3 px-4 text-right">Answer Script</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={role === 'admin' ? 9 : 8} className="py-12 text-center text-slate-400">
                          No submissions found for this exam.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row) => {
                        const isCurrentUser = row.studentEmail?.toLowerCase() === user?.email?.toLowerCase();
                        const canViewScript = role === 'admin' || isCurrentUser;
                        const subRecord = submissions.find(s => s.id === row.submissionId);

                        return (
                          <tr
                            key={row.submissionId}
                            className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                              isCurrentUser ? 'bg-blue-50/50 dark:bg-blue-950/30 font-medium' : ''
                            }`}
                          >
                            <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                              <span
                                className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${
                                  row.rank === 1
                                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30'
                                    : row.rank === 2
                                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                                    : row.rank === 3
                                    ? 'bg-amber-800/20 text-amber-700 dark:text-amber-300'
                                    : 'text-slate-500'
                                }`}
                              >
                                #{row.rank}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                              {row.studentName} {isCurrentUser && <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold ml-1">(You)</span>}
                            </td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                              {row.studentCollege}
                            </td>
                            <td className="py-3 px-4 text-center font-bold text-blue-600 dark:text-blue-400">
                              {row.marksObtained}/{selectedExam.totalMarks}
                            </td>
                            <td className="py-3 px-4 text-center font-semibold text-slate-700 dark:text-slate-300">
                              {row.percentage.toFixed(1)}%
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-slate-500 dark:text-slate-400">
                              {row.durationFormatted}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-2 text-[11px]">
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold" title="Correct">
                                  ✓{row.correctCount}
                                </span>
                                <span className="text-red-500 font-semibold" title="Wrong">
                                  ✕{row.wrongCount}
                                </span>
                                <span className="text-slate-400" title="Skipped">
                                  –{row.skippedCount}
                                </span>
                              </div>
                            </td>
                            {role === 'admin' && (
                              <td className="py-3 px-4 text-slate-500 text-[11px]">
                                {new Date(row.submittedAt).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </td>
                            )}
                            <td className="py-3 px-4 text-right">
                              {canViewScript && subRecord ? (
                                <button
                                  onClick={() => setInspectSubmission({ submission: subRecord, exam: selectedExam })}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-blue-600 dark:text-blue-400 transition-colors cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>View Script</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">
                                  Private
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: STUDENT PERFORMANCE SUMMARY */}
      {activeSubTab === 'student_history' && (
        <div className="space-y-6">
          {/* Admin Email Search Bar */}
          {role === 'admin' ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                Admin: Search Student Past Exam Summary
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Search any student by email to view chronological results of all exams they have completed and export their summary report.
              </p>
              <form onSubmit={handleAdminEmailSearch} className="flex gap-2 max-w-md">
                <div className="relative flex-1">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={searchedEmail}
                    onChange={(e) => setSearchedEmail(e.target.value)}
                    placeholder="Enter student email..."
                    className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
                >
                  Search
                </button>
              </form>
            </div>
          ) : null}

          {/* Student Profile Card & Summary Download */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-black text-lg flex items-center justify-center shrink-0">
                {targetStudentProfile.name.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  {targetStudentProfile.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {targetStudentProfile.college} • {targetStudentProfile.email}
                </p>
              </div>
            </div>

            <button
              onClick={() => exportStudentSummaryPDF(targetStudentProfile, studentPastSubmissions, exams)}
              disabled={studentPastSubmissions.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-40 transition-colors cursor-pointer self-start sm:self-auto"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Summary PDF</span>
            </button>
          </div>

          {/* Past Submissions List */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 font-semibold text-xs sm:text-sm text-slate-900 dark:text-white">
              Exam History ({studentPastSubmissions.length} Attempts)
            </div>

            {studentPastSubmissions.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <p className="text-sm">No exam submissions found for this student.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {studentPastSubmissions.map((sub) => {
                  const exam = exams.find(e => e.id === sub.examId);
                  const examTitle = exam ? exam.title : 'Exam';
                  const mins = Math.floor(sub.durationSeconds / 60);
                  const secs = sub.durationSeconds % 60;

                  return (
                    <div
                      key={sub.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            sub.isLive ? 'bg-rose-100 dark:bg-rose-950 text-rose-600' : 'bg-blue-100 dark:bg-blue-950 text-blue-600'
                          }`}>
                            {sub.isLive ? 'Live Exam' : 'Practice Exam'}
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(sub.submittedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                          {examTitle}
                        </h4>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-xs text-slate-500">Marks:</span>
                          <div className="font-bold text-sm text-blue-600 dark:text-blue-400">
                            {sub.marksObtained}/{sub.totalMarks} ({sub.percentage.toFixed(1)}%)
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            Time: {mins}m {secs}s
                          </span>
                        </div>

                        {exam && (
                          <button
                            onClick={() => setInspectSubmission({ submission: sub, exam })}
                            className="p-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                            title="View Detailed Script"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* INSPECT ANSWER SCRIPT MODAL */}
      {inspectSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Answer Script • {inspectSubmission.submission.studentName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {inspectSubmission.exam.title} • Score: {inspectSubmission.submission.marksObtained}/{inspectSubmission.exam.totalMarks} ({inspectSubmission.submission.percentage.toFixed(1)}%)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportAnswerScriptPDF(
                    inspectSubmission.exam,
                    inspectSubmission.submission,
                    inspectSubmission.submission.studentName,
                    inspectSubmission.submission.studentCollege
                  )}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer text-slate-700 dark:text-slate-300"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Script PDF</span>
                </button>
                <button
                  onClick={() => setInspectSubmission(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Questions list */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {inspectSubmission.exam.questions.map((q, idx) => {
                const ans = inspectSubmission.submission.answers.find(a => a.questionId === q.id);
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {q.options.map((opt) => {
                        const isStudentChoice = ans?.selectedOption === opt.id;
                        const isCorrectOption = q.correctOption === opt.id;

                        let styleClass = 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300';
                        if (isCorrectOption) {
                          styleClass = 'border-emerald-500 bg-emerald-100/60 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 font-semibold';
                        } else if (isStudentChoice && !isCorrect) {
                          styleClass = 'border-red-500 bg-red-100/60 dark:bg-red-950/60 text-red-800 dark:text-red-200 font-semibold';
                        }

                        return (
                          <div key={opt.id} className={`p-2 rounded-lg border text-xs ${styleClass}`}>
                            <span className="font-bold mr-1.5">{opt.id})</span>
                            <span>{opt.text}</span>
                            {isCorrectOption && <span className="text-[10px] ml-1 font-bold">[Correct]</span>}
                            {isStudentChoice && !isCorrectOption && <span className="text-[10px] ml-1 font-bold">[Chosen]</span>}
                          </div>
                        );
                      })}
                    </div>

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
      )}
    </div>
  );
};
