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
  const seededRandom = createSeededRandom(`${exam.id}_${setCode}_unmesh_omr_seed_v3`);

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

  // Unique QR Code encoding the exact Question Set ID: OMR:examId:setCode
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
 * Generate unique sets in batch
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
 * Render 4-Sub-Column Unmesh Style 100 MCQ OMR Grid
 * Sub-col 1: 1-25
 * Sub-col 2: 26-50
 * Sub-col 3: 51-75
 * Sub-col 4: 76-100
 */
function renderUnmesh100OmrGrid(totalQuestions: number): string {
  let html = '<div style="display: flex; gap: 3px; margin-top: 3px; flex: 1;">';
  const subCols = [
    { start: 1, end: 25 },
    { start: 26, end: 50 },
    { start: 51, end: 75 },
    { start: 76, end: 100 }
  ];

  subCols.forEach(({ start, end }) => {
    html += '<div style="flex: 1; border: 1px solid #dc2626; border-radius: 2px; padding: 1px; background: #ffffff;">';
    
    // Header
    html += `
      <div style="display: flex; align-items: center; justify-content: space-between; font-size: 5px; font-weight: 800; color: #ffffff; background: #dc2626; padding: 1px 2px; text-align: center; border-radius: 1px;">
        <span style="width: 11px;">Q.No.</span>
        <span style="flex: 1; text-align: center;">Answer</span>
      </div>
    `;

    for (let q = start; q <= end; q++) {
      if (q > totalQuestions && q > 100) break;
      html += `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.9px; font-size: 5px; height: 7px;">
          <div style="width: 10px; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: #dc2626; text-align: right; padding-right: 2px;">
            ${q}
          </div>
          <div style="flex: 1; display: flex; justify-content: space-around; align-items: center;">
            <div style="width: 5.5px; height: 5.5px; border-radius: 50%; border: 0.7px solid #e11d48; display: flex; align-items: center; justify-content: center; font-size: 3.5px; font-weight: 700; color: #be123c;">A</div>
            <div style="width: 5.5px; height: 5.5px; border-radius: 50%; border: 0.7px solid #e11d48; display: flex; align-items: center; justify-content: center; font-size: 3.5px; font-weight: 700; color: #be123c;">B</div>
            <div style="width: 5.5px; height: 5.5px; border-radius: 50%; border: 0.7px solid #e11d48; display: flex; align-items: center; justify-content: center; font-size: 3.5px; font-weight: 700; color: #be123c;">C</div>
            <div style="width: 5.5px; height: 5.5px; border-radius: 50%; border: 0.7px solid #e11d48; display: flex; align-items: center; justify-content: center; font-size: 3.5px; font-weight: 700; color: #be123c;">D</div>
          </div>
        </div>
      `;
    }

    html += '</div>';
  });

  html += '</div>';
  return html;
}

/**
 * Render Student ID OMR Bubble Grid (0-9 numeric columns to shade)
 */
