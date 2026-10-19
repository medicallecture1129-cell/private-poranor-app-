import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import { Exam, MCQOption, OfflineExamSet, OfflineExamSetQuestion } from '../types';

export interface PdfGenerationOptions {
  layout?: '2-page-4-col' | '4-page-2-col';
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
 * Scramble questions AND options for a specific Set (e.g. Set-1001, Set-1002 or Set A, B, C, D)
 * Preserves the true correct answer mapping!
 */
export const generateShuffledSet = (
  exam: Exam,
  setCode: string
): OfflineExamSet => {
  const seededRandom = createSeededRandom(`${exam.id}_${setCode}_seed_offline_omr`);

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

  const markPerQ = exam.markPerQuestion || Number((exam.totalMarks / (exam.questions.length || 1)).toFixed(2));
  const qrPayload = JSON.stringify({
    eId: exam.id,
    set: setCode,
    total: questionOrder.length,
    mpq: markPerQ,
    neg: exam.negativeMarkPercentage !== undefined ? exam.negativeMarkPercentage : 0.25,
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
 * Generate thousands or dozens of unique sets in batch (e.g. Set-1001, Set-1002, ...)
 */
export const generateBatchSets = (
  exam: Exam,
  count: number = 4,
  startNumber: number = 1001
): OfflineExamSet[] => {
  const sets: OfflineExamSet[] = [];
  for (let i = 0; i < count; i++) {
    const setCode = count <= 4 ? ['A', 'B', 'C', 'D'][i] || `Set-${startNumber + i}` : `Set-${startNumber + i}`;
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
 * Build 4-Column Layout HTML for rendering with full Bengali font ligature support
 */
function buildFourColumnHtml(
  exam: Exam,
  set: OfflineExamSet,
  qrDataUrl: string,
  appName: string = 'মেডিকেল ও বিশ্ববিদ্যালয় ভর্তি পরীক্ষা পোর্টাল'
): { page1Html: string; page2Html: string } {
  const totalQuestions = set.questions.length;
  const questionsPage1 = set.questions.slice(0, 50);
  const questionsPage2 = set.questions.slice(50);

  // Group questions for Page 1 columns (cols 2, 3, 4)
  const p1Col2Questions = questionsPage1.slice(0, 17);
  const p1Col3Questions = questionsPage1.slice(17, 34);
  const p1Col4Questions = questionsPage1.slice(34, 50);

  // Group questions for Page 2 columns (cols 1, 2, 3, 4)
  const p2Col1Questions = questionsPage2.slice(0, 13);
  const p2Col2Questions = questionsPage2.slice(13, 26);
  const p2Col3Questions = questionsPage2.slice(26, 38);
  const p2Col4Questions = questionsPage2.slice(38);

  const renderQuestionBlock = (q: OfflineExamSetQuestion) => `
    <div style="margin-bottom: 7px; page-break-inside: avoid; font-size: 8.5px; line-height: 1.35;">
      <div style="font-weight: 700; color: #0f172a; margin-bottom: 2px;">
        <span style="font-family: 'JetBrains Mono', monospace; font-size: 8px; color: #2563eb;">${q.questionNumber}.</span> ${q.text}
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1px 4px; padding-left: 6px; font-size: 8px; color: #334155;">
        ${q.options.map(opt => `
          <div>
            <span style="font-weight: 700; color: #475569;">(${opt.id})</span> ${opt.text}
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Render 100 questions OMR bubble grid (arranged in 2 compact columns of 50 or 4 columns of 25)
  const renderOmrBubbles = () => {
    let html = '<div style="display: flex; gap: 4px; margin-top: 4px;">';
    const subCols = 2; // 2 sub-columns of 50 each
    const perSubCol = 50;

    for (let sc = 0; sc < subCols; sc++) {
      html += '<div style="flex: 1; border: 1px solid #cbd5e1; border-radius: 3px; padding: 2px;">';
      html += '<div style="display: flex; font-size: 5.5px; font-weight: bold; color: #475569; border-bottom: 1px solid #cbd5e1; padding-bottom: 1px; margin-bottom: 2px; text-align: center;">';
      html += '<div style="width: 14px;">Q#</div><div style="flex:1;">A</div><div style="flex:1;">B</div><div style="flex:1;">C</div><div style="flex:1;">D</div>';
      html += '</div>';

      for (let r = 0; r < perSubCol; r++) {
        const qNum = sc * perSubCol + r + 1;
        if (qNum > totalQuestions && qNum > 100) break;
        html += `
          <div style="display: flex; align-items: center; margin-bottom: 1.2px; font-size: 5px;">
            <div style="width: 14px; font-weight: bold; font-family: 'JetBrains Mono', monospace; color: #1e293b;">${qNum}</div>
            <div style="flex:1; display:flex; justify-content:center;"><div style="width: 6.5px; height: 6.5px; border-radius: 50%; border: 0.7px solid #475569; display: flex; align-items: center; justify-content: center; font-size: 4px; color: #64748b;">A</div></div>
            <div style="flex:1; display:flex; justify-content:center;"><div style="width: 6.5px; height: 6.5px; border-radius: 50%; border: 0.7px solid #475569; display: flex; align-items: center; justify-content: center; font-size: 4px; color: #64748b;">B</div></div>
            <div style="flex:1; display:flex; justify-content:center;"><div style="width: 6.5px; height: 6.5px; border-radius: 50%; border: 0.7px solid #475569; display: flex; align-items: center; justify-content: center; font-size: 4px; color: #64748b;">C</div></div>
            <div style="flex:1; display:flex; justify-content:center;"><div style="width: 6.5px; height: 6.5px; border-radius: 50%; border: 0.7px solid #475569; display: flex; align-items: center; justify-content: center; font-size: 4px; color: #64748b;">D</div></div>
          </div>
        `;
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  };

  // Render 6-digit Roll Bubble Matrix
  const renderRollNumberMatrix = () => {
    let html = `
      <div style="border: 1px solid #94a3b8; border-radius: 4px; padding: 4px; margin-top: 3px; background: #f8fafc;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 7px; font-weight: bold; color: #0f172a; margin-bottom: 3px;">
          <span>স্টুডেন্ট আইডি / রোল (STUDENT ROLL):</span>
          <span style="font-size: 6px; color: #64748b;">(৬ ডিজিট)</span>
        </div>
        <!-- 6 box inputs -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          ${[0, 1, 2, 3, 4, 5].map(() => `
            <div style="width: 14px; height: 13px; border: 1px solid #475569; background: #ffffff; border-radius: 2px;"></div>
          `).join('')}
        </div>
        <!-- Bubble Matrix 0 to 9 -->
        <div style="display: flex; justify-content: space-between; font-size: 5px;">
          ${[0, 1, 2, 3, 4, 5].map(() => `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 1px;">
              ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `
                <div style="width: 6.5px; height: 6.5px; border-radius: 50%; border: 0.6px solid #475569; display: flex; align-items: center; justify-content: center; font-size: 4px; color: #334155;">${d}</div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    `;
    return html;
  };

  const sharedStyles = `
    font-family: 'Hind Siliguri', 'Noto Sans Bengali', 'SolaimanLipi', 'Kalpurush', sans-serif;
    color: #0f172a;
    background: #ffffff;
    width: 1122px; /* Landscape A4 width @ 96 DPI */
    height: 793px;  /* Landscape A4 height @ 96 DPI */
    padding: 18px 22px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  `;

  // Page 1 HTML
  const page1Html = `
    <div style="${sharedStyles}">
      <!-- Outer Border -->
      <div style="border: 1.5px solid #0f172a; border-radius: 4px; padding: 8px; height: 100%; display: flex; flex-direction: column; box-sizing: border-box;">
        
        <!-- Header Banner -->
        <div style="border-bottom: 1.5px solid #0f172a; padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 15px; font-weight: 800; color: #0f172a; letter-spacing: -0.2px;">
              ${appName}
            </div>
            <div style="font-size: 11px; font-weight: 700; color: #1e3a8a; margin-top: 1px;">
              ${exam.title} ${exam.subject ? `• ${exam.subject}` : ''} (${exam.courseName})
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px; font-size: 9px; font-weight: 600; color: #334155;">
            <div>সময়: <span style="font-weight: bold; color: #0f172a;">${toBengaliNumber(exam.durationMinutes)} মিনিট</span></div>
            <div>পূর্ণমান: <span style="font-weight: bold; color: #0f172a;">${toBengaliNumber(exam.totalMarks)}</span></div>
            <div>নেগেটিভ মার্কিং: <span style="font-weight: bold; color: #dc2626;">-${toBengaliNumber(exam.negativeMarkPercentage !== undefined ? exam.negativeMarkPercentage : 0.25)}</span></div>
            <div style="background: #0f172a; color: #ffffff; padding: 3px 8px; border-radius: 3px; font-weight: 800; font-size: 10px; font-family: 'JetBrains Mono', monospace;">
              SET: ${set.setCode}
            </div>
          </div>
        </div>

        <!-- 4 Columns Grid -->
        <div style="display: grid; grid-template-columns: 2.1fr 2.6fr 2.6fr 2.6fr; gap: 10px; flex: 1; min-height: 0;">
          
          <!-- Column 1: OMR Sheet & Roll Fill -->
          <div style="border-right: 1.2px solid #cbd5e1; padding-right: 8px; display: flex; flex-direction: column;">
            <div style="display: flex; gap: 6px; align-items: center; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">
              <img src="${qrDataUrl}" style="width: 52px; height: 52px; border: 1px solid #94a3b8; border-radius: 3px; padding: 1px;" />
              <div style="flex: 1;">
                <div style="font-size: 8px; font-weight: 800; color: #0f172a; text-transform: uppercase;">ওএমআর উত্তরপত্র (OMR)</div>
                <div style="font-size: 6.5px; color: #64748b; line-height: 1.2;">বলপয়েন্ট কালো কলম দিয়ে ভরাট করুন। কাটাকাটি নিষিদ্ধ।</div>
                <div style="margin-top: 2px; font-size: 7px; font-weight: bold; color: #1e3a8a;">সেট কোড: ${set.setCode}</div>
              </div>
            </div>

            <!-- Candidate info -->
            <div style="margin-top: 4px; font-size: 6.5px; color: #334155; line-height: 1.4;">
              <div style="display: flex; border-bottom: 0.6px dotted #94a3b8; padding-bottom: 1px;">
                <span style="font-weight: bold; width: 48px;">নাম:</span>
                <span style="flex:1;"></span>
              </div>
              <div style="display: flex; border-bottom: 0.6px dotted #94a3b8; padding-bottom: 1px; margin-top: 1px;">
                <span style="font-weight: bold; width: 48px;">কলেজ/প্রতিষ্ঠান:</span>
                <span style="flex:1;"></span>
              </div>
            </div>

            <!-- Roll Matrix -->
            ${renderRollNumberMatrix()}

            <!-- 100 MCQ Bubbles -->
            <div style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start; margin-top: 4px;">
              <div style="font-size: 6.5px; font-weight: bold; color: #0f172a; text-align: center; background: #e2e8f0; padding: 1px; border-radius: 2px;">
                উত্তর বাবল গ্রিড (প্রশ্ন ১ থেকে ১০০)
              </div>
              ${renderOmrBubbles()}
            </div>

            <!-- Signatures -->
            <div style="display: flex; justify-content: space-between; margin-top: 4px; padding-top: 4px; border-top: 0.8px solid #cbd5e1; font-size: 6px; color: #64748b;">
              <div style="text-align: center;">_____________________<br/>পরীক্ষার্থীর স্বাক্ষর ও তারিখ</div>
              <div style="text-align: center;">_____________________<br/>হল পরিদর্শকের স্বাক্ষর</div>
            </div>
          </div>

          <!-- Column 2: Questions 1 to 17 -->
          <div style="border-right: 1px solid #e2e8f0; padding-right: 6px;">
            ${p1Col2Questions.map(renderQuestionBlock).join('')}
          </div>

          <!-- Column 3: Questions 18 to 34 -->
          <div style="border-right: 1px solid #e2e8f0; padding-right: 6px;">
            ${p1Col3Questions.map(renderQuestionBlock).join('')}
          </div>

          <!-- Column 4: Questions 35 to 50 + Instructions -->
          <div style="display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              ${p1Col4Questions.map(renderQuestionBlock).join('')}
            </div>

            <!-- Instructions Box -->
            <div style="border: 1px solid #94a3b8; background: #f8fafc; border-radius: 4px; padding: 6px; margin-top: 6px; font-size: 7.2px; line-height: 1.35; color: #1e293b;">
              <div style="font-weight: 800; color: #0f172a; border-bottom: 0.8px solid #cbd5e1; padding-bottom: 2px; margin-bottom: 4px; text-align: center;">
                পরীক্ষার্থীদের জন্য বিশেষ নির্দেশাবলী
              </div>
              <ul style="margin: 0; padding-left: 12px;">
                <li>অবশ্যই <b>কালো কালির বলপয়েন্ট কলম</b> ব্যবহার করতে হবে। পেনসিল ব্যবহার সম্পূর্ণ নিষিদ্ধ।</li>
                <li>প্রতিটি প্রশ্নের জন্য কেবল <b>একটি বৃত্ত সম্পূর্ণ ভরাট</b> করতে হবে। একাধিক ভরাট বাতিল গণ্য হবে।</li>
                <li>প্রতিটি ভুল উত্তরের জন্য নির্ধারিত <b>${toBengaliNumber(exam.negativeMarkPercentage !== undefined ? exam.negativeMarkPercentage : 0.25)} নম্বর কাটা যাবে</b>।</li>
                <li>ওএমআর শিট কোনোভাবেই ভাঁজ, দাগাদাগি বা কাটাকাটি করা যাবে না।</li>
                <li>পরীক্ষা কক্ষে সব ধরনের মোবাইল ফোন ও ডিজিটাল ইলেকট্রনিক্স ডিভাইস নিষিদ্ধ।</li>
              </ul>
            </div>
          </div>

        </div>

        <!-- Page Footer -->
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 7px; color: #94a3b8; border-top: 1px solid #cbd5e1; padding-top: 2px; margin-top: 4px;">
          <span>${exam.title} • সেট: ${set.setCode}</span>
          <span style="font-weight: bold; color: #475569;">পৃষ্ঠা ১ (PAGE 1)</span>
          <span>${appName}</span>
        </div>

      </div>
    </div>
  `;

  // Page 2 HTML (Backside - Questions 51 to 100)
  const page2Html = `
    <div style="${sharedStyles}">
      <!-- Outer Border -->
      <div style="border: 1.5px solid #0f172a; border-radius: 4px; padding: 8px; height: 100%; display: flex; flex-direction: column; box-sizing: border-box;">
        
        <!-- Header Banner Page 2 -->
        <div style="border-bottom: 1.5px solid #0f172a; padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 13px; font-weight: 800; color: #0f172a;">
              ${exam.title} • সেট: ${set.setCode} (অফলাইন প্রশ্নপত্র - পৃষ্ঠা ২)
            </div>
            <div style="font-size: 9px; font-weight: 600; color: #475569;">
              প্রশ্ন ৫১ থেকে ১০০ • মোট প্রশ্ন: ${toBengaliNumber(totalQuestions)} টি
            </div>
          </div>
          <div style="background: #0f172a; color: #ffffff; padding: 3px 8px; border-radius: 3px; font-weight: 800; font-size: 10px; font-family: 'JetBrains Mono', monospace;">
            SET: ${set.setCode}
          </div>
        </div>

        <!-- 4 Columns Grid Page 2 -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; flex: 1; min-height: 0;">
          
          <!-- Column 1: Questions 51 to 63 -->
          <div style="border-right: 1px solid #e2e8f0; padding-right: 6px;">
            ${p2Col1Questions.map(renderQuestionBlock).join('')}
          </div>

          <!-- Column 2: Questions 64 to 76 -->
          <div style="border-right: 1px solid #e2e8f0; padding-right: 6px;">
            ${p2Col2Questions.map(renderQuestionBlock).join('')}
          </div>

          <!-- Column 3: Questions 77 to 88 -->
          <div style="border-right: 1px solid #e2e8f0; padding-right: 6px;">
            ${p2Col3Questions.map(renderQuestionBlock).join('')}
          </div>

          <!-- Column 4: Questions 89 to 100 + Rough Space -->
          <div style="display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              ${p2Col4Questions.map(renderQuestionBlock).join('')}
            </div>

            <!-- Rough Work Space Box -->
            <div style="border: 1px dashed #94a3b8; border-radius: 4px; padding: 6px; height: 110px; background: #fafafa; display: flex; flex-direction: column; justify-content: flex-start;">
              <span style="font-size: 7px; font-weight: bold; color: #64748b; text-align: center; border-bottom: 0.6px solid #e2e8f0; padding-bottom: 2px;">
                রাফ করার জন্য নির্ধারিত স্থান (ROUGH WORK)
              </span>
            </div>
          </div>

        </div>

        <!-- Page 2 Footer -->
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 7px; color: #94a3b8; border-top: 1px solid #cbd5e1; padding-top: 2px; margin-top: 4px;">
          <span>${exam.title} • সেট: ${set.setCode}</span>
          <span style="font-weight: bold; color: #475569;">পৃষ্ঠা ২ (PAGE 2) - সমাপ্ত</span>
          <span>${appName}</span>
        </div>

      </div>
    </div>
  `;

  return { page1Html, page2Html };
}

/**
 * Generate Printable Medical Admission Style PDF
 * Supports:
 * - 2-Page A4 Size (4-Column Layout, front & back, OMR in Column 1)
 * - 4-Page Standard Format (2 Columns per page)
 */
export const generateAdmissionStylePDF = async (
  exam: Exam,
  set: OfflineExamSet,
  options: PdfGenerationOptions = {}
): Promise<Blob> => {
  const { layout = '2-page-4-col', appName = 'মেডিকেল ও বিশ্ববিদ্যালয় ভর্তি প্রস্তুতি' } = options;

  // 1. Generate QR Code image data URL
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(set.qrData, {
      margin: 1,
      width: 280,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('QR code generation failed:', err);
  }

  // If 2-page-4-col is requested: use HTML-to-Canvas for 100% authentic Bengali font rendering
  if (layout === '2-page-4-col') {
    const { page1Html, page2Html } = buildFourColumnHtml(exam, set, qrDataUrl, appName);

    // Create an offscreen mount container
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-99999px';
    container.style.top = '0';
    container.style.zIndex = '-1000';
    container.style.opacity = '1';
    document.body.appendChild(container);

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    try {
      // Render Page 1
      container.innerHTML = page1Html;
      // Wait for fonts & DOM reflow
      await new Promise(r => setTimeout(r, 120));
      const canvas1 = await html2canvas(container.firstElementChild as HTMLElement, {
        scale: 2.2, // 2.2x scale for sharp print quality
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      const imgData1 = canvas1.toDataURL('image/jpeg', 0.96);
      doc.addImage(imgData1, 'JPEG', 0, 0, 297, 210);

      // Render Page 2
      container.innerHTML = page2Html;
      await new Promise(r => setTimeout(r, 120));
      const canvas2 = await html2canvas(container.firstElementChild as HTMLElement, {
        scale: 2.2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      const imgData2 = canvas2.toDataURL('image/jpeg', 0.96);
      doc.addPage('a4', 'landscape');
      doc.addImage(imgData2, 'JPEG', 0, 0, 297, 210);

      return doc.output('blob');
    } finally {
      document.body.removeChild(container);
    }
  }

  // 4-Page 2-Col Layout (Portrait A4, 4 pages)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const colGap = 8;
  const colWidth = (pageWidth - margin * 2 - colGap) / 2;

  let currentPage = 1;
  const drawPortraitHeader = (title: string, pNum: number) => {
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.6);
    doc.rect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2);

    doc.setFillColor(241, 245, 249);
    doc.rect(margin + 1, margin + 1, pageWidth - margin * 2 - 2, 20, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(appName.toUpperCase(), pageWidth / 2, margin + 7, { align: 'center' });

    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text(`${exam.title.toUpperCase()} • ${title}`, pageWidth / 2, margin + 13, { align: 'center' });

    doc.setFillColor(15, 23, 42);
    doc.roundedRect(pageWidth - margin - 26, margin + 4, 24, 8, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`SET - ${set.setCode}`, pageWidth - margin - 14, margin + 9.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${pNum} of 4 • Set ${set.setCode}`, pageWidth / 2, pageHeight - margin + 4, { align: 'center' });
  };

  // Build standard portrait pages
  drawPortraitHeader('OFFICIAL QUESTION PAPER', 1);

  // Split questions across pages
  const questionsPerPage = Math.ceil(set.questions.length / 3);
  let qIdx = 0;

  for (let p = 1; p <= 3; p++) {
    if (p > 1) {
      doc.addPage();
      currentPage++;
      drawPortraitHeader(`QUESTION PAPER (CONTINUED)`, currentPage);
    }

    let isRight = false;
    let currY = margin + 26;
    let currX = margin + 2;

    const endIdx = Math.min(qIdx + questionsPerPage, set.questions.length);
    for (; qIdx < endIdx; qIdx++) {
      const q = set.questions[qIdx];
      const qLines = doc.splitTextToSize(`${q.questionNumber}. ${q.text}`, colWidth - 4);
      const h = qLines.length * 3.8 + (q.options.length * 3.4) + 4;

      if (currY + h > pageHeight - margin - 8) {
        if (!isRight) {
          isRight = true;
          currX = margin + colWidth + colGap;
          currY = margin + 26;
        }
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(qLines, currX, currY);
      currY += qLines.length * 3.8 + 1;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      q.options.forEach((opt) => {
        doc.text(`(${opt.id}) ${opt.text}`, currX + 3, currY);
        currY += 3.4;
      });
      currY += 2;
    }
  }

  // Page 4: Official OMR Sheet
  doc.addPage();
  currentPage++;
  drawPortraitHeader('OFFICIAL OMR ANSWER SHEET', currentPage);

  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', pageWidth - margin - 28, margin + 24, 24, 24);
  }

  return doc.output('blob');
};

/**
 * Generate Confidential Teacher Solution Key PDF
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

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;

  // Outer border
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.8);
  doc.rect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2);

  // Header
  doc.setFillColor(241, 245, 249);
  doc.rect(margin + 1, margin + 1, pageWidth - margin * 2 - 2, 24, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('OFFICIAL TEACHER SOLUTION KEY & EXPLANATIONS', pageWidth / 2, margin + 9, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`EXAM: ${exam.title.toUpperCase()}  |  SET: ${set.setCode}`, pageWidth / 2, margin + 15, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Total Questions: ${set.questions.length}  |  Negative Marking: ${exam.negativeMarkPercentage || 0.25}  |  Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, margin + 20, { align: 'center' });

  // Grid of Answers (5 columns)
  const cols = 5;
  const rows = Math.ceil(set.questions.length / cols);
  const colW = (pageWidth - margin * 2 - 8) / cols;
  const startY = margin + 30;

  for (let c = 0; c < cols; c++) {
    const ax = margin + 4 + c * colW;
    for (let r = 0; r < rows; r++) {
      const qNum = c * rows + r + 1;
      if (qNum > set.questions.length) break;

      const ay = startY + r * 5.2;
      const ans = set.answerKey[qNum] || '-';

      doc.setFillColor(r % 2 === 0 ? 255 : 248, r % 2 === 0 ? 255 : 250, r % 2 === 0 ? 255 : 252);
      doc.rect(ax, ay - 3.5, colW - 2, 5, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.rect(ax, ay - 3.5, colW - 2, 5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Q${qNum}:`, ax + 2, ay);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(22, 163, 74);
      doc.text(`[ ${ans} ]`, ax + 16, ay);
    }
  }

  return doc.output('blob');
};
