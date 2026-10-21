import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
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
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '25mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '25mb' }));

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
  qrData?: string;
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

// Regex Fallback Parser for Bulk MCQ Text
function parseBulkTextRegex(rawText: string): Array<{
  questionText: string;
  options: { text: string; isCorrect: boolean }[];
  explanation?: string;
}> {
  const questions: Array<{
    questionText: string;
    options: { text: string; isCorrect: boolean }[];
    explanation?: string;
  }> = [];

  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const blocks = normalized.split(/\n+(?=(?:(?:Q(?:uestion)?|প্রশ্ন)\s*[\d০-৯]+[\.\:\)\-]|[\d০-৯]+[\.\:\)\-]\s+))/i);

  blocks.forEach((block) => {
    const rawLines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (rawLines.length === 0) return;

    let qText = '';
    const opts: string[] = [];
    let correctIdx = 0;
    let explanation = '';

    const qHeaderRegex = /^(?:(?:Q(?:uestion)?|প্রশ্ন)\s*[\d০-৯]+[\.\:\)\-]|[\d০-৯]+[\.\:\)\-]\s*)/i;
    const optRegex = /^[\(\[\{]?([A-Da-dক-ঘ১-৪])[\)\]\}\.\:\-]\s*(.*)$/;
    const ansRegex = /^(?:Ans(?:wer)?|Correct(?:\s*Ans(?:wer)?)?|উত্তর|সঠিক\s*উত্তর)\s*[\:\-\=–]\s*[\(\[\{]?([A-Da-dক-ঘ১-৪])[\)\]\}]?/i;
    const expRegex = /^(?:Explanation|Solution|Exp|Soln|ব্যাখ্যা|সমাধান)\s*[\:\-\=–]\s*(.*)$/i;

    qText = rawLines[0].replace(qHeaderRegex, '').trim();
    if (!qText && rawLines.length > 1) {
      qText = rawLines[1];
    }

    for (let i = 1; i < rawLines.length; i++) {
      const line = rawLines[i];
      const matchAns = line.match(ansRegex);
      const matchExp = line.match(expRegex);
      const matchOpt = line.match(optRegex);

      if (matchAns) {
        const letter = matchAns[1].toUpperCase();
        if (letter === 'B' || letter === 'খ' || letter === '২') correctIdx = 1;
        else if (letter === 'C' || letter === 'গ' || letter === '৩') correctIdx = 2;
        else if (letter === 'D' || letter === 'ঘ' || letter === '৪') correctIdx = 3;
        else correctIdx = 0;
      } else if (matchExp) {
        explanation = matchExp[1].trim();
      } else if (matchOpt && opts.length < 4) {
        opts.push(matchOpt[2].trim());
      } else if (opts.length === 0) {
        qText += ' ' + line;
      } else if (opts.length > 0 && opts.length <= 4) {
        opts[opts.length - 1] += ' ' + line;
      }
    }

    while (opts.length < 4) {
      opts.push(`Option ${String.fromCharCode(65 + opts.length)}`);
    }

    if (qText.trim()) {
      questions.push({
        questionText: qText.trim(),
        options: opts.slice(0, 4).map((text, idx) => ({
          text,
          isCorrect: idx === correctIdx
        })),
        explanation: explanation.trim()
      });
    }
  });

  return questions;
}

