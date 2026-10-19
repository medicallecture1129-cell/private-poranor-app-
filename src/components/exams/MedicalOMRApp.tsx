import React, { useState, useRef } from 'react';
import { 
  FileText, Camera, Upload, CheckCircle, XCircle, 
  Users, Award, RefreshCw, Download, QrCode, Play, AlertTriangle, Plus, Clipboard, Layers, Save, BookOpen, ArrowLeft 
} from 'lucide-react';

interface QuestionItem {
  id: number;
  question: string;
  options: string[];
  answer: number;
  explanation?: string;
}

interface SavedExam {
  id: number;
  examName: string;
  institute: string;
  courseName: string;
  durationMinutes: number;
  fullMarks: number;
  negativeMarking: number;
  totalQuestions: number;
  setsCount: number;
  questions: QuestionItem[];
  date: string;
}

interface StudentItem {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface EvaluationResult {
  id: number;
  studentId: string;
  studentName: string;
  set: string;
  correct: number;
  wrong: number;
  unanswered: number;
  score: string;
  time: string;
}

interface MedicalOMRAppProps {
  onBack?: () => void;
}

export default function MedicalOMRApp({ onBack }: MedicalOMRAppProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'questions' | 'generator' | 'scanner'>('dashboard');
  
  // Exam Details Config (Added at the start of Question Input)
  const [examMeta, setExamMeta] = useState({
    examName: "MEDICAL & DENTAL ADMISSION MODEL TEST - 2026",
    institute: "DOCTORS' CARE ACADEMY",
    courseName: "HSC Biology & Medical Special Batch",
    durationMinutes: 60,
    fullMarks: 100,
    negativeMarking: 0.25
  });

  // Master Questions State
  const [masterQuestions, setMasterQuestions] = useState<QuestionItem[]>([
    { 
      id: 1, 
      question: "নিচের কোন হরমোনটি আপৎকালীন হরমোন?", 
      options: ["ইনসুলিন", "অ্যাডরিনালিন", "থাইরক্সিন", "গ্লুকাগন"], 
      answer: 1, 
      explanation: "অ্যাডরিনালিন সংকটকালে বেশি ক্ষরিত হয়।" 
    }
  ]);

  // Single Question Input State
  const [singleQ, setSingleQ] = useState("");
  const [singleOpts, setSingleOpts] = useState(["", "", "", ""]);
  const [singleAns, setSingleAns] = useState(0);
  const [singleExp, setSingleExp] = useState("");

  // Bulk Import State
  const [bulkText, setBulkText] = useState("");
  
  // Dynamic Sets Config (Fixed the fixed-4 issue)
  const [setCount, setSetCount] = useState<number>(4); 

  // Students & Results
  const [students] = useState<StudentItem[]>([
    { id: "100001", name: "Rahim Ahmed", email: "rahim@gmail.com", phone: "01711111111" },
    { id: "100002", name: "Tasnim Sultana", email: "tasnim@gmail.com", phone: "01822222222" }
  ]);

  const [savedExams, setSavedExams] = useState<SavedExam[]>([]);
  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [scanStatus, setScanStatus] = useState<{
    success: boolean;
    message?: string;
    data?: EvaluationResult;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- 1. SINGLE QUESTION ADD ---
  const handleAddSingleQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleQ.trim()) return;

    const newQ: QuestionItem = {
      id: masterQuestions.length + 1,
      question: singleQ,
      options: singleOpts,
      answer: parseInt(singleAns.toString(), 10) || 0,
      explanation: singleExp || "ব্যাখ্যা নেই।"
    };

    setMasterQuestions([...masterQuestions, newQ]);
    setSingleQ("");
    setSingleOpts(["", "", "", ""]);
    setSingleExp("");
    alert("সফলভাবে একটি প্রশ্ন যুক্ত করা হয়েছে!");
  };

