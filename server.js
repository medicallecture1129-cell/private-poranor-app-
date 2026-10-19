const express = require('express');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const cors = require('cors');
const { initializeApp, getApps, getApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc 
} = require('firebase/firestore');

const app = express();
app.use(bodyParser.json({ limit: '15mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '15mb' }));
app.use(cors());

// Firebase Cloud Firestore Config
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

// ১. মাস্টার কোশ্চেনসহ অফলাইন এক্সাম তৈরি ও ইউনিক সেট জেনারেশন (Firestore এ সেভ)
const createExamHandler = async (req, res) => {
  try {
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

    const now = Date.now();
    const newExamDoc = {
      id: examId,
      examId,
      examName: String(examName).trim(),
      title: String(examName).trim(),
      courseName: String(courseName).trim(),
      courseId: 'general',
      masterQuestions: qList,
      sets: generatedSets,
      totalSets: maxSets,
      totalQuestions: qList.length,
      isOffline: true,
      examType: 'offline',
      isActive: true,
      createdAt: now,
      updatedAt: now
    };

    // Store in Firebase Firestore 'exams' collection
    await setDoc(doc(firestoreDb, 'exams', examId), newExamDoc);

    res.json({
      success: true,
      examId,
      message: "Exam and Unique Sets created and saved in Firebase Firestore!",
      exam: newExamDoc
    });
  } catch (err) {
    console.error('[Firestore Error] create exam:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

app.post('/api/exams/create', createExamHandler);
app.all('/api/exams/create', (req, res, next) => {
  if (req.method === 'POST') return createExamHandler(req, res);
  next();
});

// ২. নির্দিষ্ট সেটের জন্য মেডিকেল স্ট্যান্ডার্ড পিডিএফ (Firestore থেকে ফেচ)
app.get('/api/exams/:examId/set/:setCode/pdf', async (req, res) => {
  try {
    const { examId, setCode } = req.params;
    const examDoc = await getDoc(doc(firestoreDb, 'exams', examId));

    if (!examDoc.exists()) {
      return res.status(404).send("Exam not found in Firestore");
    }

    const exam = examDoc.data();
    const targetSet = (exam.sets || []).find(s => s.setCode && s.setCode.toUpperCase() === String(setCode).toUpperCase());
    if (!targetSet) return res.status(404).send("Set not found in Firestore");

    const safeExamName = (exam.examName || exam.title || 'Exam').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeSetName = (targetSet.setName || `Set_${setCode}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Exam_${safeExamName}_${safeSetName}.pdf`);

    const docPdf = new PDFDocument({ size: 'A4', margin: 30 });
    docPdf.pipe(res);

    // Header
    docPdf.fontSize(12).font('Helvetica-Bold').text("DOCTORS' CARE ACADEMY - MEDICAL ADMISSION MODEL TEST", { align: 'center' });
    docPdf.moveDown(0.2);
    docPdf.fontSize(10).font('Helvetica').text(`Course: ${exam.courseName} | Exam: ${exam.examName || exam.title} | Set: ${targetSet.setCode}`, { align: 'center' });
    docPdf.moveDown(0.5);

    docPdf.rect(30, 70, 535, 60).stroke();
    docPdf.fontSize(9).font('Helvetica-Bold').text("STUDENT ID: [                      ]   |   ROLL NO: [                      ]   |   SET CODE: [ " + targetSet.setCode + " ]", 40, 86);
    
    docPdf.fontSize(8).font('Helvetica').text("Instructions: 1. Use black ballpoint pen only. 2. Fill the bubbles completely. 3. Negative marking -0.25 for wrong answer.", 40, 104);
    docPdf.fontSize(7.5).font('Helvetica').text("নির্দেশাবলি: ১. শুধুমাত্র কালো বলপয়েন্ট কলম ব্যবহার করুন। ২. সঠিক উত্তরের বৃত্ত সম্পূর্ণ ভরাট করুন। ৩. ভুল উত্তরের জন্য -০.২৫ নম্বর কাটা হবে।", 40, 116);
    
    docPdf.moveDown(3);
    docPdf.fontSize(10).font('Helvetica-Bold').text("OMR Answer Sheet (100 Questions Grid)", { align: 'center' });
    
    let omrY = 160;
    for (let i = 1; i <= 25; i++) {
      const col1 = `${String(i).padStart(2, ' ')}. [A] [B] [C] [D]`;
      const col2 = `${String(i+25).padStart(2, ' ')}. [A] [B] [C] [D]`;
      const col3 = `${String(i+50).padStart(2, ' ')}. [A] [B] [C] [D]`;
      const col4 = `${String(i+75).padStart(2, ' ')}. [A] [B] [C] [D]`;
      docPdf.fontSize(8).font('Courier').text(`${col1}    ${col2}    ${col3}    ${col4}`, 40, omrY);
      omrY += 14;
    }

    docPdf.addPage();
    docPdf.fontSize(12).font('Helvetica-Bold').text(`Question Paper - ${exam.examName || exam.title} (${targetSet.setName})`, { align: 'center' });
    docPdf.fontSize(9).font('Helvetica').text(`Total Questions: ${targetSet.questions ? targetSet.questions.length : 0} | Set Code: ${targetSet.setCode}`, { align: 'center' });
    docPdf.moveDown(1);

    if (targetSet.questions) {
      targetSet.questions.forEach((q) => {
        docPdf.fontSize(9.5).font('Helvetica-Bold').text(`${q.qNo}. ${q.questionText}`);
        const optA = q.options && q.options[0] ? q.options[0] : '';
        const optB = q.options && q.options[1] ? q.options[1] : '';
        const optC = q.options && q.options[2] ? q.options[2] : '';
        const optD = q.options && q.options[3] ? q.options[3] : '';
        docPdf.fontSize(8.5).font('Helvetica').text(`   (A) ${optA}   (B) ${optB}   (C) ${optC}   (D) ${optD}`);
        docPdf.moveDown(0.5);
      });
    }

    docPdf.end();
  } catch (err) {
    console.error('[Firestore Error] PDF generation:', err);
    res.status(500).send("Error generating PDF: " + err.message);
  }
});

// ৩. ড্যাশবোর্ডের জন্য এক্সাম লিস্ট ফেচ API (Firestore Query)
app.get('/api/exams', async (req, res) => {
  try {
    const snapshot = await getDocs(collection(firestoreDb, 'exams'));
    const examsList = [];
    snapshot.forEach(d => {
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
          createdAt: data.createdAt || 0
        });
      }
    });
    examsList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json(examsList);
  } catch (err) {
    console.error('[Firestore Error] get exams:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ৪. ড্যাশবোর্ড থেকে এক্সাম ডিলিট API (Firestore deleteDoc)
app.delete('/api/exams/:examId', async (req, res) => {
  try {
    const { examId } = req.params;
    await deleteDoc(doc(firestoreDb, 'exams', examId));
    res.json({ success: true, message: "Exam deleted successfully from Firestore" });
  } catch (err) {
    console.error('[Firestore Error] delete exam:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT} with Firebase Firestore connected.`));
