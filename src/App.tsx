import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { Navbar } from './components/Navbar';
import { BottomNav, NavTab } from './components/BottomNav';
import { LoginPage } from './components/LoginPage';
import { CourseList } from './components/courses/CourseList';
import { CourseView } from './components/courses/CourseView';
import { ExamHub } from './components/exams/ExamHub';
import { ResultsView } from './components/results/ResultsView';
import { AdminManagement } from './components/admin/AdminManagement';
import { Course, Exam, ExamSubmission } from './types';
import { 
  subscribeCourses, 
  subscribeExams, 
  subscribeSubmissions
} from './services/db';

const MainApp: React.FC = () => {
  const { user, role, students, isLoading } = useAuth();
  const { error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState<NavTab>('courses');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  // Real-time Firestore state
  const [courses, setCourses] = useState<Course[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [submissions, setSubmissions] = useState<ExamSubmission[]>([]);

  // Real-time Firestore subscriptions (100% cloud-synced, NO mock data)
  useEffect(() => {
    const unsubCourses = subscribeCourses(
      (courseList) => {
        setCourses(courseList);
      },
      (err) => {
        toastError('Failed to sync courses from Firestore: ' + err.message);
      }
    );

    const unsubExams = subscribeExams(
      (examList) => {
        setExams(examList);
      },
      (err) => {
        toastError('Failed to sync exams from Firestore: ' + err.message);
      }
    );

    const unsubSubmissions = subscribeSubmissions(
      (subList) => {
        setSubmissions(subList);
      },
      (err) => {
        toastError('Failed to sync submissions from Firestore: ' + err.message);
      }
    );

    return () => {
      unsubCourses();
      unsubExams();
      unsubSubmissions();
    };
  }, [toastError]);

  // Update selectedCourse if updated in real-time
  useEffect(() => {
    if (selectedCourse) {
      const updated = courses.find(c => c.id === selectedCourse.id);
      if (updated) {
        setSelectedCourse(updated);
      }
    }
  }, [courses]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-black text-slate-500">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold tracking-wide">Connecting to Cloud Firestore...</span>
        </div>
      </div>
    );
  }

  // If not logged in, display Login Page
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-black text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
        <Navbar />
        <main className="flex-1">
          <LoginPage courses={courses} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      <Navbar />

      <main className="flex-1">
        {/* TAB 1: COURSES */}
        {activeTab === 'courses' && (
          selectedCourse ? (
            <CourseView
              course={selectedCourse}
              students={students}
              onBack={() => setSelectedCourse(null)}
            />
          ) : (
            <CourseList
              courses={courses}
              students={students}
              onSelectCourse={(course) => setSelectedCourse(course)}
            />
          )
        )}

        {/* TAB 2: EXAMS */}
        {activeTab === 'exams' && (
          <ExamHub
            exams={exams}
            courses={courses}
            submissions={submissions}
          />
        )}

        {/* TAB 3: RESULTS & LEADERBOARDS */}
        {activeTab === 'results' && (
          <ResultsView
            courses={courses}
            exams={exams}
            submissions={submissions}
            students={students}
          />
        )}

        {/* TAB 4: ADMIN MANAGEMENT (Only for Admin Role) */}
        {activeTab === 'admin' && role === 'admin' && (
          <AdminManagement />
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'courses') {
            setSelectedCourse(null);
          }
        }}
      />
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <MainApp />
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