// ========================================================
// AI BULK QUESTION PARSER API (/api/ai/parse-mcqs)
// ========================================================
app.post('/api/ai/parse-mcqs', async (req: Request, res: Response) => {
  try {
    const { rawText } = req.body;
    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
      return res.status(400).json({ success: false, error: 'Raw text is required' });
    }

    // Try Gemini API if key is present in environment
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI();
        const prompt = `You are an expert exam question structuring assistant. Parse the following text containing multiple-choice questions (up to 100 MCQs) into a strictly valid JSON array.
Each element must be an object with:
- "questionText": string
- "options": array of exactly 4 strings [Option A, Option B, Option C, Option D]
- "correctAnswer": number (0 for A, 1 for B, 2 for C, 3 for D)
- "explanation": string (optional, explanation or solution if provided)

Raw Text:
${rawText.slice(0, 30000)}

Output ONLY valid JSON array with no extra markdown or wrappers.`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });

        const jsonStr = response.text?.trim() || '[]';
        const parsed = JSON.parse(jsonStr);

        if (Array.isArray(parsed) && parsed.length > 0) {
          const structured = parsed.map((item: any, idx: number) => {
            const opts = Array.isArray(item.options) ? item.options : ['A', 'B', 'C', 'D'];
            while (opts.length < 4) opts.push(`Option ${String.fromCharCode(65 + opts.length)}`);
            const ansIdx = typeof item.correctAnswer === 'number' ? Math.max(0, Math.min(item.correctAnswer, 3)) : 0;

            return {
              qNo: idx + 1,
              questionText: String(item.questionText || item.question || `Question ${idx + 1}`).trim(),
              options: opts.slice(0, 4).map((t: any, oIdx: number) => ({
                text: String(t).trim(),
                isCorrect: oIdx === ansIdx
              })),
              explanation: item.explanation ? String(item.explanation).trim() : ''
            };
          });

          return res.json({
            success: true,
            source: 'gemini',
            totalQuestions: structured.length,
            questions: structured
          });
        }
      } catch (aiErr) {
        console.warn('[AI Parser] Gemini call failed, falling back to regex parser:', aiErr);
      }
    }

    // Fast and robust Regex fallback
    const regexParsed = parseBulkTextRegex(rawText);
    const structured = regexParsed.map((item, idx) => ({
      qNo: idx + 1,
      questionText: item.questionText,
      options: item.options,
      explanation: item.explanation || ''
    }));

    return res.json({
      success: true,
      source: 'regex_fallback',
      totalQuestions: structured.length,
      questions: structured
    });
  } catch (err: any) {
    console.error('MCQ Parse Error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to parse MCQs' });
  }
});

