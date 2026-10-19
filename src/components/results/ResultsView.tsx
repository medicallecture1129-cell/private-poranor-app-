import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Course, Exam, ExamSubmission, LeaderboardRow, StudentUser } from '../../types';
import { exportLeaderboardPDF, exportAnswerScriptPDF, exportStudentSummaryPDF } from '../../utils/pdfExport';
import { getSynchronizedScore } from '../../utils/scoreSync';
import { generateResultCertificatePDF } from '../../utils/certificateGenerator';
import { StudentProfileModal } from '../StudentProfileModal';
import { useToast } from '../../context/ToastContext';
import { ModernSelect } from '../ui/ModernSelect';
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
  X,
  Radio,
  Filter,
  Sparkles,
  Check,
  UserCircle,
  ChevronDown,
  BookOpen,
  Users,
  Award,
  BarChart3,
  TrendingDown,
  Target,
  BrainCircuit,
  Lightbulb,
  Scan
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
  const { success: toastSuccess, error: toastError } = useToast();

  // Mode: 'leaderboard' or 'student_history'
  const [activeSubTab, setActiveSubTab] = useState<'leaderboard' | 'student_history'>('leaderboard');

  // SEGMENT 1: EXAM LEADERBOARD STATE (Default empty so no course or exam is pre-selected)
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [leaderboardSearch, setLeaderboardSearch] = useState('');

  // Selected Submission for Answer Script View Modal
  const [inspectSubmission, setInspectSubmission] = useState<{ submission: ExamSubmission; exam: Exam } | null>(null);
  const [inspectTab, setInspectTab] = useState<'script' | 'weakness'>('script');
  const [isDownloadingCert, setIsDownloadingCert] = useState(false);

  const handleDownloadCertificate = async (exam: Exam, submission: ExamSubmission) => {
    setIsDownloadingCert(true);
    try {
      const blob = await generateResultCertificatePDF(exam, submission);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Certificate_${submission.studentName.replace(/\s+/g, '_')}_${exam.title.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toastSuccess('ভেরিফায়েড সার্টিফিকেট সফলভাবে ডাউনলোড হয়েছে!');
    } catch (err) {
      console.error('Certificate download error:', err);
      toastError('সার্টিফিকেট তৈরি করতে সমস্যা হয়েছে');
    } finally {
      setIsDownloadingCert(false);
    }
  };

  // Selected Student for Profile View Modal
  const [inspectStudentProfile, setInspectStudentProfile] = useState<(Partial<StudentUser> & { name: string; college?: string; email?: string; mobile?: string }) | null>(null);

  // SEGMENT 2: STUDENT SUMMARY REPORT (Student view state)
  const [studentHistoryFilter, setStudentHistoryFilter] = useState<'both' | 'live' | 'practice'>('both');

  // SEGMENT 2: ADMIN STUDENT SUMMARY REPORT STATE
  const [adminCourseFilter, setAdminCourseFilter] = useState<string>('all');
  const [adminMemberSearch, setAdminMemberSearch] = useState<string>('');
  // Map of student email to their selected secondary course filter
  const [studentSelectedCourseMap, setStudentSelectedCourseMap] = useState<Record<string, string>>({});
  // Map of student email to their selected exam filter ('both' | 'live' | 'practice')
  const [studentExamFilterMap, setStudentExamFilterMap] = useState<Record<string, 'both' | 'live' | 'practice'>>({});
  // Expanded student submissions drawer in admin view
  const [expandedStudentEmail, setExpandedStudentEmail] = useState<string | null>(null);

  const currentTime = Date.now();
  const courseExams = selectedCourseId ? exams.filter(e => e.courseId === selectedCourseId) : [];
  const selectedCourse = courses.find(c => c.id === selectedCourseId);
  const selectedExam = exams.find(e => e.id === selectedExamId);

  // Check if student is allowed to view results of this exam yet
  const isOfflineExam = selectedExam?.isOffline === true || selectedExam?.examType === 'offline';
  const isResultPublished = selectedExam ? (isOfflineExam || currentTime >= selectedExam.resultPublishTime || role === 'admin') : false;

  // Requirement 4: Global Marks Synchronization
  // Filter Live & Offline Exam Submissions for Official Leaderboard (Strictly students only - no admins)
  const rawLiveSubmissions = selectedExam ? submissions.filter(s => {
    if (s.examId !== selectedExam.id && s.examId !== selectedExam.id.toString()) return false;
    if (!isOfflineExam && !s.isLive) return false;
    if (s.studentId?.startsWith('admin_') || s.studentEmail?.toLowerCase().includes('admin@')) return false;
    return true;
  }) : [];

  // Synchronize scores dynamically using selectedExam.totalMarks
  const synchronizedLiveSubs = rawLiveSubmissions.map(sub => {
    const sync = getSynchronizedScore(sub, selectedExam);
    return {
      ...sub,
      marksObtained: sync.marksObtained,
      totalMarks: sync.totalMarks,
      percentage: sync.percentage
    };
  });

  // Requirement 3: Unified Merged Leaderboard
  // All live submissions across the initial live session and any re-live sessions merge into ONE single leaderboard.
  // If a student took part in multiple sessions, merge to their best score (highest marks, lowest duration).
  const mergedStudentMap = new Map<string, typeof synchronizedLiveSubs[0]>();
  for (const sub of synchronizedLiveSubs) {
    const key = (sub.studentEmail || sub.studentId).toLowerCase().trim();
    const existing = mergedStudentMap.get(key);
    if (!existing) {
      mergedStudentMap.set(key, sub);
    } else {
      if (
        sub.marksObtained > existing.marksObtained ||
        (sub.marksObtained === existing.marksObtained && sub.durationSeconds < existing.durationSeconds)
      ) {
        mergedStudentMap.set(key, sub);
      }
    }
  }

  const mergedLiveSubmissions = Array.from(mergedStudentMap.values());

  // Sort by marks desc, then duration asc
  const sortedLiveSubmissions = [...mergedLiveSubmissions].sort((a, b) => {
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

  // Filter leaderboard rows by Name or College
  const filteredLeaderboardRows = leaderboardRows.filter(r => {
    const q = leaderboardSearch.toLowerCase().trim();
    if (!q) return true;
    return r.studentName.toLowerCase().includes(q) || r.studentCollege.toLowerCase().includes(q);
  });

  // =========================================================
  // ADMIN SUMMARY REPORT: Filter Members by Course & Search
  // =========================================================
  const filteredAdminMembers = students.filter(s => {
    // 1. Course Filter
    if (adminCourseFilter !== 'all') {
      const isEnrolled = (s.enrolledCourses && s.enrolledCourses.includes(adminCourseFilter)) ||
        courses.find(c => c.id === adminCourseFilter)?.allowedEmails?.some(e => e.toLowerCase() === s.email?.toLowerCase());
      if (!isEnrolled) return false;
    }

    // 2. Search Filter (Name, Email, College)
    const q = adminMemberSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      (s.college && s.college.toLowerCase().includes(q))
    );
  });

  // Student's own past submissions (for Student view)
  const studentPastSubmissions = submissions
    .filter(s => 
      (user?.email && s.studentEmail?.toLowerCase() === user.email.toLowerCase()) ||
      (user?.id && s.studentId === user.id) ||
      (user?.rollNo && s.rollNo === user.rollNo)
    )
    .sort((a, b) => b.submittedAt - a.submittedAt);

  const filteredStudentPastSubs = studentPastSubmissions.filter(s => {
    if (studentHistoryFilter === 'live') return s.isLive === true;
    if (studentHistoryFilter === 'practice') return s.isLive === false;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <span>Results & Performance</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full badge-theme">
              {role === 'admin' ? 'Admin Control' : 'Student Portal'}
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {role === 'admin'
              ? 'Select a course and exam to view official leaderboards, manage timings & settings, or analyze student performance reports.'
              : 'Select a course and exam to view leaderboards, or analyze your past exam performance and answer scripts.'}
          </p>
        </div>

        {/* Tab switch: 1. Exam Leaderboard, 2. Student Summary Report */}
        <div className="flex items-center gap-1.5 p-1 bg-theme-surface rounded-xl self-start sm:self-auto border border-theme-border shadow-xs">
          <button
            onClick={() => setActiveSubTab('leaderboard')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSubTab === 'leaderboard'
                ? 'btn-theme-primary shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>1. Exam Leaderboard</span>
          </button>
          <button
            onClick={() => setActiveSubTab('student_history')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSubTab === 'student_history'
                ? 'btn-theme-primary shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>2. Student Summary Report</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SEGMENT 1: EXAM LEADERBOARD */}
      {/* ========================================================= */}
      {activeSubTab === 'leaderboard' && (
        <div className="space-y-6">
          {/* Step 1 & Step 2 Selectors: Default has no exam or course selected */}
          <div className="bg-theme-card border border-theme-card rounded-3xl p-5 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Step 1: Select Course (কোর্স নির্বাচন করুন)
              </label>
              <ModernSelect
                value={selectedCourseId}
                onChange={(newCid) => {
                  setSelectedCourseId(newCid);
                  setSelectedExamId('');
                }}
                placeholder="-- Choose a Course --"
                options={[
                  { value: '', label: '-- Choose a Course --' },
                  ...courses.map(c => ({ value: c.id, label: c.name, badge: c.batch }))
                ]}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Step 2: Select Exam (এক্সাম নির্বাচন করুন)
              </label>
              <ModernSelect
                value={selectedExamId}
                onChange={setSelectedExamId}
                disabled={!selectedCourseId || courseExams.length === 0}
                placeholder={
                  !selectedCourseId 
                    ? '-- Select a course first --' 
                    : courseExams.length === 0 
                    ? '-- No exams in this course --' 
                    : '-- Choose an Exam --'
                }
                options={[
                  { value: '', label: '-- Choose an Exam --' },
                  ...courseExams.map(ex => ({ value: ex.id, label: ex.title }))
                ]}
              />
            </div>

            {/* Filter by Name / College inside Leaderboard */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Search by Name or College
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  disabled={!selectedExam}
                  value={leaderboardSearch}
                  onChange={(e) => setLeaderboardSearch(e.target.value)}
                  placeholder={selectedExam ? "Search student name or college..." : "Select an exam first..."}
                  className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
                />
              </div>
            </div>
          </div>

          {/* If no exam selected yet, show clean instructional placeholder */}
          {!selectedExam ? (
            <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl p-12 sm:p-16 text-center space-y-4 shadow-xs">
              <div className="w-16 h-16 rounded-3xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center ring-8 ring-blue-50/50 dark:ring-blue-950/20">
                <Trophy className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  No Exam Leaderboard Selected
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  Please select your <strong>Course</strong> and then choose the <strong>Exam</strong> from the dropdown above to view its official results and leaderboard.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold">
                <span>Select Course & Exam above to view results</span>
              </div>
            </div>
          ) : (
            /* Selected Exam View */
            <div className="space-y-6">
              {/* EXAM SUMMARY CARD (Pure, Clean & Informative - Responsive to Light & Dark) */}
              <div className="bg-white dark:bg-[#10141f] text-slate-900 dark:text-white rounded-3xl p-5 sm:p-6 shadow-sm dark:shadow-xl border border-slate-200/80 dark:border-white/[0.08] space-y-4 relative overflow-hidden">
                <div className="card-glow-line" />
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 dark:bg-white/[0.08] text-blue-700 dark:text-rose-300 border border-blue-200 dark:border-white/[0.1]">
                      {selectedCourse?.name || selectedExam.courseName}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Exam Summary & Official Leaderboard</span>
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
                    <Users className="w-3.5 h-3.5 text-blue-600 dark:text-rose-400" />
                    <span>Total Participants: <strong className="text-slate-900 dark:text-white font-mono">{leaderboardRows.length}</strong></span>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                    {selectedExam.title}
                  </h3>
                </div>

                {/* Clean Summary Metric Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-white/[0.08]">
                  <div className="bg-slate-50 dark:bg-[#161a29] p-3.5 rounded-2xl border border-slate-200/80 dark:border-white/[0.06]">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-blue-600 dark:text-rose-400" />
                      <span>Total Marks</span>
                    </span>
                    <p className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">
                      {selectedExam.totalMarks}
                    </p>
                  </div>

                  <div className="bg-slate-50 dark:bg-[#161a29] p-3.5 rounded-2xl border border-slate-200/80 dark:border-white/[0.06]">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                      <span>Exam Duration</span>
                    </span>
                    <p className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">
                      {selectedExam.durationMinutes} min
                    </p>
                  </div>

                  <div className="bg-slate-50 dark:bg-[#161a29] p-3.5 rounded-2xl border border-slate-200/80 dark:border-white/[0.06]">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Completed / Ended</span>
                    </span>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1.5 truncate">
                      {new Date(selectedExam.endTime).toLocaleString([], {
                        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>

                  <div className="bg-slate-50 dark:bg-[#161a29] p-3.5 rounded-2xl border border-slate-200/80 dark:border-white/[0.06]">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Questions / Pass</span>
                    </span>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1.5">
                      {selectedExam.questions?.length || selectedExam.totalQuestions} Qs • Pass: {selectedExam.passMark}
                    </p>
                  </div>
                </div>
              </div>

              {/* Student View: Check if result published or locked */}
              {!isResultPublished ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-10 sm:p-14 text-center space-y-4 shadow-xs">
                  <div className="w-14 h-14 rounded-3xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center ring-8 ring-amber-50 dark:ring-amber-950/20">
                    <Lock className="w-7 h-7" />
                  </div>
                  <div className="max-w-md mx-auto space-y-2">
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                      Result has not been published yet
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                      In accordance with official guidelines, the live leaderboard and answer scripts for <strong>{selectedExam.title}</strong> will be revealed at the scheduled publish time.
                    </p>
                  </div>
                  <div className="inline-block px-5 py-2.5 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 font-bold text-xs sm:text-sm">
                    Publish Time: {new Date(selectedExam.resultPublishTime).toLocaleString('en-US', {
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
                /* Leaderboard Table (No Blur) */
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs">
                  {/* Table Header */}
                  <div className="p-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/60">
                    <div>
                      <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-500" />
                        <span>Official Leaderboard • {selectedExam.title}</span>
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {leaderboardRows.length} Participants (Ranked by Marks and Duration)
                      </p>
                    </div>

                    {/* PDF Export Button */}
                    <button
                      onClick={() => exportLeaderboardPDF(selectedExam.title, selectedExam.courseName, filteredLeaderboardRows)}
                      disabled={filteredLeaderboardRows.length === 0}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-40 transition-colors cursor-pointer self-start sm:self-auto"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Leaderboard PDF</span>
                    </button>
                  </div>

                  {/* Leaderboard Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/60 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                          <th className="py-3 px-4">Rank</th>
                          <th className="py-3 px-4">Student Name</th>
                          <th className="py-3 px-4">College / Institution</th>
                          <th className="py-3 px-4 text-center">Marks</th>
                          <th className="py-3 px-4 text-center">Score (%)</th>
                          <th className="py-3 px-4 text-center">Duration</th>
                          <th className="py-3 px-4 text-center">Breakdown</th>
                          {role === 'admin' && (
                            <th className="py-3 px-4">Submitted At</th>
                          )}
                          <th className="py-3 px-4 text-right">Answer Script</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                        {filteredLeaderboardRows.length === 0 ? (
                          <tr>
                            <td colSpan={role === 'admin' ? 9 : 8} className="py-12 text-center text-slate-400">
                              No submissions recorded for this exam yet.
                            </td>
                          </tr>
                        ) : (
                          filteredLeaderboardRows.map((row) => {
                            const isCurrentUser = row.studentEmail?.toLowerCase() === user?.email?.toLowerCase();
                            const canViewScript = role === 'admin' || isCurrentUser;
                            const subRecord = submissions.find(s => s.id === row.submissionId);

                            return (
                              <tr
                                key={row.submissionId}
                                className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                                  isCurrentUser ? 'bg-blue-50/60 dark:bg-blue-950/40 font-medium' : ''
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
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span>{row.studentName}</span>
                                    {(row.rollNo || subRecord?.rollNo) && (
                                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-500">
                                        Roll: {row.rollNo || subRecord?.rollNo}
                                      </span>
                                    )}
                                    {subRecord?.isOfflineOMR && (
                                      <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 text-[9px] font-black uppercase tracking-wider border border-purple-300 dark:border-purple-800 flex items-center gap-1">
                                        <Scan className="w-2.5 h-2.5" />
                                        <span>OMR {subRecord.setCode ? `Set-${subRecord.setCode}` : ''}</span>
                                      </span>
                                    )}
                                    {/* Student Profile Button */}
                                    <button
                                      onClick={() => setInspectStudentProfile({
                                        name: row.studentName,
                                        college: row.studentCollege,
                                        email: row.studentEmail
                                      })}
                                      className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-md transition-colors cursor-pointer"
                                      title="View Student Profile"
                                    >
                                      <UserCircle className="w-3.5 h-3.5" />
                                    </button>
                                    {isCurrentUser && <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold ml-1">(You)</span>}
                                  </div>
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
                                      Confidential
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
        </div>
      )}

      {/* ========================================================= */}
      {/* SEGMENT 2: STUDENT SUMMARY REPORT */}
      {/* ========================================================= */}
      {activeSubTab === 'student_history' && (
        <div className="space-y-6">
          {role === 'admin' ? (
            /* ========================================================= */
            /* ADMIN VIEW: COURSE-WISE ENROLLED MEMBER SUMMARY TABLE */
            /* ========================================================= */
            <div className="space-y-6">
              {/* Top Controls: Course Selector & Search Filter */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                      <Users className="w-5 h-5 text-blue-600" />
                      <span>Student Summary Report</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Select a course to view member results for live, practice, or both exams and download individual or batch PDF reports.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Course Dropdown */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      1. Select Course (Course Filter)
                    </label>
                    <select
                      value={adminCourseFilter}
                      onChange={(e) => setAdminCourseFilter(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">-- All Courses (All Enrolled Members) --</option>
                      {courses.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.batch})</option>
                      ))}
                    </select>
                  </div>

                  {/* Search by Name, Email, College */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      2. Search by Name, Email, or College
                    </label>
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={adminMemberSearch}
                        onChange={(e) => setAdminMemberSearch(e.target.value)}
                        placeholder="Search student name, email, or college..."
                        className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Members List Table (Course-wise with Exam dropdown and Other Courses dropdown) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs">
                <div className="p-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/60">
                  <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Enrolled Members List ({filteredAdminMembers.length})</span>
                    {adminCourseFilter !== 'all' && (
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                        {courses.find(c => c.id === adminCourseFilter)?.name}
                      </span>
                    )}
                  </div>
                </div>

                {filteredAdminMembers.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 space-y-2">
                    <User className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                    <p className="text-sm font-medium">No students found.</p>
                    <p className="text-xs text-slate-500">Select another course or change search query.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filteredAdminMembers.map((member) => {
                      // Other enrolled courses of this student
                      const studentEnrolledCourses = courses.filter(c =>
                        (member.enrolledCourses && member.enrolledCourses.includes(c.id)) ||
                        (member.email && c.allowedEmails?.some(e => e.toLowerCase() === member.email?.toLowerCase()))
                      );

                      // Effective course for this member row (default to adminCourseFilter or member's first course or 'all')
                      const effectiveCourseId = studentSelectedCourseMap[member.email] || (adminCourseFilter !== 'all' ? adminCourseFilter : (studentEnrolledCourses[0]?.id || 'all'));
                      const effectiveCourse = courses.find(c => c.id === effectiveCourseId);

                      // Selected exam filter for this student
                      const memberExamFilter = studentExamFilterMap[member.email] || 'both';

                      // Member submissions for the focused course
                      const memberCourseSubs = submissions.filter(s => {
                        if (s.studentEmail?.toLowerCase() !== member.email?.toLowerCase()) return false;
                        if (effectiveCourseId !== 'all' && s.courseId !== effectiveCourseId) return false;
                        if (memberExamFilter === 'live') return s.isLive === true;
                        if (memberExamFilter === 'practice') return s.isLive === false;
                        return true;
                      }).sort((a, b) => b.submittedAt - a.submittedAt);

                      const isExpanded = expandedStudentEmail === member.email;

                      return (
                        <div key={member.id} className="p-4 sm:p-5 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors space-y-3">
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            {/* Member Identity & Profile button */}
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center shrink-0">
                                {member.name.slice(0, 1).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                    {member.name}
                                  </h4>
                                  {/* Profile Icon: Admin clicks to view student full info */}
                                  <button
                                    onClick={() => setInspectStudentProfile(member)}
                                    className="p-1 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                    title="View Student Full Profile"
                                  >
                                    <UserCircle className="w-4 h-4 text-blue-500" />
                                  </button>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                  {member.college} • <span className="font-mono text-[11px]">{member.email}</span>
                                </p>
                              </div>
                            </div>

                            {/* Dropdown 1: Other Courses & Dropdown 2: Exam Type & Download PDF */}
                            <div className="flex flex-wrap items-center gap-2.5">
                              {/* Dropdown 1: Enrolled Courses */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-semibold text-slate-400 hidden sm:inline">Course:</span>
                                <select
                                  value={effectiveCourseId}
                                  onChange={(e) => {
                                    const newC = e.target.value;
                                    setStudentSelectedCourseMap(prev => ({ ...prev, [member.email]: newC }));
                                  }}
                                  className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium max-w-[170px]"
                                >
                                  <option value="all">All Courses</option>
                                  {studentEnrolledCourses.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Dropdown 2: Exam Filter (Live / Practice / Both) */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-semibold text-slate-400 hidden sm:inline">Exam:</span>
                                <select
                                  value={memberExamFilter}
                                  onChange={(e) => {
                                    const newF = e.target.value as 'both' | 'live' | 'practice';
                                    setStudentExamFilterMap(prev => ({ ...prev, [member.email]: newF }));
                                  }}
                                  className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                                >
                                  <option value="both">Both Exams (Live + Practice)</option>
                                  <option value="live">Live Exam Only</option>
                                  <option value="practice">Practice Exam Only</option>
                                </select>
                              </div>

                              {/* PDF Download for this student and filter */}
                              <button
                                onClick={() => exportStudentSummaryPDF(
                                  member, 
                                  memberCourseSubs, 
                                  exams, 
                                  memberExamFilter,
                                  effectiveCourse?.name
                                )}
                                disabled={memberCourseSubs.length === 0}
                                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-xs disabled:opacity-40 transition-colors cursor-pointer"
                                title="Download Summary Report PDF"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>PDF</span>
                              </button>

                              {/* Toggle submissions list */}
                              <button
                                onClick={() => setExpandedStudentEmail(isExpanded ? null : member.email)}
                                className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <span>{memberCourseSubs.length} Submissions</span>
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </button>
                            </div>
                          </div>

                          {/* Expanded Submissions Drawer */}
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
                              {memberCourseSubs.length === 0 ? (
                                <p className="text-xs text-slate-400 italic py-2">
                                  No exam records found in this category.
                                </p>
                              ) : (
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                  {memberCourseSubs.map(sub => {
                                    const ex = exams.find(e => e.id === sub.examId);
                                    const mins = Math.floor(sub.durationSeconds / 60);
                                    const secs = sub.durationSeconds % 60;

                                    return (
                                      <div
                                        key={sub.id}
                                        className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3 text-xs"
                                      >
                                        <div className="space-y-0.5">
                                          <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                              sub.isLive ? 'bg-rose-100 dark:bg-rose-950 text-rose-600' : 'bg-blue-100 dark:bg-blue-950 text-blue-600'
                                            }`}>
                                              {sub.isLive ? 'Live Exam' : 'Practice Exam'}
                                            </span>
                                            <span className="text-[11px] text-slate-400">
                                              {new Date(sub.submittedAt).toLocaleDateString()}
                                            </span>
                                          </div>
                                          <h5 className="font-bold text-slate-900 dark:text-white">
                                            {ex ? ex.title : 'Exam'}
                                          </h5>
                                        </div>

                                        <div className="flex items-center gap-3">
                                          <div className="text-right">
                                            {(() => {
                                              const syncd = getSynchronizedScore(sub, ex);
                                              return (
                                                <span className="font-bold text-rose-500">
                                                  {syncd.marksObtained}/{syncd.totalMarks} ({syncd.percentage.toFixed(1)}%)
                                                </span>
                                              );
                                            })()}
                                            <span className="text-[10px] text-slate-400 block font-mono">
                                              {mins}m {secs}s
                                            </span>
                                          </div>

                                          {ex && (
                                            <button
                                              onClick={() => setInspectSubmission({ submission: sub, exam: ex })}
                                              className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                                              title="View Answer Script"
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
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ========================================================= */
            /* STUDENT VIEW: OWN PERFORMANCE SUMMARY REPORT */
            /* ========================================================= */
            <div className="space-y-6">
              {/* Student Profile Card & Summary Download with Filter */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-black text-lg flex items-center justify-center shrink-0">
                    {user?.name ? user.name.slice(0, 1).toUpperCase() : 'S'}
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-900 dark:text-white">
                      {user?.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {user?.college || 'College N/A'} • {user?.email}
                    </p>
                  </div>
                </div>

                {/* Filter Dropdown & PDF Download */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 shrink-0">
                      Filter:
                    </span>
                    <select
                      value={studentHistoryFilter}
                      onChange={(e) => setStudentHistoryFilter(e.target.value as 'both' | 'live' | 'practice')}
                      className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs"
                    >
                      <option value="both">Both Exams (Live + Practice)</option>
                      <option value="live">Live Exam Only</option>
                      <option value="practice">Practice Exam Only</option>
                    </select>
                  </div>

                  <button
                    onClick={() => exportStudentSummaryPDF(
                      { name: user?.name || 'Student', email: user?.email || '', college: user?.college || 'N/A', mobile: user?.mobile },
                      filteredStudentPastSubs,
                      exams,
                      studentHistoryFilter
                    )}
                    disabled={filteredStudentPastSubs.length === 0}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Summary Report PDF</span>
                  </button>
                </div>
              </div>

              {/* Past Submissions List */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/40">
                  <div className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Exam History</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                      {filteredStudentPastSubs.length} Exams
                    </span>
                    <span className="text-xs text-slate-400 font-normal">
                      ({studentHistoryFilter === 'live' ? 'Live Exams' : studentHistoryFilter === 'practice' ? 'Practice Exams' : 'All Exams'})
                    </span>
                  </div>
                </div>

                {filteredStudentPastSubs.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 space-y-2">
                    <FileText className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                    <p className="text-sm font-medium">
                      {studentHistoryFilter === 'live' 
                        ? 'No live exam records found.'
                        : studentHistoryFilter === 'practice'
                        ? 'No practice exam records found.'
                        : 'No exam records found.'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filteredStudentPastSubs.map((sub) => {
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
                                sub.isLive 
                                  ? 'bg-rose-100 dark:bg-rose-950 text-rose-600 border border-rose-200 dark:border-rose-900/40' 
                                  : 'bg-blue-100 dark:bg-blue-950 text-blue-600 border border-blue-200 dark:border-blue-900/40'
                              }`}>
                                {sub.isLive ? 'Live Exam' : 'Practice Exam'}
                              </span>
                              <span className="text-xs text-slate-400">
                                {new Date(sub.submittedAt).toLocaleDateString('en-GB')}
                              </span>
                            </div>
                            <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                              {examTitle}
                            </h4>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <span className="text-xs text-slate-500">Score:</span>
                              {(() => {
                                const syncd = getSynchronizedScore(sub, exam);
                                return (
                                  <div className="font-bold text-sm text-rose-500 font-mono">
                                    {syncd.marksObtained}/{syncd.totalMarks} ({syncd.percentage.toFixed(1)}%)
                                  </div>
                                );
                              })()}
                              <span className="text-[10px] text-slate-400 font-mono">
                                Time: {mins}m {secs}s
                              </span>
                            </div>

                            {exam && (
                              <button
                                onClick={() => setInspectSubmission({ submission: sub, exam })}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                                title="View Answer Script"
                              >
                                <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                <span>Answer Script</span>
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
        </div>
      )}

      {/* ========================================================= */}
      {/* STUDENT PROFILE MODAL */}
      {/* ========================================================= */}
      {inspectStudentProfile && (
        <StudentProfileModal
          student={inspectStudentProfile}
          courses={courses}
          submissions={submissions}
          onClose={() => setInspectStudentProfile(null)}
        />
      )}

      {/* ========================================================= */}
      {/* INSPECT ANSWER SCRIPT & WEAKNESS ANALYTICS MODAL */}
      {/* ========================================================= */}
      {inspectSubmission && (() => {
        const syncd = getSynchronizedScore(inspectSubmission.submission, inspectSubmission.exam);
        const isPassed = syncd.marksObtained >= (inspectSubmission.exam.passMark || 0) || syncd.percentage >= 40;

        // Group questions by Topic / Chapter for Weakness Analytics
        const topicMap: Record<string, { total: number; correct: number; wrong: number; skipped: number }> = {};
        inspectSubmission.exam.questions.forEach((q) => {
          const t = q.topic?.trim() || 'মৌলিক কনসেপ্ট ও অধ্যায়';
          if (!topicMap[t]) {
            topicMap[t] = { total: 0, correct: 0, wrong: 0, skipped: 0 };
          }
          topicMap[t].total++;
          const ans = inspectSubmission.submission.answers.find(a => a.questionId === q.id);
          if (!ans || ans.selectedOption === null) {
            topicMap[t].skipped++;
          } else if (ans.isCorrect) {
            topicMap[t].correct++;
          } else {
            topicMap[t].wrong++;
          }
        });

        const topicAnalytics = Object.entries(topicMap).map(([topicName, stats]) => {
          const accuracy = (stats.correct / (stats.total || 1)) * 100;
          return {
            topicName,
            ...stats,
            accuracy,
            isWeak: accuracy < 50
          };
        }).sort((a, b) => a.accuracy - b.accuracy);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm overflow-y-auto">
            <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                      {inspectSubmission.submission.studentName}
                    </h3>
                    {inspectSubmission.submission.isOfflineOMR && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 text-[10px] font-black uppercase tracking-wider border border-purple-300 dark:border-purple-800 flex items-center gap-1">
                        <Scan className="w-2.5 h-2.5" />
                        <span>OMR Exam</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {inspectSubmission.exam.title} • Score: <strong className="text-rose-500 font-mono">{syncd.marksObtained}/{syncd.totalMarks}</strong> ({syncd.percentage.toFixed(1)}%) • Duration: {Math.floor(inspectSubmission.submission.durationSeconds / 60)}m
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Verified Certificate Download Button */}
                  {isPassed && (
                    <button
                      onClick={() => handleDownloadCertificate(inspectSubmission.exam, inspectSubmission.submission)}
                      disabled={isDownloadingCert}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
                      title="ভেরিফায়েড সার্টিফিকেট ডাউনলোড"
                    >
                      <Award className="w-4 h-4 text-slate-950" />
                      <span>{isDownloadingCert ? 'সার্টিফিকেট হচ্ছে...' : 'সার্টিফিকেট PDF'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      exportAnswerScriptPDF(
                        inspectSubmission.exam,
                        {
                          ...inspectSubmission.submission,
                          marksObtained: syncd.marksObtained,
                          totalMarks: syncd.totalMarks,
                          percentage: syncd.percentage
                        },
                        inspectSubmission.submission.studentName,
                        inspectSubmission.submission.studentCollege
                      );
                    }}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer text-slate-700 dark:text-slate-300"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>উত্তরপত্র PDF</span>
                  </button>
                  
                  <button
                    onClick={() => setInspectSubmission(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Subtabs: [Answer Script] vs [Topic & Weakness Analytics] */}
              <div className="px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2">
                <button
                  onClick={() => setInspectTab('script')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    inspectTab === 'script'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>প্রশ্ন ভিত্তিক উত্তরপত্র (Answer Script)</span>
                </button>

                <button
                  onClick={() => setInspectTab('weakness')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    inspectTab === 'weakness'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <BrainCircuit className="w-3.5 h-3.5" />
                  <span>দুর্বলতা বিশ্লেষণ (Topic/Weakness Analytics)</span>
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {inspectTab === 'weakness' ? (
                  /* ========================================================= */
                  /* TOPIC / WEAKNESS ANALYTICS DASHBOARD */
                  /* ========================================================= */
                  <div className="space-y-5">
                    {/* Weakness Alert Banner */}
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                      <Lightbulb className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div className="space-y-1 text-xs">
                        <h4 className="font-bold text-amber-900 dark:text-amber-300">
                          AI ও ডেটা ড্রিভেন দুর্বলতা পরামর্শ (Weakness Insights):
                        </h4>
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                          পরীক্ষার ফলাফল বিশ্লেষণ করে দেখা গেছে যে সব বিষয়ে আপনার নির্ভুলতা ৫০% এর কম, সেগুলোতে আরও বেশি অনুশীলনের প্রয়োজন। নিচের কার্ডগুলোতে বিস্তারিত অধ্যায়ভিত্তিক দখল দেখানো হয়েছে।
                        </p>
                      </div>
                    </div>

                    {/* Topic Performance Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {topicAnalytics.map((t) => {
                        const statusColor = t.accuracy >= 75
                          ? 'emerald'
                          : t.accuracy >= 50
                          ? 'blue'
                          : 'rose';

                        return (
                          <div
                            key={t.topicName}
                            className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                                {t.topicName}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                t.accuracy >= 75
                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                  : t.accuracy >= 50
                                  ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                                  : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                              }`}>
                                {t.accuracy >= 75 ? 'শক্তিশালী দখল' : t.accuracy >= 50 ? 'সন্তোষজনক' : 'দুর্বল - রিভিশন দরকার'}
                              </span>
                            </div>

                            {/* Progress bar */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px] font-bold">
                                <span className="text-slate-500">নির্ভুলতা (Accuracy):</span>
                                <span className={t.accuracy < 50 ? 'text-rose-500' : 'text-emerald-500'}>
                                  {t.accuracy.toFixed(1)}%
                                </span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-500 ${
                                    t.accuracy >= 75 ? 'bg-emerald-500' : t.accuracy >= 50 ? 'bg-blue-500' : 'bg-rose-500'
                                  }`}
                                  style={{ width: `${Math.max(5, t.accuracy)}%` }}
                                />
                              </div>
                            </div>

                            {/* Stats */}
                            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium">
                              <span>মোট প্রশ্ন: <strong>{t.total}</strong></span>
                              <span className="text-emerald-600 dark:text-emerald-400">সঠিক: {t.correct}</span>
                              <span className="text-rose-500">ভুল: {t.wrong}</span>
                              <span className="text-slate-400">স্কিপ: {t.skipped}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* ========================================================= */
                  /* ANSWER SCRIPT VIEW */
                  /* ========================================================= */
                  <div className="space-y-4">
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
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white text-sm">
                                Q{idx + 1}. {q.text}
                              </div>
                              {q.topic && (
                                <span className="text-[10px] font-semibold text-slate-500 mt-0.5 inline-block">
                                  অধ্যায়: {q.topic}
                                </span>
                              )}
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
                                  {isCorrectOption && <span className="text-[10px] ml-1 font-bold text-emerald-700 dark:text-emerald-300">[Correct Answer]</span>}
                                  {isStudentChoice && !isCorrectOption && <span className="text-[10px] ml-1 font-bold text-red-700 dark:text-red-300">[Your Choice]</span>}
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
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
