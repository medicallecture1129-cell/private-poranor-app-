import { Exam, ExamSubmission, LeaderboardRow } from '../types';

/**
 * Universal Bengali Unicode High-Fidelity PDF & Print Engine
 * Renders native Bengali characters using Hind Siliguri / Noto Sans Bengali font.
 * Opens high-resolution Print / Save to PDF dialog directly in the browser.
 */

// Helper to launch printable document with real Bengali typography
const openPrintableBengaliDocument = (htmlContent: string, documentTitle: string) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    // Fallback if popup is blocked: use hidden iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => document.body.removeChild(iframe), 60000);
      }, 500);
    }
    return;
  }

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();

  printWindow.onload = () => {
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
  };
};

export const exportAnswerScriptPDF = (
  exam: Exam,
  submission: ExamSubmission,
  studentName: string,
  college: string
) => {
  const markPerQ = exam.totalMarks / (exam.questions.length || 1);
  const penalty = markPerQ * (exam.negativeMarkPercentage || 0);

  const questionsHtml = exam.questions.map((q, idx) => {
    const studentAns = submission.answers.find(a => a.questionId === q.id);
    const selected = studentAns?.selectedOption || null;
    const isCorrect = studentAns?.isCorrect;
    const isSkipped = !studentAns || studentAns.selectedOption === null;

    const statusBadge = isCorrect
      ? '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:6px;font-weight:700;font-size:12px;">সঠিক (+ ' + markPerQ.toFixed(2) + ')</span>'
      : isSkipped
      ? '<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:6px;font-weight:700;font-size:12px;">স্কিপ (০.০০)</span>'
      : '<span style="background:#fee2e2;color:#b91c1c;padding:2px 8px;border-radius:6px;font-weight:700;font-size:12px;">ভুল (- ' + penalty.toFixed(2) + ')</span>';

    const optionsHtml = q.options.map(opt => {
      const isStudentChoice = opt.id === selected;
      const isRightAns = opt.id === q.correctOption;

      let rowBg = '#ffffff';
      let rowBorder = '#e2e8f0';
      let tag = '';

      if (isRightAns && isStudentChoice) {
        rowBg = '#f0fdf4';
        rowBorder = '#86efac';
        tag = '<span style="color:#16a34a;font-weight:bold;margin-left:8px;">[আপনার সঠিক উত্তর]</span>';
      } else if (isRightAns) {
        rowBg = '#f0fdf4';
        rowBorder = '#86efac';
        tag = '<span style="color:#16a34a;font-weight:bold;margin-left:8px;">[সঠিক উত্তর]</span>';
      } else if (isStudentChoice) {
        rowBg = '#fef2f2';
        rowBorder = '#fca5a5';
        tag = '<span style="color:#dc2626;font-weight:bold;margin-left:8px;">[আপনার ভুল উত্তর]</span>';
      }

      return `
        <div style="display:flex;align-items:center;padding:7px 12px;margin:4px 0;background:${rowBg};border:1px solid ${rowBorder};border-radius:8px;font-size:13px;">
          <strong style="width:24px;color:#1e293b;">${opt.id})</strong>
          <span style="flex:1;color:#334155;">${opt.text}</span>
          ${tag}
        </div>
      `;
    }).join('');

    const explanationHtml = q.explanation ? `
      <div style="margin-top:8px;padding:8px 12px;background:#f8fafc;border-left:3px solid #3b82f6;border-radius:4px;font-size:12px;color:#475569;">
        <strong>ব্যাখ্যা (Explanation):</strong> ${q.explanation}
      </div>
    ` : '';

    return `
      <div style="margin-bottom:18px;padding:14px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;page-break-inside:avoid;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px;">
          <div style="font-weight:700;font-size:14px;color:#0f172a;line-height:1.4;">
            ${idx + 1}. ${q.text}
          </div>
          <div>${statusBadge}</div>
        </div>
        <div style="margin-left:4px;">${optionsHtml}</div>
        ${explanationHtml}
      </div>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="bn">
    <head>
      <meta charset="UTF-8">
      <title>${studentName} - ${exam.title} Answer Script</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        body {
          font-family: 'Hind Siliguri', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          margin: 0;
          padding: 24px;
          background: #f8fafc;
          color: #0f172a;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .container {
          max-width: 820px;
          margin: 0 auto;
          background: #ffffff;
          padding: 32px;
          border-radius: 16px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
        @media print {
          body { background: #ffffff; padding: 0; }
          .container { max-width: 100%; padding: 12px; box-shadow: none; border-radius: 0; }
          .no-print { display: none !important; }
        }
        .header {
          border-bottom: 2px solid #2563eb;
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        .score-card {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 24px;
        }
        .score-box {
          padding: 12px;
          border-radius: 10px;
          text-align: center;
          border: 1px solid #e2e8f0;
        }
        .score-val { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
        .score-lbl { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="no-print" style="margin-bottom: 16px; display: flex; justify-content: flex-end; gap: 8px;">
          <button onclick="window.print()" style="padding: 8px 16px; background: #2563eb; color: #fff; font-weight: 600; font-family: inherit; border: none; border-radius: 8px; cursor: pointer;">
            🖨️ PDF হিসেবে সেভ করুন / প্রিন্ট
          </button>
        </div>

        <div class="header">
          <div style="font-size: 20px; font-weight: 800; color: #1e3a8a;">EXAM PORTAL - অফিশিয়াল আনসার স্ক্রিপ্ট</div>
          <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 4px;">${exam.title} (${exam.courseName})</div>
          <div style="font-size: 13px; color: #475569; margin-top: 4px;">
            শিক্ষার্থী: <strong>${studentName}</strong> | কলেজ/প্রতিষ্ঠান: <strong>${college}</strong>
          </div>
        </div>

        <div class="score-card">
          <div class="score-box" style="background:#eff6ff; border-color:#bfdbfe;">
            <div class="score-val" style="color:#1d4ed8;">${submission.marksObtained} / ${exam.totalMarks}</div>
            <div class="score-lbl">মোট প্রাপ্ত নম্বর (${submission.percentage.toFixed(1)}%)</div>
          </div>
          <div class="score-box" style="background:#f0fdf4; border-color:#bbf7d0;">
            <div class="score-val" style="color:#15803d;">${submission.correctCount}</div>
            <div class="score-lbl">সঠিক উত্তর</div>
          </div>
          <div class="score-box" style="background:#fef2f2; border-color:#fecaca;">
            <div class="score-val" style="color:#b91c1c;">${submission.wrongCount}</div>
            <div class="score-lbl">ভুল উত্তর</div>
          </div>
          <div class="score-box" style="background:#f8fafc; border-color:#e2e8f0;">
            <div class="score-val" style="color:#475569;">${submission.skippedCount}</div>
            <div class="score-lbl">স্কিপ করা প্রশ্ন</div>
          </div>
        </div>

        <div style="margin-bottom: 12px; font-weight: 700; font-size: 14px; color: #1e293b;">
          প্রশ্নোত্তর ও সমাধান বিবরণী (Answer Details):
        </div>

        ${questionsHtml}

        <div style="text-align: center; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
          Exam Portal Online Platform • Generated for ${studentName}
        </div>
      </div>
    </body>
    </html>
  `;

  openPrintableBengaliDocument(html, `${studentName}_AnswerScript`);
};

export const exportLeaderboardPDF = (
  examTitle: string,
  courseName: string,
  rows: LeaderboardRow[]
) => {
  const tableRows = rows.map((r) => `
    <tr style="border-bottom: 1px solid #e2e8f0; ${r.rank <= 3 ? 'background:#fefce8; font-weight:600;' : ''}">
      <td style="padding: 8px 12px; text-align: center; font-weight: bold; color: ${r.rank === 1 ? '#ca8a04' : '#1e293b'};">
        #${r.rank}
      </td>
      <td style="padding: 8px 12px; color: #0f172a;">${r.studentName}</td>
      <td style="padding: 8px 12px; color: #475569;">${r.studentCollege || 'N/A'}</td>
      <td style="padding: 8px 12px; font-weight: bold; color: #2563eb;">${r.marksObtained}</td>
      <td style="padding: 8px 12px; color: #16a34a; font-weight: 600;">${r.percentage.toFixed(1)}%</td>
      <td style="padding: 8px 12px; color: #64748b;">${r.durationFormatted}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="bn">
    <head>
      <meta charset="UTF-8">
      <title>Leaderboard - ${examTitle}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Hind Siliguri', sans-serif; padding: 24px; background: #fff; color: #0f172a; }
        .no-print { display: flex; justify-content: flex-end; margin-bottom: 16px; }
        @media print { .no-print { display: none !important; } }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #f1f5f9; padding: 10px 12px; text-align: left; font-weight: 700; color: #334155; border-bottom: 2px solid #cbd5e1; }
      </style>
    </head>
    <body>
      <div class="no-print">
        <button onclick="window.print()" style="padding: 8px 16px; background: #2563eb; color: #fff; font-weight: 600; font-family: inherit; border: none; border-radius: 8px; cursor: pointer;">
          🖨️ PDF হিসেবে সেভ করুন / প্রিন্ট
        </button>
      </div>
      <div style="border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="margin: 0; color: #1e3a8a;">EXAM PORTAL - অফিশিয়াল মেধা তালিকা (Leaderboard)</h2>
        <div style="font-size: 15px; font-weight: 700; margin-top: 4px;">পরীক্ষা: ${examTitle} | কোর্স: ${courseName}</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 2px;">মোট পরীক্ষার্থী: ${rows.length} জন</div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="text-align: center; width: 60px;">র‍্যাংক</th>
            <th>শিক্ষার্থীর নাম</th>
            <th>কলেজ/প্রতিষ্ঠান</th>
            <th>প্রাপ্ত নম্বর</th>
            <th>শতাংশ (%)</th>
            <th>সময়</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </body>
    </html>
  `;

  openPrintableBengaliDocument(html, `${examTitle}_Leaderboard`);
};

export const exportStudentSummaryPDF = (
  student: { name: string; email: string; college: string; mobile?: string },
  submissions: ExamSubmission[],
  exams: Exam[],
  filterType: 'both' | 'live' | 'practice' = 'both',
  courseName?: string
) => {
  const filterLabel = 
    filterType === 'live' 
      ? 'লাইভ পরীক্ষা (Live Exams Only)' 
      : filterType === 'practice' 
      ? 'অনুশীলন পরীক্ষা (Practice Exams Only)' 
      : 'সকল পরীক্ষা (লাইভ + অনুশীলন / Both Exams)';

  const rows = submissions.map(sub => {
    const exam = exams.find(e => e.id === sub.examId);
    const examTitle = exam ? exam.title : 'Exam';
    const dateStr = new Date(sub.submittedAt).toLocaleDateString('en-GB');
    const minutes = Math.floor(sub.durationSeconds / 60);
    const seconds = sub.durationSeconds % 60;

    return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 12px; color: #64748b;">${dateStr}</td>
        <td style="padding: 8px 12px; font-weight: 600; color: #0f172a;">${examTitle}</td>
        <td style="padding: 8px 12px; color: ${sub.isLive ? '#2563eb' : '#64748b'};">${sub.isLive ? 'লাইভ পরীক্ষা' : 'অনুশীলন'}</td>
        <td style="padding: 8px 12px; font-weight: bold; color: #1e293b;">${sub.marksObtained} / ${sub.totalMarks}</td>
        <td style="padding: 8px 12px; font-weight: bold; color: #16a34a;">${sub.percentage.toFixed(1)}%</td>
        <td style="padding: 8px 12px; color: #64748b;">${minutes}মি ${seconds}সে</td>
      </tr>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="bn">
    <head>
      <meta charset="UTF-8">
      <title>${student.name} - Performance Summary</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Hind Siliguri', sans-serif; padding: 24px; background: #fff; color: #0f172a; }
        .no-print { display: flex; justify-content: flex-end; margin-bottom: 16px; }
        @media print { .no-print { display: none !important; } }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #f1f5f9; padding: 10px 12px; text-align: left; font-weight: 700; color: #334155; border-bottom: 2px solid #cbd5e1; }
      </style>
    </head>
    <body>
      <div class="no-print">
        <button onclick="window.print()" style="padding: 8px 16px; background: #2563eb; color: #fff; font-weight: 600; font-family: inherit; border: none; border-radius: 8px; cursor: pointer;">
          🖨️ PDF হিসেবে সেভ করুন / প্রিন্ট
        </button>
      </div>
      <div style="border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="margin: 0; color: #1e3a8a;">EXAM PORTAL - সামগ্রিক পরীক্ষার সারসংক্ষেপ (Student Performance)</h2>
        <div style="font-size: 14px; font-weight: 700; margin-top: 4px;">শিক্ষার্থী: ${student.name} | কলেজ: ${student.college} ${courseName ? `| কোর্স: ${courseName}` : ''}</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 2px;">ইমেইল: ${student.email} | ফোন: ${student.mobile || 'N/A'} | ফিল্টার: <strong>${filterLabel}</strong> | মোট সম্পন্ন পরীক্ষা: ${submissions.length} টি</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>তারিখ</th>
            <th>পরীক্ষার নাম</th>
            <th>ধরন</th>
            <th>প্রাপ্ত নম্বর</th>
            <th>শতাংশ (%)</th>
            <th>ব্যয়িত সময়</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </body>
    </html>
  `;

  openPrintableBengaliDocument(html, `${student.name}_Performance_Summary`);
};
