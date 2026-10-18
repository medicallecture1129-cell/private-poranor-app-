import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs,
  onSnapshot, 
  query, 
  where, 
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { 
  AdminUser, 
  StudentUser, 
  Course, 
  Folder, 
  CourseClass,
  MediaResource, 
  DiscussionMessage, 
  Exam, 
  ExamSubmission,
  PortalSettings
} from '../types';

// Default Admin account for bootstrapping first login if database is fresh
export const DEFAULT_ADMIN: AdminUser = {
  id: 'admin_primary',
  name: 'Head Teacher / Admin',
  email: 'admin@examportal.com',
  password: 'admin',
  createdAt: 1700000000000
};

// Admin operations
export const subscribeAdmins = (
  callback: (admins: AdminUser[]) => void,
  onError?: (err: Error) => void
) => {
  const q = collection(db, 'admins');
  return onSnapshot(
    q, 
    (snapshot) => {
      const list: AdminUser[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as AdminUser);
      });

      if (list.length === 0) {
        setDoc(doc(db, 'admins', DEFAULT_ADMIN.id), DEFAULT_ADMIN).catch(() => {});
        callback([DEFAULT_ADMIN]);
      } else {
        callback(list);
      }
    }, 
    (error) => {
      console.error("Firestore admins listener error:", error);
      if (onError) onError(error);
      callback([DEFAULT_ADMIN]);
    }
  );
};

export const createAdminUser = async (admin: Omit<AdminUser, 'id' | 'createdAt'>): Promise<AdminUser> => {
  const newAdmin: AdminUser = {
    id: 'admin_' + Date.now(),
    ...admin,
    createdAt: Date.now()
  };
  await setDoc(doc(db, 'admins', newAdmin.id), newAdmin);
  return newAdmin;
};

export const deleteAdminUser = async (adminId: string): Promise<void> => {
  if (adminId === DEFAULT_ADMIN.id) {
    throw new Error('The primary default administrator cannot be deleted.');
  }
  await deleteDoc(doc(db, 'admins', adminId));
};

// Student operations
export const subscribeStudents = (
  callback: (students: StudentUser[]) => void,
  onError?: (err: Error) => void
) => {
  const q = collection(db, 'students');
  return onSnapshot(
    q, 
    (snapshot) => {
      const list: StudentUser[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as StudentUser);
      });
      callback(list);
    }, 
    (error) => {
      console.error("Firestore students listener error:", error);
      if (onError) onError(error);
      callback([]);
    }
  );
};

export const registerOrUpdateStudent = async (
  student: Omit<StudentUser, 'id' | 'createdAt'>, 
  existingId?: string
): Promise<StudentUser> => {
  const id = existingId || ('student_' + Date.now());
  const studentData: StudentUser = {
    id,
    ...student,
    createdAt: Date.now()
  };
  await setDoc(doc(db, 'students', id), studentData, { merge: true });
  return studentData;
};

// Course operations
export const subscribeCourses = (
  callback: (courses: Course[]) => void,
  onError?: (err: Error) => void
) => {
  const q = collection(db, 'courses');
  return onSnapshot(
    q, 
    (snapshot) => {
      const list: Course[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Course);
      });
      list.sort((a, b) => b.createdAt - a.createdAt);
      callback(list);
    }, 
    (error) => {
      console.error("Firestore courses listener error:", error);
      if (onError) onError(error);
      callback([]);
    }
  );
};

export const createCourse = async (name: string, batch: string): Promise<Course> => {
  const newCourse: Omit<Course, 'id'> = {
    name: name.trim(),
    batch: batch.trim(),
    allowedEmails: [],
    createdAt: Date.now()
  };
  const docRef = await addDoc(collection(db, 'courses'), newCourse);
  return { id: docRef.id, ...newCourse };
};

export const updateCourseAllowedEmails = async (courseId: string, allowedEmails: string[]): Promise<void> => {
  await updateDoc(doc(db, 'courses', courseId), {
    allowedEmails: Array.from(new Set(allowedEmails.map(e => e.trim().toLowerCase())))
  });
};

