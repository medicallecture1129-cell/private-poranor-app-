import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Course, StudentUser } from '../../types';
import { createCourse, deleteCourse } from '../../services/db';
import { BookOpen, Plus, Users, Trash2, ArrowRight } from 'lucide-react';

interface CourseListProps {
  courses: Course[];
  students: StudentUser[];
  onSelectCourse: (course: Course) => void;
}

export const CourseList: React.FC<CourseListProps> = ({ courses, students, onSelectCourse }) => {
  const { user, role } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const [showAddModal, setShowAddModal] = useState(false);
  const [courseName, setCourseName] = useState('');
  const [batchName, setBatchName] = useState('HSC 2025');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If student: only show courses they are enrolled in
  const visibleCourses = role === 'admin'
    ? courses
    : courses.filter(c => {
        const cleanEmail = user?.email?.toLowerCase();
        return (
          (cleanEmail && c.allowedEmails?.some(e => e.toLowerCase() === cleanEmail)) ||
          (user?.enrolledCourses && user.enrolledCourses.includes(c.id))
        );
      });

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = courseName.trim();
    const batch = batchName.trim();
    if (!name || !batch) return;

    // Immediately close modal and clear inputs
    setShowAddModal(false);
    setCourseName('');

    setIsSubmitting(true);
    try {
      await createCourse(name, batch);
      toastSuccess(`Course "${name}" created successfully.`);
    } catch (err: unknown) {
      console.error('Failed to create course:', err);
      toastError(err instanceof Error ? err.message : 'Failed to create course');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCourse = async (course: Course, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete course "${course.name}" and all its contents?`)) {
      try {
        await deleteCourse(course.id);
        toastSuccess(`Course "${course.name}" deleted.`);
      } catch (err: unknown) {
        toastError(err instanceof Error ? err.message : 'Failed to delete course');
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-24 space-y-6">
      {/* Title & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Available Courses
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {role === 'admin' 
              ? 'Manage educational courses, folders, materials, student enrollment, and discussions' 
              : 'Access your enrolled batches, video lectures, notes, and discussion group'}
          </p>
        </div>

        {role === 'admin' && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm shadow-sm transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Course</span>
          </button>
        )}
      </div>

      {/* Courses Grid */}
      {visibleCourses.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-400">
          <BookOpen className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
          <h4 className="font-semibold text-slate-700 dark:text-slate-300 text-base">
            No courses found
          </h4>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {role === 'admin'
              ? 'Click "Add Course" above to create your first coaching course.'
              : 'You have not been assigned to any course yet. Contact your teacher.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleCourses.map((course) => {
            const enrolledCount = course.allowedEmails?.length || 0;
            return (
              <div
                key={course.id}
                onClick={() => onSelectCourse(course)}
                className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500/60 dark:hover:border-blue-500/60 rounded-2xl p-5 shadow-xs hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <span className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold border border-blue-200 dark:border-blue-900/50">
                      {course.batch}
                    </span>

                    {role === 'admin' && (
                      <button
                        onClick={(e) => handleDeleteCourse(course, e)}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer opacity-90 sm:opacity-0 sm:group-hover:opacity-100"
                        title="Delete Course"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                    {course.name}
                  </h3>
                </div>

                <div className="pt-5 mt-5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span>{enrolledCount} Total Member{enrolledCount === 1 ? '' : 's'}</span>
                  </div>

                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform">
                    Enter <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE COURSE MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Create New Course
            </h3>
            <form onSubmit={handleCreateCourse} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Course Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="e.g. HSC Physics 1st Paper"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  HSC / SSC Batch
                </label>
                <input
                  type="text"
                  required
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="e.g. HSC 2025 or SSC 2026"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Creating...' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