function renderStudentIdOmrGrid(): string {
  const digits = 6;
  return `
    <div style="border: 1px solid #dc2626; border-radius: 3px; padding: 2px 4px; margin-top: 2px; background: #fff5f5; display: flex; gap: 4px;">
      <div style="flex: 1;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 6px; font-weight: 800; color: #dc2626; margin-bottom: 1.5px;">
          <span>Student ID (স্টুডেন্ট আইডি)</span>
          <span style="font-size: 5px; color: #64748b;">(৬ ডিজিট)</span>
        </div>
        <!-- 6 write boxes -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          ${[0, 1, 2, 3, 4, 5].map(() => `
            <div style="width: 11px; height: 10px; border: 0.8px solid #dc2626; background: #ffffff; border-radius: 1px;"></div>
          `).join('')}
        </div>
        <!-- Bubble Matrix 0 to 9 -->
        <div style="display: flex; justify-content: space-between; font-size: 4px;">
          ${[0, 1, 2, 3, 4, 5].map(() => `
            <div style="display: flex; flex-direction: column; align-items: center; gap: 0.8px;">
              ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `
                <div style="width: 5.4px; height: 5.4px; border-radius: 50%; border: 0.6px solid #e11d48; display: flex; align-items: center; justify-content: center; font-size: 3.5px; font-weight: bold; color: #be123c; background: #ffffff;">${d}</div>
              `).join('')}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Signature of Invigilator vertical box -->
      <div style="width: 18px; border-left: 0.8px dashed #dc2626; display: flex; align-items: center; justify-content: center; writing-mode: vertical-rl; transform: rotate(180deg); font-size: 4.5px; font-weight: 700; color: #991b1b; padding: 2px;">
        SIGNATURE OF INVIGILATOR
      </div>
    </div>
  `;
}

/**
 * Build Full Unmesh-Style Layout HTML (Matching IMG_20261019_170429_064.jpg & IMG_20261019_170429_220.jpg)
 */
function buildUnmeshStyleHtml(
  exam: Exam,
  set: OfflineExamSet,
  qrDataUrl: string,
  appName: string = 'Medical Admission Program 2026'
): { page1Html: string; page2Html: string } {
  const questionsPage1 = set.questions.slice(0, 53); // Q1 to Q53 on Front Page
  const questionsPage2 = set.questions.slice(53);     // Q54 to Q100 on Back Page

  // Split Page 1 questions across Columns 2, 3, 4 (18, 18, 17)
  const p1Col2Questions = questionsPage1.slice(0, 18);
  const p1Col3Questions = questionsPage1.slice(18, 36);
  const p1Col4Questions = questionsPage1.slice(36, 53);

  // Split Page 2 questions across Columns 1, 2, 3 (16, 16, 15)
  const p2Col1Questions = questionsPage2.slice(0, 16);
  const p2Col2Questions = questionsPage2.slice(16, 32);
  const p2Col3Questions = questionsPage2.slice(32, 47);

  const renderQuestionBlock = (q: OfflineExamSetQuestion) => `
    <div style="margin-bottom: 5.5px; page-break-inside: avoid; font-size: 7.8px; line-height: 1.3;">
      <div style="font-weight: 700; color: #090d16; margin-bottom: 1.5px;">
        <span style="font-family: 'JetBrains Mono', monospace; font-size: 7.8px; font-weight: 800; color: #0f172a;">${toBengaliNumber(q.questionNumber).padStart(2, '০')}.</span> ${q.text}
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1px 4px; padding-left: 3px; font-size: 7.2px; color: #1e293b;">
        ${q.options.map(opt => `
          <div>
            <span style="font-weight: 700; color: #0f172a;">(${opt.id.toLowerCase()})</span> ${opt.text}
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const sharedStyles = `
    font-family: 'Hind Siliguri', 'Noto Sans Bengali', -apple-system, sans-serif;
    color: #090d16;
    background: #ffffff;
    width: 1122px; /* Landscape A4 */
    height: 793px;  /* Landscape A4 */
    padding: 12px 16px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  `;

  // Page 1 (Front Side): 4 Columns
  // Col 1 = Left Sidebar OMR with 4 Corner Registration Black Squares
  // Col 2, 3, 4 = Questions 01 to 53
  const page1Html = `
    <div style="${sharedStyles}">
      <div style="height: 100%; display: flex; flex-direction: column; box-sizing: border-box;">
        
        <!-- 4 Columns Container -->
        <div style="display: grid; grid-template-columns: 310px 1fr 1fr 1fr; gap: 8px; flex: 1; min-height: 0;">
          
          <!-- ============================================== -->
          <!-- COLUMN 1: UNMESH OMR SHEET WITH CORNER MARKERS -->
          <!-- ============================================== -->
          <div style="position: relative; border-right: 1.5px dashed #dc2626; padding-right: 6px; display: flex; flex-direction: column;">
            
            {/* 4 SOLID BLACK CORNER REGISTRATION SQUARES FOR COMPUTER VISION */}
            <div style="position: absolute; top: 0px; left: 0px; width: 9px; height: 9px; background: #000000; z-index: 20;"></div>
            <div style="position: absolute; top: 0px; right: 8px; width: 9px; height: 9px; background: #000000; z-index: 20;"></div>
            <div style="position: absolute; bottom: 0px; left: 0px; width: 9px; height: 9px; background: #000000; z-index: 20;"></div>
            <div style="position: absolute; bottom: 0px; right: 8px; width: 9px; height: 9px; background: #000000; z-index: 20;"></div>

            <!-- Top Header & QR Codes -->
            <div style="padding-left: 12px; padding-right: 12px; margin-bottom: 2px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="font-size: 6px; font-weight: bold; color: #475569; font-family: monospace;">
                  Code: ${exam.id.slice(0, 16)}
                </div>
                <div style="font-size: 6px; font-weight: bold; color: #dc2626; font-family: monospace;">
                  SET: ${set.setCode}
                </div>
              </div>

              <!-- Title -->
              <div style="text-align: center; margin-top: 1px;">
                <div style="font-size: 9px; font-weight: 900; color: #0f172a; text-transform: uppercase;">
                  ${appName}
                </div>
                <div style="font-size: 7.5px; font-weight: 700; color: #1e3a8a;">
                  ${exam.title}
                </div>
              </div>

              <!-- QR Code & OMR Banner -->
              <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 2px;">
                <!-- Left QR Code -->
                <div style="background: #ffffff; padding: 1px; border: 1px solid #000000; border-radius: 2px;">
                  <img src="${qrDataUrl}" style="width: 38px; height: 38px; display: block;" />
                </div>

                <div style="text-align: center; flex: 1; padding: 0 4px;">
                  <div style="background: #dc2626; color: #ffffff; font-size: 7.5px; font-weight: 900; padding: 1px 6px; border-radius: 2px; display: inline-block;">
                    OMR উত্তরপত্র
                  </div>
                  <div style="font-size: 5px; color: #dc2626; font-weight: bold; line-height: 1.1; margin-top: 1.5px;">
                    * "পরীক্ষার্থীদের জন্য নির্দেশাবলি" অপর পৃষ্ঠায় বর্ণিত হয়েছে।<br/>
                    Roll No. নির্দিষ্ট স্থানে ইংরেজিতে লিখে সংশ্লিষ্ট বৃত্তগুলো ভরাট করতে হবে।
                  </div>
                </div>

                <!-- Right QR Code (Redundant sync) -->
                <div style="background: #ffffff; padding: 1px; border: 1px solid #000000; border-radius: 2px;">
                  <img src="${qrDataUrl}" style="width: 38px; height: 38px; display: block;" />
                </div>
              </div>
            </div>

            <!-- Student ID Grid -->
            ${renderStudentIdOmrGrid()}

            <!-- 100 MCQ OMR Grid (4 sub-columns: 1-25, 26-50, 51-75, 76-100) -->
            ${renderUnmesh100OmrGrid(exam.questions.length)}

            <!-- Bottom Feedback Banner -->
            <div style="border-top: 0.8px solid #cbd5e1; padding-top: 2px; margin-top: 2px; font-size: 5px; color: #dc2626; display: flex; justify-content: space-between; align-items: center;">
              <span>আজকের প্রশ্নের মান কেমন হয়েছে?</span>
              <span style="display: flex; gap: 4px; font-weight: bold;">
                <span>○ স্ট্যান্ডার্ড</span>
                <span>○ কঠিন</span>
                <span>○ সহজ</span>
              </span>
            </div>

            <!-- Perforation Scissor label on right border -->
            <div style="position: absolute; right: -8px; top: 40%; font-size: 7px; color: #dc2626; background: #ffffff; padding: 2px 0;">
              ✂
            </div>
            <div style="position: absolute; right: -8px; top: 75%; font-size: 7px; color: #dc2626; background: #ffffff; padding: 2px 0;">
              ✂
            </div>
          </div>

          <!-- ============================================== -->
          <!-- COLUMNS 2, 3, 4: QUESTIONS 01 TO 53 -->
          <!-- ============================================== -->

          <!-- Column 2: Questions 01 to 18 -->
          <div style="border-right: 1px solid #e2e8f0; padding-right: 5px; display: flex; flex-direction: column;">
            <!-- Column 2 Header -->
            <div style="border-bottom: 1px solid #0f172a; padding-bottom: 2px; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; font-size: 7px;">
              <span style="font-weight: 800; color: #0f172a;">${appName}</span>
              <span style="font-weight: 700; color: #475569;">পূর্ণমান: ১০০</span>
              <span style="font-weight: 700; color: #475569;">সময়: ৬০ মিনিট</span>
            </div>
            <div style="text-align: center; font-weight: 800; font-size: 7.5px; color: #0f172a; margin-bottom: 4px;">
              বহুনির্বাচনি প্রশ্ন (MCQ)
            </div>
            <div>
              ${p1Col2Questions.map(renderQuestionBlock).join('')}
            </div>
          </div>

          <!-- Column 3: Questions 19 to 36 -->
          <div style="border-right: 1px solid #e2e8f0; padding-right: 5px; padding-top: 18px;">
            ${p1Col3Questions.map(renderQuestionBlock).join('')}
          </div>

          <!-- Column 4: Questions 37 to 53 -->
          <div style="padding-top: 18px;">
            ${p1Col4Questions.map(renderQuestionBlock).join('')}
          </div>

        </div>

        <!-- Page 1 Bottom Footer -->
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 6.5px; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 2px; margin-top: 3px;">
          <span>${exam.title} • সেট কোড: ${set.setCode}</span>
          <span style="font-weight: 800; color: #0f172a;">[পৃষ্ঠা ১ (সম্মুখভাগ)]</span>
          <span>${appName}</span>
        </div>

      </div>
    </div>
  `;

  // Page 2 (Back Side): 4 Columns
  // Cols 1, 2, 3 = Questions 54 to 100
  // Col 4 = "পরীক্ষার্থীদের জন্য নির্দেশাবলি" (Rules & Instructions Box)
  const page2Html = `
    <div style="${sharedStyles}">
      <div style="height: 100%; display: flex; flex-direction: column; box-sizing: border-box;">
        
        <!-- Header Page 2 -->
        <div style="border-bottom: 1.5px solid #0f172a; padding-bottom: 3px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 10px; font-weight: 800; color: #0f172a;">
            ${appName} • ${exam.title}
          </div>
          <div style="font-size: 8px; font-weight: 700; color: #dc2626; font-family: monospace;">
            SET: ${set.setCode} (প্রশ্ন ৫৪ থেকে ১০০)
          </div>
        </div>

        <!-- 4 Columns Grid Page 2 -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 280px; gap: 8px; flex: 1; min-height: 0;">
          
          <!-- Column 1: Questions 54 to 69 -->
          <div style="border-right: 1px solid #e2e8f0; padding-right: 5px;">
            ${p2Col1Questions.map(renderQuestionBlock).join('')}
          </div>

          <!-- Column 2: Questions 70 to 85 -->
          <div style="border-right: 1px solid #e2e8f0; padding-right: 5px;">
            ${p2Col2Questions.map(renderQuestionBlock).join('')}
          </div>

          <!-- Column 3: Questions 86 to 100 -->
          <div style="border-right: 1px solid #e2e8f0; padding-right: 5px;">
            ${p2Col3Questions.map(renderQuestionBlock).join('')}
          </div>

          <!-- Column 4: পরীক্ষার্থীদের জন্য নির্দেশাবলি (Exact Unmesh Style Instructions) -->
          <div style="display: flex; flex-direction: column; justify-content: space-between;">
            
            <div style="border: 1.5px solid #dc2626; border-radius: 4px; padding: 6px; background: #fffdfd; font-size: 6.8px; line-height: 1.32; color: #1e293b;">
              
              <!-- Red Header Banner -->
              <div style="background: #dc2626; color: #ffffff; text-align: center; font-size: 8px; font-weight: 900; padding: 3px; border-radius: 2px; margin-bottom: 5px;">
                পরীক্ষার্থীদের জন্য নির্দেশাবলি
              </div>

              <!-- Numbered Instructions matching photo -->
              <div style="space-y: 3px;">
                <div style="margin-bottom: 3.5px;">
                  <strong style="color: #dc2626;">১।</strong> প্রশ্নপত্রের সাথে সংযুক্ত অবস্থায় OMR উত্তরপত্র প্রদান করা হলো। সতর্কতার সাথে পারফোরেশন মার্ক (--- ✂ ---) বরাবর ছিঁড়ে OMR উত্তরপত্রটি প্রশ্নপত্র হতে আলাদা করে নিতে হবে।
                </div>

                <div style="margin-bottom: 3.5px;">
                  <strong style="color: #dc2626;">২।</strong> OMR উত্তরপত্রের নির্ধারিত স্থানে পরীক্ষার্থীকে রোল নম্বর ও রেজিস্ট্রেশন নম্বর লিখে সংশ্লিষ্ট বৃত্ত ভরাট করতে হবে।
                </div>

                <!-- Illustrated Bubble filling guide -->
                <div style="margin-bottom: 3.5px; background: #fef2f2; padding: 3px; border-radius: 2px; border: 0.5px solid #fecaca;">
                  <div style="color: #991b1b; font-weight: 800; font-size: 6.5px; margin-bottom: 1.5px;">
                    ৩। বৃত্তগুলো এমনভাবে ভরাট করতে হবে যেন ভেতরের লেখাটি দেখা না যায়।
                  </div>
                  <div style="display: flex; align-items: center; justify-content: space-around; font-size: 6px;">
                    <span style="color: #15803d; font-weight: bold;">সঠিক পদ্ধতি: ●</span>
                    <span style="color: #b91c1c;">ভুল পদ্ধতি: ⊗ ⊙ ◐ ✕</span>
                  </div>
                </div>

                <div style="margin-bottom: 3.5px;">
                  <strong style="color: #dc2626;">৪।</strong> প্রতিটি প্রশ্নের চারটি অপশন (Option) দেওয়া আছে। সঠিক অপশনটি বেছে নিয়ে OMR উত্তরপত্রের সংশ্লিষ্ট বৃত্তটি <strong>কালো কালির বলপেন</strong> দিয়ে সম্পূর্ণ ভরাট করতে হবে।
                </div>

                <div style="margin-bottom: 3.5px;">
                  <strong style="color: #dc2626;">৫।</strong> OMR উত্তরপত্রটি মেশিনে মূল্যায়ন করা হবে। এজন্য কোনো অংশে দাগ দেওয়া যাবে না বা রাফ করার কাজে ব্যবহার করা যাবে না।
                </div>

                <div style="margin-bottom: 3.5px;">
                  <strong style="color: #dc2626;">৬।</strong> ভুলভাবে ভরাটকৃত উত্তরপত্র বাতিল বলে গণ্য হবে।
                </div>

                <div style="margin-bottom: 3.5px;">
                  <strong style="color: #dc2626;">৭।</strong> পরীক্ষা কক্ষে মোবাইল বা কোনো প্রকার ডিজিটাল ডিভাইস সম্পূর্ণ নিষিদ্ধ।
                </div>

                <div style="margin-bottom: 3.5px;">
                  <strong style="color: #dc2626;">৮।</strong> অসদুপায় অবলম্বন করলে সাথে সাথে বহিষ্কার করা হবে।
                </div>

                <div style="margin-bottom: 3.5px;">
                  <strong style="color: #dc2626;">৯।</strong> খসড়ার জন্য প্রশ্নপত্র ব্যবহার করা যাবে। কোনো পৃথক কাগজ ব্যবহার করা যাবে না।
                </div>

                <div style="margin-bottom: 3.5px;">
                  <strong style="color: #dc2626;">১০।</strong> পরীক্ষা শেষ না হওয়া পর্যন্ত কোনো পরীক্ষার্থী হল ত্যাগ করতে পারবে না।
                </div>

                <div>
                  <strong style="color: #dc2626;">১১।</strong> প্রতিটি সঠিক উত্তরের জন্য <strong>১ নম্বর</strong> পাওয়া যাবে। প্রতিটি ভুল উত্তরের জন্য <strong>০.২৫ নম্বর</strong> কাটা যাবে।
                </div>
              </div>

            </div>

            <!-- Rough Work Area -->
            <div style="flex: 1; border: 1.2px dashed #94a3b8; border-radius: 4px; margin-top: 5px; padding: 4px; background: #fafafa; display: flex; flex-direction: column;">
              <div style="font-size: 6.5px; font-weight: 800; color: #64748b; text-align: center; border-bottom: 0.8px dashed #cbd5e1; padding-bottom: 2px;">
                খসড়া বা রাফ করার স্থান (ROUGH WORK)
              </div>
              <div style="flex: 1; display: flex; align-items: center; justify-content: center; color: #cbd5e1; font-size: 10px; font-weight: bold;">
                (প্রয়োজনে হিসাব-নিকাশ করার জন্য)
              </div>
            </div>

          </div>

        </div>

        <!-- Page 2 Footer -->
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 6.5px; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 2px; margin-top: 3px;">
          <span>${exam.title} • সেট কোড: ${set.setCode}</span>
          <span style="font-weight: 800; color: #0f172a;">[পৃষ্ঠা ২ (বিপরীতভাগ - সমাপ্ত)]</span>
          <span>${appName}</span>
        </div>

      </div>
    </div>
  `;

  return { page1Html, page2Html };
}

/**
 * Generate 2-Page Unmesh-Style Printable PDF
 */
export const generateAdmissionStylePDF = async (
  exam: Exam,
  set: OfflineExamSet,
  options: PdfGenerationOptions = {}
): Promise<Blob> => {
  const { appName = 'Medical Admission Program 2026' } = options;

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

  const { page1Html, page2Html } = buildUnmeshStyleHtml(exam, set, qrDataUrl, appName);

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
    // Render Page 1 (Front Side: OMR + Questions 1-53)
    container.innerHTML = page1Html;
    await new Promise(r => setTimeout(r, 150));
    const canvas1 = await html2canvas(container.firstElementChild as HTMLElement, {
      scale: 2.8,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData1 = canvas1.toDataURL('image/jpeg', 0.98);
    doc.addImage(imgData1, 'JPEG', 0, 0, 297, 210);

    // Render Page 2 (Back Side: Questions 54-100 + Instructions Box)
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
    <div style="font-family: 'Hind Siliguri', 'Noto Sans Bengali', sans-serif; padding: 20px; color: #0f172a; width: 794px; background: #ffffff;">
      <div style="border-bottom: 2px solid #dc2626; padding-bottom: 6px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 15px; font-weight: 800; color: #dc2626;">শিক্ষক সমাধান ও উত্তরমালা (TEACHER MASTER KEY)</div>
          <div style="font-size: 12px; font-weight: 700; color: #0f172a;">${exam.title}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 13px; font-weight: 900; background: #dc2626; color: #ffffff; padding: 2px 10px; border-radius: 3px; display: inline-block;">
            সেট: ${set.setCode}
          </div>
          <div style="font-size: 8px; color: #64748b; margin-top: 1px;">মোট প্রশ্ন: ${set.questions.length} টি</div>
        </div>
      </div>

      <!-- Quick Answer Grid (100 Questions) -->
      <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; background: #f8fafc; margin-bottom: 10px;">
        <div style="font-size: 8.5px; font-weight: 800; color: #0f172a; margin-bottom: 4px; text-transform: uppercase;">
          এক নজরে সঠিক উত্তর গ্রিড (QUICK ANSWER KEY)
        </div>
        <div style="display: grid; grid-template-columns: repeat(10, 1fr); gap: 3px; font-size: 7.5px; font-family: 'JetBrains Mono', monospace;">
          ${set.questions.map(q => `
            <div style="display: flex; justify-content: space-between; padding: 1.5px 3px; background: #ffffff; border: 0.8px solid #cbd5e1; border-radius: 2px;">
              <span style="font-weight: bold; color: #475569;">${q.questionNumber}.</span>
              <span style="font-weight: 900; color: #dc2626;">${set.answerKey[q.questionNumber]}</span>
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
                <span style="color: #dc2626; font-weight: 800;">${q.questionNumber}.</span> ${q.text}
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
