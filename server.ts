import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc 
} from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '15mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '15mb' }));

// ========================================================
// Firebase Cloud Firestore Initialization
// ========================================================
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyDy1IFOYcPma4VFSguPMQ3P8gJHOS27niE",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "examportalonline-cb0a0.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "examportalonline-cb0a0",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "examportalonline-cb0a0.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "991705340498",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:991705340498:web:abc98a9e4f2c3914611d8b",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || "G-PVHS1KESXW"
};

const fbApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const firestoreDb = getFirestore(fbApp);

export interface QuestionOption {
  text: string;
  isCorrect?: boolean;
}

export interface MasterQuestion {
  id?: number | string;
  qNo?: number;
  questionText: string;
  options: (string | QuestionOption)[];
  answer?: number;
  correctAnswer?: number;
  explanation?: string;
}

export interface ExamSetQuestion {
  qNo: number;
  questionText: string;
  options: string[];
  correctAnswer: number;
}

export interface GeneratedExamSet {
  setName: string;
  setCode: string;
  questions: ExamSetQuestion[];
}

export interface StoredExam {
  id?: string;
  examId: string;
  examName: string;
  title: string;
  courseName: string;
  courseId: string;
  masterQuestions: any[];
  sets: GeneratedExamSet[];
  questions?: any[];
  offlineSets?: any[];
  totalSets?: number;
  totalQuestions?: number;
  totalMarks?: number;
  durationMinutes?: number;
  passMark?: number;
  negativeMarkPercentage?: number;
  isOffline?: boolean;
  examType?: string;
  isActive?: boolean;
  createdAt: number;
  updatedAt?: number;
}

// Helper to normalize options
function normalizeOptions(options: any[], fallbackAnsIndex: number = 0): { text: string; isCorrect: boolean }[] {
  if (!Array.isArray(options) || options.length === 0) {
    return [
      { text: 'Option A', isCorrect: true },
      { text: 'Option B', isCorrect: false },
      { text: 'Option C', isCorrect: false },
      { text: 'Option D', isCorrect: false }
    ];
  }

  return options.map((opt, i) => {
    if (typeof opt === 'object' && opt !== null) {
      return {
        text: String(opt.text || opt.title || `Option ${i + 1}`).trim(),
        isCorrect: Boolean(opt.isCorrect)
      };
    }
    return {
      text: String(opt).trim(),
      isCorrect: i === fallbackAnsIndex
    };
  });
}

// ========================================================
// ১. মাস্টার কোশ্চেনসহ অফলাইন এক্সাম তৈরি ও ইউনিক সেট জেনারেশন (Firestore এ সেভ)
// ========================================================
const handleCreateExam = async (req: Request, res: Response) => {
  try {
    const { examName, courseName, masterQuestions, totalSets } = req.body;
    if (!examName || !courseName) {
      return res.status(400).json({ success: false, error: 'Exam Name and Course Name are required' });
    }

    const examId = Date.now().toString();
    const generatedSets: GeneratedExamSet[] = [];
    const maxSets = Math.min(Math.max(parseInt(totalSets, 10) || 1, 1), 20); // সর্বোচ্চ ২০টি সেট

    const questionsList: any[] = Array.isArray(masterQuestions) && masterQuestions.length > 0
      ? masterQuestions
      : [
          {
            questionText: 'নিচের কোনটি মানবদেহের প্রধান ফিল্টারিং অঙ্গ?',
            options: [
              { text: 'বৃক্ক (Kidney)', isCorrect: true },
              { text: 'যকৃত (Liver)', isCorrect: false },
              { text: 'হৃৎপিণ্ড (Heart)', isCorrect: false },
              { text: 'ফুসফুস (Lungs)', isCorrect: false }
            ]
          }
        ];

    // Generate Sets with randomized questions and options
    for (let i = 1; i <= maxSets; i++) {
      const setCode = String.fromCharCode(64 + i); // Set A, B, C...

      // Shuffle questions
      const shuffledQuestions = [...questionsList].sort(() => Math.random() - 0.5);

      const finalQuestions: ExamSetQuestion[] = shuffledQuestions.map((q, idx) => {
        const qText = q.questionText || q.question || `Question ${idx + 1}`;
        const originalOptions = normalizeOptions(q.options, q.answer ?? q.correctAnswer ?? 0);
        
        // Shuffle options
        const shuffledOpts = [...originalOptions].sort(() => Math.random() - 0.5);
        const correctIdx = shuffledOpts.findIndex(opt => opt.isCorrect);

        return {
          qNo: idx + 1,
          questionText: qText,
          options: shuffledOpts.map(o => o.text),
          correctAnswer: correctIdx >= 0 ? correctIdx : 0
        };
      });

      generatedSets.push({
        setName: `Set ${setCode}`,
        setCode: setCode,
        questions: finalQuestions
      });
    }

    // Prepare full Exam document compatible with both Offline Manager & Main Exam Portal
    const now = Date.now();
    const newExamDoc: StoredExam = {
      id: examId,
      examId: examId,
      examName: String(examName).trim(),
      title: String(examName).trim(),
      courseName: String(courseName).trim(),
      courseId: 'general',
      masterQuestions: questionsList,
      questions: questionsList.map((q, idx) => {
        const opts = normalizeOptions(q.options, q.answer ?? q.correctAnswer ?? 0);
        const correctIdx = opts.findIndex(o => o.isCorrect);
        return {
          id: `q_${idx + 1}`,
          text: q.questionText || q.question || `Question ${idx + 1}`,
          options: opts.map((opt, oIdx) => ({
            id: String.fromCharCode(65 + oIdx),
            text: opt.text
          })),
          correctOption: String.fromCharCode(65 + (correctIdx >= 0 ? correctIdx : 0))
        };
      }),
      sets: generatedSets,
      offlineSets: generatedSets.map((s) => ({
        setCode: s.setCode,
        qrData: `OMR:${examId}:${s.setCode}`,
        questions: s.questions.map((q, qIdx) => ({
          questionNumber: q.qNo || (qIdx + 1),
          masterQuestionId: `mq_${qIdx + 1}`,
          text: q.questionText,
          options: q.options.map((opt, oIdx) => ({
            id: String.fromCharCode(65 + oIdx),
            text: opt
          })),
          correctOption: String.fromCharCode(65 + (q.correctAnswer || 0))
        })),
        answerKey: s.questions.reduce((acc, q, qIdx) => {
          acc[q.qNo || (qIdx + 1)] = String.fromCharCode(65 + (q.correctAnswer || 0));
          return acc;
        }, {} as Record<number, string>),
        createdAt: now
      })),
      totalSets: maxSets,
      totalQuestions: questionsList.length,
      totalMarks: questionsList.length * 1,
      durationMinutes: 60,
      passMark: Math.ceil(questionsList.length * 0.4),
      negativeMarkPercentage: 0.25,
      isOffline: true,
      examType: 'offline',
      isActive: true,
      createdAt: now,
      updatedAt: now
    };

    // Save directly to Firebase Cloud Firestore 'exams' collection
    await setDoc(doc(firestoreDb, 'exams', examId), newExamDoc);

    console.log(`[Firestore] Successfully created exam ${examId} with ${maxSets} sets.`);

    return res.json({
      success: true,
      examId,
      message: 'Exam and Unique Sets created and stored in Firestore successfully!',
      exam: newExamDoc
    });
  } catch (err: any) {
    console.error('[Firestore Error] createExam failed:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to save exam to Firestore'
    });
  }
};