// ========================================================
// ১. মাস্টার কোশ্চেনসহ অফলাইন এক্সাম তৈরি ও ইউনিক সেট জেনারেশন (Firestore এ সেভ)
// ========================================================
const handleCreateExam = async (req: Request, res: Response) => {
  try {
    const { examName, courseName, masterQuestions, totalSets } = req.body;
    if (!examName || !courseName) {
      return res.status(400).json({ success: false, error: 'Exam Name and Course Name are required' });
    }

    const examId = 'offline_' + Date.now();
    const generatedSets: GeneratedExamSet[] = [];
    const maxSets = Math.min(Math.max(parseInt(totalSets, 10) || 1, 1), 20);

    const questionsList: any[] = Array.isArray(masterQuestions) && masterQuestions.length > 0
      ? masterQuestions
      : [
          {
            questionText: 'What is the SI unit of electric current?',
            options: [
              { text: 'Volt', isCorrect: false },
              { text: 'Ampere', isCorrect: true },
              { text: 'Ohm', isCorrect: false },
              { text: 'Watt', isCorrect: false }
            ]
          }
        ];

    // Generate Sets with randomized questions and options (Set-01 to Set-XX)
    for (let i = 1; i <= maxSets; i++) {
      const setCode = `Set-${String(i).padStart(2, '0')}`;

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
        setName: setCode,
        setCode: setCode,
        qrData: `OMR:${examId}:${setCode}`,
        questions: finalQuestions
      });
    }

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
          correctOption: String.fromCharCode(65 + (correctIdx >= 0 ? correctIdx : 0)),
          explanation: q.explanation || ''
        };
      }),
      sets: generatedSets,
      offlineSets: generatedSets.map((s) => ({
        setCode: s.setCode,
        qrData: s.qrData || `OMR:${examId}:${s.setCode}`,
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
      durationMinutes: 90,
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
// ========================================================
// ২. নির্দিষ্ট সেটের জন্য মেডিকেল স্ট্যান্ডার্ড পিডিএফ (DEMO LAYOUT MATCHING)
// ========================================================
async function buildPdfKitQuestionPaper(exam: any, targetSet: any, res: Response) {
  const examName = exam.examName || exam.title || 'Weekly Exam - 01';
  const courseName = exam.courseName || 'Biology 1st Paper (Chapter-01)';
  const safeExamName = String(examName).replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeSetName = String(targetSet.setCode || 'Set-01').replace(/[^a-zA-Z0-9_-]/g, '_');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Exam_${safeExamName}_${safeSetName}.pdf"`);

  const docPdf = new PDFDocument({ size: 'A4', margin: 24 });
  docPdf.pipe(res);

  const qrData = targetSet.qrData || `OMR:${exam.id || 'exam'}:${targetSet.setCode || 'Set-01'}`;
  const qrBuffer = await QRCode.toBuffer(qrData, {
    margin: 1,
    width: 180,
    errorCorrectionLevel: 'M'
  });

  const getOptStr = (opt: any): string => {
    if (!opt) return '';
    if (typeof opt === 'string') return opt;
    return opt.text || String(opt);
  };

  const getQText = (q: any): string => q?.questionText || q?.text || '';
  const getQNo = (q: any, fallback: number): number => q?.qNo || q?.questionNumber || fallback;

  // ----------------------------------------------------
  // PAGE 1: TOP 3 BOXES + 100-OMR GRID + QUESTIONS 1-24
  // ----------------------------------------------------
  const startX = 24;
  const contentWidth = 547; // 595 - 48

  // Box 1: Student ID (Left)
  const box1Width = 145;
  const topBoxHeight = 118;
  docPdf.rect(startX, 24, box1Width, topBoxHeight).stroke();
  docPdf.rect(startX, 24, box1Width, 16).fill('#000000');
  docPdf.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold').text('Student ID', startX, 28, { width: box1Width, align: 'center' });
  docPdf.fillColor('#000000');

  const colStep = (box1Width - 14) / 5;
  const rowStep = (topBoxHeight - 24) / 10;
  for (let c = 0; c < 6; c++) {
    const cx = startX + 7 + c * colStep;
    for (let d = 0; d < 10; d++) {
      const cy = 44 + d * rowStep;
      docPdf.circle(cx, cy, 3.8).stroke();
      docPdf.fontSize(4.8).font('Helvetica-Bold').text(String(d), cx - 4, cy - 2.2, {
        width: 8,
        align: 'center',
        lineBreak: false
      });
    }
  }

  // Box 2: QR Code & Set Number (Center)
  const box2Width = 110;
  const box2X = startX + box1Width + 6;
  docPdf.rect(box2X, 24, box2Width, topBoxHeight).stroke();
  docPdf.image(qrBuffer, box2X + 18, 30, { width: 74, height: 74 });
  docPdf.fontSize(11).font('Helvetica-Bold').text(targetSet.setCode || 'Set-01', box2X, 115, { width: box2Width, align: 'center' });

  // Box 3: Exam Info (Right)
  const box3X = box2X + box2Width + 6;
  const box3Width = contentWidth - (box1Width + box2Width + 12);
  docPdf.rect(box3X, 24, box3Width, topBoxHeight).fillAndStroke('#f8fafc', '#000000');
  docPdf.fillColor('#000000');
  docPdf.fontSize(12).font('Helvetica-Bold').text(examName, box3X + 8, 32);
  docPdf.fontSize(9.5).font('Helvetica').text(courseName, box3X + 8, 48);
  
  const totalQ = targetSet.questions?.length || exam.totalQuestions || 100;
  docPdf.fontSize(8).font('Helvetica').text(`Total Questions: ${totalQ} MCQs`, box3X + 8, 65);
  docPdf.fontSize(8).text(`Total Marks: ${exam.totalMarks || totalQ} Marks`, box3X + 8, 77);
  docPdf.fontSize(8).text(`Negative Mark: ${exam.negativeMarkPercentage !== undefined ? exam.negativeMarkPercentage : 0.25} / Question`, box3X + 8, 89);
  docPdf.fontSize(8).text(`Date of Exam: ....../....../............`, box3X + 8, 101);
  docPdf.fontSize(8).font('Helvetica-Bold').text(`Candidate Name: .......................................`, box3X + 8, 117);

  // 100-Question OMR Grid Table
  const omrTableY = 150;
  const omrTableHeight = 275;
  docPdf.rect(startX, omrTableY, contentWidth, omrTableHeight).stroke();

  const subColW = contentWidth / 4;
  const subColRanges = [
    { start: 1, end: 25 },
    { start: 26, end: 50 },
    { start: 51, end: 75 },
    { start: 76, end: 100 }
  ];

  subColRanges.forEach((range, scIdx) => {
    const scX = startX + scIdx * subColW;
    if (scIdx > 0) {
      docPdf.moveTo(scX, omrTableY).lineTo(scX, omrTableY + omrTableHeight).stroke();
    }

    // Header: Q. | ANS
    docPdf.rect(scX, omrTableY, subColW, 14).fillAndStroke('#f1f5f9', '#000000');
    docPdf.fillColor('#000000');
    docPdf.fontSize(7).font('Helvetica-Bold').text('Q.', scX + 4, omrTableY + 4);
    docPdf.text('ANS', scX + 26, omrTableY + 4, { width: subColW - 30, align: 'center' });

    // Rows
    const rowH = (omrTableHeight - 14) / 25;
    for (let r = 0; r < 25; r++) {
      const qNum = range.start + r;
      const rowY = omrTableY + 14 + r * rowH;

      if (r > 0) {
        docPdf.moveTo(scX, rowY).lineTo(scX + subColW, rowY).strokeColor('#e2e8f0').stroke().strokeColor('#000000');
      }

      docPdf.fontSize(6.5).font('Courier-Bold').text(String(qNum), scX + 2, rowY + 2.5);

      const optStep = (subColW - 34) / 3;
      ['A', 'B', 'C', 'D'].forEach((opt, oIdx) => {
        const optX = scX + 26 + oIdx * optStep;
        const optY = rowY + 5.2;
        docPdf.circle(optX, optY, 3.5).stroke();
        docPdf.fontSize(4.0).font('Helvetica-Bold').text(opt, optX - 4, optY - 2.0, {
          width: 8,
          align: 'center',
          lineBreak: false
        });
      });
    }
  });

  // Divider: বহুনির্বাচনি প্রশ্ন (MULTIPLE CHOICE QUESTIONS)
  const divY = omrTableY + omrTableHeight + 12;
  docPdf.moveTo(startX, divY + 6).lineTo(startX + contentWidth, divY + 6).stroke();
  docPdf.rect(startX + contentWidth / 2 - 60, divY, 120, 14).fillAndStroke('#ffffff', '#000000');
  docPdf.fillColor('#000000').fontSize(8.5).font('Helvetica-Bold').text('MULTIPLE CHOICE QUESTIONS', startX + contentWidth / 2 - 60, divY + 3, { width: 120, align: 'center' });

  // Page 1 Questions (Q. 01 - 24)
  let qY1 = divY + 22;
  const colW = (contentWidth - 16) / 2;
  const p1Questions = (targetSet.questions || []).slice(0, 24);

  for (let i = 0; i < 12; i++) {
    const qLeft = p1Questions[i];
    const qRight = p1Questions[i + 12];

    if (qLeft) {
      const qNum = getQNo(qLeft, i + 1);
      docPdf.fontSize(7.5).font('Helvetica-Bold').text(`${String(qNum).padStart(2, '0')}. ${getQText(qLeft)}`, startX, qY1, { width: colW });
      const oA = getOptStr(qLeft.options?.[0]);
      const oB = getOptStr(qLeft.options?.[1]);
      const oC = getOptStr(qLeft.options?.[2]);
      const oD = getOptStr(qLeft.options?.[3]);
      docPdf.fontSize(6.8).font('Helvetica').text(`  (A) ${oA}   (B) ${oB}`, startX, qY1 + 10, { width: colW });
      docPdf.text(`  (C) ${oC}   (D) ${oD}`, startX, qY1 + 18, { width: colW });
    }

    if (qRight) {
      const rightX = startX + colW + 16;
      const qNum = getQNo(qRight, i + 13);
      docPdf.fontSize(7.5).font('Helvetica-Bold').text(`${String(qNum).padStart(2, '0')}. ${getQText(qRight)}`, rightX, qY1, { width: colW });
      const oA = getOptStr(qRight.options?.[0]);
      const oB = getOptStr(qRight.options?.[1]);
      const oC = getOptStr(qRight.options?.[2]);
      const oD = getOptStr(qRight.options?.[3]);
      docPdf.fontSize(6.8).font('Helvetica').text(`  (A) ${oA}   (B) ${oB}`, rightX, qY1 + 10, { width: colW });
      docPdf.text(`  (C) ${oC}   (D) ${oD}`, rightX, qY1 + 18, { width: colW });
    }

    qY1 += 28;
  }

  docPdf.fontSize(6.5).font('Helvetica').text('Subject: General Science & Competency | Page 1 of 3', startX, 810);

  // ----------------------------------------------------
  // PAGE 2: QUESTIONS 25 - 62 (2 Columns)
  // ----------------------------------------------------
  docPdf.addPage();
  docPdf.fontSize(9.5).font('Helvetica-Bold').text(`QUESTION PAPER - PART 2 (Q. 25 - 62) | ${targetSet.setCode || 'Set-01'}`, startX, 24);
  docPdf.moveTo(startX, 36).lineTo(startX + contentWidth, 36).stroke();

  let qY2 = 44;
  const p2Questions = (targetSet.questions || []).slice(24, 62);
  const halfP2 = Math.ceil(p2Questions.length / 2);

  for (let i = 0; i < halfP2; i++) {
    const qLeft = p2Questions[i];
    const qRight = p2Questions[i + halfP2];

    if (qLeft) {
      const qNum = getQNo(qLeft, 25 + i);
      docPdf.fontSize(7.5).font('Helvetica-Bold').text(`${qNum}. ${getQText(qLeft)}`, startX, qY2, { width: colW });
      const oA = getOptStr(qLeft.options?.[0]);
      const oB = getOptStr(qLeft.options?.[1]);
      const oC = getOptStr(qLeft.options?.[2]);
      const oD = getOptStr(qLeft.options?.[3]);
      docPdf.fontSize(6.8).font('Helvetica').text(`  (A) ${oA}   (B) ${oB}`, startX, qY2 + 10, { width: colW });
      docPdf.text(`  (C) ${oC}   (D) ${oD}`, startX, qY2 + 18, { width: colW });
    }

    if (qRight) {
      const rightX = startX + colW + 16;
      const qNum = getQNo(qRight, 25 + halfP2 + i);
      docPdf.fontSize(7.5).font('Helvetica-Bold').text(`${qNum}. ${getQText(qRight)}`, rightX, qY2, { width: colW });
      const oA = getOptStr(qRight.options?.[0]);
      const oB = getOptStr(qRight.options?.[1]);
      const oC = getOptStr(qRight.options?.[2]);
      const oD = getOptStr(qRight.options?.[3]);
      docPdf.fontSize(6.8).font('Helvetica').text(`  (A) ${oA}   (B) ${oB}`, rightX, qY2 + 10, { width: colW });
      docPdf.text(`  (C) ${oC}   (D) ${oD}`, rightX, qY2 + 18, { width: colW });
    }

    qY2 += 28;
  }
  docPdf.fontSize(6.5).font('Helvetica').text('Subject: General Science & Competency | Page 2 of 3', startX, 810);

  // ----------------------------------------------------
  // PAGE 3: QUESTIONS 63 - 100 (2 Columns)
  // ----------------------------------------------------
  docPdf.addPage();
  docPdf.fontSize(9.5).font('Helvetica-Bold').text(`QUESTION PAPER - PART 3 (Q. 63 - 100) | ${targetSet.setCode || 'Set-01'}`, startX, 24);
  docPdf.moveTo(startX, 36).lineTo(startX + contentWidth, 36).stroke();

  let qY3 = 44;
  const p3Questions = (targetSet.questions || []).slice(62, 100);
  const halfP3 = Math.ceil(p3Questions.length / 2);

  for (let i = 0; i < halfP3; i++) {
    const qLeft = p3Questions[i];
    const qRight = p3Questions[i + halfP3];

    if (qLeft) {
      const qNum = getQNo(qLeft, 63 + i);
      docPdf.fontSize(7.5).font('Helvetica-Bold').text(`${qNum}. ${getQText(qLeft)}`, startX, qY3, { width: colW });
      const oA = getOptStr(qLeft.options?.[0]);
      const oB = getOptStr(qLeft.options?.[1]);
      const oC = getOptStr(qLeft.options?.[2]);
      const oD = getOptStr(qLeft.options?.[3]);
      docPdf.fontSize(6.8).font('Helvetica').text(`  (A) ${oA}   (B) ${oB}`, startX, qY3 + 10, { width: colW });
      docPdf.text(`  (C) ${oC}   (D) ${oD}`, startX, qY3 + 18, { width: colW });
    }

    if (qRight) {
      const rightX = startX + colW + 16;
      const qNum = getQNo(qRight, 63 + halfP3 + i);
      docPdf.fontSize(7.5).font('Helvetica-Bold').text(`${qNum}. ${getQText(qRight)}`, rightX, qY3, { width: colW });
      const oA = getOptStr(qRight.options?.[0]);
      const oB = getOptStr(qRight.options?.[1]);
      const oC = getOptStr(qRight.options?.[2]);
      const oD = getOptStr(qRight.options?.[3]);
      docPdf.fontSize(6.8).font('Helvetica').text(`  (A) ${oA}   (B) ${oB}`, rightX, qY3 + 10, { width: colW });
      docPdf.text(`  (C) ${oC}   (D) ${oD}`, rightX, qY3 + 18, { width: colW });
    }

    qY3 += 28;
  }
  docPdf.fontSize(6.5).font('Helvetica').text('Subject: General Science & Competency | Page 3 of 3', startX, 810);

  docPdf.end();
}

app.get('/api/exams/:examId/set/:setCode/pdf', async (req: Request, res: Response) => {
  try {
    const { examId, setCode } = req.params;

    // Fetch exam document from Firestore
    const examDocRef = doc(firestoreDb, 'exams', examId);
    const examSnap = await getDoc(examDocRef);

    if (!examSnap.exists()) {
      return res.status(404).send('Exam not found in Firebase Firestore');
    }

    const exam = examSnap.data() as StoredExam;
    const sets: GeneratedExamSet[] = exam.sets || (exam.offlineSets as any) || [];

    const normalizedCode = String(setCode).replace(/^Set-?/i, 'Set-');
    const targetSet = sets.find(
      s => s.setCode && (
        s.setCode.toUpperCase() === String(setCode).toUpperCase() ||
        s.setCode.replace(/^Set-?/i, 'Set-').toUpperCase() === normalizedCode.toUpperCase()
      )
    ) || sets[0];

    if (!targetSet) {
      return res.status(404).send(`Set ${setCode} not found for this exam in Firestore`);
    }

    return await buildPdfKitQuestionPaper(exam, targetSet, res);
  } catch (err: any) {
    console.error('[Firestore Error] PDF generation failed:', err);
    return res.status(500).send('Failed to generate PDF: ' + err.message);
  }
});

// Direct PDF generation endpoint from client payload (Works instantly for unsaved or local sets)
app.post('/api/exams/generate-pdf', async (req: Request, res: Response) => {
  try {
    const { exam, targetSet, setCode } = req.body;
    if (!exam) {
      return res.status(400).send('Exam object is required');
    }

    const sets: any[] = exam.sets || exam.offlineSets || [];
    const normalizedCode = String(setCode || targetSet?.setCode || 'Set-01').replace(/^Set-?/i, 'Set-');

    const currentSet = targetSet || sets.find(
      (s: any) => s.setCode && (
        s.setCode.toUpperCase() === normalizedCode.toUpperCase() ||
        String(s.setCode).replace(/^Set-?/i, 'Set-').toUpperCase() === normalizedCode.toUpperCase()
      )
    ) || sets[0] || {
      setCode: normalizedCode,
      qrData: `OMR:${exam.id || 'exam'}:${normalizedCode}`,
      questions: exam.questions || []
    };

    return await buildPdfKitQuestionPaper(exam, currentSet, res);
  } catch (err: any) {
    console.error('generate-pdf error:', err);
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
