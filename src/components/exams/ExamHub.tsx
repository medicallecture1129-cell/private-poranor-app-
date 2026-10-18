import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Exam, Course, ExamSubmission } from '../../types';
import { CreateExamModal } from './CreateExamModal';
import { ExamRunner } from './ExamRunner';
import { PracticeResultModal } from './PracticeResultModal';
import { deleteExam } from '../../services/db';
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
  Filter 
} from 'lucide-react';

interface ExamHubProps {
  exams: Exam[];
  courses: Course[];
  submissions: ExamSubmission[];
}

export const ExamHub: React.FC<ExamHubProps> = ({ exams, courses, submissions }) => {
  const { user, role } = useAuth();

  const [activeSegment, setActiveSegment] = useState<'live' | 'practice'>('live');
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeExamRunning, setActiveExamRunning] = useState<{ exam: Exam; isLive: boolean } | null>(null);
  const [practiceResultData, setPracticeResultData] = useState<{ exam: Exam; submission: ExamSubmission } | null>(null);

  const currentTime = Date.now();

  // If student: only show exams belonging to courses they are enrolled in
  const studentEnrolledCourseIds = role === 'admin'
    ? courses.map(c => c.id)
    : courses
        .filter(c => 
          (user?.email && c.allowedEmails?.some(e => e.toLowerCase() === user.email.toLowerCase())) ||
          (user?.enrolledCourses && user.enrolledCourses.includes(c.id))
        )
        .map(c => c.id);

  const availableExams = exams.filter(e => studentEnrolledCourseIds.includes(e.courseId));

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
                        e.courseName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCourse && matchSearch;
  });

  const handleDeleteExam = async (examId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this exam?')) {
      await deleteExam(examId);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Examinations
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Official Live Exams with Scheduled Result Publishing & Unlimited Practice Tests
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

      {/* Segment Switcher: Live Exam vs Practice Exam */}
      <div className="grid grid-cols-2 p-1.5 bg-slate-200/60 dark:bg-slate-800/80 rounded-2xl max-w-md">
        <button
          onClick={() => setActiveSegment('live')}
          className={`py-2.5 text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeSegment === 'live'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Radio className={`w-4 h-4 ${activeSegment === 'live' ? 'text-rose-500 animate-pulse' : ''}`} />
          <span>Live Exams ({liveExams.length})</span>
        </button>

        <button
          onClick={() => setActiveSegment('practice')}
          className={`py-2.5 text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeSegment === 'practice'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <RotateCcw className="w-4 h-4 text-blue-500" />
          <span>Practice Exams ({practiceExams.length})</span>
        </button>
      </div>

      {/* Filters Bar: Course Selector + Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Course Dropdown */}
          <div className="relative flex-1 sm:w-64">
            <Filter className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <select
              value={selectedCourseFilter}
              onChange={(e) => setSelectedCourseFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Enrolled Courses</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.batch})</option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search exams by name..."
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
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
            // Live Status checks
            const hasStarted = currentTime >= exam.startTime;
            const hasEnded = currentTime > exam.endTime;
            const isLiveNow = hasStarted && !hasEnded;

            // Student submission check
            const studentLiveSubmission = submissions.find(
              s => s.examId === exam.id && s.studentId === user?.id && s.isLive
            );
            const studentPracticeSubmissions = submissions.filter(
              s => s.examId === exam.id && s.studentId === user?.id && !s.isLive
            );

            return (
              <div
                key={exam.id}
                className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500/60 dark:hover:border-blue-500/60 rounded-2xl p-5 shadow-xs hover:shadow-lg transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Badge & Admin Delete */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 truncate max-w-[200px]">
                      {exam.courseName}
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
                        <span>Live Window: {new Date(exam.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(exam.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                        <Award className="w-3.5 h-3.5" />
                        <span>Results Publish: {new Date(exam.resultPublishTime).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
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

                {/* Actions */}
                <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
                  {activeSegment === 'live' ? (
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
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE EXAM MODAL */}
      {showCreateModal && (
        <CreateExamModal
          courses={courses}
          onClose={() => setShowCreateModal(false)}
          onExamCreated={() => {}}
        />
      )}

      {/* RUNNER MODAL */}
      {activeExamRunning && (
        <ExamRunner
          exam={activeExamRunning.exam}
          isLive={activeExamRunning.isLive}
          onClose={() => setActiveExamRunning(null)}
          onFinished={(submission) => {
            const currentExam = activeExamRunning.exam;
            setActiveExamRunning(null);
            if (!activeExamRunning.isLive) {
              setPracticeResultData({ exam: currentExam, submission });
            }
          }}
        />
      )}

      {/* PRACTICE RESULT MODAL WITH PREDICTIVE RANKING */}
      {practiceResultData && (
        <PracticeResultModal
          exam={practiceResultData.exam}
          submission={practiceResultData.submission}
          liveSubmissions={submissions.filter(s => s.examId === practiceResultData.exam.id && s.isLive)}
          onClose={() => setPracticeResultData(null)}
          onRetake={() => {
            const examToRetake = practiceResultData.exam;
            setPracticeResultData(null);
            setActiveExamRunning({ exam: examToRetake, isLive: false });
          }}
        />
      )}
    </div>
  );
};
