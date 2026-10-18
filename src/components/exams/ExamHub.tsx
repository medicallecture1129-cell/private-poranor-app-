import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Exam, Course, ExamSubmission } from '../../types';
import { CreateExamModal } from './CreateExamModal';
import { EditExamModal } from './EditExamModal';
import { ExamRunner } from './ExamRunner';
import { PracticeResultModal } from './PracticeResultModal';
import { deleteExam, updateExam } from '../../services/db';
import { useToast } from '../../context/ToastContext';
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
  ShieldCheck,
  CheckCircle
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

  // Segmentation Logic:
  // Live Exams: endTime > currentTime
  // Practice Exams: endTime <= currentTime OR any exam attempted as practice
  const liveExams = availableExams.filter(e => e.endTime > currentTime);
  const practiceExams = availableExams.filter(e => e.endTime <= currentTime);

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

  const handleToggleExamActive = async (exam: Exam, e: React.MouseEvent) => {
    e.stopPropagation();
    const newActive = exam.isActive === false ? true : false;
    try {
      await updateExam(exam.id, { isActive: newActive });
      toastSuccess(`Exam is now ${newActive ? 'Active (ON)' : 'Paused (OFF)'}.`);
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Failed to toggle exam status');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <span>Examinations</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
              {availableExams.length} Total
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {role === 'admin'
              ? 'Admin Dashboard: Manage live schedules, pause/resume exams, and edit questions bank'
              : 'Official Live Exams with Scheduled Result Publishing & Unlimited Practice Tests'}
          </p>
        </div>

        {role === 'admin' && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm shadow-sm transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Exam</span>
          </button>
        )}
      </div>

      {/* Segment Selector & Course Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Live vs Practice Tabs */}
        <div className="inline-flex p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs self-start">
          <button
            onClick={() => setActiveSegment('live')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeSegment === 'live'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Live Exams</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              activeSegment === 'live' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'
            }`}>
              {liveExams.length}
            </span>
          </button>

          <button
            onClick={() => setActiveSegment('practice')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeSegment === 'practice'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Practice Tests</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              activeSegment === 'practice' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600'
            }`}>
              {practiceExams.length}
            </span>
          </button>
        </div>

        {/* Filter by Course */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={selectedCourseFilter}
            onChange={(e) => setSelectedCourseFilter(e.target.value)}
            className="px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">All Courses / Batches</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.batch})</option>
            ))}
          </select>
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
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 self-end sm:self-center">
          Showing {filteredExams.length} Exam{filteredExams.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Exams Grid */}
      {filteredExams.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          <Clock className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
          <h4 className="font-semibold text-slate-700 dark:text-slate-300 text-base">
            No {activeSegment === 'live' ? 'Live' : 'Practice'} Exams Found
          </h4>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {activeSegment === 'live'
              ? 'No live exams are currently active. When live exams expire, they shift automatically to Practice exams.'
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
                className={`group relative bg-white/95 dark:bg-slate-900/90 border card-theme-interactive rounded-2xl p-5 shadow-xs hover:shadow-xl flex flex-col justify-between overflow-hidden ${
                  !isExamActive 
                    ? 'border-amber-300/70 dark:border-amber-900/60 bg-amber-50/10' 
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="card-glow-line" />
                <div className="space-y-3">
                  {/* Top Badges & Status */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 truncate max-w-[170px]">
                      {exam.courseName}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {/* Active Status Badge */}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isExamActive 
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' 
                          : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                      }`}>
                        {isExamActive ? 'Live ON' : 'Paused OFF'}
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
                  <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100 dark:border-slate-800 text-center">
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
                        <Calendar className="w-3.5 h-3.5 text-blue-500" />
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
                <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
                  {role === 'admin' ? (
                    /* ADMIN CONTROLS: Toggle ON/OFF, Edit details & questions (Admin CANNOT take exams) */
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => handleToggleExamActive(exam, e)}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                          isExamActive
                            ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                        title={isExamActive ? 'Pause exam' : 'Resume exam'}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{isExamActive ? 'Pause Exam' : 'Make Active'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingExam(exam)}
                        className="py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                        title="Edit schedule and questions"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Manage / Edit</span>
                      </button>
                    </div>
                  ) : (
                    /* STUDENT CONTROLS: Start Live Exam or Practice */
                    !isExamActive ? (
                      <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-center text-xs text-amber-700 dark:text-amber-300 font-medium">
                        ⚠️ পরীক্ষা সাময়িকভাবে বন্ধ আছে (Paused by Admin)
                      </div>
                    ) : activeSegment === 'live' ? (
                      studentLiveSubmission ? (
                        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-center text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                          ✓ Submitted. Result will be published on schedule.
                        </div>
                      ) : isLiveNow ? (
                        <button
                          onClick={() => setActiveExamRunning({ exam, isLive: true })}
                          className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Start Live Exam Now</span>
                        </button>
                      ) : !hasStarted ? (
                        <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-center text-xs text-slate-500 font-medium">
                          Starts {new Date(exam.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      ) : (
                        <button
                          onClick={() => setActiveExamRunning({ exam, isLive: false })}
                          className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Take as Practice</span>
                        </button>
                      )
                    ) : (
                      <button
                        onClick={() => setActiveExamRunning({ exam, isLive: false })}
                        className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
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
    </div>
  );
};
