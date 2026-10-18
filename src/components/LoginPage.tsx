import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Course } from '../types';
import { Eye, EyeOff, Lock, Mail, User, School, Phone, AlertCircle, CheckCircle2, ShieldCheck, GraduationCap } from 'lucide-react';

interface LoginPageProps {
  courses: Course[];
}

export const LoginPage: React.FC<LoginPageProps> = ({ courses }) => {
  const { loginTeacher, checkStudentEmail, loginExistingStudent, registerNewStudent } = useAuth();

  const [activeTab, setActiveTab] = useState<'teacher' | 'student'>('teacher');

  // Teacher Form State
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherRemember, setTeacherRemember] = useState(true);
  const [showTeacherPassword, setShowTeacherPassword] = useState(false);
  const [teacherError, setTeacherError] = useState<string | null>(null);
  const [teacherLoading, setTeacherLoading] = useState(false);

  // Student Form State
  const [studentEmail, setStudentEmail] = useState('');
  const [studentStep, setStudentStep] = useState<'email' | 'existing_password' | 'new_profile'>('email');
  const [studentPassword, setStudentPassword] = useState('');
  const [showStudentPassword, setShowStudentPassword] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [studentCollege, setStudentCollege] = useState('');
  const [studentMobile, setStudentMobile] = useState('');
  const [studentRemember, setStudentRemember] = useState(true);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [studentSuccess, setStudentSuccess] = useState<string | null>(null);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<string[]>([]);
  const [studentLoading, setStudentLoading] = useState(false);

  // Handle Teacher Login
  const handleTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTeacherError(null);
    setTeacherLoading(true);

    const res = await loginTeacher(teacherEmail, teacherPassword, teacherRemember);
    if (!res.success) {
      setTeacherError(res.message || 'Login failed. Please check credentials.');
    }
    setTeacherLoading(false);
  };

  // Handle Student Step 1: Email check
  const handleStudentEmailCheck = (e: React.FormEvent) => {
    e.preventDefault();
    setStudentError(null);
    setStudentSuccess(null);

    const emailTrimmed = studentEmail.trim().toLowerCase();
    if (!emailTrimmed) {
      setStudentError('Please enter a valid email address.');
      return;
    }

    const { isEnrolled, studentProfile, enrolledCourseIds: matchingCourses } = checkStudentEmail(emailTrimmed, courses);

    if (!isEnrolled) {
      setStudentError('You have not been added to any course yet. Please contact your teacher.');
      return;
    }

    setEnrolledCourseIds(matchingCourses);

    if (studentProfile && studentProfile.password) {
      // Existing student with password
      setStudentStep('existing_password');
      setStudentSuccess(`Welcome back, ${studentProfile.name}! Please enter your password.`);
    } else {
      // First time registration
      setStudentStep('new_profile');
      if (studentProfile) {
        setStudentName(studentProfile.name || '');
        setStudentCollege(studentProfile.college || '');
        setStudentMobile(studentProfile.mobile || '');
      }
      setStudentSuccess('Email verified. Complete your profile details to access your courses.');
    }
  };

  // Handle Existing Student Login
  const handleStudentPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudentError(null);
    setStudentLoading(true);

    const res = await loginExistingStudent(studentEmail, studentPassword, studentRemember);
    if (!res.success) {
      setStudentError(res.message || 'Incorrect password.');
    }
    setStudentLoading(false);
  };

  // Handle New Student Registration
  const handleStudentRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudentError(null);
    setStudentLoading(true);

    if (!studentName.trim() || !studentCollege.trim() || !studentMobile.trim() || !studentPassword.trim()) {
      setStudentError('Please fill in all required fields.');
      setStudentLoading(false);
      return;
    }

    const res = await registerNewStudent({
      email: studentEmail,
      name: studentName,
      college: studentCollege,
      mobile: studentMobile,
      pass: studentPassword,
      enrolledCourseIds,
      remember: studentRemember
    });

    if (!res.success) {
      setStudentError(res.message || 'Registration failed.');
    }
    setStudentLoading(false);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-slate-50 dark:bg-black transition-colors">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 sm:p-8">
        {/* Portal Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white shadow-lg mb-3">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Exam Portal
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Sign in to access your courses, live exams, and results
          </p>
        </div>

        {/* Tab Selection */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => {
              setActiveTab('teacher');
              setTeacherError(null);
            }}
            className={`py-2.5 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === 'teacher'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Teacher Login
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('student');
              setStudentError(null);
            }}
            className={`py-2.5 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === 'student'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Student Login
          </button>
        </div>

        {/* TEACHER LOGIN FORM */}
        {activeTab === 'teacher' && (
          <form onSubmit={handleTeacherSubmit} className="space-y-4">
            {teacherError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-2.5 text-red-700 dark:text-red-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{teacherError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={teacherEmail}
                  onChange={(e) => setTeacherEmail(e.target.value)}
                  placeholder="teacher@examportal.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showTeacherPassword ? 'text' : 'password'}
                  required
                  value={teacherPassword}
                  onChange={(e) => setTeacherPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowTeacherPassword(!showTeacherPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                >
                  {showTeacherPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={teacherRemember}
                  onChange={(e) => setTeacherRemember(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                />
                <span>Remember me</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={teacherLoading}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {teacherLoading ? 'Authenticating...' : 'Sign In as Teacher'}
            </button>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Default Teacher Credential:</span>
              <br />Email: <code className="text-blue-600 dark:text-blue-400 font-mono">admin@examportal.com</code> | Password: <code className="text-blue-600 dark:text-blue-400 font-mono">admin</code>
            </div>
          </form>
        )}

        {/* STUDENT LOGIN FLOW */}
        {activeTab === 'student' && (
          <div className="space-y-4">
            {studentError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start gap-2.5 text-red-700 dark:text-red-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{studentError}</span>
              </div>
            )}

            {studentSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 flex items-start gap-2.5 text-emerald-700 dark:text-emerald-300 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{studentSuccess}</span>
              </div>
            )}

            {/* STEP 1: Email Verification */}
            {studentStep === 'email' && (
              <form onSubmit={handleStudentEmailCheck} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Student Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={studentEmail}
                      onChange={(e) => setStudentEmail(e.target.value)}
                      placeholder="student@example.com"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                    Your email must be enrolled in a course by your teacher.
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors shadow-sm cursor-pointer"
                >
                  Verify Email & Continue
                </button>
              </form>
            )}

            {/* STEP 2A: Returning Student Password */}
            {studentStep === 'existing_password' && (
              <form onSubmit={handleStudentPasswordLogin} className="space-y-4">
                <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between">
                  <span>Enrolled Email: <strong>{studentEmail}</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentStep('email');
                      setStudentError(null);
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Change
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showStudentPassword ? 'text' : 'password'}
                      required
                      value={studentPassword}
                      onChange={(e) => setStudentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStudentPassword(!showStudentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                    >
                      {showStudentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={studentRemember}
                      onChange={(e) => setStudentRemember(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Remember me</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={studentLoading}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {studentLoading ? 'Signing In...' : 'Sign In'}
                </button>
              </form>
            )}

            {/* STEP 2B: First Time Registration */}
            {studentStep === 'new_profile' && (
              <form onSubmit={handleStudentRegister} className="space-y-3.5">
                <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-800">
                  <span>Email: <strong>{studentEmail}</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentStep('email');
                      setStudentError(null);
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Change
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Student Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      placeholder="e.g. Rafiqul Islam"
                      className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    College / Institution
                  </label>
                  <div className="relative">
                    <School className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={studentCollege}
                      onChange={(e) => setStudentCollege(e.target.value)}
                      placeholder="e.g. Dhaka College"
                      className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Mobile Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      required
                      value={studentMobile}
                      onChange={(e) => setStudentMobile(e.target.value)}
                      placeholder="e.g. 01700000000"
                      className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Set Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showStudentPassword ? 'text' : 'password'}
                      required
                      value={studentPassword}
                      onChange={(e) => setStudentPassword(e.target.value)}
                      placeholder="Create secure password"
                      className="w-full pl-10 pr-11 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowStudentPassword(!showStudentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                    >
                      {showStudentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={studentRemember}
                      onChange={(e) => setStudentRemember(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Remember me</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={studentLoading}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {studentLoading ? 'Creating Account...' : 'Complete Profile & Enter'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