app.post('/api/exams/create', handleCreateExam);
app.all('/api/exams/create', (req, res, next) => {
  if (req.method === 'POST') return handleCreateExam(req, res);
  next();
});

// ========================================================
// ২. নির্দিষ্ট সেটের জন্য মেডিকেল স্ট্যান্ডার্ড পিডিএফ (Firestore থেকে ফেচ)
// ========================================================
app.get('/api/exams/:examId/set/:setCode/pdf', async (req: Request, res: Response) => {
  try {
    const { examId, setCode } = req.params;

    // Fetch exam document directly from Firestore
    const examDocRef = doc(firestoreDb, 'exams', examId);
    const examSnap = await getDoc(examDocRef);

    if (!examSnap.exists()) {
      return res.status(404).send('Exam not found in Firebase Firestore');
    }

    const exam = examSnap.data() as StoredExam;
    const examName = exam.examName || exam.title || 'Model_Test';
    const courseName = exam.courseName || 'Medical_Admission';
    const sets: GeneratedExamSet[] = exam.sets || [];

    const targetSet = sets.find(
      s => s.setCode && s.setCode.toUpperCase() === String(setCode).toUpperCase()
    );

    if (!targetSet) {
      return res.status(404).send(`Set ${setCode} not found for this exam in Firestore`);
    }

    const safeExamName = examName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeSetName = (targetSet.setName || `Set_${setCode}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Exam_${safeExamName}_${safeSetName}.pdf`);

    const docPdf = new PDFDocument({ size: 'A4', margin: 30 });
    docPdf.pipe(res);

    // --- OMR PAGE HEADER & LAYOUT (মেডিকেল ওএমআর ডিজাইন) ---
    docPdf.fontSize(12).font('Helvetica-Bold').text("DOCTORS' CARE ACADEMY - MEDICAL ADMISSION MODEL TEST", { align: 'center' });
    docPdf.moveDown(0.2);
    docPdf.fontSize(10).font('Helvetica').text(`Course: ${courseName} | Exam: ${examName} | Set: ${targetSet.setCode}`, { align: 'center' });
    docPdf.moveDown(0.5);

    // Student Candidate Info Box
    docPdf.rect(30, 70, 535, 62).stroke();
    docPdf.fontSize(9).font('Helvetica-Bold').text(
      `STUDENT ID: [                      ]   |   ROLL NO: [                      ]   |   SET CODE: [ ${targetSet.setCode} ]`,
      40,
      85
    );
    
    docPdf.fontSize(8).font('Helvetica').text(
      'Instructions: 1. Use black ballpoint pen only. 2. Fill the bubbles completely. 3. Negative marking -0.25 for wrong answer.',
      40,
      104
    );
    docPdf.fontSize(7.5).font('Helvetica').text(
      'Nirdeshaboli: 1. Kalo ballpoint pen bebohar korun. 2. Bubble shompurno bhorat korun. 3. Bhul uttorer jonno -0.25 mark kata hobe.',
      40,
      116
    );

    docPdf.moveDown(3);
    docPdf.fontSize(10).font('Helvetica-Bold').text('OMR Answer Sheet (100 Questions Grid)', { align: 'center' });
    
    // OMR Grid Simulation (25 rows x 4 columns = 100 questions)
    let omrY = 160;
    for (let i = 1; i <= 25; i++) {
      const col1 = `${String(i).padStart(2, ' ')}. [A] [B] [C] [D]`;
      const col2 = `${String(i + 25).padStart(2, ' ')}. [A] [B] [C] [D]`;
      const col3 = `${String(i + 50).padStart(2, ' ')}. [A] [B] [C] [D]`;
      const col4 = `${String(i + 75).padStart(2, ' ')}. [A] [B] [C] [D]`;
      docPdf.fontSize(8).font('Courier').text(`${col1}    ${col2}    ${col3}    ${col4}`, 40, omrY);
      omrY += 14;
    }

    // --- QUESTION PAPER PAGE ---
    docPdf.addPage();
    docPdf.fontSize(13).font('Helvetica-Bold').text(`Question Paper - ${examName} (${targetSet.setName})`, { align: 'center' });
    docPdf.fontSize(9).font('Helvetica').text(`Total Questions: ${targetSet.questions?.length || 0} | Set Code: ${targetSet.setCode}`, { align: 'center' });
    docPdf.moveDown(1);

    if (targetSet.questions && targetSet.questions.length > 0) {
      targetSet.questions.forEach((q) => {
        docPdf.fontSize(9.5).font('Helvetica-Bold').text(`${q.qNo}. ${q.questionText}`);
        const opt0 = q.options && q.options[0] ? q.options[0] : '';
        const opt1 = q.options && q.options[1] ? q.options[1] : '';
        const opt2 = q.options && q.options[2] ? q.options[2] : '';
        const opt3 = q.options && q.options[3] ? q.options[3] : '';
        docPdf.fontSize(8.5).font('Helvetica').text(`   (A) ${opt0}   (B) ${opt1}   (C) ${opt2}   (D) ${opt3}`);
        docPdf.moveDown(0.5);
      });
    }

    docPdf.end();
  } catch (err: any) {
    console.error('[Firestore Error] PDF generation failed:', err);
    return res.status(500).send('Failed to generate PDF: ' + err.message);
  }
});

