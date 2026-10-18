export type UserRole = 'admin' | 'student';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  password?: string;
  canManageAdmins?: boolean; // If true, can remove other admins
  createdAt: number;
}

export interface StudentUser {
  id: string;
  name: string;
  email: string;
  college: string;
  mobile: string;
  password?: string;
  enrolledCourses: string[]; // Course IDs
  createdAt: number;
}

export interface Course {
  id: string;
  name: string;
  batch: string; // e.g. "HSC 2025", "SSC 2026"
  createdAt: number;
  allowedEmails: string[]; // Teacher pre-added emails
}

export interface Folder {
  id: string;
  courseId: string;
  parentId?: string | null; // for nested folders
  name: string;
  createdAt: number;
}

export interface CourseClass {
  id: string;
  courseId: string;
  folderId?: string | null; // can belong to root or a folder
  title: string;
  instructor?: string;
  createdAt: number;
}

export type PdfCategory = 'lecture' | 'practice' | 'solution' | 'marked_book';

export interface MediaResource {
  id: string;
  courseId: string;
  folderId?: string | null;
  classId?: string | null; // assigned to a class
  title: string;
  type: 'video' | 'pdf';
  category?: PdfCategory;
  instructor?: string;
  url: string; // YouTube link or Google Drive/PDF link
  createdAt: number;
}

export interface DiscussionMessage {
  id: string;
  courseId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  senderCollege?: string;
  text?: string;
  imageUrl?: string;
  timestamp: number; // millisecond timestamp
}

export interface MCQOption {
  id: string; // 'A', 'B', 'C', 'D'
  text: string;
}

export interface Question {
  id: string;
  text: string;
  options: MCQOption[];
  correctOption: string; // 'A', 'B', 'C', or 'D'
  explanation?: string;
}

export interface Exam {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  durationMinutes: number;
  totalMarks: number;
  totalQuestions: number;
  passMark: number;
  negativeMarkPercentage: number; // e.g. 0.25 (25%) or 0
  instructions?: string;
  startTime: number; // ms timestamp
  endTime: number; // ms timestamp
  resultPublishTime: number; // ms timestamp
  questions: Question[];
  createdAt: number;
  isActive?: boolean; // Admin can toggle exam ON / OFF (Active / Inactive)
  isPractice?: boolean; // True if converted to practice or explicitly in practice section
}

export interface StudentAnswer {
  questionId: string;
  selectedOption: string | null; // null if skipped
  isCorrect: boolean;
  marksEarned: number;
}

export interface ExamSubmission {
  id: string;
  examId: string;
  courseId: string;
  studentId: string;
  studentEmail: string;
  studentName: string;
  studentCollege: string;
  isLive: boolean; // true if submitted during live window, false if practice
  startTime: number;
  submittedAt: number;
  durationSeconds: number; // actual time taken
  totalMarks: number;
  marksObtained: number;
  percentage: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  answers: StudentAnswer[];
}

export interface LeaderboardRow {
  rank: number;
  submissionId: string;
  studentId: string;
  studentName: string;
  studentCollege: string;
  studentEmail?: string;
  marksObtained: number;
  percentage: number;
  durationSeconds: number;
  durationFormatted: string;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  submittedAt: number; // Only for admin
}

export interface PortalSettings {
  portalName: string;
  tagline: string;
  theme: 'dark' | 'light';
  announcementText: string;
  showAnnouncement: boolean;
  contactNumber?: string;
  supportEmail?: string;
  allowSelfRegistration?: boolean;
  updatedAt?: number;
}
