import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { Exam, MCQOption, OfflineExamSet, OfflineExamSetQuestion } from '../types';

/**
 * Scramble questions and options for a specific Set (e.g. Set A, Set B, Set C, Set D)
 * Preserves the true correct answer mapping!
 */
export const generateShuffledSet = (
  exam: Exam,
  setCode: string
): OfflineExamSet => {
  // Fisher-Yates shuffle helper with deterministic seed based on setCode and exam.id
  const seed = `${exam.id}_${setCode}`;
  let seedNum = 0;
  for (let i = 0; i < seed.length; i++) {
    seedNum = (seedNum * 31 + seed.charCodeAt(i)) >>> 0;
  }

  const seededRandom = () => {
    seedNum = (seedNum * 1664525 + 1013904223) >>> 0;
    return (seedNum >>> 0) / 4294967296;
  };

  // 1. Shuffle Questions
  const shuffledQuestions = [...exam.questions];
  for (let i = shuffledQuestions.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    [shuffledQuestions[i], shuffledQuestions[j]] = [shuffledQuestions[j], shuffledQuestions[i]];
  }

  const answerKey: Record<number, string> = {};
  const questionOrder: OfflineExamSetQuestion[] = [];

  shuffledQuestions.forEach((masterQ, idx) => {
    const qNum = idx + 1;
    // Find text of correct option in master question
    const originalCorrectOpt = masterQ.options.find(o => o.id === masterQ.correctOption);
    const correctText = originalCorrectOpt ? originalCorrectOpt.text : '';

    // Shuffle options for this question
    const shuffledOpts = [...masterQ.options];
    for (let i = shuffledOpts.length - 1; i > 0; i--) {
      const j = Math.floor(seededRandom() * (i + 1));
      [shuffledOpts[i], shuffledOpts[j]] = [shuffledOpts[j], shuffledOpts[i]];
    }

    // Re-assign letter labels A, B, C, D
    const letters = ['A', 'B', 'C', 'D'];
    let newCorrectOption = 'A';
    const finalOptions: MCQOption[] = shuffledOpts.map((opt, optIdx) => {
      const newLetter = letters[optIdx] || 'A';
      if (opt.text === correctText) {
        newCorrectOption = newLetter;
      }
      return {
        id: newLetter,
        text: opt.text
      };
    });

    answerKey[qNum] = newCorrectOption;
    questionOrder.push({
      questionNumber: qNum,
      masterQuestionId: masterQ.id,
      text: masterQ.text,
      options: finalOptions,
      correctOption: newCorrectOption,
      topic: masterQ.topic
    });
  });

  const qrPayload = JSON.stringify({
    eId: exam.id,
    set: setCode,
    total: questionOrder.length,
    mpq: Number((exam.totalMarks / (exam.questions.length || 1)).toFixed(2)),
    neg: exam.negativeMarkPercentage || 0.25,
    key: answerKey
  });

  return {
    setCode,
    qrData: qrPayload,
    questions: questionOrder,
    answerKey,
    createdAt: Date.now()
  };
};

/**
 * Generate Printable Medical Admission Style PDF with:
 * 1. Admission Test Question Paper (2-column layout, Bengali styling)
 * 2. Official Medical-style OMR Answer Sheet with Roll number grid & QR code
 * 3. Official Teacher Solution Key
 */