// ========================================================
// ৩. ড্যাশবোর্ডের জন্য এক্সাম লিস্ট ফেচ API (Firestore Query)
// ========================================================
app.get('/api/exams', async (_req: Request, res: Response) => {
  try {
    const snapshot = await getDocs(collection(firestoreDb, 'exams'));
    const examsList: StoredExam[] = [];

    snapshot.forEach((d) => {
      const data = d.data();
      // Include any exam with sets or master questions or offline flag
      if (data.sets || data.masterQuestions || data.isOffline || data.examType === 'offline') {
        examsList.push({
          id: d.id,
          examId: data.examId || d.id,
          examName: data.examName || data.title || 'Untitled Exam',
          title: data.title || data.examName || 'Untitled Exam',
          courseName: data.courseName || 'General',
          courseId: data.courseId || 'general',
          masterQuestions: data.masterQuestions || [],
          sets: data.sets || [],
          totalSets: data.totalSets || (data.sets ? data.sets.length : 0),
          totalQuestions: data.totalQuestions || (data.masterQuestions ? data.masterQuestions.length : 0),
          isOffline: Boolean(data.isOffline),
          createdAt: data.createdAt || 0,
          updatedAt: data.updatedAt || data.createdAt || 0
        });
      }
    });

    // Sort descending by creation date
    examsList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return res.json(examsList);
  } catch (err: any) {
    console.error('[Firestore Error] fetch exams failed:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to fetch exams from Firestore' });
  }
});

// ========================================================
// ৪. ড্যাশবোর্ড থেকে এক্সাম পার্মানেন্টলি ডিলিট API (Firestore deleteDoc)
// ========================================================
app.delete('/api/exams/:examId', async (req: Request, res: Response) => {
  try {
    const { examId } = req.params;
    if (!examId) {
      return res.status(400).json({ success: false, error: 'Exam ID is required' });
    }

    await deleteDoc(doc(firestoreDb, 'exams', examId));
    console.log(`[Firestore] Successfully deleted exam ${examId}`);

    return res.json({
      success: true,
      message: 'Exam deleted successfully from Firebase Firestore'
    });
  } catch (err: any) {
    console.error('[Firestore Error] deleteDoc failed:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to delete exam from Firestore'
    });
  }
});

// ========================================================
// Mount Vite middlewares in development or static dist in prod
// ========================================================
async function initServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Express + Vite] Server running on http://0.0.0.0:${PORT} with Firebase Firestore connected.`);
  });
}

initServer().catch((err) => {
  console.error('Failed to start server:', err);
});
