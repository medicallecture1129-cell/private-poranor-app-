const express = require('express');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const cors = require('cors');

const app = express();
app.use(bodyParser.json({ limit: '15mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '15mb' }));
app.use(cors());

// ইন-মেমোরি ডাটাবেস (ডেমো হিসেবে)
let examsDB = [
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
          }
        ]
      },
      {
        setName: 'Set B',
        setCode: 'B',
        questions: [
          {
            qNo: 1,
            questionText: 'নিচের কোন হরমোনটি আপৎকালীন হরমোন? (Which hormone is the emergency hormone?)',
            options: ['অ্যাডরিনালিন (Adrenaline)', 'ইনসুলিন (Insulin)', 'থাইরক্সিন (Thyroxine)', 'গ্লুকাগন (Glucagon)'],
            correctAnswer: 0
          },
          {
            qNo: 2,
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

// ১. মাস্টার কোশ্চেনসহ অফলাইন এক্সাম তৈরি ও ইউনিক সেট জেনারেশন
const createExamHandler = (req, res) => {
  const { examName, courseName, masterQuestions, totalSets } = req.body;
  if (!examName || !courseName) {
    return res.status(400).json({ success: false, error: 'Exam Name and Course Name are required' });
  }
  const examId = Date.now().toString();

  const generatedSets = [];
  const maxSets = Math.min(Math.max(parseInt(totalSets) || 1, 1), 20); // সর্বোচ্চ ২০টি সেট
  const qList = Array.isArray(masterQuestions) && masterQuestions.length > 0 ? masterQuestions : [];

  for (let i = 1; i <= maxSets; i++) {
    const setCode = String.fromCharCode(64 + i); // সেট এ, বি, সি...
    
    // প্রশ্ন ও অপশন শাফেল করা
    const shuffledQuestions = [...qList].sort(() => Math.random() - 0.5);
    const finalQuestions = shuffledQuestions.map((q, idx) => {
      const qText = q.questionText || q.question || `Question ${idx + 1}`;
      let opts = Array.isArray(q.options) ? q.options : [];
      let mappedOpts = opts.map((opt, oIdx) => {
        if (typeof opt === 'object' && opt !== null) {
          return { text: String(opt.text || opt.title || `Option ${oIdx + 1}`).trim(), isCorrect: Boolean(opt.isCorrect) };
        }
        const isCorr = (q.answer !== undefined && q.answer === oIdx) || (q.correctAnswer !== undefined && q.correctAnswer === oIdx);
        return { text: String(opt).trim(), isCorrect: isCorr };
      });

      const shuffledOpts = [...mappedOpts].sort(() => Math.random() - 0.5);
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

  const newExam = { examId, examName, courseName, masterQuestions: qList, sets: generatedSets, totalSets: maxSets, createdAt: new Date().toISOString() };
  examsDB.unshift(newExam);
  res.json({ success: true, examId, message: "Exam and Unique Sets created successfully!", exam: newExam });
};

app.post('/api/exams/create', createExamHandler);
app.all('/api/exams/create', (req, res, next) => {
  if (req.method === 'POST') return createExamHandler(req, res);
  next();
});

// ২. নির্দিষ্ট সেটের জন্য মেডিকেল স্ট্যান্ডার্ড পিডিএফ (সিংগেল ওএমআর + নিচে প্রশ্ন) জেনারেট করা
app.get('/api/exams/:examId/set/:setCode/pdf', (req, res) => {
  const { examId, setCode } = req.params;
  const exam = examsDB.find(e => e.examId === examId);
  if (!exam) return res.status(404).send("Exam not found");

  const targetSet = exam.sets.find(s => s.setCode.toUpperCase() === String(setCode).toUpperCase());
  if (!targetSet) return res.status(404).send("Set not found");

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

  doc.rect(30, 70, 535, 60).stroke();
  doc.fontSize(9).font('Helvetica-Bold').text("STUDENT ID: [                      ]   |   ROLL NO: [                      ]   |   SET CODE: [ " + targetSet.setCode + " ]", 40, 86);
  
  doc.fontSize(8).font('Helvetica').text("Instructions: 1. Use black ballpoint pen only. 2. Fill the bubbles completely. 3. Negative marking -0.25 for wrong answer.", 40, 104);
  doc.fontSize(7.5).font('Helvetica').text("নির্দেশাবলি: ১. শুধুমাত্র কালো বলপয়েন্ট কলম ব্যবহার করুন। ২. সঠিক উত্তরের বৃত্ত সম্পূর্ণ ভরাট করুন। ৩. ভুল উত্তরের জন্য -০.২৫ নম্বর কাটা হবে।", 40, 116);
  
  doc.moveDown(3);
  doc.fontSize(10).font('Helvetica-Bold').text("OMR Answer Sheet (100 Questions Grid)", { align: 'center' });
  
  // ওএমআর গ্রিড সিমুলেশন (সংক্ষিপ্ত রূপ)
  let omrY = 160;
  for (let i = 1; i <= 25; i++) {
    const col1 = `${String(i).padStart(2, ' ')}. [A] [B] [C] [D]`;
    const col2 = `${String(i+25).padStart(2, ' ')}. [A] [B] [C] [D]`;
    const col3 = `${String(i+50).padStart(2, ' ')}. [A] [B] [C] [D]`;
    const col4 = `${String(i+75).padStart(2, ' ')}. [A] [B] [C] [D]`;
    doc.fontSize(8).font('Courier').text(`${col1}    ${col2}    ${col3}    ${col4}`, 40, omrY);
    omrY += 14;
  }

  // --- QUESTION PAPER PAGE ---
  doc.addPage();
  doc.fontSize(12).font('Helvetica-Bold').text(`Question Paper - ${exam.examName} (${targetSet.setName})`, { align: 'center' });
  doc.fontSize(9).font('Helvetica').text(`Total Questions: ${targetSet.questions.length} | Set Code: ${targetSet.setCode}`, { align: 'center' });
  doc.moveDown(1);

  targetSet.questions.forEach((q) => {
    doc.fontSize(9.5).font('Helvetica-Bold').text(`${q.qNo}. ${q.questionText}`);
    const optA = q.options[0] || '';
    const optB = q.options[1] || '';
    const optC = q.options[2] || '';
    const optD = q.options[3] || '';
    doc.fontSize(8.5).font('Helvetica').text(`   (A) ${optA}   (B) ${optB}   (C) ${optC}   (D) ${optD}`);
    doc.moveDown(0.5);
  });

  doc.end();
});

// ৩. ড্যাশবোর্ডের জন্য এক্সাম লিস্ট ও ডিলিট API
app.get('/api/exams', (req, res) => {
  res.json(examsDB);
});

app.delete('/api/exams/:examId', (req, res) => {
  examsDB = examsDB.filter(e => e.examId !== req.params.examId);
  res.json({ success: true, message: "Exam deleted successfully" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