export const deleteCourse = async (courseId: string): Promise<void> => {
  await deleteDoc(doc(db, 'courses', courseId));

  // Cascade cleanup for folders, classes, resources, discussions
  try {
    const foldersSnap = await getDocs(query(collection(db, 'folders'), where('courseId', '==', courseId)));
    foldersSnap.forEach((d: any) => deleteDoc(d.ref).catch(() => {}));

    const classesSnap = await getDocs(query(collection(db, 'classes'), where('courseId', '==', courseId)));
    classesSnap.forEach((d: any) => deleteDoc(d.ref).catch(() => {}));

    const resourcesSnap = await getDocs(query(collection(db, 'resources'), where('courseId', '==', courseId)));
    resourcesSnap.forEach((d: any) => deleteDoc(d.ref).catch(() => {}));

    const discSnap = await getDocs(query(collection(db, 'discussions'), where('courseId', '==', courseId)));
    discSnap.forEach((d: any) => deleteDoc(d.ref).catch(() => {}));
  } catch (err) {
    console.warn('Cascade cleanup partial error:', err);
  }
};

// Folder operations
export const subscribeFolders = (
  courseId: string, 
  callback: (folders: Folder[]) => void,
  onError?: (err: Error) => void
) => {
  const q = query(collection(db, 'folders'), where('courseId', '==', courseId));
  return onSnapshot(
    q, 
    (snapshot) => {
      const list: Folder[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Folder);
      });
      list.sort((a, b) => a.createdAt - b.createdAt);
      callback(list);
    }, 
    (error) => {
      console.error("Firestore folders listener error:", error);
      if (onError) onError(error);
      callback([]);
    }
  );
};

export const createFolder = async (courseId: string, name: string, parentId?: string | null): Promise<Folder> => {
  const folderData: Omit<Folder, 'id'> = {
    courseId,
    name: name.trim(),
    parentId: parentId || null,
    createdAt: Date.now()
  };
  const docRef = await addDoc(collection(db, 'folders'), folderData);
  return { id: docRef.id, ...folderData };
};

export const updateFolderName = async (folderId: string, newName: string): Promise<void> => {
  await updateDoc(doc(db, 'folders', folderId), {
    name: newName.trim()
  });
};

export const deleteFolder = async (folderId: string): Promise<void> => {
  await deleteDoc(doc(db, 'folders', folderId));

  try {
    const classesSnap = await getDocs(query(collection(db, 'classes'), where('folderId', '==', folderId)));
    classesSnap.forEach((d: any) => deleteDoc(d.ref).catch(() => {}));

    const resourcesSnap = await getDocs(query(collection(db, 'resources'), where('folderId', '==', folderId)));
    resourcesSnap.forEach((d: any) => deleteDoc(d.ref).catch(() => {}));
  } catch (err) {
    console.warn('Folder cascade cleanup partial error:', err);
  }
};

// Class operations (Add Class option inside Course / Folder)
export const subscribeClasses = (
  courseId: string,
  callback: (classes: CourseClass[]) => void,
  onError?: (err: Error) => void
) => {
  const q = query(collection(db, 'classes'), where('courseId', '==', courseId));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: CourseClass[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as CourseClass);
      });
      list.sort((a, b) => a.createdAt - b.createdAt);
      callback(list);
    },
    (error) => {
      console.error("Firestore classes listener error:", error);
      if (onError) onError(error);
      callback([]);
    }
  );
};

export const createClass = async (
  courseId: string,
  title: string,
  folderId?: string | null
): Promise<CourseClass> => {
  const classData: Omit<CourseClass, 'id'> = {
    courseId,
    title: title.trim(),
    folderId: folderId || null,
    createdAt: Date.now()
  };
  const docRef = await addDoc(collection(db, 'classes'), classData);
  return { id: docRef.id, ...classData };
};