export const generateAdmissionStylePDF = async (
  exam: Exam,
  set: OfflineExamSet
): Promise<Blob> => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Generate QR Code data URL
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(set.qrData, {
      margin: 1,
      width: 250,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('QR code generation failed:', err);
  }

  // ==========================================
  // PAGE 1+: QUESTION PAPER (Medical Admission Style)
  // ==========================================
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;
  const colGap = 8;
  const colWidth = (pageWidth - margin * 2 - colGap) / 2;

  let currentPage = 1;
  let currentY = 58;
  let currentX = margin;
  let isRightCol = false;

  const drawHeader = () => {
    // Top Border & Crest header
    doc.setDrawColor(20, 40, 80);
    doc.setLineWidth(0.8);
    doc.rect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2);

    doc.setFillColor(240, 244, 250);
    doc.rect(margin + 1, margin + 1, pageWidth - margin * 2 - 2, 28, 'F');

    // Title & Institutional Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 30, 70);
    doc.text('MEDICAL & DENTAL ADMISSION MODEL TEST', pageWidth / 2, margin + 8, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text(exam.title.toUpperCase(), pageWidth / 2, margin + 14, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Course: ${exam.courseName}   |   Time: ${exam.durationMinutes} Minutes   |   Total Marks: ${exam.totalMarks}`, pageWidth / 2, margin + 20, { align: 'center' });
    doc.text(`Negative Marking: Each wrong answer deducts ${(exam.negativeMarkPercentage || 0.25) * 100}% marks. Fill OMR sheet with black ballpoint pen.`, pageWidth / 2, margin + 25, { align: 'center' });

    // Set Code Badge
    doc.setFillColor(20, 40, 80);
    doc.roundedRect(pageWidth - margin - 32, margin + 3, 30, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`SET - ${set.setCode}`, pageWidth - margin - 17, margin + 9.5, { align: 'center' });

    // Horizontal Rule
    doc.setDrawColor(180, 190, 205);
    doc.setLineWidth(0.5);
    doc.line(margin + 2, margin + 30, pageWidth - margin - 2, margin + 30);

    // Column Divider Line
    doc.line(pageWidth / 2, margin + 32, pageWidth / 2, pageHeight - margin - 6);

    // Footer page number
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Set ${set.setCode} - Page ${currentPage}`, pageWidth / 2, pageHeight - margin + 4, { align: 'center' });
  };

  drawHeader();

  // Render Questions in 2 Columns
  const questions = set.questions;
  const startY = margin + 34;
  currentY = startY;

  for (let qIdx = 0; qIdx < questions.length; qIdx++) {
    const q = questions[qIdx];
    const qNum = q.questionNumber;

    // Estimate question height
    const qTextLines = doc.splitTextToSize(`${qNum}. ${q.text}`, colWidth - 2);
    const qHeight = qTextLines.length * 4 + 4 + (q.options.length * 4) + 2;

    // Check if question fits in column
    if (currentY + qHeight > pageHeight - margin - 8) {
      if (!isRightCol) {
        // Move to right column
        isRightCol = true;
        currentX = margin + colWidth + colGap;
        currentY = startY;
      } else {
        // Move to next page
        doc.addPage();
        currentPage++;
        isRightCol = false;
        currentX = margin;
        currentY = startY;
        drawHeader();
      }
    }

    // Render Question Text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(qTextLines, currentX, currentY);
    currentY += qTextLines.length * 4 + 1;

    // Render 4 Options
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);

    q.options.forEach((opt) => {
      const optText = `(${opt.id}) ${opt.text}`;
      const optLines = doc.splitTextToSize(optText, colWidth - 4);
      doc.text(optLines, currentX + 3, currentY);
      currentY += optLines.length * 3.6;
    });

    currentY += 3; // gap between questions
  }

  // ==========================================
  // PAGE 2: OFFICIAL OMR ANSWER SHEET (Medical Style)
  // ==========================================
  doc.addPage();
  currentPage++;

  // Draw OMR Sheet Outer Frame
  doc.setDrawColor(20, 40, 80);
  doc.setLineWidth(1);
  doc.rect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2);

  // OMR Header
  doc.setFillColor(243, 244, 246);
  doc.rect(margin + 1, margin + 1, pageWidth - margin * 2 - 2, 34, 'F');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('OMR ANSWER SHEET (ওএমআর উত্তরপত্র)', pageWidth / 2, margin + 8, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`EXAM: ${exam.title.toUpperCase()}  |  COURSE: ${exam.courseName.toUpperCase()}`, pageWidth / 2, margin + 14, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Use Black Ballpoint Pen only. Fill the circles completely. Do not fold or tear this sheet.', pageWidth / 2, margin + 19, { align: 'center' });

  // Draw Set Code Badge & QR Code on Top Right
  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', pageWidth - margin - 30, margin + 2, 28, 28);
  }

  // Set Code text
  doc.setFillColor(20, 40, 80);
  doc.roundedRect(margin + 5, margin + 22, 40, 9, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(`QUESTION SET - ${set.setCode}`, margin + 25, margin + 28, { align: 'center' });

  // Candidate Information & Roll Number Grid
  const candidateInfoY = margin + 38;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin + 4, candidateInfoY, pageWidth - margin * 2 - 8, 48, 2, 2);

  // Student Name Line
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text("Candidate's Name (English Block Letters):", margin + 8, candidateInfoY + 6);
  doc.setDrawColor(148, 163, 184);
  doc.line(margin + 70, candidateInfoY + 6, pageWidth - margin - 10, candidateInfoY + 6);

  // Student College Line
  doc.text("College / Institution Name:", margin + 8, candidateInfoY + 12);
  doc.line(margin + 52, candidateInfoY + 12, pageWidth - margin - 10, candidateInfoY + 12);

  // Roll Number Section with 6-digit boxes & bubble matrix
  const rollSectionX = margin + 10;
  const rollSectionY = candidateInfoY + 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('STUDENT ROLL NO. (রোল নম্বর):', rollSectionX, rollSectionY);

  // 6 digit boxes
  const boxWidth = 6.5;
  const boxHeight = 6.5;
  const startBoxX = rollSectionX + 65;
  for (let b = 0; b < 6; b++) {
    doc.rect(startBoxX + b * boxWidth, rollSectionY - 4.5, boxWidth, boxHeight);
  }

  // 0-9 Bubble columns below Roll boxes
  const bubbleStartY = rollSectionY + 4;
  for (let digit = 0; digit <= 9; digit++) {
    for (let col = 0; col < 6; col++) {
      const cx = startBoxX + col * boxWidth + boxWidth / 2;
      const cy = bubbleStartY + digit * 2.5;
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.3);
      doc.circle(cx, cy, 1.1);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(4.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`${digit}`, cx, cy + 0.5, { align: 'center' });
    }
  }

  // Set Code Selection Bubbles
  const setBubbleX = rollSectionX + 115;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text('SET CODE (সেট কোড):', setBubbleX, rollSectionY);

  const setLetters = ['A', 'B', 'C', 'D'];
  setLetters.forEach((letter, sIdx) => {
    const cx = setBubbleX + 5 + sIdx * 9;
    const cy = rollSectionY + 6;
    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.4);
    if (letter === set.setCode) {
      // Pre-fill or highlight set bubble
      doc.setFillColor(30, 41, 59);
      doc.circle(cx, cy, 2.2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(255, 255, 255);
      doc.text(letter, cx, cy + 0.8, { align: 'center' });
    } else {
      doc.circle(cx, cy, 2.2);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(30, 41, 59);
      doc.text(letter, cx, cy + 0.8, { align: 'center' });
    }
  });

  // OMR Answer Bubbles Matrix
  // 1 to N questions (standard up to 100 questions, formatted in 4 columns of 25)
  const omrGridY = candidateInfoY + 52;
  const numQuestions = Math.min(questions.length, 100);
  const totalCols = numQuestions <= 50 ? 2 : 4;
  const rowsPerCol = Math.ceil(numQuestions / totalCols);
  const gridColWidth = (pageWidth - margin * 2 - 8) / totalCols;

  for (let c = 0; c < totalCols; c++) {
    const colX = margin + 4 + c * gridColWidth;
    
    // Column header
    doc.setFillColor(241, 245, 249);
    doc.rect(colX, omrGridY, gridColWidth - 3, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Q#    (A)    (B)    (C)    (D)', colX + (gridColWidth - 3) / 2, omrGridY + 3.5, { align: 'center' });

    for (let r = 0; r < rowsPerCol; r++) {
      const qNum = c * rowsPerCol + r + 1;
      if (qNum > numQuestions) break;

      const rowY = omrGridY + 7 + r * 4.8;

      // Question Number
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(30, 41, 59);
      doc.text(`${qNum}`.padStart(3, '0'), colX + 4, rowY + 0.8);

      // Bubbles A, B, C, D
      const optLetters = ['A', 'B', 'C', 'D'];
      const bubbleStartX = colX + 13;
      const bubbleSpacing = 6.2;

      optLetters.forEach((opt, oIdx) => {
        const bx = bubbleStartX + oIdx * bubbleSpacing;
        doc.setDrawColor(100, 116, 139);
        doc.setLineWidth(0.35);
        doc.circle(bx, rowY, 1.8);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5);
        doc.setTextColor(100, 116, 139);
        doc.text(opt, bx, rowY + 0.6, { align: 'center' });
      });
    }
  }

  // Candidate Signature and Teacher Signature line
  const sigY = pageHeight - margin - 14;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.5);

  doc.line(margin + 10, sigY, margin + 65, sigY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text("Candidate's Signature & Date", margin + 37, sigY + 4, { align: 'center' });

  doc.line(pageWidth - margin - 65, sigY, pageWidth - margin - 10, sigY);
  doc.text("Invigilator's Signature & Date", pageWidth - margin - 37, sigY + 4, { align: 'center' });

  // ==========================================
  // PAGE 3: TEACHER MASTER ANSWER KEY REFERENCE
  // ==========================================
  doc.addPage();
  currentPage++;

  doc.setDrawColor(20, 40, 80);
  doc.setLineWidth(0.8);
  doc.rect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2);

  doc.setFillColor(240, 244, 250);
  doc.rect(margin + 1, margin + 1, pageWidth - margin * 2 - 2, 20, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 30, 70);
  doc.text(`CONFIDENTIAL TEACHER ANSWER KEY: SET - ${set.setCode}`, pageWidth / 2, margin + 9, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Exam: ${exam.title}   |   Total Questions: ${questions.length}   |   Set Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, margin + 15, { align: 'center' });

  // Solutions Grid
  const ansStartY = margin + 26;
  const ansCols = 5;
  const ansRows = Math.ceil(questions.length / ansCols);
  const ansColWidth = (pageWidth - margin * 2 - 8) / ansCols;

  for (let c = 0; c < ansCols; c++) {
    const ax = margin + 4 + c * ansColWidth;
    for (let r = 0; r < ansRows; r++) {
      const qNum = c * ansRows + r + 1;
      if (qNum > questions.length) break;

      const ay = ansStartY + r * 5.2;
      const ans = set.answerKey[qNum] || '-';

      doc.setFillColor(r % 2 === 0 ? 255 : 248, r % 2 === 0 ? 255 : 250, r % 2 === 0 ? 255 : 252);
      doc.rect(ax, ay - 3.5, ansColWidth - 2, 5, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.rect(ax, ay - 3.5, ansColWidth - 2, 5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Q${qNum}:`, ax + 3, ay);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(22, 163, 74);
      doc.text(`[ ${ans} ]`, ax + 18, ay);
    }
  }

  return doc.output('blob');
};
