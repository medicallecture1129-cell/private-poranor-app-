import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Exam, Course, ExamSubmission } from '../../types';
import { CreateExamModal } from './CreateExamModal';
import { EditExamModal } from './EditExamModal';
import { ExamRunner } from './ExamRunner';
import { PracticeResultModal } from './PracticeResultModal';
import { deleteExam, updateExam } from '../../services/db';
import { useToast } from '../../context/ToastContext';
import { ModernSelect } from '../ui/ModernSelect';
import { 
  Plus, 
  Search, 
  Radio, 
  RotateCcw, 
  Clock, 
  Award, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Play, 
  Filter,
  Edit,
  Power,
  CheckCircle,
  X,
  ArrowRight,
  Sparkles,
  Layers
} from 'lucide-react';

interface ExamHubProps {
  exams: Exam[];
  courses: Course[];
  submissions: ExamSubmission[];
}

export const ExamHub: React.FC<ExamHubProps> = ({ exams, courses, submissions }) => {
  const { user, role } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const [activeSegment, setActiveSegment] = useState<'live' | 'practice'>('live');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [activeExamRunning, setActiveExamRunning] = useState<{ exam: Exam; isLive: boolean } | null>(null);
  const [practiceResultData, setPracticeResultData] = useState<{ exam: Exam; submission: ExamSubmission } | null>(null);

  // Re-live Exam Modal State (Requirement 3: Dynamic Re-Live Logic from Practice section)
  const [reLiveTargetExam, setReLiveTargetExam] = useState<Exam | null>(null);
  const [reLiveStartTime, setReLiveStartTime] = useState('');
  const [reLiveEndTime, setReLiveEndTime] = useState('');
  const [reLivePublishTime, setReLivePublishTime] = useState('');
  const [isReLiving, setIsReLiving] = useState(false);

  const formatForDateTimeInput = (ms: number) => {
    const d = new Date(ms);
    const pad = (n: number) => (n < 10 ? '0' + n : n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleOpenReLiveModal = (exam: Exam, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const now = Date.now();
    const durationMs = (exam.durationMinutes || 30) * 60 * 1000;
    setReLiveStartTime(formatForDateTimeInput(now));
    setReLiveEndTime(formatForDateTimeInput(now + Math.max(durationMs * 2, 4 * 60 * 60 * 1000)));
    setReLivePublishTime(formatForDateTimeInput(now + Math.max(durationMs * 2, 4 * 60 * 60 * 1000) + 60 * 60 * 1000));
    setReLiveTargetExam(exam);
  };

  const handleConfirmReLive = async () => {
    if (!reLiveTargetExam) return;
    const startMs = new Date(reLiveStartTime).getTime();
    const endMs = new Date(reLiveEndTime).getTime();
    const pubMs = new Date(reLivePublishTime).getTime();

    if (isNaN(startMs) || isNaN(endMs) || isNaN(pubMs)) {
      toastError('অনুগ্রহ করে সঠিক তারিখ ও সময় নির্বাচন করুন');
      return;
    }
    if (endMs <= startMs) {
      toastError('সমাপ্তির সময় অবশ্যই শুরুর সময়ের পরে হতে হবে');
      return;
    }
    if (pubMs < endMs) {
      toastError('ফলাফল প্রকাশের সময় অবশ্যই সমাপ্তির সময়ের সমান বা পরে হতে হবে');
      return;
    }

    setIsReLiving(true);
    try {
      await updateExam(reLiveTargetExam.id, {
        startTime: startMs,
        endTime: endMs,
        resultPublishTime: pubMs,
        isActive: true,
        isPractice: false
      });
      toastSuccess(`"${reLiveTargetExam.title}" সফলভাবে আবার লাইভ করা হয়েছে!`);
      setReLiveTargetExam(null);
      setActiveSegment('live');
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to re-live exam');
    } finally {
      setIsReLiving(false);
    }
  };

  // Requirement 2: Live to Practice shift ('Make it Practice Exam' button)
  const handleMakePracticeExam = async (exam: Exam, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`আপনি কি "${exam.title}" পরীক্ষাটি সরাসরি প্র্যাকটিস এক্সামে রূপান্তর করতে চান?`)) {
      try {
        await updateExam(exam.id, { 
          isPractice: true,
          endTime: Math.min(exam.endTime, Date.now() - 1000)
        });
        toastSuccess(`"${exam.title}" পরীক্ষাটি প্র্যাকটিস এক্সামে রূপান্তর করা হয়েছে।`);
        setActiveSegment('practice');
      } catch (err: unknown) {
        toastError(err instanceof Error ? err.message : 'Failed to shift exam to practice');
      }
    }
  };

  const currentTime = Date.now();

  // If student: only show exams belonging to courses they are enrolled in (or general courses)
  const studentEnrolledCourseIds = role === 'admin'
    ? courses.map(c => c.id)
    : [
        'general',
        ...courses
          .filter(c => 
            (user?.email && c.allowedEmails?.some(e => e.toLowerCase() === user.email.toLowerCase())) ||
            (user?.enrolledCourses && user.enrolledCourses.includes(c.id))
          )
          .map(c => c.id)
      ];

  const availableExams = role === 'admin'
    ? exams
    : exams.filter(e => e.courseId === 'general' || studentEnrolledCourseIds.includes(e.courseId));

  // Segmentation Logic (Requirement 2 & 3):
  // Live Exams: !isPractice && endTime > currentTime
  // Practice Exams: isPractice === true || endTime <= currentTime
  const liveExams = availableExams.filter(e => !e.isPractice && e.endTime > currentTime);
  const practiceExams = availableExams.filter(e => e.isPractice === true || e.endTime <= currentTime);

  const currentSegmentExams = activeSegment === 'live' ? liveExams : practiceExams;

  // Apply Course & Search Filters
  const filteredExams = currentSegmentExams.filter(e => {
    const matchCourse = selectedCourseFilter === 'all' || e.courseId === selectedCourseFilter;
    const matchSearch = e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (e.courseName && e.courseName.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCourse && matchSearch;
  });

  const handleDeleteExam = async (examId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to permanently delete this exam?')) {
      try {
        await deleteExam(examId);
        toastSuccess('Exam deleted successfully.');
      } catch (err: unknown) {
        toastError(err instanceof Error ? err.message : 'Failed to delete exam');
      }
    }
  };

  // Requirement 2: Active / Inactive Toggle for Admin
  const handleToggleExamActive = async (exam: Exam, e: React.MouseEvent) => {
    e.stopPropagation();
    const newActive = exam.isActive === false ? true : false;
    try {
      await updateExam(exam.id, { isActive: newActive });
      toastSuccess(`পরীক্ষাটি এখন ${newActive ? 'একটিভ (Active)' : 'ইনএকটিভ (Inactive)'} করা হয়েছে।`);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to toggle exam status');
    }
  };

  // Course dropdown options for ModernSelect
  const courseSelectOptions = [
    { value: 'all', label: 'All Courses / Batches' },
    ...courses.map(c => ({ value: c.id, label: c.name, badge: c.batch }))
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <span>Examinations</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold badge-theme">
              {availableExams.length} Total
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {role === 'admin'
              ? 'Admin Dashboard: Manage live schedules, active/inactive modes, convert to practice, and questions bank'
              : 'Official Live Exams with Scheduled Result Publishing & Unlimited Practice Tests'}
          </p>
        </div>

        {role === 'admin' && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-theme-primary font-semibold text-xs sm:text-sm shadow-sm cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Exam</span>
          </button>
        )}
      </div>

      {/* Segment Selector & Course Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Live vs Practice Tabs */}
        <div className="inline-flex p-1 bg-theme-surface border border-theme-border rounded-2xl shadow-xs self-start">
          <button
            onClick={() => setActiveSegment('live')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeSegment === 'live'
                ? 'btn-theme-primary shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Live Exams</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              activeSegment === 'live' ? 'bg-white/20 text-white' : 'bg-theme-card text-slate-300'
            }`}>
              {liveExams.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSegment('practice')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeSegment === 'practice'
                ? 'btn-theme-primary shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Practice Tests</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              activeSegment === 'practice' ? 'bg-white/20 text-white' : 'bg-theme-card text-slate-300'
            }`}>
              {practiceExams.length}
            </span>
          </button>
        </div>

        {/* Modern Course Filter Dropdown (Requirement 4: Modernized Dropdown UI) */}
        <div className="flex items-center gap-2 min-w-[240px] sm:w-72">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <ModernSelect
            value={selectedCourseFilter}
            onChange={setSelectedCourseFilter}
            options={courseSelectOptions}
            className="flex-1"
          />
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search exams by title..."
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-theme-border bg-theme-surface text-theme-title placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]"
          />
        </div>
        <div className="text-xs font-semibold text-slate-400 self-end sm:self-center">
          Showing {filteredExams.length} Exam{filteredExams.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Exams Grid & Empty State ("No Live Exams Found" as in User's Screenshot) */}
      {filteredExams.length === 0 ? (
        <div className="bg-theme-card border border-theme-card rounded-3xl p-12 text-center text-slate-400 shadow-md">
          <div 
            className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center ring-1 ring-white/10"
            style={{ backgroundColor: 'var(--theme-primary-light)' }}
          >
            <Clock className="w-8 h-8 text-theme-primary" />
          </div>
          <h4 className="font-bold text-theme-title text-base">
            No {activeSegment === 'live' ? 'Live' : 'Practice'} Exams Found
          </h4>
          <p className="text-xs sm:text-sm text-slate-400 mt-1.5 max-w-md mx-auto">
            {activeSegment === 'live'
              ? 'No live exams are currently scheduled or active. When live exams expire or are converted, they appear in Practice exams.'
              : 'No practice exams match your selected course or search query.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredExams.map((exam) => {
            const hasStarted = currentTime >= exam.startTime;
            const hasEnded = currentTime > exam.endTime;
            const isLiveNow = hasStarted && !hasEnded;
            const isExamActive = exam.isActive !== false;

            const studentLiveSubmission = submissions.find(
              s => s.examId === exam.id && s.studentId === user?.id && s.isLive
            );
            const studentPracticeSubmissions = submissions.filter(
              s => s.examId === exam.id && s.studentId === user?.id && !s.isLive
            );

            return (
              <div
                key={exam.id}
                className={`group relative bg-white/95 dark:bg-[#121622]/95 border card-theme-interactive rounded-3xl p-5 shadow-xs hover:shadow-xl flex flex-col justify-between overflow-hidden ${
                  !isExamActive 
                    ? 'border-amber-300/70 dark:border-amber-900/60 bg-amber-50/10' 
                    : 'border-slate-200 dark:border-white/[0.08]'
                }`}
              >
                <div className="card-glow-line" />
                <div className="space-y-3">
                  {/* Top Badges & Status */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/[0.08] truncate max-w-[170px]">
                      {exam.courseName}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {/* Active / Inactive Status Badge (Requirement 2 & 3) */}
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isExamActive 
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' 
                          : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1'
                      }`}>
                        {isExamActive ? 'Active' : 'Inactive'}
                      </span>

                      {role === 'admin' && (
                        <button
                          onClick={(e) => handleDeleteExam(exam.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition-opacity cursor-pointer"
                          title="Delete Exam"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-white line-clamp-2">
                    {exam.title}
                  </h3>

                  {/* Metrics Badges */}
                  <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100 dark:border-white/[0.06] text-center">
                    <div>
                      <span className="text-[10px] text-slate-400">Duration</span>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {exam.durationMinutes}m
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400">Questions</span>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {exam.questions.length}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400">Marks</span>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {exam.totalMarks}
                      </p>
                    </div>
                  </div>

                  {/* Schedule Details */}
                  {activeSegment === 'live' && (
                    <div className="text-[11px] space-y-1 text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-theme-primary" />
                        <span>Live: {new Date(exam.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(exam.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                        <Award className="w-3.5 h-3.5" />
                        <span>Results: {new Date(exam.resultPublishTime).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  )}

                  {activeSegment === 'practice' && studentPracticeSubmissions.length > 0 && (
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Attempted {studentPracticeSubmissions.length} time(s)</span>
                    </div>
                  )}
                </div>

                {/* Bottom Actions based on Role */}
                <div className="pt-4 mt-4 border-t border-slate-100 dark:border-white/[0.06]">
                  {role === 'admin' ? (
                    /* ADMIN CONTROLS */
                    <div className="space-y-2">
                      {/* Live Section Action: Make it Practice Exam button (Requirement 2.2) */}
                      {activeSegment === 'live' && (
                        <button
                          type="button"
                          onClick={(e) => handleMakePracticeExam(exam, e)}
                          className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-200 dark:border-white/[0.08]"
                          title="Convert this live exam to practice mode directly"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Make it Practice Exam</span>
                        </button>
                      )}

                      {/* Practice Section Action: Make it Live Exam button (Requirement 3.2) */}
                      {activeSegment === 'practice' && (
                        <button
                          type="button"
                          onClick={(e) => handleOpenReLiveModal(exam, e)}
                          className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer ring-1 ring-white/10"
                          title="Make this exam live again with new timings"
                        >
                          <Radio className="w-3.5 h-3.5 animate-pulse" />
                          <span>Make it Live Exam</span>
                        </button>
                      )}

                      <div className="flex items-center gap-2">
                        {/* Requirement 2.1 & 3.1: Active / Inactive Toggle */}
                        <button
                          type="button"
                          onClick={(e) => handleToggleExamActive(exam, e)}
                          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                            isExamActive
                              ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                          title={isExamActive ? 'Pause / Inactive' : 'Active exam'}
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>{isExamActive ? 'Make Inactive' : 'Make Active'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingExam(exam)}
                          className="py-2 px-3 rounded-xl btn-theme-primary text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                          title="Edit schedule and questions"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Manage / Edit</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* STUDENT CONTROLS */
                    /* Requirement 2.1 & 3.1: If Inactive, show "এডমিন এটি ইনএকটিভ করে রেখেছেন" */
                    !isExamActive ? (
                      <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-center text-xs text-amber-800 dark:text-amber-300 font-semibold flex items-center justify-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>এডমিন এটি ইনএকটিভ করে রেখেছেন</span>
                      </div>
                    ) : activeSegment === 'live' ? (
                      studentLiveSubmission ? (
                        <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-center text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center justify-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>✓ Submitted. Result will be published on schedule.</span>
                        </div>
                      ) : isLiveNow ? (
                        <button
                          onClick={() => setActiveExamRunning({ exam, isLive: true })}
                          className="w-full py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Start Live Exam Now</span>
                        </button>
                      ) : !hasStarted ? (
                        <div className="p-2.5 rounded-2xl bg-slate-100 dark:bg-white/[0.06] text-center text-xs text-slate-500 dark:text-slate-400 font-medium">
                          Starts {new Date(exam.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      ) : (
                        <button
                          onClick={() => setActiveExamRunning({ exam, isLive: false })}
                          className="w-full py-2.5 rounded-2xl btn-theme-primary text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Take as Practice</span>
                        </button>
                      )
                    ) : (
                      <button
                        onClick={() => setActiveExamRunning({ exam, isLive: false })}
                        className="w-full py-2.5 rounded-2xl btn-theme-primary text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Start Practice Exam</span>
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateExamModal
          courses={courses}
          onClose={() => setShowCreateModal(false)}
          onExamCreated={() => setShowCreateModal(false)}
        />
      )}

      {editingExam && (
        <EditExamModal
          exam={editingExam}
          courses={courses}
          isPractice={activeSegment === 'practice' || editingExam.isPractice === true || editingExam.endTime <= currentTime}
          onClose={() => setEditingExam(null)}
          onExamUpdated={() => setEditingExam(null)}
        />
      )}

      {activeExamRunning && (
        <ExamRunner
          exam={activeExamRunning.exam}
          isLive={activeExamRunning.isLive}
          onClose={() => setActiveExamRunning(null)}
          onFinished={(sub) => {
            setActiveExamRunning(null);
            setPracticeResultData({ exam: activeExamRunning.exam, submission: sub });
          }}
        />
      )}

      {practiceResultData && (
        <PracticeResultModal
          exam={practiceResultData.exam}
          submission={practiceResultData.submission}
          liveSubmissions={submissions.filter(s => s.examId === practiceResultData.exam.id && s.isLive)}
          onClose={() => setPracticeResultData(null)}
          onRetake={() => {
            const reExam = practiceResultData.exam;
            setPracticeResultData(null);
            setActiveExamRunning({ exam: reExam, isLive: false });
          }}
        />
      )}

      {/* RE-LIVE EXAM MODAL (Requirement 3: Make it Live Exam Feature) */}
      {reLiveTargetExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 dark:bg-black/85 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg bg-white dark:bg-[#111420] border border-slate-200/90 dark:border-white/[0.1] rounded-3xl shadow-2xl overflow-hidden my-auto text-slate-900 dark:text-white">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#161a29] flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
                <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400">
                  <Radio className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    আপনি কি এই এক্সামটি আবার লাইভ করতে চান?
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">
                    {reLiveTargetExam.title}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReLiveTargetExam(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Leaderboard Notice Banner (Requirement 3.3) */}
              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-800 dark:text-rose-200 leading-relaxed space-y-1">
                <div className="font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>লিডারবোর্ড তথ্য (Merged Leaderboard Synchronization)</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-[11px]">
                  প্রথমবার লাইভ এক্সাম থেকে যে লিডারবোর্ড তৈরি হয়েছিল এবং পুনরায় নতুন সময়ে লাইভ করার পর যারা এক্সাম দেবে—তাদের সবার প্রাপ্ত নম্বর ও র‍্যাংক স্বয়ংক্রিয়ভাবে আগের মূল লিডারবোর্ডের সাথেই সিঙ্ক্রোনাইজ হয়ে যুক্ত থাকবে। কোনো পৃথক লিডারবোর্ড তৈরি হবে না।
                </p>
              </div>

              {/* Schedule Inputs */}
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    ১. নতুন শুরুর সময় (Live Start Time)
                  </label>
                  <input
                    type="datetime-local"
                    value={reLiveStartTime}
                    onChange={(e) => setReLiveStartTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-white/[0.1] bg-slate-50/60 dark:bg-[#181d2c] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    ২. নতুন সমাপ্তির সময় (Live End Time)
                  </label>
                  <input
                    type="datetime-local"
                    value={reLiveEndTime}
                    onChange={(e) => setReLiveEndTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-[#181d2c] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    ৩. ফলাফল প্রকাশের সময় (Result Publish Time)
                  </label>
                  <input
                    type="datetime-local"
                    value={reLivePublishTime}
                    onChange={(e) => setReLivePublishTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-[#181d2c] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setReLiveTargetExam(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-white/[0.1] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  disabled={isReLiving}
                  onClick={handleConfirmReLive}
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isReLiving ? (
                    <span>লাইভ করা হচ্ছে...</span>
                  ) : (
                    <>
                      <Radio className="w-3.5 h-3.5 animate-pulse" />
                      <span>হ্যাঁ, কনফার্ম করে লাইভ করুন</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
