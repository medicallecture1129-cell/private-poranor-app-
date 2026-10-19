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
 * Scramble questions AND options for a specific Set (e.g. Set-1, Set-2, Set-A, Set-1001)
 * Preserves the true correct answer mapping!
 * Uses a compact QR payload (OMR:examId:setCode) for instantaneous smartphone camera scanning.
 */
export const generateShuffledSet = (
  exam: Exam,
  setCode: string
): OfflineExamSet => {
  const seededRandom = createSeededRandom(`${exam.id}_${setCode}_deterministic_seed_v2`);

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

  // Short, compact, high-contrast QR payload: OMR:examId:setCode
  // Extremely easy for any phone camera or jsQR to decode in milliseconds!
  const qrPayload = `OMR:${exam.id}:${setCode}`;

  return {
    setCode,
    qrData: qrPayload,
    questions: questionOrder,
    answerKey,
    createdAt: Date.now()
  };
};

/**
 * Generate unique sets in batch (e.g. Set-1, Set-2, ...)
 */
export const generateBatchSets = (
  exam: Exam,
  count: number = 4,
  startNumber: number = 1
): OfflineExamSet[] => {
  const sets: OfflineExamSet[] = [];
  for (let i = 0; i < count; i++) {
    const num = startNumber + i;
    const setCode = count <= 4 && startNumber === 1 ? `Set-${['A', 'B', 'C', 'D'][i] || num}` : `Set-${num}`;
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
 * Build 2-Page, 8-Column Layout HTML (Foldable Dosta Page / Medical Admission Test Style)
 * Page 1 (Front): 4 Columns. Col 1 = OMR Sheet, Col 2, 3, 4 = Q1 to Q50.
 * Page 2 (Back):  4 Columns. Col 5, 6, 7 = Q51 to Q100, Col 8 = Candidate Instructions & Rough Work.
 */
function buildTwoPageEightColumnHtml(
  exam: Exam,
  set: OfflineExamSet,
  qrDataUrl: string,
  appName: string = 'মেডিকেল ও বিশ্ববিদ্যালয় ভর্তি পরীক্ষা পোর্টাল'
): { page1Html: string; page2Html: string } {
  const totalQuestions = set.questions.length;
  const questionsPage1 = set.questions.slice(0, 50);
  const questionsPage2 = set.questions.slice(50);

  // Split Page 1 questions across Columns 2, 3, 4 (17, 17, 16)
  const p1Col2Questions = questionsPage1.slice(0, 17);
  const p1Col3Questions = questionsPage1.slice(17, 34);
  const p1Col4Questions = questionsPage1.slice(34, 50);

  // Split Page 2 questions across Columns 1, 2, 3 (17, 17, 16)
  const p2Col1Questions = questionsPage2.slice(0, 17);
  const p2Col2Questions = questionsPage2.slice(17, 34);
  const p2Col3Questions = questionsPage2.slice(34, 50);

  const renderQuestionBlock = (q: OfflineExamSetQuestion) => `
    <div style="margin-bottom: 7.5px; page-break-inside: avoid; font-size: 8.5px; line-height: 1.35;">
      <div style="font-weight: 700; color: #090d16; margin-bottom: 2px;">
        <span style="font-family: 'JetBrains Mono', monospace; font-size: 8.5px; font-weight: 800; color: #1e40af;">${toBengaliNumber(q.questionNumber)}.</span> ${q.text}
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5px 5px; padding-left: 5px; font-size: 8px; color: #1e293b;">
        ${q.options.map(opt => `
          <div>
            <span style="font-weight: 800; color: #0f172a;">(${opt.id})</span> ${opt.text}
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Render 100 questions OMR bubble grid (2 compact columns of 50 each)
  const renderOmrBubbles = () => {
    let html = '<div style="display: flex; gap: 4px; margin-top: 3px;">';
    const subCols = 2; // 2 sub-columns of 50 each
    const perSubCol = 50;

    for (let sc = 0; sc < subCols; sc++) {
      html += '<div style="flex: 1; border: 1.2px solid #334155; border-radius: 3px; padding: 2px; background: #ffffff;">';
      html += '<div style="display: flex; font-size: 6px; font-weight: 800; color: #0f172a; border-bottom: 1px solid #64748b; padding-bottom: 1.5px; margin-bottom: 2px; text-align: center; background: #f1f5f9;">';
      html += '<div style="width: 14px;">নং</div><div style="flex:1;">A</div><div style="flex:1;">B</div><div style="flex:1;">C</div><div style="flex:1;">D</div>';
      html += '</div>';

      for (let r = 0; r < perSubCol; r++) {
        const qNum = sc * perSubCol + r + 1;
        if (qNum > totalQuestions && qNum > 100) break;
        html += `
          <div style="display: flex; align-items: center; margin-bottom: 1.2px; font-size: 5.5px;">
            <div style="width: 14px; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: #090d16;">${qNum}</div>
            <div style="flex:1; display:flex; justify-content:center;"><div style="width: 6.8px; height: 6.8px; border-radius: 50%; border: 0.8px solid #0f172a; display: flex; align-items: center; justify-content: center; font-size: 4px; font-weight: bold; color: #334155;">A</div></div>
            <div style="flex:1; display:flex; justify-content:center;"><div style="width: 6.8px; height: 6.8px; border-radius: 50%; border: 0.8px solid #0f172a; display: flex; align-items: center; justify-content: center; font-size: 4px; font-weight: bold; color: #334155;">B</div></div>
            <div style="flex:1; display:flex; justify-content:center;"><div style="width: 6.8px; height: 6.8px; border-radius: 50%; border: 0.8px solid #0f172a; display: flex; align-items: center; justify-content: center; font-size: 4px; font-weight: bold; color: #334155;">C</div></div>
            <div style="flex:1; display:flex; justify-content:center;"><div style="width: 6.8px; height: 6.8px; border-radius: 50%; border: 0.8px solid #0f172a; display: flex; align-items: center; justify-content: center; font-size: 4px; font-weight: bold; color: #334155;">D</div></div>
          </div>
        `;
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  };

  // Render 6-digit Roll Bubble Matrix (0-9 for each digit)
  const renderRollNumberMatrix = () => {
    let html = `
      <div style="border: 1.2px solid #334155; border-radius: 4px; padding: 3px 5px; margin-top: 3px; background: #f8fafc;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 7.5px; font-weight: 800; color: #0f172a; margin-bottom: 2px;">
          <span>স্টুডেন্ট আইডি / রোল নম্বর (STUDENT ID):</span>
          <span style="font-size: 6.5px; color: #475569; font-weight: 600;">(৬ ডিজিট)</span>
        </div>
        <!-- 6 box inputs -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          ${[0, 1, 2, 3, 4, 5].map(() => `
            <div style="width: 14px; height: 12px; border: 1px solid #1e293b; background: #ffffff; border-radius: 2px;"></div>
          `).join('')}
        </div>
        <!-- Bubble Matrix 0 to 9 -->
        <div style="display: flex; justify-content: space-between; font-size: 5px;">
          ${[0, 1, 2, 3, 4, 5].map(() => `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 1px;">
              ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `
                <div style="width: 6.6px; height: 6.6px; border-radius: 50%; border: 0.7px solid #1e293b; display: flex; align-items: center; justify-content: center; font-size: 4px; font-weight: bold; color: #0f172a; background: #ffffff;">${d}</div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    `;
    return html;
  };

  const sharedStyles = `
    font-family: 'Hind Siliguri', 'Noto Sans Bengali', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #090d16;
    background: #ffffff;
    width: 1122px; /* Landscape A4 width @ 96 DPI */
    height: 793px;  /* Landscape A4 height @ 96 DPI */
    padding: 16px 20px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  `;

  // Page 1 HTML (Front Page: 4 Columns)
  const page1Html = `
    <div style="${sharedStyles}">
      <!-- Outer Border -->
      <div style="border: 2px solid #0f172a; border-radius: 4px; padding: 7px; height: 100%; display: flex; flex-direction: column; box-sizing: border-box;">
        
        <!-- Header Banner -->
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 5px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 15px; font-weight: 800; color: #0f172a; letter-spacing: -0.2px;">
              ${appName}
            </div>
            <div style="font-size: 11px; font-weight: 700; color: #1e3a8a; margin-top: 1px;">
              ${exam.title} ${exam.subject ? `• ${exam.subject}` : ''}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px; font-size: 9px; font-weight: 700; color: #1e293b;">
            <div>সময়: <span style="font-weight: 800; color: #0f172a;">${toBengaliNumber(exam.durationMinutes)} মিনিট</span></div>
            <div>পূর্ণমান: <span style="font-weight: 800; color: #0f172a;">${toBengaliNumber(exam.totalMarks)}</span></div>
            <div>নেগেটিভ মার্কিং: <span style="font-weight: 800; color: #dc2626;">-${toBengaliNumber(exam.negativeMarkPercentage !== undefined ? exam.negativeMarkPercentage : 0.25)}</span></div>
            <div style="background: #0f172a; color: #ffffff; padding: 3px 10px; border-radius: 4px; font-weight: 900; font-size: 11px; font-family: 'JetBrains Mono', monospace; border: 1px solid #0f172a;">
              ${set.setCode}
            </div>
          </div>
        </div>

        <!-- 4 Columns Grid (Landscape) -->
        <div style="display: grid; grid-template-columns: 2.15fr 2.6fr 2.6fr 2.6fr; gap: 10px; flex: 1; min-height: 0;">
          
          <!-- Column 1: OMR Sheet & Roll Fill -->
          <div style="border-right: 1.5px solid #64748b; padding-right: 8px; display: flex; flex-direction: column;">
            
            {/* Top OMR Banner with Clear High-Contrast QR Code */}
            <div style="display: flex; gap: 8px; align-items: center; border-bottom: 1.5px solid #0f172a; padding-bottom: 4px; background: #f8fafc; padding: 4px; border-radius: 4px; border: 1px solid #cbd5e1;">
              <!-- High-Contrast Clean QR Code with Corner Markers -->
              <div style="position: relative; padding: 2px; background: #ffffff; border: 1.5px solid #0f172a; border-radius: 3px; display: flex; align-items: center; justify-content: center;">
                <img src="${qrDataUrl}" style="width: 58px; height: 58px; display: block; image-rendering: pixelated;" />
              </div>
              <div style="flex: 1;">
                <div style="font-size: 8.5px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: -0.2px;">
                  ওএমআর উত্তরপত্র (OMR)
                </div>
                <div style="font-size: 6.5px; color: #334155; line-height: 1.25; margin-top: 1px;">
                  কালো কালির বলপয়েন্ট দিয়ে ভরাট করুন। কাটাকাটি সম্পূর্ণ নিষিদ্ধ।
                </div>
                <div style="margin-top: 2px; font-size: 7.5px; font-weight: 800; color: #1e3a8a;">
                  সেট: <span style="background: #e0e7ff; padding: 1px 4px; border-radius: 2px; color: #1e40af; border: 0.5px solid #93c5fd;">${set.setCode}</span>
                </div>
              </div>
            </div>

            <!-- Candidate info -->
            <div style="margin-top: 3px; font-size: 6.8px; color: #1e293b; line-height: 1.4;">
              <div style="display: flex; border-bottom: 0.8px dotted #64748b; padding-bottom: 1px;">
                <span style="font-weight: 800; width: 50px;">নাম:</span>
                <span style="flex:1;"></span>
              </div>
              <div style="display: flex; border-bottom: 0.8px dotted #64748b; padding-bottom: 1px; margin-top: 1.5px;">
                <span style="font-weight: 800; width: 50px;">প্রতিষ্ঠান/কলেজ:</span>
                <span style="flex:1;"></span>
              </div>
            </div>

            <!-- Roll Matrix -->
            ${renderRollNumberMatrix()}

            <!-- 100 MCQ Bubbles -->
            <div style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start; margin-top: 3px;">
              <div style="font-size: 7px; font-weight: 800; color: #0f172a; text-align: center; background: #e2e8f0; padding: 1.5px; border-radius: 2px; border: 1px solid #cbd5e1;">
                উত্তর বাবল গ্রিড (প্রশ্ন ১ থেকে ১০০)
              </div>
              ${renderOmrBubbles()}
            </div>

            <!-- Signatures -->
            <div style="display: flex; justify-content: space-between; margin-top: 3px; padding-top: 3px; border-top: 1px solid #94a3b8; font-size: 6px; font-weight: 600; color: #475569;">
              <div style="text-align: center;">_____________________<br/>পরীক্ষার্থীর স্বাক্ষর ও তারিখ</div>
              <div style="text-align: center;">_____________________<br/>হল পরিদর্শকের স্বাক্ষর</div>
            </div>
          </div>

          <!-- Column 2: Questions 1 to 17 -->
          <div style="border-right: 1.2px solid #cbd5e1; padding-right: 6px;">
            ${p1Col2Questions.map(renderQuestionBlock).join('')}
          </div>

          <!-- Column 3: Questions 18 to 34 -->
          <div style="border-right: 1.2px solid #cbd5e1; padding-right: 6px;">
            ${p1Col3Questions.map(renderQuestionBlock).join('')}
          </div>

          <!-- Column 4: Questions 35 to 50 -->
          <div style="display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              ${p1Col4Questions.map(renderQuestionBlock).join('')}
            </div>
          </div>

        </div>

        <!-- Page Footer -->
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 7.5px; font-weight: 600; color: #64748b; border-top: 1.5px solid #0f172a; padding-top: 2px; margin-top: 3px;">
          <span>${exam.title} • সেট কোড: ${set.setCode}</span>
          <span style="font-weight: 800; color: #0f172a; background: #e2e8f0; padding: 1px 8px; border-radius: 3px;">পৃষ্ঠা ১ (PAGE 1) - ফ্রন্ট পেজ</span>
          <span>${appName}</span>
        </div>

      </div>
    </div>
  `;

  // Page 2 HTML (Back Page: 4 Columns)
  const page2Html = `
    <div style="${sharedStyles}">
      <!-- Outer Border -->
      <div style="border: 2px solid #0f172a; border-radius: 4px; padding: 7px; height: 100%; display: flex; flex-direction: column; box-sizing: border-box;">
        
        <!-- Header Banner Page 2 -->
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 4px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 11px; font-weight: 800; color: #0f172a;">
            ${appName} • ${exam.title}
          </div>
          <div style="display: flex; items-center; gap: 8px; font-size: 9px; font-weight: 700;">
            <span style="background: #0f172a; color: #ffffff; padding: 2px 8px; border-radius: 3px; font-family: 'JetBrains Mono', monospace;">
              সেট: ${set.setCode}
            </span>
            <span style="color: #475569;">(প্রশ্ন ৫১ থেকে ১০০)</span>
          </div>
        </div>

        <!-- 4 Columns Grid Page 2 -->
        <div style="display: grid; grid-template-columns: 2.6fr 2.6fr 2.6fr 2.2fr; gap: 10px; flex: 1; min-height: 0;">
          
          <!-- Column 5 (P2 Col 1): Questions 51 to 67 -->
          <div style="border-right: 1.2px solid #cbd5e1; padding-right: 6px;">
            ${p2Col1Questions.map(renderQuestionBlock).join('')}
          </div>

          <!-- Column 6 (P2 Col 2): Questions 68 to 84 -->
          <div style="border-right: 1.2px solid #cbd5e1; padding-right: 6px;">
            ${p2Col2Questions.map(renderQuestionBlock).join('')}
          </div>

          <!-- Column 7 (P2 Col 3): Questions 85 to 100 -->
          <div style="border-right: 1.2px solid #cbd5e1; padding-right: 6px;">
            ${p2Col3Questions.map(renderQuestionBlock).join('')}
          </div>

          <!-- Column 8 (P2 Col 4): Candidate Instructions & Rough Work Area -->
          <div style="display: flex; flex-direction: column; justify-content: space-between;">
            
            {/* Exam Instructions */}
            <div style="border: 1.5px solid #0f172a; background: #f8fafc; border-radius: 4px; padding: 6px; font-size: 7.2px; line-height: 1.35; color: #0f172a;">
              <div style="font-weight: 800; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; margin-bottom: 4px; text-align: center; font-size: 8px;">
                পরীক্ষার্থীদের জন্য আবশ্যিক নির্দেশাবলী
              </div>
              <ul style="margin: 0; padding-left: 12px;">
                <li>অবশ্যই <b>কালো কালির বলপয়েন্ট কলম</b> ব্যবহার করতে হবে। পেনসিল ব্যবহার সম্পূর্ণ নিষিদ্ধ।</li>
                <li>প্রতিটি প্রশ্নের জন্য কেবল <b>একটি বৃত্ত সম্পূর্ণ ভরাট</b> করতে হবে। একাধিক ভরাট বাতিল গণ্য হবে।</li>
                <li>প্রতিটি ভুল উত্তরের জন্য নির্ধারিত <b>${toBengaliNumber(exam.negativeMarkPercentage !== undefined ? exam.negativeMarkPercentage : 0.25)} নম্বর কাটা যাবে</b>।</li>
                <li>ওএমআর শিট কোনোভাবেই ভাঁজ, দাগাদাগি বা কাটাকাটি করা যাবে না।</li>
                <li>পরীক্ষা কক্ষে সব ধরনের মোবাইল ফোন ও ইলেকট্রনিক্স ডিভাইস নিষিদ্ধ।</li>
                <li>পরীক্ষা শেষ না হওয়া পর্যন্ত কোনো পরীক্ষার্থী পরীক্ষার কক্ষ ত্যাগ করতে পারবে না।</li>
              </ul>
            </div>

            {/* Rough Work Area (রাফ করার স্থান) */}
            <div style="flex: 1; border: 1.5px dashed #94a3b8; border-radius: 4px; margin-top: 6px; padding: 6px; background: #fafafa; display: flex; flex-direction: column;">
              <div style="font-size: 7.5px; font-weight: 800; color: #64748b; text-align: center; border-bottom: 1px dashed #cbd5e1; padding-bottom: 2px; margin-bottom: 4px;">
                খসড়া বা রাফ করার স্থান (ROUGH WORK)
              </div>
              <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: #cbd5e1; font-size: 11px; font-weight: bold;">
                (প্রয়োজনে হিসাব-নিকাশ করার জন্য)
              </div>
            </div>

          </div>

        </div>

        <!-- Page Footer Page 2 -->
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 7.5px; font-weight: 600; color: #64748b; border-top: 1.5px solid #0f172a; padding-top: 2px; margin-top: 3px;">
          <span>${exam.title} • সেট কোড: ${set.setCode}</span>
          <span style="font-weight: 800; color: #0f172a; background: #e2e8f0; padding: 1px 8px; border-radius: 3px;">পৃষ্ঠা ২ (PAGE 2) - ব্যাক পেজ (সমাপ্ত)</span>
          <span>${appName}</span>
        </div>

      </div>
    </div>
  `;

  return { page1Html, page2Html };
}

/**
 * Generate 2-Page 8-Column Medical Admission Printable PDF
 * Razor sharp 300-DPI quality with crystal clear fonts, perfect QR codes, and zero text blur!
 */
export const generateAdmissionStylePDF = async (
  exam: Exam,
  set: OfflineExamSet,
  options: PdfGenerationOptions = {}
): Promise<Blob> => {
  const { appName = 'মেডিকেল ও বিশ্ববিদ্যালয় ভর্তি প্রস্তুতি' } = options;

  // 1. Generate Crisp, High-Contrast QR Code image
  // Compact payload: OMR:examId:setCode
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(set.qrData, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('QR code generation failed:', err);
  }

  const { page1Html, page2Html } = buildTwoPageEightColumnHtml(exam, set, qrDataUrl, appName);

  // Create offscreen mount container
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.zIndex = '-1000';
  container.style.opacity = '1';
  document.body.appendChild(container);

  // A4 Landscape PDF
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  try {
    // Render Page 1 (Front Page: 4 Cols)
    container.innerHTML = page1Html;
    await new Promise(r => setTimeout(r, 150));
    const canvas1 = await html2canvas(container.firstElementChild as HTMLElement, {
      scale: 2.8, // 2.8x super-high resolution print quality
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData1 = canvas1.toDataURL('image/jpeg', 0.98);
    // A4 landscape dimensions: 297mm x 210mm
    doc.addImage(imgData1, 'JPEG', 0, 0, 297, 210);

    // Render Page 2 (Back Page: 4 Cols)
    doc.addPage('a4', 'landscape');
    container.innerHTML = page2Html;
    await new Promise(r => setTimeout(r, 150));
    const canvas2 = await html2canvas(container.firstElementChild as HTMLElement, {
      scale: 2.8,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData2 = canvas2.toDataURL('image/jpeg', 0.98);
    doc.addImage(imgData2, 'JPEG', 0, 0, 297, 210);

    return doc.output('blob');
  } finally {
    document.body.removeChild(container);
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
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.zIndex = '-1000';
  document.body.appendChild(container);

  const html = `
    <div style="font-family: 'Hind Siliguri', 'Noto Sans Bengali', sans-serif; padding: 24px; color: #0f172a; width: 794px; background: #ffffff;">
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 16px; font-weight: 800; color: #1e3a8a;">শিক্ষক সমাধান ও উত্তরমালা (TEACHER MASTER KEY)</div>
          <div style="font-size: 13px; font-weight: 700; color: #0f172a;">${exam.title}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 14px; font-weight: 900; background: #0f172a; color: #ffffff; padding: 3px 12px; border-radius: 4px; display: inline-block;">
            সেট: ${set.setCode}
          </div>
          <div style="font-size: 9px; color: #64748b; margin-top: 2px;">মোট প্রশ্ন: ${set.questions.length} টি</div>
        </div>
      </div>

      <!-- Quick Answer Grid (100 Questions) -->
      <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; background: #f8fafc; margin-bottom: 14px;">
        <div style="font-size: 9px; font-weight: 800; color: #0f172a; margin-bottom: 6px; text-transform: uppercase;">
          এক নজরে সঠিক উত্তর গ্রিড (QUICK ANSWER KEY)
        </div>
        <div style="display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px; font-size: 8px; font-family: 'JetBrains Mono', monospace;">
          ${set.questions.map(q => `
            <div style="display: flex; justify-content: space-between; padding: 2px 4px; background: #ffffff; border: 0.8px solid #cbd5e1; border-radius: 3px;">
              <span style="font-weight: bold; color: #475569;">${q.questionNumber}.</span>
              <span style="font-weight: 900; color: #1e40af;">${set.answerKey[q.questionNumber]}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Detailed Question Explanations -->
      <div style="font-size: 8.5px; line-height: 1.4;">
        <div style="font-size: 10px; font-weight: 800; color: #0f172a; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px;">
          প্রশ্ন ও ব্যাখ্যাসহ বিস্তারিত সমাধান
        </div>
        ${set.questions.map(q => {
          const original = exam.questions.find(mq => mq.id === q.masterQuestionId);
          return `
            <div style="margin-bottom: 6px; padding-bottom: 4px; border-bottom: 0.5px solid #f1f5f9; page-break-inside: avoid;">
              <div style="font-weight: 700; color: #0f172a;">
                <span style="color: #2563eb; font-weight: 800;">${q.questionNumber}.</span> ${q.text}
              </div>
              <div style="display: flex; gap: 8px; margin-top: 1px; color: #334155;">
                ${q.options.map(opt => `
                  <span style="${opt.id === q.correctOption ? 'font-weight: 800; color: #16a34a;' : ''}">
                    (${opt.id}) ${opt.text}
                  </span>
                `).join('')}
              </div>
              <div style="margin-top: 1px; color: #15803d; font-weight: 600;">
                ✓ সঠিক উত্তর: (${q.correctOption}) ${original?.explanation ? `• ব্যাখ্যা: ${original.explanation}` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  try {
    container.innerHTML = html;
    await new Promise(r => setTimeout(r, 150));
    const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
      scale: 2.4,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    doc.addImage(imgData, 'JPEG', 0, 0, 210, 297);
    return doc.output('blob');
  } finally {
    document.body.removeChild(container);
  }
};