export const updateClassTitle = async (classId: string, newTitle: string): Promise<void> => {
  await updateDoc(doc(db, 'classes', classId), {
    title: newTitle.trim()
  });
};

export const deleteClass = async (classId: string): Promise<void> => {
  await deleteDoc(doc(db, 'classes', classId));

  try {
    const resourcesSnap = await getDocs(query(collection(db, 'resources'), where('classId', '==', classId)));
    resourcesSnap.forEach((d: any) => deleteDoc(d.ref).catch(() => {}));
  } catch (err) {
    console.warn('Class cascade cleanup partial error:', err);
  }
};

// Media Resources (Videos & PDFs)
export const subscribeResources = (
  courseId: string, 
  callback: (resources: MediaResource[]) => void,
  onError?: (err: Error) => void
) => {
  const q = query(collection(db, 'resources'), where('courseId', '==', courseId));
  return onSnapshot(
    q, 
    (snapshot) => {
      const list: MediaResource[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as MediaResource);
      });
      list.sort((a, b) => a.createdAt - b.createdAt);
      callback(list);
    }, 
    (error) => {
      console.error("Firestore resources listener error:", error);
      if (onError) onError(error);
      callback([]);
    }
  );
};

export const createResource = async (
  courseId: string, 
  title: string, 
  type: 'video' | 'pdf', 
  url: string, 
  folderId?: string | null,
  classId?: string | null
): Promise<MediaResource> => {
  const resourceData: Omit<MediaResource, 'id'> = {
    courseId,
    title: title.trim(),
    type,
    url: url.trim(),
    folderId: folderId || null,
    classId: classId || null,
    createdAt: Date.now()
  };
  const docRef = await addDoc(collection(db, 'resources'), resourceData);
  return { id: docRef.id, ...resourceData };
};

export const deleteResource = async (resourceId: string): Promise<void> => {
  await deleteDoc(doc(db, 'resources', resourceId));
};

// Discussion Messages (No composite index required: query by courseId, sort in memory)
export const subscribeDiscussions = (
  courseId: string, 
  callback: (messages: DiscussionMessage[]) => void,
  onError?: (err: Error) => void
) => {
  // Simple single-field query to avoid missing composite index errors!
  const q = query(
    collection(db, 'discussions'), 
    where('courseId', '==', courseId)
  );
  return onSnapshot(
    q, 
    (snapshot) => {
      const list: DiscussionMessage[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as DiscussionMessage);
      });
      // Sort chronologically ascending
      list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      callback(list);
    }, 
    (error) => {
      console.error("Firestore discussions listener error:", error);
      if (onError) onError(error);
      callback([]);
    }
  );
};

export const sendDiscussionMessage = async (
  message: {
    courseId: string;
    senderId: string;
    senderName: string;
    senderRole?: 'admin' | 'student';
    senderCollege?: string;
    text?: string;
    imageUrl?: string;
  }
): Promise<DiscussionMessage> => {
  let finalImageUrl = (message.imageUrl || '').trim();

  // If image is a base64 string, attempt uploading to Firebase Storage with a 2.5s timeout.
  // If Storage bucket rules or network fails, fallback seamlessly to direct data URL.
  if (finalImageUrl.startsWith('data:image/')) {
    try {
      const uploadPromise = (async () => {
        const storageRef = ref(storage, `discussions/${message.courseId}/${Date.now()}_img.jpg`);
        await uploadString(storageRef, finalImageUrl, 'data_url');
        return await getDownloadURL(storageRef);
      })();

      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Storage upload timeout')), 2500)
      );

      finalImageUrl = await Promise.race([uploadPromise, timeoutPromise]);
    } catch (storageErr) {
      console.warn('Storage upload fallback to direct data URL:', storageErr);
      // Fallback: The compressed image is already ~40-60KB, safely stored in Firestore
    }
  }

  // Strictly sanitize all properties so Firestore never receives `undefined`
  const msgData: Omit<DiscussionMessage, 'id'> = {
    courseId: String(message.courseId || ''),
    senderId: String(message.senderId || 'user_' + Date.now()),
    senderName: String(message.senderName || 'Anonymous'),
    senderRole: message.senderRole === 'admin' ? 'admin' : 'student',
    senderCollege: String(message.senderCollege || ''),
    text: String(message.text || ''),
    imageUrl: String(finalImageUrl || ''),
    timestamp: Date.now()
  };

  const docRef = await addDoc(collection(db, 'discussions'), msgData);
  return { id: docRef.id, ...msgData };
};

