import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Course, Exam, ExamSubmission, LeaderboardRow, StudentUser } from '../../types';
import { exportLeaderboardPDF, exportAnswerScriptPDF, exportStudentSummaryPDF } from '../../utils/pdfExport';
import { EditExamModal } from '../exams/EditExamModal';
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
  Check
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

  // Requirement 1 & Admin 1: Default to empty so no course or exam leaderboard is shown by default
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [selectedExamId, setSelectedExamId] = useState<string>('');

  // Course Exams filter
  const courseExams = selectedCourseId ? exams.filter(e => e.courseId === selectedCourseId) : [];

  // Filter/Search by Name and College in Leaderboard
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Submission for Answer Script View Modal
  const [inspectSubmission, setInspectSubmission] = useState<{ submission: ExamSubmission; exam: Exam } | null>(null);

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

  // Requirement 2: Student Summary Report history dropdown filter
  // Options: 'both' | 'live' | 'practice'
  const [historyFilter, setHistoryFilter] = useState<'both' | 'live' | 'practice'>('both');

  // Student History Search (for Admin search by email or student selection)
  const [searchedEmail, setSearchedEmail] = useState('');
  const [targetStudentEmail, setTargetStudentEmail] = useState(user?.role === 'student' ? (user.email || '') : '');

  const currentTime = Date.now();
  const selectedCourse = courses.find(c => c.id === selectedCourseId);
  const selectedExam = exams.find(e => e.id === selectedExamId);

  // Check if student is allowed to view results of this exam yet
  const isResultPublished = selectedExam ? (currentTime >= selectedExam.resultPublishTime || role === 'admin') : false;

  // Filter ONLY Live Exam Submissions for the Official Leaderboard (Strictly students only - no admins)
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

  // Filter rows by Name or College
  const filteredRows = leaderboardRows.filter(r => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return r.studentName.toLowerCase().includes(q) || r.studentCollege.toLowerCase().includes(q);
  });

  // Student Past Exams History (Chronological)
  const effectiveEmail = role === 'admin' 
    ? (targetStudentEmail.trim().toLowerCase() || (students[0]?.email?.toLowerCase() || ''))
    : (user?.email?.toLowerCase() || '');

  const targetStudentProfile = students.find(s => s.email.toLowerCase() === effectiveEmail) || {
    name: user?.name || 'Student',
    email: effectiveEmail || '',
    college: user?.college || 'N/A',
    mobile: user?.mobile
  };

  const studentPastSubmissions = submissions
    .filter(s => s.studentEmail.toLowerCase() === effectiveEmail)
    .sort((a, b) => b.submittedAt - a.submittedAt);

  // Apply Live / Practice / Both filter
  const filteredPastSubmissions = studentPastSubmissions.filter(s => {
    if (historyFilter === 'live') return s.isLive === true;
    if (historyFilter === 'practice') return s.isLive === false;
    return true; // 'both'
  });

  const handleAdminEmailSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchedEmail.trim()) {
      setTargetStudentEmail(searchedEmail.trim().toLowerCase());
    }
  };

  // Open Re-Live Modal with smart presets
  const handleOpenReLiveModal = () => {
    if (!selectedExam) return;
    const now = Date.now();
    // Default: starts now, ends in 4 hours, results published 5 hours from now
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
              ? 'কোর্স ও পরীক্ষা সিলেক্ট করে অফিশিয়াল লিডারবোর্ড দেখুন, পরীক্ষার সময় ও সেটিংস পরিবর্তন করুন অথবা পুনরায় লাইভ করুন।'
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
                  // Reset exam selection when course changes so default is blank
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
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
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
                <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-md border border-blue-700/40 space-y-4">
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
                /* Leaderboard Table */
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
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

                    {/* PDF Export Button (Available for Admin and Students) */}
                    <button
                      onClick={() => exportLeaderboardPDF(selectedExam.title, selectedExam.courseName, filteredRows)}
                      disabled={filteredRows.length === 0}
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
                        {filteredRows.length === 0 ? (
                          <tr>
                            <td colSpan={role === 'admin' ? 9 : 8} className="py-12 text-center text-slate-400">
                              এই পরীক্ষায় এখনো কোনো সাবমিশন পাওয়া যায়নি।
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
          {/* Admin Email Search / Student Selector */}
          {role === 'admin' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-600" />
                  <span>অ্যাডমিন: যেকোনো শিক্ষার্থীর পরীক্ষার সারসংক্ষেপ ও হিস্ট্রি খুঁজুন</span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  শিক্ষার্থীর ইমেইল দিয়ে সার্চ করুন অথবা তালিকা থেকে সিলেক্ট করে তার সব লাইভ বা প্র্যাকটিস পরীক্ষার রেজাল্ট ও উত্তরপত্র দেখুন।
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Search by email */}
                <form onSubmit={handleAdminEmailSearch} className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={searchedEmail}
                      onChange={(e) => setSearchedEmail(e.target.value)}
                      placeholder="শিক্ষার্থীর ইমেইল লিখুন..."
                      className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shadow-xs transition-colors"
                  >
                    সার্চ
                  </button>
                </form>

                {/* Quick Select from Registered Students */}
                <div>
                  <select
                    value={targetStudentEmail}
                    onChange={(e) => setTargetStudentEmail(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- নিবন্ধিত শিক্ষার্থী তালিকা থেকে বেছে নিন --</option>
                    {students.map(s => (
                      <option key={s.id} value={s.email}>
                        {s.name} ({s.college}) - {s.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Student Profile Card & Summary Download with Filter */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-black text-lg flex items-center justify-center shrink-0">
                {targetStudentProfile.name ? targetStudentProfile.name.slice(0, 1).toUpperCase() : 'S'}
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  {targetStudentProfile.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {targetStudentProfile.college} • {targetStudentProfile.email}
                </p>
                {targetStudentProfile.mobile && (
                  <p className="text-[11px] text-slate-400">
                    মোবাইল: {targetStudentProfile.mobile}
                  </p>
                )}
              </div>
            </div>

            {/* Action controls: Filter Dropdown & PDF Download */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {/* Dropdown filter box: Live Exam / Practice Exam / Both Exam */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 shrink-0">
                  ফিল্টার:
                </span>
                <select
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value as 'both' | 'live' | 'practice')}
                  className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs"
                >
                  <option value="both">Both Exam (লাইভ + প্র্যাকটিস সব পরীক্ষা)</option>
                  <option value="live">Live exam (শুধুমাত্র লাইভ পরীক্ষা)</option>
                  <option value="practice">Practice exam (শুধুমাত্র অনুশীলন পরীক্ষা)</option>
                </select>
              </div>

              {/* Download PDF for the selected filter */}
              <button
                onClick={() => exportStudentSummaryPDF(targetStudentProfile, filteredPastSubmissions, exams, historyFilter)}
                disabled={filteredPastSubmissions.length === 0}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>সামারি রিপোর্ট PDF ডাউনলোড</span>
              </button>
            </div>
          </div>

          {/* Past Submissions List */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/40">
              <div className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <span>পরীক্ষার হিস্ট্রি (Exam History)</span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                  {filteredPastSubmissions.length} টি পরীক্ষা
                </span>
                <span className="text-xs text-slate-400 font-normal">
                  ({historyFilter === 'live' ? 'লাইভ পরীক্ষা' : historyFilter === 'practice' ? 'অনুশীলন পরীক্ষা' : 'সব পরীক্ষা'})
                </span>
              </div>
            </div>

            {filteredPastSubmissions.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-2">
                <FileText className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                <p className="text-sm font-medium">
                  {historyFilter === 'live' 
                    ? 'এই শিক্ষার্থীর কোনো লাইভ পরীক্ষার রেকর্ড পাওয়া যায়নি।'
                    : historyFilter === 'practice'
                    ? 'এই শিক্ষার্থীর কোনো প্র্যাকটিস পরীক্ষার রেকর্ড পাওয়া যায়নি।'
                    : 'এই শিক্ষার্থীর কোনো পরীক্ষার রেকর্ড পাওয়া যায়নি।'}
                </p>
                <p className="text-xs text-slate-500">
                  ড্রপডাউন থেকে অন্য কোনো ফিল্টার নির্বাচন করে দেখতে পারেন।
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredPastSubmissions.map((sub) => {
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
                <strong>কেন এই অপশন?</strong> যদি কোনো শিক্ষার্থী নির্দিষ্ট সময়ে লাইভ পরীক্ষায় অংশ নিতে না পেরে থাকে বা আপনি পুনরায় লাইভ পরীক্ষা নিতে চান, তাহলে নতুন সময়সীমা দিয়ে পুনরায় লাইভ করুন। পরীক্ষাটি স্বয়ংক্রিয়ভাবে লাইভ সেগমেন্টে চলে যাবে।
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
      {/* INSPECT ANSWER SCRIPT MODAL */}
      {/* ========================================================= */}
      {inspectSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
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