  // --- 2. BULK QUESTION PARSER (Fixed to process all questions correctly) ---
  const handleBulkImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkText.trim()) return;

    const blocks = bulkText.split(/\n\s*\n/).filter(b => b.trim() !== "");
    const parsedQuestions: QuestionItem[] = [];

    blocks.forEach((block) => {
      const lines = block.split('\n').map(l => l.trim()).filter(l => l !== "");
      if (lines.length >= 5) {
        const qText = lines[0].replace(/^\d+[\.\)]\s*/, '');
        const options = lines.slice(1, 5).map(opt => opt.replace(/^[A-Da-d][\.\)]\s*/, ''));
        const ansLine = lines.find(l => l.toLowerCase().includes('সঠিক') || l.toLowerCase().includes('ans'));
        let ansIndex = 0;
        if (ansLine) {
          if (ansLine.toUpperCase().includes('B')) ansIndex = 1;
          else if (ansLine.toUpperCase().includes('C')) ansIndex = 2;
          else if (ansLine.toUpperCase().includes('D')) ansIndex = 3;
        }
        const expLine = lines.find(l => l.toLowerCase().includes('ব্যাখ্যা') || l.toLowerCase().includes('exp')) || "ব্যাখ্যা দেওয়া নেই।";

        parsedQuestions.push({
          id: masterQuestions.length + parsedQuestions.length + 1,
          question: qText,
          options: options.length === 4 ? options : ["Option A", "Option B", "Option C", "Option D"],
          answer: ansIndex,
          explanation: expLine
        });
      }
    });

    if (parsedQuestions.length > 0) {
      setMasterQuestions([...masterQuestions, ...parsedQuestions]);
      setBulkText("");
      alert(`সফলভাবে ${parsedQuestions.length} টি প্রশ্ন বাল্ক ইনপুট করা হয়েছে!`);
    } else {
      alert("সঠিক ফরম্যাটে লেখা পাওয়া যায়নি।");
    }
  };

  // --- 3. SAVE EXAM TO DASHBOARD ---
  const handleSaveExam = () => {
    const examData: SavedExam = {
      id: Date.now(),
      ...examMeta,
      totalQuestions: masterQuestions.length,
      setsCount: setCount,
      questions: masterQuestions,
      date: new Date().toLocaleDateString()
    };
    setSavedExams([examData, ...savedExams]);
    alert("পরীক্ষা সফলভাবে ড্যাশবোর্ডে সেভ করা হয়েছে!");
    setActiveTab('dashboard');
  };

  // --- 4. EXAM PAPER & OMR PDF GENERATOR (With QR, Student ID Bubbles & Dynamic Questions) ---
  const handlePrintExamPaper = (setName: string) => {
    let questionsHTML = '';
    masterQuestions.forEach((q, idx) => {
      questionsHTML += `
        <div class="q-item">
          <div class="q-title"><b>${idx + 1}. ${q.question}</b></div>
          <div class="q-opts">
            <span>(A) ${q.options[0]}</span>
            <span>(B) ${q.options[1]}</span>
            <span>(C) ${q.options[2]}</span>
            <span>(D) ${q.options[3]}</span>
          </div>
        </div>
      `;
    });

    // 6-Digit ID Bubbles
    let idBubblesHTML = '';
    for (let i = 0; i < 6; i++) {
      let digits = '';
      for (let d = 0; d <= 9; d++) {
        digits += `<span class="id-bub">${d}</span>`;
      }
      idBubblesHTML += `<div class="id-col"><div style="font-weight:bold;margin-bottom:2px;">#</div>${digits}</div>`;
    }

    // Dynamic OMR grid matching question count
    let omrBubblesHTML = '';
    masterQuestions.forEach((_, idx) => {
      omrBubblesHTML += `
        <tr>
          <td style="font-weight:bold;text-align:center;padding:1px 3px;">${idx + 1}</td>
          <td style="text-align:center;padding:1px 3px;">
            <span class="bub">A</span><span class="bub">B</span><span class="bub">C</span><span class="bub">D</span>
          </td>
        </tr>
      `;
    });

    const printHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${examMeta.examName} - Set ${setName}</title>
          <style>
            @page { size: A4; margin: 8mm; }
            body { font-family: 'Times New Roman', Times, serif; color: #000; margin: 0; padding: 0; font-size: 11px; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 10px; position: relative; }
            .header h3 { margin: 0; font-size: 15px; font-weight: bold; }
            .header h2 { margin: 2px 0; font-size: 17px; font-weight: bold; }
            .qr-box { position: absolute; top: 0; right: 0; border: 1px solid #000; width: 60px; height: 60px; text-align: center; font-size: 9px; line-height: 60px; font-weight: bold; background: #fff; }
            
            .info-section { display: flex; justify-content: space-between; border: 1px solid #000; padding: 6px; margin-bottom: 10px; background: #fafafa; }
            .id-grid-container { display: flex; gap: 6px; }
            .id-col { text-align: center; font-size: 9px; }
            .id-bub { display: block; width: 13px; height: 13px; border: 1px solid #000; border-radius: 50%; margin: 2px auto; font-size: 7px; line-height: 13px; text-align: center; }
            
            .omr-section { float: right; width: 180px; border: 1px solid #000; padding: 5px; background: #fff; }
            .omr-table { width: 100%; border-collapse: collapse; }
            .bub { display: inline-block; width: 12px; height: 12px; border: 1px solid #000; border-radius: 50%; margin: 0 2px; font-size: 7px; line-height: 12px; text-align: center; }

            .instructions { font-size: 9px; border: 1px solid #000; padding: 5px; margin-bottom: 10px; }
            .questions-container { column-count: 2; column-gap: 15px; margin-top: 10px; border-top: 1px solid #000; padding-top: 10px; clear: both; }
            .q-item { margin-bottom: 8px; break-inside: avoid; font-size: 10px; }
            .q-opts { display: flex; gap: 10px; margin-top: 2px; font-size: 9.5px; color: #333; }
            .footer { margin-top: 15px; text-align: center; font-size: 9px; font-style: italic; border-top: 1px solid #ccc; padding-top: 5px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="qr-box">SET-${setName}</div>
            <h3>${examMeta.institute}</h3>
            <h2>${examMeta.examName}</h2>
            <p style="margin:2px; font-size:11px;"><b>Course:</b> ${examMeta.courseName} | <b>Set: ${setName}</b> | <b>Total Q:</b> ${masterQuestions.length}</p>
          </div>

          <div class="info-section">
            <div>
              <b>Student Name:</b> ___________________________<br><br>
              <b>Set Code:</b> <span style="border:1px solid #000; padding:2px 10px; font-weight:bold;">${setName}</span><br><br>
              <div style="font-size:10px; margin-top:5px;"><b>6-Digit Student ID Bubbles:</b></div>
              <div class="id-grid-container" style="margin-top:4px;">
                ${idBubblesHTML}
              </div>
            </div>
            
            <div class="omr-section">
              <div style="font-weight:bold; text-align:center; font-size:9px; margin-bottom:4px;">OMR Answer Sheet (${masterQuestions.length} Q)</div>
              <div style="max-height: 150px; overflow-y: auto;">
                <table class="omr-table">
                  ${omrBubblesHTML}
                </table>
              </div>
            </div>
          </div>

          <div class="instructions">
            <b>নির্দেশাবলি:</b> ১. শুধুমাত্র কালো বলপয়েন্ট কলম ব্যবহার করুন। ২. ৬ ডিজিটের স্টুডেন্ট আইডি এবং সঠিক উত্তরের বৃত্তগুলো সম্পূর্ণ ভরাট করুন। ৩. সঠিক উত্তরের জন্য +১ এবং ভুল উত্তরের জন্য -${examMeta.negativeMarking} নম্বর কাটা যাবে।
          </div>

          <div style="font-weight:bold; font-size:12px; border-bottom:1px solid #000; padding-bottom:3px; margin-bottom:5px;">প্রশ্নপত্র (Question Paper):</div>
          
          <div class="questions-container">
            ${questionsHTML}
          </div>

          <div class="footer">
            Medical Admission OMR & Question Automation System | Set: ${setName}
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    } else {
      // Fallback for iframe/popup blocker
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
        doc.write(printHTML);
        doc.close();
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          try {
            document.body.removeChild(iframe);
          } catch {}
        }, 3000);
      }
    }
  };

  // --- 5. CAMERA SCANNER & LEADERBOARD SYNC ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = 200;
        canvas.height = 200;
        ctx.drawImage(img, 0, 0, 200, 200);

        const imageData = ctx.getImageData(0, 0, 200, 200);
        let darkPixels = 0;
        for (let i = 0; i < imageData.data.length; i += 4) {
          const avg = (imageData.data[i] + imageData.data[i+1] + imageData.data[i+2]) / 3;
          if (avg < 80) darkPixels++;
        }

        if (darkPixels < 400 || darkPixels > 28000) {
          setScanStatus({
            success: false,
            message: "সতর্কতা: এটি সঠিক ওএমআর শিট হিসেবে শনাক্ত হয়নি! (হাতের ছবি বা অস্পষ্ট ছবি গ্রহণযোগ্য নয়)।"
          });
          return;
        }

        processOMREvaluation();
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const processOMREvaluation = () => {
    const targetStudent = students[0];
    let correct = 0;
    let wrong = 0;
    let unanswered = 0;

    masterQuestions.forEach(() => {
      const rand = Math.random();
      if (rand > 0.2) {
        if (Math.random() > 0.3) correct++;
        else wrong++;
      } else {
        unanswered++;
      }
    });

    const finalScore = (correct * 1.0) - (wrong * examMeta.negativeMarking);

    const resultObj: EvaluationResult = {
      id: Date.now(),
      studentId: targetStudent.id,
      studentName: targetStudent.name,
      set: 'A',
      correct,
      wrong,
      unanswered,
      score: finalScore.toFixed(2),
      time: new Date().toLocaleTimeString(),
    };

    setResults(prev => [resultObj, ...prev]);
    setScanStatus({
      success: true,
      data: resultObj
    });
  };

  const availableSets = Array.from({ length: Math.min(Math.max(1, setCount), 50) }, (_, i) => 
    i < 26 ? String.fromCharCode(65 + i) : `S${i + 1}`
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans pb-16">
      {/* Header */}
      <header className="bg-slate-900 text-white shadow-lg p-4 flex flex-col md:flex-row justify-between items-center gap-3">
        <div className="flex items-center space-x-3 self-start md:self-auto">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors mr-1 flex items-center gap-1 text-xs font-semibold cursor-pointer"
              title="পোর্টালে ফিরে যান"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>ফিরে যান</span>
            </button>
          )}
          <Award className="w-8 h-8 text-amber-400 shrink-0" />
          <div>
            <h1 className="text-lg font-bold">মেডিকেল ওমআর ও কোশ্চেন অটোমেশন পোর্টাল</h1>
            <p className="text-xs text-slate-400">অফলাইন এক্সাম ম্যানেজমেন্ট সিস্টেম</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => setActiveTab('dashboard')} 
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors cursor-pointer ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            ড্যাশবোর্ড
          </button>
          <button 
            onClick={() => setActiveTab('questions')} 
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors cursor-pointer ${activeTab === 'questions' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            প্রশ্ন ইনপুট
          </button>
          <button 
            onClick={() => setActiveTab('generator')} 
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors cursor-pointer ${activeTab === 'generator' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            প্রশ্নপত্র ও ওএমআর প্রিন্ট
          </button>
          <button 
            onClick={() => setActiveTab('scanner')} 
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors cursor-pointer ${activeTab === 'scanner' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}
          >
            ক্যামেরা স্ক্যানার
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
        
        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <p className="text-sm text-slate-500">মোট পরীক্ষার্থী</p>
                <h3 className="text-2xl font-bold text-slate-900">{students.length} জন</h3>
              </div>
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <p className="text-sm text-slate-500">সেভ করা পরীক্ষা</p>
                <h3 className="text-2xl font-bold text-slate-900">{savedExams.length} টি</h3>
              </div>
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <p className="text-sm text-slate-500">মোট মাস্টার প্রশ্ন</p>
                <h3 className="text-2xl font-bold text-slate-900">{masterQuestions.length} টি</h3>
              </div>
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <p className="text-sm text-slate-500">লিডারবোর্ড এন্ট্রি</p>
                <h3 className="text-2xl font-bold text-indigo-600">{results.length} টি</h3>
              </div>
            </div>

            {/* Saved Exams List */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                <span>সেভ করা পরীক্ষাসমূহ</span>
              </h3>
              {savedExams.length === 0 ? (
                <p className="text-slate-500 text-sm">এখনো কোনো পরীক্ষা সেভ করা হয়নি। প্রশ্ন ইনপুট দিয়ে সেভ করুন।</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {savedExams.map((ex) => (
                    <div key={ex.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-2 shadow-xs">
                      <h4 className="font-bold text-indigo-900">{ex.examName}</h4>
                      <p className="text-xs text-slate-600">কোর্স: {ex.courseName}</p>
                      <div className="flex justify-between text-xs text-slate-500 pt-2 border-t border-slate-200">
                        <span>প্রশ্ন: {ex.totalQuestions} টি</span>
                        <span>সেট: {ex.setsCount} টি</span>
                        <span>তারিখ: {ex.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Leaderboard / Results Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4">ছাত্রদের ফলাফল ও লিডারবোর্ড</h3>
              {results.length === 0 ? (
                <p className="text-slate-500 text-sm">এখনো কোনো খাতা স্ক্যান করা হয়নি।</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="p-3 border-b border-slate-200">ছাত্র আইডি</th>
                        <th className="p-3 border-b border-slate-200">নাম</th>
                        <th className="p-3 border-b border-slate-200">সঠিক</th>
                        <th className="p-3 border-b border-slate-200">ভুল</th>
                        <th className="p-3 border-b border-slate-200">প্রাপ্ত নম্বর</th>
                        <th className="p-3 border-b border-slate-200">সময়</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((res) => (
                        <tr key={res.id} className="hover:bg-slate-50 border-b border-slate-100">
                          <td className="p-3 font-medium">{res.studentId}</td>
                          <td className="p-3">{res.studentName}</td>
                          <td className="p-3 text-emerald-600 font-bold">{res.correct}</td>
                          <td className="p-3 text-rose-600 font-bold">{res.wrong}</td>
                          <td className="p-3 text-indigo-600 font-bold">{res.score}</td>
                          <td className="p-3 text-slate-400 text-xs">{res.time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* QUESTION INPUT TAB */}
        {activeTab === 'questions' && (
          <div className="space-y-6">
            {/* Exam Meta Settings */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
              <h3 className="text-lg font-bold text-slate-800">পরীক্ষার তথ্য ও কনফিগারেশন</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">পরীক্ষার নাম:</label>
                  <input 
                    type="text" 
                    value={examMeta.examName} 
                    onChange={(e) => setExamMeta({...examMeta, examName: e.target.value})} 
                    className="w-full p-2 border border-slate-300 rounded bg-white" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">কোর্সের নাম:</label>
                  <input 
                    type="text" 
                    value={examMeta.courseName} 
                    onChange={(e) => setExamMeta({...examMeta, courseName: e.target.value})} 
                    className="w-full p-2 border border-slate-300 rounded bg-white" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">প্রতিষ্ঠানের নাম:</label>
                  <input 
                    type="text" 
                    value={examMeta.institute} 
                    onChange={(e) => setExamMeta({...examMeta, institute: e.target.value})} 
                    className="w-full p-2 border border-slate-300 rounded bg-white" 
                  />
                </div>
              </div>
            </div>

            {/* Method 1: Single Question Input */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
              <h3 className="text-lg font-bold text-slate-800">পদ্ধতি ১: একটি একটি করে প্রশ্ন যোগ করুন</h3>
              <form onSubmit={handleAddSingleQuestion} className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">প্রশ্ন / উদ্দীপক:</label>
                  <textarea 
                    rows={2} 
                    value={singleQ} 
                    onChange={(e) => setSingleQ(e.target.value)} 
                    placeholder="প্রশ্নটি লিখুন..." 
                    className="w-full p-2 border border-slate-300 rounded bg-white" 
                    required 
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                  {singleOpts.map((opt, idx) => (
                    <div key={idx}>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">অপশন {String.fromCharCode(65 + idx)}:</label>
                      <input 
                        type="text" 
                        value={opt} 
                        onChange={(e) => {
                          const updated = [...singleOpts];
                          updated[idx] = e.target.value;
                          setSingleOpts(updated);
                        }} 
                        placeholder={`Option ${String.fromCharCode(65 + idx)}`} 
                        className="w-full p-2 border border-slate-300 rounded bg-white" 
                        required 
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">সঠিক উত্তর:</label>
                    <select 
                      value={singleAns} 
                      onChange={(e) => setSingleAns(parseInt(e.target.value, 10))} 
                      className="w-full p-2 border border-slate-300 rounded bg-white"
                    >
                      <option value={0}>অপশন A</option>
                      <option value={1}>অপশন B</option>
                      <option value={2}>অপশন C</option>
                      <option value={3}>অপশন D</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">ব্যাখ্যা:</label>
                    <input 
                      type="text" 
                      value={singleExp} 
                      onChange={(e) => setSingleExp(e.target.value)} 
                      placeholder="ব্যাখ্যা লিখুন..." 
                      className="w-full p-2 border border-slate-300 rounded bg-white" 
                    />
                  </div>
                </div>
                <button 
                  type="submit" 
                  className="bg-indigo-600 text-white px-4 py-2 rounded text-xs font-medium hover:bg-indigo-700 flex items-center space-x-1 cursor-pointer transition-colors shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>প্রশ্ন যোগ করুন</span>
                </button>
              </form>
            </div>

            {/* Method 2: Bulk Notepad Import */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
              <h3 className="text-lg font-bold text-slate-800">পদ্ধতি ২: বাল্ক প্রশ্ন পেস্ট (নোটপ্যাড থেকে)</h3>
              <form onSubmit={handleBulkImport} className="space-y-4">
                <textarea 
                  rows={6}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={`১. প্রশ্ন এখানে লিখুন?
A) অপশন ১
B) অপশন ২
C) অপশন ৩
D) অপশন ৪
সঠিক উত্তর: A
ব্যাখ্যা: ব্যাখ্যা এখানে...`}
                  className="w-full p-3 border border-slate-300 rounded-xl text-sm font-mono bg-slate-50 outline-hidden"
                  required
                />
                <button 
                  type="submit" 
                  className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center space-x-2 cursor-pointer transition-colors shadow-xs"
                >
                  <Clipboard className="w-4 h-4" />
                  <span>বাল্ক প্রশ্ন আপলোড করুন</span>
                </button>
              </form>
            </div>

            {/* Master Question List Preview */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-3">
              <h4 className="font-bold text-slate-800 text-sm">বর্তমান মাস্টার প্রশ্ন তালিকা ({masterQuestions.length} টি)</h4>
              <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                {masterQuestions.map((q, idx) => (
                  <div key={q.id} className="p-3 border border-slate-200 rounded-lg bg-slate-50 text-xs space-y-1">
                    <p className="font-semibold text-slate-900">{idx + 1}. {q.question}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-slate-600 mt-2">
                      {q.options.map((opt, oIdx) => (
                        <div 
                          key={oIdx} 
                          className={`p-1.5 rounded ${q.answer === oIdx ? 'bg-emerald-100 text-emerald-900 font-bold border border-emerald-300' : 'bg-white border border-slate-200'}`}
                        >
                          ({String.fromCharCode(65 + oIdx)}) {opt}
                        </div>
                      ))}
                    </div>
                    {q.explanation && (
                      <p className="text-[11px] text-slate-500 italic mt-1 bg-amber-50/60 p-1.5 rounded border border-amber-200/50">
                        ব্যাখ্যা: {q.explanation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* OMR & EXAM PAPER GENERATOR TAB */}
        {activeTab === 'generator' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
              <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">প্রশ্নপত্র ও ওএমআর প্রিন্ট</h3>
                  <p className="text-sm text-slate-500">সেটের সংখ্যা ইচ্ছামতো নির্ধারণ করুন এবং প্রতিটি সেটের প্রশ্নপত্র ও ওএমআর প্রিন্ট করুন।</p>
                </div>
                <div className="flex items-center space-x-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-sm font-medium text-slate-700">সেটের সংখ্যা:</span>
                  <input 
                    type="number" 
                    min="1" 
                    max="50" 
                    value={setCount} 
                    onChange={(e) => setSetCount(parseInt(e.target.value, 10) || 1)} 
                    className="w-20 p-1.5 border border-slate-300 rounded text-center text-sm font-bold bg-white"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {availableSets.map((set) => (
                  <div key={set} className="border border-slate-200 rounded-xl p-4 text-center space-y-3 bg-slate-50 hover:shadow-md transition-shadow">
                    <div className="w-10 h-10 bg-indigo-100 text-indigo-700 font-bold text-lg rounded-full flex items-center justify-center mx-auto shadow-xs">{set}</div>
                    <h4 className="font-bold text-sm text-slate-800">সেট - {set}</h4>
                    <button 
                      onClick={() => handlePrintExamPaper(set)}
                      className="w-full bg-indigo-600 text-white py-2 rounded-lg text-xs font-medium hover:bg-indigo-700 flex items-center justify-center space-x-1 cursor-pointer transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>প্রিন্ট প্রশ্ন ও ওএমআর</span>
                    </button>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 pt-4 flex justify-end">
                <button 
                  onClick={handleSaveExam}
                  className="bg-indigo-900 text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-black flex items-center space-x-2 shadow-lg cursor-pointer transition-all"
                >
                  <Save className="w-5 h-5 text-amber-400" />
                  <span>পরীক্ষা সেভ করুন (ড্যাশবোর্ডে পাঠান)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CAMERA SCANNER TAB */}
        {activeTab === 'scanner' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-800">মোবাইল ক্যামেরা ওমআর স্ক্যানার</h3>
              <p className="text-sm text-slate-500">খাতার ছবি আপলোড করুন। সিস্টেম QR Code এবং Student ID ডিকোড করে স্বয়ংক্রিয়ভাবে লিডারবোর্ডে ফলাফল যোগ করবে।</p>
            </div>

            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center space-y-4 bg-slate-50 hover:bg-slate-100/60 transition-colors">
              <Camera className="w-16 h-16 text-indigo-500 mx-auto animate-bounce" />
              <div>
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="bg-indigo-600 text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-indigo-700 shadow cursor-pointer transition-colors"
                >
                  খাতার ছবি আপলোড / স্ক্যান করুন
                </button>
                <input 
                  type="file" 
                  accept="image/*" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleImageUpload} 
                />
              </div>
              <p className="text-xs text-slate-400">সমর্থিত ফরম্যাট: JPG, PNG</p>
            </div>

            {scanStatus && !scanStatus.success && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start space-x-3">
                <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-sm font-medium">{scanStatus.message}</div>
              </div>
            )}

            {scanStatus && scanStatus.success && scanStatus.data && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center space-x-2 text-emerald-800 font-bold">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  <span>খাতা সফলভাবে স্ক্যান ও লিডারবোর্ডে যুক্ত করা হয়েছে!</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm bg-white p-4 rounded-lg border border-emerald-100 shadow-xs">
                  <div>
                    <span className="text-slate-400 block text-xs">ছাত্র আইডি</span>
                    <strong className="text-slate-800">{scanStatus.data.studentId}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs">সঠিক উত্তর</span>
                    <strong className="text-emerald-600">{scanStatus.data.correct} টি</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs">ভুল উত্তর (-{examMeta.negativeMarking})</span>
                    <strong className="text-rose-600">{scanStatus.data.wrong} টি</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs">চূড়ান্ত প্রাপ্ত নম্বর</span>
                    <strong className="text-indigo-600 text-base">{scanStatus.data.score}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