export const deleteDiscussionMessage = async (messageId: string): Promise<void> => {
  await deleteDoc(doc(db, 'discussions', messageId));
};

export const deleteMultipleDiscussionMessages = async (messageIds: string[]): Promise<void> => {
  const batch = writeBatch(db);
  messageIds.forEach(id => {
    batch.delete(doc(db, 'discussions', id));
  });
  await batch.commit();
};

// Exams
export const subscribeExams = (
  callback: (exams: Exam[]) => void,
  onError?: (err: Error) => void
) => {
  const q = collection(db, 'exams');
  return onSnapshot(
    q, 
    (snapshot) => {
      const list: Exam[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Exam);
      });
      list.sort((a, b) => b.createdAt - a.createdAt);
      callback(list);
    }, 
    (error) => {
      console.error("Firestore exams listener error:", error);
      if (onError) onError(error);
      callback([]);
    }
  );
};

export const createExam = async (examData: Omit<Exam, 'id' | 'createdAt'>): Promise<Exam> => {
  const sanitizedQuestions = (examData.questions || []).map((q, idx) => ({
    id: q.id || `q_${Date.now()}_${idx}`,
    text: String(q.text || '').trim(),
    options: (q.options || []).map((o, optIdx) => ({
      id: String(o.id || ['A', 'B', 'C', 'D'][optIdx] || 'A'),
      text: String(o.text || '').trim()
    })),
    correctOption: String(q.correctOption || 'A').toUpperCase(),
    explanation: String(q.explanation || '').trim()
  }));

  const newExam: Omit<Exam, 'id'> = {
    courseId: String(examData.courseId || 'general'),
    courseName: String(examData.courseName || 'General Exam'),
    title: String(examData.title || '').trim(),
    durationMinutes: Number(examData.durationMinutes) || 30,
    totalMarks: Number(examData.totalMarks) || 25,
    totalQuestions: sanitizedQuestions.length,
    passMark: Number(examData.passMark) || 10,
    negativeMarkPercentage: Number(examData.negativeMarkPercentage) || 0,
    instructions: String(examData.instructions || '').trim(),
    startTime: Number(examData.startTime) || Date.now(),
    endTime: Number(examData.endTime) || (Date.now() + 4 * 60 * 60 * 1000),
    resultPublishTime: Number(examData.resultPublishTime) || (Date.now() + 5 * 60 * 60 * 1000),
    questions: sanitizedQuestions,
    createdAt: Date.now()
  };

  const docRef = await addDoc(collection(db, 'exams'), newExam);
  return { id: docRef.id, ...newExam };
};

export const deleteExam = async (examId: string): Promise<void> => {
  await deleteDoc(doc(db, 'exams', examId));
};

