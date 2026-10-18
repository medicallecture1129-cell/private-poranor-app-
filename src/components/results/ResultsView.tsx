import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Course, Exam, ExamSubmission, LeaderboardRow, StudentUser } from '../../types';
import { exportLeaderboardPDF, exportAnswerScriptPDF, exportStudentSummaryPDF } from '../../utils/pdfExport';
import { EditExamModal } from '../exams/EditExamModal';
import { StudentProfileModal } from '../StudentProfileModal';
import { updateExam, deleteExam } from '../../services/db';
import { useToast } from '../../context/ToastContext';
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
  Edit,
  Power,
  Trash2,
  AlertCircle,
  Filter,
  Sparkles,
  Zap,
  Check,
  UserCircle,
  ChevronDown,
  BookOpen,
  Users
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

  // Selected Student for Profile View Modal
  const [inspectStudentProfile, setInspectStudentProfile] = useState<(Partial<StudentUser> & { name: string; college?: string; email?: string; mobile?: string }) | null>(null);

  // Admin Exam Management state
  const [editingExamData, setEditingExamData] = useState<Exam | null>(null);
  const [showReLiveModal, setShowReLiveModal] = useState(false);
  const [isUpdatingLive, setIsUpdatingLive] = useState(false);

  // Re-live time inputs
  const formatForInput = (ms: number) => {
    const d = new Date(ms);
    const pad = (n: number) => (n < 10 ? '0' + n : n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [reLiveStart, setReLiveStart] = useState('');
  const [reLiveEnd, setReLiveEnd] = useState('');
  const [reLiveResultPub, setReLiveResultPub] = useState('');

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
  const isResultPublished = selectedExam ? (currentTime >= selectedExam.resultPublishTime || role === 'admin') : false;

  // Filter ONLY Live Exam Submissions for Official Leaderboard (Strictly students only - no admins)
  const liveSubmissions = selectedExam ? submissions.filter(s => {
    if (s.examId !== selectedExam.id || !s.isLive) return false;
    if (s.studentId?.startsWith('admin_') || s.studentEmail?.toLowerCase().includes('admin@')) return false;
    return true;
  }) : [];

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

  // Open Re-Live Modal with smart presets
  const handleOpenReLiveModal = () => {
    if (!selectedExam) return;
    const now = Date.now();
    setReLiveStart(formatForInput(now));
    setReLiveEnd(formatForInput(now + 4 * 60 * 60 * 1000));
    setReLiveResultPub(formatForInput(now + 5 * 60 * 60 * 1000));
    setShowReLiveModal(true);
  };

  const handleApplyPreset = (hours: number) => {
    const now = Date.now();
    setReLiveStart(formatForInput(now));
    setReLiveEnd(formatForInput(now + hours * 60 * 60 * 1000));
    setReLiveResultPub(formatForInput(now + (hours + 1) * 60 * 60 * 1000));
  };

  const handleSaveReLive = async () => {
    if (!selectedExam) return;
    const startMs = new Date(reLiveStart).getTime();
    const endMs = new Date(reLiveEnd).getTime();
    const pubMs = new Date(reLiveResultPub).getTime();

    if (isNaN(startMs) || isNaN(endMs) || isNaN(pubMs)) {
      toastError('সঠিক তারিখ ও সময় নির্বাচন করুন');
      return;
    }
    if (endMs <= startMs) {
      toastError('পরীক্ষা সমাপ্তির সময় অবশ্যই শুরু হওয়ার সময় থেকে পরবর্তী হতে হবে');
      return;
    }
    if (pubMs < endMs) {
      toastError('ফলাফল প্রকাশের সময় অবশ্যই পরীক্ষা সমাপ্তির সমান বা পরবর্তী হতে হবে');
      return;
    }

    setIsUpdatingLive(true);
    try {
      await updateExam(selectedExam.id, {
        startTime: startMs,
        endTime: endMs,
        resultPublishTime: pubMs,
        isActive: true
      });
      toastSuccess(`"${selectedExam.title}" সফলভাবে পুনরায় লাইভ করা হয়েছে!`);
      setShowReLiveModal(false);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'পরীক্ষা পুনরায় লাইভ করতে ব্যর্থ হয়েছে');
    } finally {
      setIsUpdatingLive(false);
    }
  };

  const handleToggleExamStatus = async () => {
    if (!selectedExam) return;
    const newStatus = selectedExam.isActive === false ? true : false;
    try {
      await updateExam(selectedExam.id, { isActive: newStatus });
      toastSuccess(`পরীক্ষা এখন ${newStatus ? 'সক্রিয় (ON)' : 'স্থগিত (OFF)'}`);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে');
    }
  };

  const handleDeleteCurrentExam = async () => {
    if (!selectedExam) return;
    if (window.confirm(`আপনি কি নিশ্চিত যে "${selectedExam.title}" পরীক্ষাটি সম্পূর্ণ মুছে ফেলতে চান?`)) {
      try {
        await deleteExam(selectedExam.id);
        setSelectedExamId('');
        toastSuccess('পরীক্ষা সফলভাবে মুছে ফেলা হয়েছে');
      } catch (err: unknown) {
        toastError(err instanceof Error ? err.message : 'পরীক্ষা মুছতে সমস্যা হয়েছে');
      }
    }
  };

  // Student's own past submissions (for Student view)
  const studentPastSubmissions = submissions
    .filter(s => s.studentEmail.toLowerCase() === (user?.email?.toLowerCase() || ''))
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
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
              {role === 'admin' ? 'Admin Control' : 'Student Portal'}
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {role === 'admin'
              ? 'কোর্স ও পরীক্ষা সিলেক্ট করে অফিশিয়াল লিডারবোর্ড দেখুন, পরীক্ষার সময় ও সেটিংস পরিবর্তন করুন অথবা শিক্ষার্থীদের কোর্স-ভিত্তিক সারসংক্ষেপ বিশ্লেষণ করুন।'
              : 'কোর্স ও পরীক্ষা সিলেক্ট করে মেধা তালিকা দেখুন অথবা আপনার বিগত পরীক্ষার সামারি রিপোর্ট ও উত্তরপত্র বিশ্লেষণ করুন।'}
          </p>
        </div>

        {/* Tab switch: 1. Exam Leaderboard, 2. Student Summary Report */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl self-start sm:self-auto border border-slate-200 dark:border-slate-700 shadow-xs">
          <button
            onClick={() => setActiveSubTab('leaderboard')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSubTab === 'leaderboard'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4 text-amber-500" />
            <span>1. Exam Leaderboard</span>
          </button>
          <button
            onClick={() => setActiveSubTab('student_history')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeSubTab === 'student_history'
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4 text-blue-500" />
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
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                ধাপ ১: কোর্স সিলেক্ট করুন (Step 1: Select Course)
              </label>
              <select
                value={selectedCourseId}
                onChange={(e) => {
                  const newCid = e.target.value;
                  setSelectedCourseId(newCid);
                  setSelectedExamId('');
                }}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="">-- কোর্স সিলেক্ট করুন (Choose a Course) --</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.batch})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                ধাপ ২: পরীক্ষা সিলেক্ট করুন (Step 2: Select Exam)
              </label>
              <select
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(e.target.value)}
                disabled={!selectedCourseId || courseExams.length === 0}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 font-medium"
              >
                <option value="">
                  {!selectedCourseId 
                    ? '-- প্রথমে কোর্স সিলেক্ট করুন --' 
                    : courseExams.length === 0 
                    ? '-- এই কোর্সে কোনো পরীক্ষা নেই --' 
                    : '-- পরীক্ষা সিলেক্ট করুন (Choose an Exam) --'}
                </option>
                {courseExams.map(ex => (
                  <option key={ex.id} value={ex.id}>{ex.title}</option>
                ))}
              </select>
            </div>

            {/* Filter by Name / College inside Leaderboard */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                মেধা তালিকায় নাম বা কলেজ খুঁজুন (Search)
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  disabled={!selectedExam}
                  value={leaderboardSearch}
                  onChange={(e) => setLeaderboardSearch(e.target.value)}
                  placeholder={selectedExam ? "শিক্ষার্থীর নাম বা কলেজ লিখুন..." : "আগে পরীক্ষা সিলেক্ট করুন..."}
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
                  কোনো পরীক্ষার মেধা তালিকা নির্বাচন করা হয়নি
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  ডিফল্টভাবে কোনো ফলাফল লোড করা হয়নি। অনুগ্রহ করে উপরের ড্রপডাউন থেকে প্রথমে আপনার <strong>কোর্স</strong> এবং এরপর যে পরীক্ষার ফলাফল ও মেধা তালিকা দেখতে চান তা <strong>সিলেক্ট</strong> করুন।
                </p>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold">
                <span>Select Course & Exam above to view results</span>
              </div>
            </div>
          ) : (
            /* Selected Exam View */
            <div className="space-y-6">
              {/* ADMIN SPECIAL CONTROLS & EXAM EDITING BAR */}
              {role === 'admin' && (
                <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-md border border-blue-700/40 space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/30 text-blue-200 border border-blue-400/30">
                          {selectedCourse?.name || selectedExam.courseName}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 ${
                          selectedExam.isActive === false
                            ? 'bg-amber-500/30 text-amber-300 border border-amber-400/30'
                            : currentTime < selectedExam.startTime
                            ? 'bg-sky-500/30 text-sky-300 border border-sky-400/30'
                            : currentTime <= selectedExam.endTime
                            ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/30 animate-pulse'
                            : 'bg-slate-500/30 text-slate-300 border border-slate-400/30'
                        }`}>
                          <Radio className="w-3 h-3" />
                          <span>
                            {selectedExam.isActive === false
                              ? 'Exam Paused (বন্ধ)'
                              : currentTime < selectedExam.startTime
                              ? 'Scheduled (আসন্ন)'
                              : currentTime <= selectedExam.endTime
                              ? 'LIVE NOW (লাইভ চলছে)'
                              : 'Live Completed (লাইভ সমাপ্ত)'}
                          </span>
                        </span>
                      </div>
                      <h3 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                        <span>{selectedExam.title}</span>
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-blue-200/90 font-medium pt-1">
                        <span>সময়কাল: {selectedExam.durationMinutes} মিনিট</span>
                        <span>•</span>
                        <span>মোট নম্বর: {selectedExam.totalMarks}</span>
                        <span>•</span>
                        <span>পাস মার্ক: {selectedExam.passMark}</span>
                        <span>•</span>
                        <span>নেগেটিভ মার্কিং: {(selectedExam.negativeMarkPercentage || 0) * 100}%</span>
                        <span>•</span>
                        <span>মোট প্রশ্ন: {selectedExam.questions?.length || selectedExam.totalQuestions} টি</span>
                      </div>
                    </div>

                    {/* Admin Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      {/* 1. Re-make Live Button */}
                      <button
                        onClick={handleOpenReLiveModal}
                        className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                        title="পুনরায় লাইভ শুরু করার সময় নির্ধারণ করুন"
                      >
                        <Zap className="w-4 h-4" />
                        <span>পুনরায় লাইভ করুন (Make Live Again)</span>
                      </button>

                      {/* 2. Edit Exam Details & Questions */}
                      <button
                        onClick={() => setEditingExamData(selectedExam)}
                        className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                        title="নাম, কোর্স, সময়, নম্বর ও প্রশ্ন পরিবর্তন করুন"
                      >
                        <Edit className="w-4 h-4" />
                        <span>পরীক্ষা এডিট করুন</span>
                      </button>

                      {/* 3. Toggle Active ON/OFF */}
                      <button
                        onClick={handleToggleExamStatus}
                        className={`px-3 py-2 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                          selectedExam.isActive === false
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : 'bg-amber-600/80 hover:bg-amber-600 text-white'
                        }`}
                        title="পরীক্ষা চালু বা বন্ধ করুন"
                      >
                        <Power className="w-4 h-4" />
                        <span>{selectedExam.isActive === false ? 'চালু করুন (Turn ON)' : 'বন্ধ করুন (Turn OFF)'}</span>
                      </button>

                      {/* 4. Delete Exam */}
                      <button
                        onClick={handleDeleteCurrentExam}
                        className="p-2 rounded-xl bg-red-950/60 hover:bg-red-900 border border-red-700/50 text-red-300 hover:text-white transition-all cursor-pointer"
                        title="পরীক্ষাটি মুছে ফেলুন"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Schedule Timestamps View */}
                  <div className="pt-2 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-blue-200/80">
                    <div>
                      <span className="text-white/60">শুরু (Live Start):</span>{' '}
                      <span className="font-semibold text-white">
                        {new Date(selectedExam.startTime).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">সমাপ্তি (Live End):</span>{' '}
                      <span className="font-semibold text-white">
                        {new Date(selectedExam.endTime).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">ফলাফল প্রকাশ (Result Publish):</span>{' '}
                      <span className="font-semibold text-white">
                        {new Date(selectedExam.resultPublishTime).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Student View: Check if result published or locked */}
              {!isResultPublished ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-10 sm:p-14 text-center space-y-4 shadow-xs">
                  <div className="w-14 h-14 rounded-3xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center ring-8 ring-amber-50 dark:ring-amber-950/20">
                    <Lock className="w-7 h-7" />
                  </div>
                  <div className="max-w-md mx-auto space-y-2">
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                      ফলাফল প্রকাশের নির্ধারিত সময় এখনো হয়নি
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                      অফিশিয়াল নিয়ম অনুযায়ী <strong>{selectedExam.title}</strong> পরীক্ষার লাইভ মেধা তালিকা এবং উত্তরপত্র ফলাফল প্রকাশের নির্দিষ্ট তারিখে উন্মুক্ত হবে।
                    </p>
                  </div>
                  <div className="inline-block px-5 py-2.5 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-blue-700 dark:text-blue-300 font-bold text-xs sm:text-sm">
                    প্রকাশের সময়: {new Date(selectedExam.resultPublishTime).toLocaleString('en-US', {
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
                        <span>অফিশিয়াল মেধা তালিকা (Live Leaderboard) • {selectedExam.title}</span>
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {leaderboardRows.length} জন পরীক্ষার্থী অংশগ্রহণ করেছে (নম্বর ও সময়ের ভিত্তিতে র‍্যাংক নির্ধারিত)
                      </p>
                    </div>

                    {/* PDF Export Button */}
                    <button
                      onClick={() => exportLeaderboardPDF(selectedExam.title, selectedExam.courseName, filteredLeaderboardRows)}
                      disabled={filteredLeaderboardRows.length === 0}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-40 transition-colors cursor-pointer self-start sm:self-auto"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>মেধা তালিকা PDF ডাউনলোড</span>
                    </button>
                  </div>

                  {/* Leaderboard Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/60 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                          <th className="py-3 px-4">র‍্যাংক</th>
                          <th className="py-3 px-4">শিক্ষার্থীর নাম</th>
                          <th className="py-3 px-4">কলেজ / প্রতিষ্ঠান</th>
                          <th className="py-3 px-4 text-center">প্রাপ্ত নম্বর</th>
                          <th className="py-3 px-4 text-center">শতাংশ (%)</th>
                          <th className="py-3 px-4 text-center">ব্যয়িত সময়</th>
                          <th className="py-3 px-4 text-center">উত্তর বিভাজন</th>
                          {role === 'admin' && (
                            <th className="py-3 px-4">সাবমিশন সময়</th>
                          )}
                          <th className="py-3 px-4 text-right">উত্তরপত্র</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                        {filteredLeaderboardRows.length === 0 ? (
                          <tr>
                            <td colSpan={role === 'admin' ? 9 : 8} className="py-12 text-center text-slate-400">
                              এই পরীক্ষায় এখনো কোনো সাবমিশন পাওয়া যায়নি।
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
                                  <div className="flex items-center gap-2">
                                    <span>{row.studentName}</span>
                                    {/* Student Profile Button (Admin gets full info, Student gets public card) */}
                                    <button
                                      onClick={() => setInspectStudentProfile({
                                        name: row.studentName,
                                        college: row.studentCollege,
                                        email: row.studentEmail
                                      })}
                                      className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-md transition-colors cursor-pointer"
                                      title="শিক্ষার্থীর প্রোফাইল দেখুন"
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
                                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold" title="সঠিক">
                                      ✓{row.correctCount}
                                    </span>
                                    <span className="text-red-500 font-semibold" title="ভুল">
                                      ✕{row.wrongCount}
                                    </span>
                                    <span className="text-slate-400" title="ছেড়ে দেওয়া">
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
                                      <span>উত্তরপত্র দেখুন</span>
                                    </button>
                                  ) : (
                                    <span className="text-[11px] text-slate-400 italic">
                                      গোপনীয়
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
                      <span>শিক্ষার্থীদের কোর্স-ভিত্তিক সারসংক্ষেপ (Student Summary Report)</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      কোর্স নির্বাচন করে মেম্বারদের লাইভ, প্র্যাকটিস বা উভয়ের পরীক্ষার রেজাল্ট দেখুন ও একক বা ব্যাচ PDF ডাউনলোড করুন।
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Course Dropdown */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      ১. কোর্স সিলেক্ট করুন (Course Filter)
                    </label>
                    <select
                      value={adminCourseFilter}
                      onChange={(e) => setAdminCourseFilter(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">-- সকল কোর্স (All Enrolled Members) --</option>
                      {courses.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.batch})</option>
                      ))}
                    </select>
                  </div>

                  {/* Search by Name, Email, College */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      ২. নাম, ইমেইল বা কলেজ দিয়ে খুঁজুন (Search Student)
                    </label>
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={adminMemberSearch}
                        onChange={(e) => setAdminMemberSearch(e.target.value)}
                        placeholder="শিক্ষার্থীর নাম, ইমেইল বা কলেজ লিখুন..."
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
                    <span>এনরোল্ড মেম্বার তালিকা ({filteredAdminMembers.length})</span>
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
                    <p className="text-sm font-medium">কোনো শিক্ষার্থী পাওয়া যায়নি।</p>
                    <p className="text-xs text-slate-500">অন্য কোনো কোর্স সিলেক্ট করুন অথবা সার্চ পরিবর্তন করুন।</p>
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
                                    title="শিক্ষার্থীর পূর্ণাঙ্গ প্রোফাইল দেখুন"
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
                                <span className="text-[11px] font-semibold text-slate-400 hidden sm:inline">কোর্স:</span>
                                <select
                                  value={effectiveCourseId}
                                  onChange={(e) => {
                                    const newC = e.target.value;
                                    setStudentSelectedCourseMap(prev => ({ ...prev, [member.email]: newC }));
                                  }}
                                  className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-medium max-w-[170px]"
                                >
                                  <option value="all">সকল কোর্স</option>
                                  {studentEnrolledCourses.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Dropdown 2: Exam Filter (Live / Practice / Both) */}
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-semibold text-slate-400 hidden sm:inline">পরীক্ষা:</span>
                                <select
                                  value={memberExamFilter}
                                  onChange={(e) => {
                                    const newF = e.target.value as 'both' | 'live' | 'practice';
                                    setStudentExamFilterMap(prev => ({ ...prev, [member.email]: newF }));
                                  }}
                                  className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                                >
                                  <option value="both">Both Exam (লাইভ+প্র্যাকটিস)</option>
                                  <option value="live">Live exam (লাইভ)</option>
                                  <option value="practice">Practice exam (প্র্যাকটিস)</option>
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
                                title="সামারি রিপোর্ট PDF ডাউনলোড করুন"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>PDF</span>
                              </button>

                              {/* Toggle submissions list */}
                              <button
                                onClick={() => setExpandedStudentEmail(isExpanded ? null : member.email)}
                                className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <span>{memberCourseSubs.length} সাবমিশন</span>
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </button>
                            </div>
                          </div>

                          {/* Expanded Submissions Drawer */}
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
                              {memberCourseSubs.length === 0 ? (
                                <p className="text-xs text-slate-400 italic py-2">
                                  এই ক্যাটাগরিতে কোনো পরীক্ষার রেকর্ড পাওয়া যায়নি।
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
                                            <span className="font-bold text-blue-600 dark:text-blue-400">
                                              {sub.marksObtained}/{sub.totalMarks} ({sub.percentage.toFixed(1)}%)
                                            </span>
                                            <span className="text-[10px] text-slate-400 block font-mono">
                                              {mins}m {secs}s
                                            </span>
                                          </div>

                                          {ex && (
                                            <button
                                              onClick={() => setInspectSubmission({ submission: sub, exam: ex })}
                                              className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                                              title="উত্তরপত্র দেখুন"
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
                      ফিল্টার:
                    </span>
                    <select
                      value={studentHistoryFilter}
                      onChange={(e) => setStudentHistoryFilter(e.target.value as 'both' | 'live' | 'practice')}
                      className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs"
                    >
                      <option value="both">Both Exam (লাইভ + প্র্যাকটিস সব পরীক্ষা)</option>
                      <option value="live">Live exam (শুধুমাত্র লাইভ পরীক্ষা)</option>
                      <option value="practice">Practice exam (শুধুমাত্র অনুশীলন পরীক্ষা)</option>
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
                    <span>সামারি রিপোর্ট PDF ডাউনলোড</span>
                  </button>
                </div>
              </div>

              {/* Past Submissions List */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/40">
                  <div className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <span>পরীক্ষার হিস্ট্রি (Exam History)</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                      {filteredStudentPastSubs.length} টি পরীক্ষা
                    </span>
                    <span className="text-xs text-slate-400 font-normal">
                      ({studentHistoryFilter === 'live' ? 'লাইভ পরীক্ষা' : studentHistoryFilter === 'practice' ? 'অনুশীলন পরীক্ষা' : 'সব পরীক্ষা'})
                    </span>
                  </div>
                </div>

                {filteredStudentPastSubs.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 space-y-2">
                    <FileText className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                    <p className="text-sm font-medium">
                      {studentHistoryFilter === 'live' 
                        ? 'আপনার কোনো লাইভ পরীক্ষার রেকর্ড পাওয়া যায়নি।'
                        : studentHistoryFilter === 'practice'
                        ? 'আপনার কোনো প্র্যাকটিস পরীক্ষার রেকর্ড পাওয়া যায়নি।'
                        : 'আপনার কোনো পরীক্ষার রেকর্ড পাওয়া যায়নি।'}
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
                                {sub.isLive ? 'লাইভ পরীক্ষা (Live)' : 'অনুশীলন পরীক্ষা (Practice)'}
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
                              <span className="text-xs text-slate-500">প্রাপ্ত নম্বর:</span>
                              <div className="font-bold text-sm text-blue-600 dark:text-blue-400">
                                {sub.marksObtained}/{sub.totalMarks} ({sub.percentage.toFixed(1)}%)
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono">
                                সময়: {mins}মি {secs}সে
                              </span>
                            </div>

                            {exam && (
                              <button
                                onClick={() => setInspectSubmission({ submission: sub, exam })}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                                title="উত্তরপত্র দেখুন"
                              >
                                <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                <span>উত্তরপত্র</span>
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
      {/* RE-MAKE LIVE MODAL (ADMIN) */}
      {/* ========================================================= */}
      {showReLiveModal && selectedExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-rose-50 dark:bg-rose-950/40 flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <Zap className="w-5 h-5" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  পরীক্ষা পুনরায় লাইভ করুন (Make Exam Live Again)
                </h3>
              </div>
              <button
                onClick={() => setShowReLiveModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                <strong>কেন এই অপশন?</strong> যদি কোনো শিক্ষার্থী নির্দিষ্ট সময়ে লাইভ পরীক্ষায় অংশ নিতে না পেরে থাকে বা আপনি পুনরায় লাইভ পরীক্ষা নিতে চান, তাহলে নতুন সময়সীমা দিয়ে পুনরায় লাইভ করুন। পরবর্তীতে যারা এই পরীক্ষা দিবে তাদের ফলাফলও <strong>একই মূল লিডারবোর্ডে</strong> স্বয়ংক্রিয়ভাবে যুক্ত হয়ে যাবে।
              </div>

              <div>
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  কুইক প্রিসেট (Quick Presets):
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(2)}
                    className="py-1.5 px-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    এখন থেকে ২ ঘণ্টা
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(4)}
                    className="py-1.5 px-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    এখন থেকে ৪ ঘণ্টা
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(24)}
                    className="py-1.5 px-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-950 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    ২৪ ঘণ্টা লাইভ
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    ১. লাইভ শুরু হওয়ার সময় (Start Time)
                  </label>
                  <input
                    type="datetime-local"
                    value={reLiveStart}
                    onChange={(e) => setReLiveStart(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    ২. লাইভ সমাপ্তির সময় (End Time)
                  </label>
                  <input
                    type="datetime-local"
                    value={reLiveEnd}
                    onChange={(e) => setReLiveEnd(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    ৩. ফলাফল প্রকাশের সময় (Result Publish Date & Time)
                  </label>
                  <input
                    type="datetime-local"
                    value={reLiveResultPub}
                    onChange={(e) => setReLiveResultPub(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowReLiveModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  disabled={isUpdatingLive}
                  onClick={handleSaveReLive}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isUpdatingLive ? (
                    <span>সংরক্ষণ হচ্ছে...</span>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5" />
                      <span>সংরক্ষণ করুন ও লাইভ চালু করুন</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* EDIT EXAM FULL DETAILS & QUESTIONS MODAL (ADMIN) */}
      {/* ========================================================= */}
      {editingExamData && (
        <EditExamModal
          exam={editingExamData}
          courses={courses}
          onClose={() => setEditingExamData(null)}
          onExamUpdated={(updated) => {
            setEditingExamData(null);
            toastSuccess(`"${updated.title}" সফলভাবে আপডেট করা হয়েছে`);
          }}
        />
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
      {/* INSPECT ANSWER SCRIPT MODAL */}
      {/* ========================================================= */}
      {inspectSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  উত্তরপত্র বিশ্লেষণ (Answer Script) • {inspectSubmission.submission.studentName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {inspectSubmission.exam.title} • স্কোর: {inspectSubmission.submission.marksObtained}/{inspectSubmission.exam.totalMarks} ({inspectSubmission.submission.percentage.toFixed(1)}%)
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
                        {isCorrect ? 'সঠিক' : isSkipped ? 'ছেড়ে দেওয়া' : 'ভুল'}
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
                            {isCorrectOption && <span className="text-[10px] ml-1 font-bold text-emerald-700 dark:text-emerald-300">[সঠিক উত্তর]</span>}
                            {isStudentChoice && !isCorrectOption && <span className="text-[10px] ml-1 font-bold text-red-700 dark:text-red-300">[আপনার পছন্দ]</span>}
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation && (
                      <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">ব্যাখ্যা: </span>
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
