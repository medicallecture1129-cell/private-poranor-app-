import React, { createContext, useContext, useEffect, useState } from 'react';
import { AdminUser, StudentUser, UserRole, Course } from '../types';
import { subscribeAdmins, subscribeStudents, registerOrUpdateStudent } from '../services/db';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  college?: string;
  mobile?: string;
  enrolledCourses?: string[];
}

interface AuthContextType {
  user: AuthUser | null;
  role: UserRole | null;
  isLoading: boolean;
  admins: AdminUser[];
  students: StudentUser[];
  loginTeacher: (email: string, pass: string, remember: boolean) => Promise<{ success: boolean; message?: string }>;
  checkStudentEmail: (email: string, courses: Course[]) => { isEnrolled: boolean; studentProfile?: StudentUser; enrolledCourseIds: string[] };
  loginExistingStudent: (email: string, pass: string, remember: boolean) => Promise<{ success: boolean; message?: string }>;
  registerNewStudent: (data: { email: string; name: string; college: string; mobile: string; pass: string; enrolledCourseIds: string[]; remember: boolean }) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  refreshUserProfile: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = 'examportal_auth_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [students, setStudents] = useState<StudentUser[]>([]);

  // Subscribe to admins and students real-time
  useEffect(() => {
    const unsubAdmins = subscribeAdmins((adminList) => {
      setAdmins(adminList);
    });
    const unsubStudents = subscribeStudents((studentList) => {
      setStudents(studentList);
    });

    // Check saved session
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setUser(parsed);
      }
    } catch {
      // Ignore if storage is inaccessible
    }
    setIsLoading(false);

    return () => {
      unsubAdmins();
      unsubStudents();
    };
  }, []);

  // Synchronize active session user data with live Firestore admins/students data in real-time
  useEffect(() => {
    if (user) {
      if (user.role === 'student') {
        const liveStudent = students.find(s => s.id === user.id || s.email.toLowerCase() === user.email.toLowerCase());
        if (liveStudent) {
          setUser(prev => prev ? {
            ...prev,
            name: liveStudent.name,
            college: liveStudent.college,
            mobile: liveStudent.mobile,
            enrolledCourses: liveStudent.enrolledCourses || []
          } : null);
        }
      } else if (user.role === 'admin') {
        const liveAdmin = admins.find(a => a.id === user.id || a.email.toLowerCase() === user.email.toLowerCase());
        if (liveAdmin) {
          setUser(prev => prev ? {
            ...prev,
            name: liveAdmin.name
          } : null);
        }
      }
    }
  }, [students, admins]);

  const loginTeacher = async (email: string, pass: string, remember: boolean) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = pass.trim();

    // Check against admins list
    const foundAdmin = admins.find(a => a.email.toLowerCase() === cleanEmail);
    if (!foundAdmin) {
      // Also allow root admin fallback
      if (cleanEmail === 'admin@examportal.com' && (cleanPass === 'admin' || cleanPass === 'admin123')) {
        const authUser: AuthUser = {
          id: 'admin_primary',
          name: 'Head Teacher / Admin',
          email: 'admin@examportal.com',
          role: 'admin'
        };
        setUser(authUser);
        if (remember) {
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser));
        } else {
          sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser));
        }
        return { success: true };
      }
      return { success: false, message: 'Invalid teacher email or not registered as admin.' };
    }

    if (foundAdmin.password !== cleanPass) {
      return { success: false, message: 'Incorrect password.' };
    }

    const authUser: AuthUser = {
      id: foundAdmin.id,
      name: foundAdmin.name,
      email: foundAdmin.email,
      role: 'admin'
    };

    setUser(authUser);
    if (remember) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser));
    } else {
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser));
    }
    return { success: true };
  };

  const checkStudentEmail = (email: string, courses: Course[]) => {
    const cleanEmail = email.trim().toLowerCase();
    const studentProfile = students.find(s => s.email.toLowerCase() === cleanEmail);

    // Check if any course includes this email in allowedEmails OR if studentProfile has it in enrolledCourses
    const enrolledCourses = courses.filter(c => 
      (c.allowedEmails && c.allowedEmails.map(e => e.toLowerCase()).includes(cleanEmail)) ||
      (studentProfile?.enrolledCourses && studentProfile.enrolledCourses.includes(c.id))
    );
    let enrolledCourseIds = enrolledCourses.map(c => c.id);
    if (enrolledCourseIds.length === 0 && studentProfile?.enrolledCourses?.length) {
      enrolledCourseIds = studentProfile.enrolledCourses;
    }

    const isEnrolled = enrolledCourseIds.length > 0 || studentProfile !== undefined;

    return {
      isEnrolled,
      studentProfile,
      enrolledCourseIds
    };
  };

  const loginExistingStudent = async (email: string, pass: string, remember: boolean) => {
    const cleanEmail = email.trim().toLowerCase();
    const student = students.find(s => s.email.toLowerCase() === cleanEmail);
    if (!student) {
      return { success: false, message: 'Student account not found.' };
    }

    if (student.password && student.password !== pass.trim()) {
      return { success: false, message: 'Incorrect password.' };
    }

    const authUser: AuthUser = {
      id: student.id,
      name: student.name,
      email: student.email,
      role: 'student',
      college: student.college,
      mobile: student.mobile,
      enrolledCourses: student.enrolledCourses || []
    };

    setUser(authUser);
    if (remember) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser));
    } else {
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser));
    }
    return { success: true };
  };

  const registerNewStudent = async (data: {
    email: string;
    name: string;
    college: string;
    mobile: string;
    pass: string;
    enrolledCourseIds: string[];
    remember: boolean;
  }) => {
    try {
      const cleanEmail = data.email.trim().toLowerCase();
      const existing = students.find(s => s.email.toLowerCase() === cleanEmail);

      const created = await registerOrUpdateStudent({
        email: cleanEmail,
        name: data.name.trim(),
        college: data.college.trim(),
        mobile: data.mobile.trim(),
        password: data.pass.trim(),
        enrolledCourses: data.enrolledCourseIds
      }, existing?.id);

      const authUser: AuthUser = {
        id: created.id,
        name: created.name,
        email: created.email,
        role: 'student',
        college: created.college,
        mobile: created.mobile,
        enrolledCourses: created.enrolledCourses
      };

      setUser(authUser);
      if (data.remember) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser));
      } else {
        sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser));
      }
      return { success: true };
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Registration failed.' };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const refreshUserProfile = () => {
    if (user && user.role === 'student') {
      const updated = students.find(s => s.id === user.id);
      if (updated) {
        setUser({
          id: updated.id,
          name: updated.name,
          email: updated.email,
          role: 'student',
          college: updated.college,
          mobile: updated.mobile,
          enrolledCourses: updated.enrolledCourses
        });
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        isLoading,
        admins,
        students,
        loginTeacher,
        checkStudentEmail,
        loginExistingStudent,
        registerNewStudent,
        logout,
        refreshUserProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