export const updateExam = async (examId: string, updates: Partial<Exam>): Promise<void> => {
  const cleanUpdates: Record<string, any> = {};
  if (updates.title !== undefined) cleanUpdates.title = String(updates.title).trim();
  if (updates.courseId !== undefined) cleanUpdates.courseId = updates.courseId;
  if (updates.courseName !== undefined) cleanUpdates.courseName = updates.courseName;
  if (updates.durationMinutes !== undefined) cleanUpdates.durationMinutes = Number(updates.durationMinutes);
  if (updates.totalMarks !== undefined) cleanUpdates.totalMarks = Number(updates.totalMarks);
  if (updates.passMark !== undefined) cleanUpdates.passMark = Number(updates.passMark);
  if (updates.negativeMarkPercentage !== undefined) cleanUpdates.negativeMarkPercentage = Number(updates.negativeMarkPercentage);
  if (updates.instructions !== undefined) cleanUpdates.instructions = String(updates.instructions).trim();
  if (updates.startTime !== undefined) cleanUpdates.startTime = Number(updates.startTime);
  if (updates.endTime !== undefined) cleanUpdates.endTime = Number(updates.endTime);
  if (updates.resultPublishTime !== undefined) cleanUpdates.resultPublishTime = Number(updates.resultPublishTime);
  if (updates.isActive !== undefined) cleanUpdates.isActive = Boolean(updates.isActive);
  if (updates.questions) {
    cleanUpdates.questions = updates.questions.map((q, idx) => ({
      id: q.id || `q_${Date.now()}_${idx}`,
      text: String(q.text || '').trim(),
      options: (q.options || []).map((o, optIdx) => ({
        id: String(o.id || ['A', 'B', 'C', 'D'][optIdx] || 'A'),
        text: String(o.text || '').trim()
      })),
      correctOption: String(q.correctOption || 'A').toUpperCase(),
      explanation: String(q.explanation || '').trim()
    }));
    cleanUpdates.totalQuestions = cleanUpdates.questions.length;
  }
  await updateDoc(doc(db, 'exams', examId), cleanUpdates);
};

// Submissions
export const subscribeSubmissions = (
  callback: (submissions: ExamSubmission[]) => void,
  onError?: (err: Error) => void
) => {
  const q = collection(db, 'submissions');
  return onSnapshot(
    q, 
    (snapshot) => {
      const list: ExamSubmission[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as ExamSubmission);
      });
      list.sort((a, b) => b.submittedAt - a.submittedAt);
      callback(list);
    }, 
    (error) => {
      console.error("Firestore submissions listener error:", error);
      if (onError) onError(error);
      callback([]);
    }
  );
};

export const submitExamAnswers = async (submission: Omit<ExamSubmission, 'id'>): Promise<ExamSubmission> => {
  const docRef = await addDoc(collection(db, 'submissions'), submission);
  return { id: docRef.id, ...submission };
};

// Portal Settings & Customization operations (Saved in Firestore, real-time synced across all devices)
export const DEFAULT_PORTAL_SETTINGS: PortalSettings = {
  portalName: 'Exam Portal',
  tagline: 'Online Education & Examination Platform with Real-time Cloud Sync',
  theme: 'dark',
  announcementText: 'স্বাগতম! সকল লাইভ ক্লাস, পরীক্ষা এবং ফলাফল ফায়ারবেস ক্লাউডে রিয়েল-টাইম সিঙ্ক হচ্ছে।',
  showAnnouncement: true,
  contactNumber: '+880 1700-000000',
  supportEmail: 'support@examportal.com',
  allowSelfRegistration: true,
  updatedAt: 1700000000000
};

export const subscribePortalSettings = (
  callback: (settings: PortalSettings) => void,
  onError?: (err: Error) => void
) => {
  const docRef = doc(db, 'settings', 'portal');
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback({ ...DEFAULT_PORTAL_SETTINGS, ...(snapshot.data() as Partial<PortalSettings>) });
      } else {
        // Bootstrap default settings in Firestore so it's always persistent
        setDoc(docRef, DEFAULT_PORTAL_SETTINGS).catch((e) => console.warn('Bootstrap settings warning:', e));
        callback(DEFAULT_PORTAL_SETTINGS);
      }
    },
    (error) => {
      console.error('Firestore settings listener error:', error);
      if (onError) onError(error);
      callback(DEFAULT_PORTAL_SETTINGS);
    }
  );
};

export const updatePortalSettings = async (settings: Partial<PortalSettings>): Promise<void> => {
  const docRef = doc(db, 'settings', 'portal');
  await setDoc(docRef, { ...settings, updatedAt: Date.now() }, { merge: true });
};
