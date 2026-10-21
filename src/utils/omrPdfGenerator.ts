import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { Exam, MCQOption, OfflineExamSet, OfflineExamSetQuestion } from '../types';

export interface PdfGenerationOptions {
  appName?: string;
  watermarkText?: string;
}

/**
 * Deterministic PRNG seeded by string
 */
function createSeededRandom(seedStr: string) {
  let seedNum = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seedNum = (seedNum * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  return () => {
    seedNum = (seedNum * 1664525 + 1013904223) >>> 0;
    return (seedNum >>> 0) / 4294967296;
  };
}

/**
 * Scramble questions sequence AND options order (A, B, C, D)
 * Preserves true correct answer mapping!
 */
export const generateShuffledSet = (
  exam: Exam,
  setCode: string
): OfflineExamSet => {
  const seededRandom = createSeededRandom(`${exam.id}_${setCode}_unique_omr_seed_v4`);

  // 1. Shuffle Questions sequence
  const shuffledQuestions = [...exam.questions];
  for (let i = shuffledQuestions.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    [shuffledQuestions[i], shuffledQuestions[j]] = [shuffledQuestions[j], shuffledQuestions[i]];
  }

  const answerKey: Record<number, string> = {};
  const questionOrder: OfflineExamSetQuestion[] = [];

  shuffledQuestions.forEach((masterQ, idx) => {
    const qNum = idx + 1;
    const originalCorrectOpt = masterQ.options.find(o => o.id === masterQ.correctOption);
    const correctText = originalCorrectOpt ? originalCorrectOpt.text : '';

    // Shuffle options for this question
    const shuffledOpts = [...masterQ.options];
    for (let i = shuffledOpts.length - 1; i > 0; i--) {
      const j = Math.floor(seededRandom() * (i + 1));
      [shuffledOpts[i], shuffledOpts[j]] = [shuffledOpts[j], shuffledOpts[i]];
    }

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

  // Normalized set code, e.g. Set-01
  const cleanCode = setCode.startsWith('Set-') || setCode.startsWith('Set ') ? setCode : `Set-${setCode}`;
  const qrPayload = `OMR:${exam.id}:${cleanCode}`;

  return {
    setCode: cleanCode,
    qrData: qrPayload,
    questions: questionOrder,
    answerKey,
    createdAt: Date.now()
  };
};

/**
 * Generate unique sets in batch (Set-01, Set-02, ..., Set-10)
 */
export const generateBatchSets = (
  exam: Exam,
  count: number = 4,
  startNumber: number = 1
): OfflineExamSet[] => {
  const sets: OfflineExamSet[] = [];
  for (let i = 0; i < count; i++) {
    const num = startNumber + i;
    const setCode = `Set-${String(num).padStart(2, '0')}`;
    sets.push(generateShuffledSet(exam, setCode));
  }
  return sets;
};

/**
 * Bengali number converter
 */
export const toBengaliNumber = (num: number | string): string => {
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(num).replace(/[0-9]/g, (d) => bnDigits[parseInt(d, 10)]);
};

/**
 * 1. Render Student ID 6-Digit OMR Bubble Grid (Box 1 of Demo Layout)
 * Top header: Solid black background with text "Student ID"
 * 6 columns of circular bubbles for digits 0-9
 */
function renderStudentIdBox(): string {
  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  return `
    <div style="width: 175px; border: 1.5px solid #000000; box-sizing: border-box; display: flex; flex-direction: column; background: #ffffff;">
      <!-- Black Header -->
      <div style="background: #000000; color: #ffffff; text-align: center; font-weight: 900; font-size: 11px; padding: 4.5px 0; letter-spacing: 0.5px;">
        Student ID
      </div>
      <!-- 6 Columns of Bubbles -->
      <div style="display: flex; justify-content: space-between; padding: 5px 8px 4px 8px; flex: 1;">
        ${[0, 1, 2, 3, 4, 5].map(() => `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: space-between; gap: 1.5px;">
            ${digits.map(d => `
              <div style="width: 12.5px; height: 12.5px; min-width: 12.5px; min-height: 12.5px; border-radius: 50%; border: 0.85px solid #000000; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: #ffffff; overflow: hidden; line-height: 1;">
                <span style="font-size: 6px; font-weight: 800; line-height: 1; text-align: center; color: #000000; font-family: Arial, Helvetica, sans-serif; display: block; margin-top: -0.5px;">
                  ${d}
                </span>
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * 2. Render QR Code & Set Number Box (Box 2 of Demo Layout)
 * Centered QR Code at top, "Set -01" in clean bold font underneath
 */
function renderQrCodeBox(qrDataUrl: string, setCode: string): string {
  const displaySet = setCode.replace(/Set-?/i, 'Set -');
  return `
    <div style="width: 140px; border: 1.5px solid #000000; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6px; background: #ffffff;">
      <div style="width: 95px; height: 95px; display: flex; align-items: center; justify-content: center;">
        <img src="${qrDataUrl}" style="width: 90px; height: 90px; display: block;" />
      </div>
      <div style="font-size: 15px; font-weight: 900; font-family: sans-serif; color: #000000; margin-top: 10px; letter-spacing: 0.5px;">
        ${displaySet}
      </div>
    </div>
  `;
}

/**
 * 3. Render Exam Metadata & Candidate Box (Box 3 of Demo Layout)
 * Title, Course Name, Total Questions, Total Marks, Negative Mark, Exam Date, Candidate Name
 */
function renderExamInfoBox(exam: Exam): string {
  const title = exam.title || (exam as any).examName || 'Weekly Exam - 01';
  const subtitle = exam.courseName || (exam as any).course || 'Biology 1st Paper (Chapter-01)';
  const totalQ = exam.totalQuestions || exam.questions?.length || 100;
  const totalM = exam.totalMarks || totalQ;
  const negMark = exam.negativeMarkPercentage !== undefined ? exam.negativeMarkPercentage : 0.25;

  return `
    <div style="flex: 1; border: 1.5px solid #000000; box-sizing: border-box; padding: 8px 12px; display: flex; flex-direction: column; justify-content: space-between; background: #f8fafc;">
      <div>
        <div style="font-size: 16px; font-weight: 900; color: #000000; line-height: 1.2;">
          ${title}
        </div>
        <div style="font-size: 13.5px; font-weight: 700; color: #1e293b; margin-top: 2px;">
          ${subtitle}
        </div>
      </div>

      <div style="font-size: 11px; line-height: 1.45; color: #000000; font-weight: 600; margin-top: 4px;">
        <div><strong>Total Questions:</strong> ${totalQ} MCQs</div>
        <div><strong>Total Marks:</strong> ${totalM} Marks</div>
        <div><strong>Negative Mark:</strong> ${negMark} / Question</div>
        <div><strong>Date of Exam:</strong> ....../....../............</div>
      </div>

      <div style="font-size: 12px; font-weight: 700; color: #000000; margin-top: 6px; border-top: 0.6px dashed #94a3b8; padding-top: 5px;">
        Candidate Name: ....................................................
      </div>
    </div>
  `;
}

/**
 * 4. Render 100-Question OMR Bubble Sheet Grid (Middle Section of Demo Layout)
 * 4 columns of 25 questions:
 * Col 1: 1-25 | Col 2: 26-50 | Col 3: 51-75 | Col 4: 76-100
 * Headers: Q. | ANS
 */
function renderOmr100Grid(): string {
  const columns = [
    { start: 1, end: 25 },
    { start: 26, end: 50 },
    { start: 51, end: 75 },
    { start: 76, end: 100 }
  ];

  return `
    <div style="width: 100%; border: 1.5px solid #000000; box-sizing: border-box; display: flex; background: #ffffff; margin-top: 7px;">
      ${columns.map((col, colIdx) => `
        <div style="flex: 1; border-right: ${colIdx < 3 ? '1.5px solid #000000' : 'none'}; display: flex; flex-direction: column;">
          <!-- Header -->
          <div style="display: flex; align-items: center; background: #f1f5f9; border-bottom: 1.2px solid #000000; padding: 2px 0;">
            <div style="width: 25px; text-align: center; font-size: 7.5px; font-weight: 900; color: #000000; border-right: 0.8px solid #cbd5e1;">
              Q.
            </div>
            <div style="flex: 1; text-align: center; font-size: 7.5px; font-weight: 900; color: #000000; letter-spacing: 1px;">
              ANS
            </div>
          </div>
          <!-- Rows (25 questions) -->
          <div style="display: flex; flex-direction: column;">
            ${Array.from({ length: 25 }, (_, r) => {
              const qNum = col.start + r;
              return `
                <div style="display: flex; align-items: center; height: 11.8px; border-bottom: ${r < 24 ? '0.6px solid #e2e8f0' : 'none'}; padding: 0 1px; box-sizing: border-box;">
                  <div style="width: 24px; text-align: center; font-size: 7px; font-weight: 800; font-family: monospace; color: #000000; border-right: 0.6px solid #e2e8f0; padding-right: 1px;">
                    ${qNum}
                  </div>
                  <div style="flex: 1; display: flex; justify-content: space-around; align-items: center; padding: 0 3px;">
                    ${['A', 'B', 'C', 'D'].map(opt => `
                      <div style="width: 9.8px; height: 9.8px; min-width: 9.8px; min-height: 9.8px; border-radius: 50%; border: 0.8px solid #000000; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: #ffffff; overflow: hidden; line-height: 1;">
                        <span style="font-size: 4.8px; font-weight: 800; line-height: 1; text-align: center; color: #000000; font-family: Arial, Helvetica, sans-serif; display: block; margin-top: -0.5px;">
                          ${opt}
                        </span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * 5. Render MCQ Question block in clean 2-column format (strictly matching Demo PDF)
 */
function renderQuestionItem(q: OfflineExamSetQuestion): string {
  const qNumStr = String(q.questionNumber).padStart(2, '0');
  const opts = q.options || [];
  const optA = opts[0]?.text || '';
  const optB = opts[1]?.text || '';
  const optC = opts[2]?.text || '';
  const optD = opts[3]?.text || '';

  return `
    <div style="margin-bottom: 6px; font-size: 8.5px; line-height: 1.25; page-break-inside: avoid; color: #000000;">
      <div style="font-weight: 800; margin-bottom: 1.5px; color: #000000;">
        <span style="font-weight: 900; font-family: monospace;">${qNumStr}.</span> ${q.text}
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1px 6px; padding-left: 5px; font-size: 7.8px; color: #000000;">
        <div><strong>(A)</strong> ${optA}</div>
        <div><strong>(B)</strong> ${optB}</div>
        <div><strong>(C)</strong> ${optC}</div>
        <div><strong>(D)</strong> ${optD}</div>
      </div>
    </div>
  `;
}

/**
 * Build Full 3-Page Portrait HTML Strictly Matching Demo PDF:
 * - Page 1:
 *   - Top section: Student ID Box, QR & Set Box, Exam Info Box
 *   - Middle section: 100-Question OMR Grid Table
 *   - Center pill: "বহুনির্বাচনি প্রশ্ন"
 *   - Questions 1 to 24 (2 columns: 1-12 left, 13-24 right)
 * - Page 2:
 *   - Top line header: QUESTION PAPER - PART 2
 *   - Questions 25 to 62 (2 columns: 25-43 left, 44-62 right)
 * - Page 3:
 *   - Top line header: QUESTION PAPER - PART 3
 *   - Questions 63 to 100 (2 columns: 63-81 left, 82-100 right)
 *   - Footer: Subject & Page Number
 */
export function buildUnmeshStyleHtml(
  exam: Exam,
  set: OfflineExamSet,
  qrDataUrl: string
): { page1Html: string; page2Html: string; page3Html: string } {
  // Page 1 Questions: 1 to 24
  const p1Questions = set.questions.slice(0, 24);
  const p1Col1 = p1Questions.slice(0, 12);
  const p1Col2 = p1Questions.slice(12, 24);

  // Page 2 Questions: 25 to 62
  const p2Questions = set.questions.slice(24, 62);
  const p2Col1 = p2Questions.slice(0, 19);
  const p2Col2 = p2Questions.slice(19, 38);

  // Page 3 Questions: 63 to 100
  const p3Questions = set.questions.slice(62, 100);
  const p3Col1 = p3Questions.slice(0, 19);
  const p3Col2 = p3Questions.slice(19, 38);

  const pageContainerStyle = `
    font-family: 'Hind Siliguri', 'Noto Sans Bengali', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #000000;
    background: #ffffff;
    width: 794px;   /* A4 Portrait width in px at 96 DPI */
    height: 1123px; /* A4 Portrait height in px at 96 DPI */
    padding: 24px 28px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  `;

  // PAGE 1 HTML
  const page1Html = `
    <div style="${pageContainerStyle}">
      <!-- 4 Corner Registration Square Fiducial Markers for Computer Vision Alignment -->
      <div style="position: absolute; top: 12px; left: 14px; width: 8px; height: 8px; background: #000000;"></div>
      <div style="position: absolute; top: 12px; right: 14px; width: 8px; height: 8px; background: #000000;"></div>
      <div style="position: absolute; bottom: 12px; left: 14px; width: 8px; height: 8px; background: #000000;"></div>
      <div style="position: absolute; bottom: 12px; right: 14px; width: 8px; height: 8px; background: #000000;"></div>

      <!-- Top Section (Row 1): 3 Bordered Boxes -->
      <div style="display: flex; gap: 8px; height: 160px; box-sizing: border-box;">
        ${renderStudentIdBox()}
        ${renderQrCodeBox(qrDataUrl, set.setCode)}
        ${renderExamInfoBox(exam)}
      </div>

      <!-- Middle Section: 100-Question OMR Bubble Sheet Grid -->
      ${renderOmr100Grid()}

      <!-- Divider Pill: বহুনির্বাচনি প্রশ্ন -->
      <div style="display: flex; align-items: center; justify-content: center; margin: 10px 0 8px 0; position: relative;">
        <div style="position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: #000000; z-index: 1;"></div>
        <div style="position: relative; z-index: 2; background: #ffffff; padding: 0 14px;">
          <div style="border: 1.2px solid #000000; border-radius: 12px; padding: 2px 16px; font-size: 9.5px; font-weight: 900; color: #000000; background: #ffffff;">
            বহুনির্বাচনি প্রশ্ন
          </div>
        </div>
      </div>

      <!-- Page 1 Questions (Q. 01 - 24 in 2 Columns) -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; flex: 1;">
        <div>
          ${p1Col1.map(renderQuestionItem).join('')}
        </div>
        <div>
          ${p1Col2.map(renderQuestionItem).join('')}
        </div>
      </div>

      <!-- Footer Page 1 -->
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 7.5px; color: #475569; border-top: 0.8px solid #cbd5e1; padding-top: 3px; margin-top: 4px;">
        <span>Subject: ${exam.subject || exam.courseName || 'General Science & Competency'}</span>
        <span style="font-weight: 800; color: #000000;">Page 1 of 3</span>
      </div>
    </div>
  `;

  // PAGE 2 HTML (Questions 25 to 62)
  const page2Html = `
    <div style="${pageContainerStyle}">
      <!-- Top Header Line -->
      <div style="border-bottom: 1.5px solid #000000; padding-bottom: 3px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 10px; font-weight: 900; color: #000000;">
          QUESTION PAPER - PART 2 (Q. 25 - 62)
        </div>
        <div style="font-size: 9px; font-weight: 800; color: #000000; font-family: monospace;">
          ${set.setCode} • ${exam.title}
        </div>
      </div>

      <!-- 2 Columns Questions -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; flex: 1;">
        <div>
          ${p2Col1.map(renderQuestionItem).join('')}
        </div>
        <div>
          ${p2Col2.map(renderQuestionItem).join('')}
        </div>
      </div>

      <!-- Footer Page 2 -->
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 7.5px; color: #475569; border-top: 0.8px solid #cbd5e1; padding-top: 3px; margin-top: 4px;">
        <span>Subject: ${exam.subject || exam.courseName || 'General Science & Competency'}</span>
        <span style="font-weight: 800; color: #000000;">Page 2 of 3</span>
      </div>
    </div>
  `;

  // PAGE 3 HTML (Questions 63 to 100)
  const page3Html = `
    <div style="${pageContainerStyle}">
      <!-- Top Header Line -->
      <div style="border-bottom: 1.5px solid #000000; padding-bottom: 3px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 10px; font-weight: 900; color: #000000;">
          QUESTION PAPER - PART 3 (Q. 63 - 100)
        </div>
        <div style="font-size: 9px; font-weight: 800; color: #000000; font-family: monospace;">
          ${set.setCode} • ${exam.title}
        </div>
      </div>

      <!-- 2 Columns Questions -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; flex: 1;">
        <div>
          ${p3Col1.map(renderQuestionItem).join('')}
        </div>
        <div>
          ${p3Col2.map(renderQuestionItem).join('')}
        </div>
      </div>

      <!-- Footer Page 3 -->
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 7.5px; color: #475569; border-top: 0.8px solid #cbd5e1; padding-top: 3px; margin-top: 4px;">
        <span>Subject: ${exam.subject || exam.courseName || 'General Science & Competency'}</span>
        <span style="font-weight: 800; color: #000000;">Page 3 of 3</span>
      </div>
    </div>
  `;

  return { page1Html, page2Html, page3Html };
}

/**
 * Generate 3-Page Printable Portrait PDF strictly matching demo layout
 */
export const generateAdmissionStylePDF = async (
  exam: Exam,
  set: OfflineExamSet,
  _options: PdfGenerationOptions = {}
): Promise<Blob> => {
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(set.qrData, {
      margin: 1,
      width: 256,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('QR code generation failed:', err);
  }

  const { page1Html, page2Html, page3Html } = buildUnmeshStyleHtml(exam, set, qrDataUrl);

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = '794px';
  container.style.height = '1123px';
  container.style.zIndex = '-99999';
  container.style.pointerEvents = 'none';
  container.style.opacity = '0.001';
  container.style.overflow = 'hidden';
  document.body.appendChild(container);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const canvasOptions = {
    scale: 2.0,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
    width: 794,
    height: 1123,
    windowWidth: 794,
    windowHeight: 1123,
    x: 0,
    y: 0
  };

  try {
    // 1. PAGE 1 (Student ID, QR Code, Exam Info, OMR 100 Grid, Q 01-24)
    container.innerHTML = page1Html;
    await new Promise(r => setTimeout(r, 120));
    const canvas1 = await html2canvas(container.firstElementChild as HTMLElement, canvasOptions);
    const imgData1 = canvas1.toDataURL('image/jpeg', 0.96);
    doc.addImage(imgData1, 'JPEG', 0, 0, 210, 297);

    // 2. PAGE 2 (Questions 25 to 62)
    doc.addPage('a4', 'portrait');
    container.innerHTML = page2Html;
    await new Promise(r => setTimeout(r, 120));
    const canvas2 = await html2canvas(container.firstElementChild as HTMLElement, canvasOptions);
    const imgData2 = canvas2.toDataURL('image/jpeg', 0.96);
    doc.addImage(imgData2, 'JPEG', 0, 0, 210, 297);

    // 3. PAGE 3 (Questions 63 to 100)
    doc.addPage('a4', 'portrait');
    container.innerHTML = page3Html;
    await new Promise(r => setTimeout(r, 120));
    const canvas3 = await html2canvas(container.firstElementChild as HTMLElement, canvasOptions);
    const imgData3 = canvas3.toDataURL('image/jpeg', 0.96);
    doc.addImage(imgData3, 'JPEG', 0, 0, 210, 297);

    return doc.output('blob');
  } finally {
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  }
};

/**
 * Generate Master Solution Key PDF for Teachers
 */
export const generateSolutionKeyPDF = async (
  exam: Exam,
  set: OfflineExamSet
): Promise<Blob> => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = '794px';
  container.style.zIndex = '-99999';
  container.style.pointerEvents = 'none';
  container.style.opacity = '0.001';
  container.style.overflow = 'hidden';
  document.body.appendChild(container);

  const html = `
    <div style="font-family: 'Hind Siliguri', 'Noto Sans Bengali', sans-serif; padding: 20px; color: #0f172a; width: 794px; background: #ffffff;">
      <div style="border-bottom: 2px solid #2563eb; padding-bottom: 6px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 15px; font-weight: 800; color: #2563eb;">শিক্ষক সমাধান ও উত্তরমালা (TEACHER MASTER SOLUTION KEY)</div>
          <div style="font-size: 12px; font-weight: 700; color: #0f172a;">${exam.title}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 13px; font-weight: 900; background: #2563eb; color: #ffffff; padding: 2px 10px; border-radius: 4px; display: inline-block;">
            সেট: ${set.setCode}
          </div>
          <div style="font-size: 8px; color: #64748b; margin-top: 1px;">মোট প্রশ্ন: ${set.questions.length} টি</div>
        </div>
      </div>

      <!-- Quick Answer Grid (100 Questions) -->
      <div style="border: 1.2px solid #cbd5e1; border-radius: 4px; padding: 6px; background: #f8fafc; margin-bottom: 10px;">
        <div style="font-size: 9px; font-weight: 800; color: #0f172a; margin-bottom: 4px; text-transform: uppercase;">
          এক নজরে সঠিক উত্তর গ্রিড (QUICK ANSWER KEY)
        </div>
        <div style="display: grid; grid-template-columns: repeat(10, 1fr); gap: 3px; font-size: 8px; font-family: 'JetBrains Mono', monospace;">
          ${set.questions.map(q => `
            <div style="display: flex; justify-content: space-between; padding: 1.5px 3px; background: #ffffff; border: 0.8px solid #cbd5e1; border-radius: 2px;">
              <span style="font-weight: bold; color: #475569;">${q.questionNumber}.</span>
              <span style="font-weight: 900; color: #2563eb;">${set.answerKey[q.questionNumber]}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Detailed Question Explanations -->
      <div style="font-size: 8px; line-height: 1.35;">
        <div style="font-size: 9px; font-weight: 800; color: #0f172a; margin-bottom: 4px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">
          প্রশ্ন ও ব্যাখ্যাসহ বিস্তারিত সমাধান
        </div>
        ${set.questions.map(q => {
          const original = exam.questions.find(mq => mq.id === q.masterQuestionId);
          return `
            <div style="margin-bottom: 5px; padding-bottom: 3px; border-bottom: 0.5px solid #f1f5f9; page-break-inside: avoid;">
              <div style="font-weight: 700; color: #0f172a;">
                <span style="color: #2563eb; font-weight: 800;">${q.questionNumber}.</span> ${q.text}
              </div>
              <div style="display: flex; gap: 8px; margin-top: 1px; color: #334155;">
                ${q.options.map(opt => `
                  <span style="${opt.id === q.correctOption ? 'font-weight: 800; color: #16a34a;' : ''}">
                    (${opt.id.toLowerCase()}) ${opt.text}
                  </span>
                `).join('')}
              </div>
              <div style="margin-top: 1px; color: #15803d; font-weight: 600;">
                ✓ সঠিক উত্তর: (${q.correctOption.toLowerCase()}) ${original?.explanation ? `• ব্যাখ্যা: ${original.explanation}` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  try {
    container.innerHTML = html;
    await new Promise(r => setTimeout(r, 120));
    const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
      scale: 2.0,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: 794,
      windowWidth: 794
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    doc.addImage(imgData, 'JPEG', 0, 0, 210, 297);
    return doc.output('blob');
  } finally {
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  }
};

/**
 * Universal safe blob file downloader
 * Prevents premature revocation which cancels downloads in Chromium/Safari/Firefox
 */
export function downloadPdfBlob(blob: Blob, filename: string): void {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    a.target = '_self';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        if (a.parentNode) document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {}
    }, 15000);
  } catch (err) {
    console.error('downloadPdfBlob error:', err);
  }
}

/**
 * High-Speed Smart PDF Downloader
 * 1. Calls server POST /api/exams/generate-pdf (instant vector PDF, 150KB)
 * 2. Falls back to client-side jsPDF if server route fails
 */
export async function downloadExamPdfSmart(
  exam: any,
  targetSet: any,
  setCode: string
): Promise<void> {
  const safeExamName = String(exam.examName || exam.title || 'Exam').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeSetName = String(setCode || targetSet?.setCode || 'Set-01').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Exam_${safeExamName}_${safeSetName}.pdf`;

  // 1. Fast Server Vector Generation
  try {
    const res = await fetch('/api/exams/generate-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exam,
        targetSet,
        setCode
      })
    });

    if (res.ok) {
      const blob = await res.blob();
      if (blob.size > 1000) {
        downloadPdfBlob(blob, filename);
        return;
      }
    }
  } catch (srvErr) {
    console.warn('Server PDF generation failed, switching to client generation:', srvErr);
  }

  // 2. Client-side Fallback
  const blob = await generateAdmissionStylePDF(exam, targetSet);
  downloadPdfBlob(blob, filename);
}
