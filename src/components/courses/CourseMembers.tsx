import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Course, StudentUser } from '../../types';
import { updateCourseAllowedEmails, registerOrUpdateStudent } from '../../services/db';
import { Search, UserPlus, Trash2, Mail, CheckCircle2, Clock, School, Phone, UserCheck, Shield, UserCircle } from 'lucide-react';
import { StudentProfileModal } from '../StudentProfileModal';

interface CourseMembersProps {
  course: Course;
  students: StudentUser[];
}

export const CourseMembers: React.FC<CourseMembersProps> = ({ course, students }) => {
  const { role } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectStudent, setInspectStudent] = useState<StudentUser | null>(null);
  
  // Admin add emails state
  const [emailInput, setEmailInput] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Filter students who are in this course:
  // Either their email is in course.allowedEmails AND they have registered, OR their enrolledCourses includes course.id
  const allowedEmailsList = course.allowedEmails || [];

  // Active registered members in this course
  const registeredMembers = students.filter(s => 
    (s.enrolledCourses && s.enrolledCourses.includes(course.id)) ||
    allowedEmailsList.map(e => e.toLowerCase()).includes(s.email.toLowerCase())
  );

  // Filtered members by search query
  const filteredMembers = registeredMembers.filter(m => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const matchName = m.name?.toLowerCase().includes(q);
    const matchCollege = m.college?.toLowerCase().includes(q);
    const matchEmail = role === 'admin' ? m.email?.toLowerCase().includes(q) : false;
    return matchName || matchCollege || matchEmail;
  });

  // Admin Add Emails Handler
  const handleAddEmails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || isUpdating) return;
    setIsUpdating(true);
    setNotice(null);

    // Extract emails (separated by commas, spaces, or newlines)
    const rawList = emailInput
      .split(/[\n,;\s]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => e.length > 3 && e.includes('@'));

    if (rawList.length === 0) {
      setNotice('Please enter valid email addresses.');
      setIsUpdating(false);
      return;
    }

    const merged = Array.from(new Set([...allowedEmailsList, ...rawList]));
    try {
      await updateCourseAllowedEmails(course.id, merged);
      setEmailInput('');
      setNotice(`Successfully added ${rawList.length} student email(s) to enrollment whitelist.`);
    } catch (err) {
      console.error(err);
      setNotice('Failed to update email whitelist.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Admin Remove Email / Student from Course
  const handleRemoveStudent = async (emailToRemove: string) => {
    if (!window.confirm(`Are you sure you want to remove ${emailToRemove} from this course?`)) return;

    try {
      const updatedList = allowedEmailsList.filter(e => e.toLowerCase() !== emailToRemove.toLowerCase());
      await updateCourseAllowedEmails(course.id, updatedList);

      // Also remove course.id from student's enrolledCourses if student exists
      const student = students.find(s => s.email.toLowerCase() === emailToRemove.toLowerCase());
      if (student && student.enrolledCourses) {
        const newCourses = student.enrolledCourses.filter(cid => cid !== course.id);
        await registerOrUpdateStudent({
          ...student,
          enrolledCourses: newCourses
        }, student.id);
      }
    } catch (err) {
      console.error('Failed to remove student:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={role === 'admin' ? "Search by Name, College, or Email..." : "Search members by Name or College..."}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 self-end sm:self-center">
          {filteredMembers.length} Active Member{filteredMembers.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Member Cards / Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h4 className="font-semibold text-sm text-slate-900 dark:text-white">
              Enrolled Course Members
            </h4>
          </div>
          <span className="text-xs text-slate-500">
            {registeredMembers.length} logged in
          </span>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <p className="text-sm">No members found matching your search.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filteredMembers.map((member) => (
              <div
                key={member.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center shrink-0">
                    {member.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h5 className="font-semibold text-sm text-slate-900 dark:text-white">
                        {member.name}
                      </h5>
                      <button
                        onClick={() => {
                          window.history.pushState({ modal: 'studentProfile' }, '');
                          setInspectStudent(member);
                        }}
                        className="p-1 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title={role === 'admin' ? "View Student Details" : "View Student Profile"}
                      >
                        <UserCircle className="w-3.5 h-3.5 text-blue-500" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      <span className="flex items-center gap-1">
                        <School className="w-3.5 h-3.5" />
                        {member.college}
                      </span>
                      {role === 'admin' && (
                        <>
                          <span className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5" />
                            {member.email}
                          </span>
                          {member.mobile && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5" />
                              {member.mobile}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {role === 'admin' && (
                  <button
                    onClick={() => handleRemoveStudent(member.email)}
                    className="self-end sm:self-center p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors cursor-pointer"
                    title="Remove member from this course"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ADMIN ONLY: Add & Manage Invited Emails Whitelist */}
      {role === 'admin' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h4 className="font-semibold text-sm text-slate-900 dark:text-white">
                Admin: Student Enrollment Whitelist
              </h4>
            </div>
            <button
              onClick={() => setBulkMode(!bulkMode)}
              className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline cursor-pointer"
            >
              {bulkMode ? 'Switch to Single Email' : 'Switch to Bulk Add'}
            </button>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Students can only register or access this course if their email is added here.
            Once they sign in with this email, their name and college appear in the Member list above.
          </p>

          {notice && (
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 text-xs text-blue-700 dark:text-blue-300">
              {notice}
            </div>
          )}

          <form onSubmit={handleAddEmails} className="space-y-3">
            {bulkMode ? (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Paste Multiple Emails (comma or line separated)
                </label>
                <textarea
                  rows={3}
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="student1@gmail.com, student2@gmail.com&#10;student3@gmail.com"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="student@example.com"
                  className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={!emailInput.trim() || isUpdating}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
                >
                  Add Email
                </button>
              </div>
            )}

            {bulkMode && (
              <button
                type="submit"
                disabled={!emailInput.trim() || isUpdating}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
              >
                {isUpdating ? 'Adding Emails...' : 'Add All Emails'}
              </button>
            )}
          </form>

          {/* Email Status Overview Table */}
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <h5 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              All Invited Emails & Login Status ({allowedEmailsList.length})
            </h5>
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {allowedEmailsList.map((email) => {
                const isLogged = registeredMembers.some(m => m.email.toLowerCase() === email.toLowerCase());
                return (
                  <div
                    key={email}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs"
                  >
                    <span className="font-mono text-slate-800 dark:text-slate-200 truncate mr-2">
                      {email}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {isLogged ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Logged In
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-500 dark:text-amber-400">
                          <Clock className="w-3.5 h-3.5" /> Pending First Login
                        </span>
                      )}
                      <button
                        onClick={() => handleRemoveStudent(email)}
                        className="text-slate-400 hover:text-red-500 p-1 cursor-pointer"
                        title="Remove from whitelist"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {allowedEmailsList.length === 0 && (
                <p className="text-xs text-slate-400 italic py-2">No student emails added yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STUDENT PROFILE MODAL */}
      {inspectStudent && (
        <StudentProfileModal
          student={inspectStudent}
          courses={[course]}
          onClose={() => setInspectStudent(null)}
        />
      )}
    </div>
  );
};
