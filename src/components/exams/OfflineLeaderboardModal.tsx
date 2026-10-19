import React, { useState, useMemo } from 'react';
import { Exam, ExamSubmission } from '../../types';
import { 
  X, 
  Trophy, 
  Search, 
  Download, 
  Award, 
  Filter, 
  Layers, 
  CheckCircle2, 
  AlertCircle,
  FileSpreadsheet,
  Printer
} from 'lucide-react';

interface OfflineLeaderboardModalProps {
  exam: Exam;
  submissions: ExamSubmission[];
  isOpen: boolean;
  onClose: () => void;
}

export const OfflineLeaderboardModal: React.FC<OfflineLeaderboardModalProps> = ({
  exam,
  submissions,
  isOpen,
  onClose
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSetFilter, setSelectedSetFilter] = useState<string>('all');

  // Filter submissions for this specific exam
  const examSubmissions = useMemo(() => {
    return submissions.filter(s => s.examId === exam.id || s.examId === exam.id.toString());
  }, [submissions, exam]);

  // Sort and assign Merit Rank (Highest mark first, then fewer wrong answers, then earliest submission)
  const rankedList = useMemo(() => {
    const sorted = [...examSubmissions].sort((a, b) => {
      if (b.marksObtained !== a.marksObtained) {
        return b.marksObtained - a.marksObtained;
      }
      if (a.wrongCount !== b.wrongCount) {
        return a.wrongCount - b.wrongCount; // Fewer wrong answers gets higher rank
      }
      return (a.submittedAt || 0) - (b.submittedAt || 0);
    });

    return sorted.map((item, idx) => ({
      ...item,
      meritRank: idx + 1
    }));
  }, [examSubmissions]);

  // Apply search & set code filter
  const filteredRankList = useMemo(() => {
    return rankedList.filter(item => {
      const matchSet = selectedSetFilter === 'all' || item.setCode === selectedSetFilter;
      const query = searchQuery.toLowerCase().trim();
      const matchQuery = !query ||
        (item.rollNo && item.rollNo.toLowerCase().includes(query)) ||
        (item.studentName && item.studentName.toLowerCase().includes(query)) ||
        (item.studentCollege && item.studentCollege.toLowerCase().includes(query));
      return matchSet && matchQuery;
    });
  }, [rankedList, selectedSetFilter, searchQuery]);

  // Set codes present in submissions
  const setCodes = useMemo(() => {
    const sets = new Set<string>();
    examSubmissions.forEach(s => {
      if (s.setCode) sets.add(s.setCode);
    });
    return Array.from(sets);
  }, [examSubmissions]);

  if (!isOpen) return null;

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['Merit Rank,Roll No,Student Name,College,Set Code,Total Marks,Marks Obtained,Correct,Wrong,Percentage,Evaluated Date\n'];
    const rows = rankedList.map(r => 
      `"${r.meritRank}","${r.rollNo || ''}","${r.studentName.replace(/"/g, '""')}","${(r.studentCollege || '').replace(/"/g, '""')}","${r.setCode || ''}","${r.totalMarks}","${r.marksObtained}","${r.correctCount}","${r.wrongCount}","${r.percentage}%","${new Date(r.submittedAt).toLocaleDateString()}"`
    );
    const csvContent = headers.concat(rows).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (exam.title || (exam as any).examName || 'Offline_Exam').replace(/\s+/g, '_');
    a.download = `Leaderboard_${safeTitle}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-5xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/30">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-[10px] font-black uppercase tracking-wider">
                  Combined Merit List
                </span>
                <span className="text-xs text-slate-400">• মোট মূল্যায়িত: {examSubmissions.length} জন</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-0.5">
                সেন্ট্রাল মেরিট লিস্ট ও লিডারবোর্ড (Offline Exam Leaderboard)
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              title="এক্সেল / সিএসভি এক্সপোর্ট"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span className="hidden sm:inline">CSV এক্সপোর্ট</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="p-4 sm:px-6 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="রোল নম্বর, নাম বা কলেজ দিয়ে খুঁজুন..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-500">সেট ফিল্টার:</span>
            <select
              value={selectedSetFilter}
              onChange={(e) => setSelectedSetFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold font-mono text-slate-900 dark:text-white"
            >
              <option value="all">সকল সেট ({rankedList.length})</option>
              {setCodes.map(code => (
                <option key={code} value={code}>SET {code}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Leaderboard Table */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1">
          {filteredRankList.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-3">
              <Trophy className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
              <div className="text-sm font-bold text-slate-600 dark:text-slate-400">
                কোনো ওএমআর খাতার ফলাফল পাওয়া যায়নি
              </div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                ক্যামেরা দিয়ে ওএমআর শিট স্ক্যান করে খাতা মূল্যায়ন করলেই শিক্ষার্থীদের স্কোর স্বয়ংক্রিয়ভাবে এখানে মেরিট লিস্টে যুক্ত হবে।
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold">
                  <tr>
                    <th className="py-3 px-3.5 text-center w-16">র‍্যাংক</th>
                    <th className="py-3 px-3.5 w-24">রোল নম্বর</th>
                    <th className="py-3 px-3.5">শিক্ষার্থীর নাম ও কলেজ</th>
                    <th className="py-3 px-3.5 text-center w-20">সেট কোড</th>
                    <th className="py-3 px-3.5 text-center w-24">সঠিক / ভুল</th>
                    <th className="py-3 px-3.5 text-right w-28">প্রাপ্ত নম্বর</th>
                    <th className="py-3 px-3.5 text-right w-24">তারিখ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredRankList.map((row) => {
                    const isTop1 = row.meritRank === 1;
                    const isTop2 = row.meritRank === 2;
                    const isTop3 = row.meritRank === 3;

                    return (
                      <tr 
                        key={row.id}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                          isTop1 ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''
                        }`}
                      >
                        {/* Merit Rank */}
                        <td className="py-3 px-3.5 text-center">
                          {isTop1 ? (
                            <span className="w-7 h-7 rounded-xl bg-amber-500 text-white font-black text-xs inline-flex items-center justify-center shadow-sm">
                              🥇
                            </span>
                          ) : isTop2 ? (
                            <span className="w-7 h-7 rounded-xl bg-slate-400 text-white font-black text-xs inline-flex items-center justify-center shadow-sm">
                              🥈
                            </span>
                          ) : isTop3 ? (
                            <span className="w-7 h-7 rounded-xl bg-amber-700 text-white font-black text-xs inline-flex items-center justify-center shadow-sm">
                              🥉
                            </span>
                          ) : (
                            <span className="font-mono font-bold text-slate-500 dark:text-slate-400">
                              #{row.meritRank}
                            </span>
                          )}
                        </td>

                        {/* Roll Number */}
                        <td className="py-3 px-3.5 font-mono font-bold text-blue-600 dark:text-blue-400">
                          {row.rollNo || '-'}
                        </td>

                        {/* Student Name & College */}
                        <td className="py-3 px-3.5">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {row.studentName}
                          </div>
                          {row.studentCollege && (
                            <div className="text-[11px] text-slate-400 truncate max-w-xs">
                              {row.studentCollege}
                            </div>
                          )}
                        </td>

                        {/* Set Code */}
                        <td className="py-3 px-3.5 text-center font-mono font-bold">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px]">
                            {row.setCode || 'A'}
                          </span>
                        </td>

                        {/* Correct / Wrong */}
                        <td className="py-3 px-3.5 text-center font-mono text-[11px]">
                          <span className="text-emerald-600 font-bold">{row.correctCount}</span>
                          <span className="text-slate-400"> / </span>
                          <span className="text-rose-500 font-bold">{row.wrongCount}</span>
                        </td>

                        {/* Marks Obtained */}
                        <td className="py-3 px-3.5 text-right font-mono font-black text-sm text-slate-900 dark:text-white">
                          <span>{row.marksObtained}</span>
                          <span className="text-[10px] text-slate-400 font-normal"> / {row.totalMarks}</span>
                        </td>

                        {/* Date */}
                        <td className="py-3 px-3.5 text-right text-[11px] text-slate-400">
                          {new Date(row.submittedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
