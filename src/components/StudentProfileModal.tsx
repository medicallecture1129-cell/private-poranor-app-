import React from 'react';
import { StudentUser, Course, ExamSubmission } from '../types';
import { useAuth } from '../context/AuthContext';
import { 
  X, 
  Mail, 
  Phone, 
  GraduationCap, 
  Award, 
  CheckCircle2
} from 'lucide-react';

interface StudentProfileModalProps {
  student: Partial<StudentUser> & { name: string; college?: string; email?: string; mobile?: string };
  courses?: Course[];
  submissions?: ExamSubmission[];
  onClose: () => void;
}

export const StudentProfileModal: React.FC<StudentProfileModalProps> = ({
  student,
  courses = [],
  submissions = [],
  onClose
}) => {
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  // Handle hardware / browser back button to close modal
  React.useEffect(() => {
    const handlePopState = () => {
      onClose();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onClose]);

  // Submissions by this student
  const studentSubs = student.email 
    ? submissions.filter(s => s.studentEmail?.toLowerCase() === student.email?.toLowerCase())
    : [];

  // Enrolled course names
  const enrolledCoursesList = courses.filter(c => 
    (student.enrolledCourses && student.enrolledCourses.includes(c.id)) ||
    (student.email && c.allowedEmails?.some(e => e.toLowerCase() === student.email?.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header Banner */}
        <div 
          className="relative p-6 text-white text-center"
          style={{ background: 'linear-gradient(135deg, var(--theme-primary) 0%, #1e1b4b 100%)' }}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-black/20 hover:bg-black/40 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md text-white border border-white/20 font-black text-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            {student.name ? student.name.slice(0, 1).toUpperCase() : 'S'}
          </div>

          <h3 className="text-xl font-bold tracking-tight">
            {student.name}
          </h3>
          <p className="text-xs text-blue-200 mt-1">
            {student.college || 'Institution N/A'}
          </p>

          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-[11px] font-semibold backdrop-blur-xs">
            <GraduationCap className="w-3.5 h-3.5 text-blue-200" />
            <span>Student Profile {isAdmin ? '• Admin View' : '• Public Profile'}</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 text-xs sm:text-sm">
          {isAdmin ? (
            /* ADMIN VIEW: Full Details */
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-2.5">
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Email Address</span>
                    <span className="font-semibold text-slate-900 dark:text-white break-all">{student.email || 'N/A'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Phone Number</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{student.mobile || 'N/A'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <Award className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Exams Completed</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{studentSubs.length} completed exam{studentSubs.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>

              {/* Enrolled Courses */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block">
                  Enrolled Courses ({enrolledCoursesList.length}):
                </span>
                {enrolledCoursesList.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No courses enrolled yet</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {enrolledCoursesList.map(c => (
                      <span key={c.id} className="px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold text-xs border border-blue-200 dark:border-blue-900">
                        {c.name} ({c.batch})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* STUDENT VIEW: Public Card Only */
            <div className="space-y-4 text-center">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  This is a classmate's public profile. Personal contact information (phone and email) is kept private.
                </p>
                <div className="pt-2 flex items-center justify-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Verified Student Account</span>
                </div>
              </div>

              {enrolledCoursesList.length > 0 && (
                <div className="text-left space-y-1.5">
                  <span className="text-xs font-bold text-slate-500 block">Common Courses:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {enrolledCoursesList.map(c => (
                      <span key={c.id} className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium">
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
