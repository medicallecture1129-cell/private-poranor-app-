import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '15mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '15mb' }));

// ইন-মেমোরি ডাটাবেস (In-memory Database with initial demo exam)
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
  examId: string;
  examName: string;
  courseName: string;
  masterQuestions: any[];
  sets: GeneratedExamSet[];
  totalSets?: number;
  createdAt: string;
}

let examsDB: StoredExam[] = [
  {
    examId: '1001',
    examName: 'MEDICAL & DENTAL ADMISSION MODEL TEST - 2026',
    courseName: 'HSC Biology & Medical Special Batch',
    masterQuestions: [
      {
        questionText: 'নিচের কোন হরমোনটি আপৎকালীন হরমোন? (Which hormone is the emergency hormone?)',
        options: [
          { text: 'ইনসুলিন (Insulin)', isCorrect: false },
          { text: 'অ্যাডরিনালিন (Adrenaline)', isCorrect: true },
          { text: 'থাইরক্সিন (Thyroxine)', isCorrect: false },
          { text: 'গ্লুকাগন (Glucagon)', isCorrect: false }
        ]
      },
      {
        questionText: 'মানবদেহের বৃহত্তম গ্রন্থি কোনটি? (Which is the largest gland in the human body?)',
        options: [
          { text: 'যকৃত (Liver)', isCorrect: true },
          { text: 'অগ্ন্যাশয় (Pancreas)', isCorrect: false },
          { text: 'থাইরয়েড (Thyroid)', isCorrect: false },
          { text: 'পিটুইটারি (Pituitary)', isCorrect: false }
        ]
      },
      {
        questionText: 'রক্তে হিমোগ্লোবিনের প্রধান উপাদান কোনটি? (Main component of hemoglobin?)',
        options: [
          { text: 'লৌহ (Iron)', isCorrect: true },
          { text: 'ক্যালসিয়াম (Calcium)', isCorrect: false },
          { text: 'ম্যাগনেসিয়াম (Magnesium)', isCorrect: false },
          { text: 'জিঙ্ক (Zinc)', isCorrect: false }
        ]
      },
      {
        questionText: 'মানবদেহের ক্রোমোজোম সংখ্যা কতটি? (Total chromosomes in human body?)',
        options: [
          { text: '৪৬ টি (46)', isCorrect: true },
          { text: '২৩ টি (23)', isCorrect: false },
          { text: '৪৪ টি (44)', isCorrect: false },
          { text: '৪৮ টি (48)', isCorrect: false }
        ]
      }
    ],
    sets: [
      {
        setName: 'Set A',
        setCode: 'A',
        questions: [
          {
            qNo: 1,
            questionText: 'মানবদেহের বৃহত্তম গ্রন্থি কোনটি? (Which is the largest gland in the human body?)',
            options: ['যকৃত (Liver)', 'অগ্ন্যাশয় (Pancreas)', 'থাইরয়েড (Thyroid)', 'পিটুইটারি (Pituitary)'],
            correctAnswer: 0
          },
          {
            qNo: 2,
            questionText: 'নিচের কোন হরমোনটি আপৎকালীন হরমোন? (Which hormone is the emergency hormone?)',
            options: ['ইনসুলিন (Insulin)', 'অ্যাডরিনালিন (Adrenaline)', 'গ্লুকাগন (Glucagon)', 'থাইরক্সিন (Thyroxine)'],
            correctAnswer: 1
          },
          {
            qNo: 3,
            questionText: 'রক্তে হিমোগ্লোবিনের প্রধান উপাদান কোনটি? (Main component of hemoglobin?)',
            options: ['লৌহ (Iron)', 'ক্যালসিয়াম (Calcium)', 'ম্যাগনেসিয়াম (Magnesium)', 'জিঙ্ক (Zinc)'],
            correctAnswer: 0
          },
          {
            qNo: 4,
            questionText: 'মানবদেহের ক্রোমোজোম সংখ্যা কতটি? (Total chromosomes in human body?)',
            options: ['৪৬ টি (46)', '২৩ টি (23)', '৪৪ টি (44)', '৪৮ টি (48)'],
            correctAnswer: 0
          }
        ]
      },
      {
        setName: 'Set B',
        setCode: 'B',
        questions: [
          {
            qNo: 1,
            questionText: 'রক্তে হিমোগ্লোবিনের প্রধান উপাদান কোনটি? (Main component of hemoglobin?)',
            options: ['ক্যালসিয়াম (Calcium)', 'লৌহ (Iron)', 'জিঙ্ক (Zinc)', 'ম্যাগনেসিয়াম (Magnesium)'],
            correctAnswer: 1
          },
          {
            qNo: 2,
            questionText: 'মানবদেহের ক্রোমোজোম সংখ্যা কতটি? (Total chromosomes in human body?)',
            options: ['২৩ টি (23)', '৪৬ টি (46)', '৪৮ টি (48)', '৪৪ টি (44)'],
            correctAnswer: 1
          },
          {
            qNo: 3,
            questionText: 'নিচের কোন হরমোনটি আপৎকালীন হরমোন? (Which hormone is the emergency hormone?)',
            options: ['অ্যাডরিনালিন (Adrenaline)', 'ইনসুলিন (Insulin)', 'থাইরক্সিন (Thyroxine)', 'গ্লুকাগন (Glucagon)'],
            correctAnswer: 0
          },
          {
            qNo: 4,
            questionText: 'মানবদেহের বৃহত্তম গ্রন্থি কোনটি? (Which is the largest gland in the human body?)',
            options: ['পিটুইটারি (Pituitary)', 'যকৃত (Liver)', 'অগ্ন্যাশয় (Pancreas)', 'থাইরয়েড (Thyroid)'],
            correctAnswer: 1
          }
        ]
      }
    ],
    totalSets: 2,
    createdAt: new Date().toISOString()
  }
];

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
// ১. মাস্টার কোশ্চেনসহ অফলাইন এক্সাম তৈরি ও ইউনিক সেট জেনারেশন
// Supports both POST /api/exams/create and app.all fallback
// ========================================================
const handleCreateExam = (req: Request, res: Response) => {
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

  for (let i = 1; i <= maxSets; i++) {
    const setCode = String.fromCharCode(64 + i); // সেট A, B, C, D...

    // প্রশ্ন শাফেল করা
    const shuffledQuestions = [...questionsList].sort(() => Math.random() - 0.5);

    const finalQuestions: ExamSetQuestion[] = shuffledQuestions.map((q, idx) => {
      const qText = q.questionText || q.question || `Question ${idx + 1}`;
      const originalOptions = normalizeOptions(q.options, q.answer ?? q.correctAnswer ?? 0);
      
      // অপশন শাফেল করা
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

  const newExam: StoredExam = {
    examId,
    examName,
    courseName,
    masterQuestions: questionsList,
    sets: generatedSets,
    totalSets: maxSets,
    createdAt: new Date().toISOString()
  };

  examsDB.unshift(newExam);
  res.json({
    success: true,
    examId,
    message: 'Exam and Unique Sets created successfully!',
    exam: newExam
  });
};

app.post('/api/exams/create', handleCreateExam);
app.all('/api/exams/create', (req, res, next) => {
  if (req.method === 'POST') return handleCreateExam(req, res);
  next();
});

// ========================================================
// ২. নির্দিষ্ট সেটের জন্য মেডিকেল স্ট্যান্ডার্ড পিডিএফ (সিংগেল ওএমআর + নিচে প্রশ্ন) জেনারেট করা
// ========================================================
app.get('/api/exams/:examId/set/:setCode/pdf', (req: Request, res: Response) => {
  const { examId, setCode } = req.params;
  const exam = examsDB.find(e => e.examId === examId);
  if (!exam) return res.status(404).send('Exam not found');

  const targetSet = exam.sets.find(
    s => s.setCode.toUpperCase() === String(setCode).toUpperCase()
  );
  if (!targetSet) return res.status(404).send('Set not found');

  const safeExamName = exam.examName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeSetName = targetSet.setName.replace(/[^a-zA-Z0-9_-]/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=Exam_${safeExamName}_${safeSetName}.pdf`);

  const doc = new PDFDocument({ size: 'A4', margin: 30 });
  doc.pipe(res);

  // --- OMR PAGE HEADER & LAYOUT (সিংগেল ওএমআর ডিজাইন) ---
  doc.fontSize(12).font('Helvetica-Bold').text("DOCTORS' CARE ACADEMY - MEDICAL ADMISSION MODEL TEST", { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(10).font('Helvetica').text(`Course: ${exam.courseName} | Exam: ${exam.examName} | Set: ${targetSet.setCode}`, { align: 'center' });
  doc.moveDown(0.5);

  // Student info box
  doc.rect(30, 70, 535, 62).stroke();
  doc.fontSize(9).font('Helvetica-Bold').text(
    `STUDENT ID: [                      ]   |   ROLL NO: [                      ]   |   SET CODE: [ ${targetSet.setCode} ]`,
    40,
    85
  );
  
  doc.fontSize(8).font('Helvetica').text(
    'Instructions: 1. Use black ballpoint pen only. 2. Fill the bubbles completely. 3. Negative marking -0.25 for wrong answer.',
    40,
    104
  );
  doc.fontSize(7.5).font('Helvetica').text(
    'নির্দেশাবলি: ১. কালো বলপয়েন্ট কলম ব্যবহার করুন। ২. বৃত্ত সম্পূর্ণ ভরাট করুন। ৩. ভুল উত্তরের জন্য -০.২৫ নম্বর কাটা হবে।',
    40,
    116
  );

  doc.moveDown(3);
  doc.fontSize(10).font('Helvetica-Bold').text('OMR Answer Sheet (100 Questions Grid)', { align: 'center' });
  
  // ওএমআর গ্রিড সিমুলেশন (25 rows x 4 columns = 100 questions)
  let omrY = 160;
  for (let i = 1; i <= 25; i++) {
    const col1 = `${String(i).padStart(2, ' ')}. [A] [B] [C] [D]`;
    const col2 = `${String(i + 25).padStart(2, ' ')}. [A] [B] [C] [D]`;
    const col3 = `${String(i + 50).padStart(2, ' ')}. [A] [B] [C] [D]`;
    const col4 = `${String(i + 75).padStart(2, ' ')}. [A] [B] [C] [D]`;
    doc.fontSize(8).font('Courier').text(`${col1}    ${col2}    ${col3}    ${col4}`, 40, omrY);
    omrY += 14;
  }

  // --- QUESTION PAPER PAGE ---
  doc.addPage();
  doc.fontSize(13).font('Helvetica-Bold').text(`Question Paper - ${exam.examName} (${targetSet.setName})`, { align: 'center' });
  doc.fontSize(9).font('Helvetica').text(`Total Questions: ${targetSet.questions.length} | Set Code: ${targetSet.setCode}`, { align: 'center' });
  doc.moveDown(1);

  targetSet.questions.forEach((q) => {
    doc.fontSize(9.5).font('Helvetica-Bold').text(`${q.qNo}. ${q.questionText}`);
    const opt0 = q.options[0] ?? '';
    const opt1 = q.options[1] ?? '';
    const opt2 = q.options[2] ?? '';
    const opt3 = q.options[3] ?? '';
    doc.fontSize(8.5).font('Helvetica').text(`   (A) ${opt0}   (B) ${opt1}   (C) ${opt2}   (D) ${opt3}`);
    doc.moveDown(0.5);
  });

  doc.end();
});

// ========================================================
// ৩. ড্যাশবোর্ডের জন্য এক্সাম লিস্ট ও ডিলিট API
// ========================================================
app.get('/api/exams', (_req: Request, res: Response) => {
  res.json(examsDB);
});

app.delete('/api/exams/:examId', (req: Request, res: Response) => {
  const { examId } = req.params;
  const initialLength = examsDB.length;
  examsDB = examsDB.filter(e => e.examId !== examId);
  res.json({
    success: true,
    message: initialLength > examsDB.length ? 'Exam deleted successfully' : 'Exam not found'
  });
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
    console.log(`[Express + Vite] Server running on http://0.0.0.0:${PORT}`);
  });
}

initServer().catch((err) => {
  console.error('Failed to start server:', err);
});
