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
  rollNo?: string; // 6-digit roll number for OMR and student identity
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
  topic?: string; // e.g. "Physics", "গতিবিদ্যা", "Organic Chemistry", etc.
}

export interface OfflineExamSetQuestion {
  questionNumber: number; // 1 to N
  masterQuestionId: string;
  text: string;
  options: MCQOption[];
  correctOption: string;
  topic?: string;
}

export interface OfflineExamSet {
  setCode: string; // 'A', 'B', 'C', 'D'
  qrData: string; // QR code payload string
  questions: OfflineExamSetQuestion[];
  answerKey: Record<number, string>; // 1: 'A', 2: 'C', etc.
  createdAt: number;
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
  offlineSets?: OfflineExamSet[]; // Pre-generated scrambled sets for offline OMR print
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
  rollNo?: string;
  isLive: boolean; // true if submitted during live window, false if practice
  isOfflineOMR?: boolean; // true if evaluated from offline OMR sheet
  setCode?: string; // 'A', 'B', 'C', 'D' if taken via offline set
  tabSwitchCount?: number; // Anti-cheat warning / switch counter
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
  rollNo?: string;
  isOfflineOMR?: boolean;
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

export interface PresetTheme {
  id: string;
  name: string;
  bgColor: string;
  fgColor: string;
  primaryColor: string;
  createdAt: number;
  createdBy?: string;
}

export interface VideoNote {
  id: string;
  videoId: string;
  studentId: string;
  studentEmail?: string;
  studentName?: string;
  timestampSeconds: number;
  timestampFormatted: string;
  noteText: string;
  createdAt: number;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'class' | 'exam' | 'result' | 'omr' | 'system';
  linkTab?: string;
  createdAt: number;
  read?: boolean;
}
