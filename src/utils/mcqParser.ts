import { Question } from '../types';

/**
 * Universal Bengali + English MCQ Bulk Parser
 * Supports:
 * - English numbers (1., 2., Q1., 1)) & Bengali numbers (১., ২., ৩., প্রশ্ন ১:)
 * - Multiple questions separated by blank lines or numbering
 * - Options in English (A, B, C, D / a, b, c, d / (A), (B))
 * - Options in Bengali (ক, খ, গ, ঘ / (ক), (খ) / ১, ২, ৩, ৪)
 * - Answers in English (Ans: B, Answer: B, Correct: B) & Bengali (উত্তর: খ, সঠিক উত্তর: ক, উত্তর- B)
 * - Explanations in English (Explanation: ..., Solution: ...) & Bengali (ব্যাখ্যা: ..., সমাধান: ...)
 */
export const parseBulkMCQText = (rawText: string): Question[] => {
  const questions: Question[] = [];
  if (!rawText || !rawText.trim()) return questions;

  // Bengali numerals to English
  const bengaliToEnglishDigits: Record<string, string> = {
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
  };

  // Convert Bengali option letter to A/B/C/D
  const normalizeOptionLetter = (raw: string): string => {
    const clean = raw.trim().toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(clean)) return clean;
    if (clean === 'ক' || clean === '১') return 'A';
    if (clean === 'খ' || clean === '২') return 'B';
    if (clean === 'গ' || clean === '৩') return 'C';
    if (clean === 'ঘ' || clean === '৪') return 'D';
    return 'A';
  };

  // Normalize line breaks
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  // Try splitting by question headers (English: 1., Q1., Question 1. / Bengali: ১., প্রশ্ন ১., ১))
  // OR double newline blocks
  let blocks: string[] = [];

  // Match question start boundary:
  // (newline followed by digit/. or Bengali digit/. or Q/Question/প্রশ্ন followed by digits)
  const questionBoundaryRegex = /\n+(?=(?:(?:Q(?:uestion)?|প্রশ্ন)\s*[\d০-৯]+[\.\:\)\-]|[\d০-৯]+[\.\:\)\-]\s+))/i;
  
  if (questionBoundaryRegex.test(normalized)) {
    blocks = normalized.split(questionBoundaryRegex);
  } else {
    // Fallback: split by empty lines (2 or more newlines)
    blocks = normalized.split(/\n\s*\n+/);
  }

  blocks = blocks.map(b => b.trim()).filter(Boolean);

  blocks.forEach((block, index) => {
    const rawLines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (rawLines.length === 0) return;

    let questionText = '';
    const options: { id: string; text: string }[] = [];
    let correctOption = 'A';
    let explanation = '';

    // Regex for matching option lines:
    // English: A), A., (A), A -, a), a.
    // Bengali: ক), ক., (ক), ক -, খ), গ), ঘ)
    const optionLineRegex = /^[\(\[\{]?([A-Da-dক-ঘ১-৪])[\)\]\}\.\:\-]\s*(.*)$/;
    // Regex for matching answer lines:
    const ansLineRegex = /^(?:Ans(?:wer)?|Correct(?:\s*Ans(?:wer)?)?|উত্তর|সঠিক\s*উত্তর)\s*[\:\-\=–]\s*[\(\[\{]?([A-Da-dক-ঘ১-৪])[\)\]\}]?/i;
    // Regex for matching explanation lines:
    const explLineRegex = /^(?:Explanation|Solution|Exp|Soln|ব্যাখ্যা|সমাধান)\s*[\:\-\=–]\s*(.*)$/i;

    let readingQuestion = true;
    let readingExplanation = false;

    // Clean initial question header (e.g., "1. ", "প্রশ্ন ১: ") from line 0
    let firstLine = rawLines[0].replace(/^(?:(?:Q(?:uestion)?|প্রশ্ন)\s*[\d০-৯]+[\.\:\)\-]|[\d০-৯]+[\.\:\)\-]\s*)/i, '').trim();
    if (!firstLine && rawLines.length > 1) {
      firstLine = rawLines[1];
    }
    questionText = firstLine;

    for (let i = 1; i < rawLines.length; i++) {
      const line = rawLines[i];

      const matchAns = line.match(ansLineRegex);
      const matchExpl = line.match(explLineRegex);
      const matchOpt = line.match(optionLineRegex);

      if (matchAns) {
        readingQuestion = false;
        readingExplanation = false;
        correctOption = normalizeOptionLetter(matchAns[1]);
      } else if (matchExpl) {
        readingQuestion = false;
        readingExplanation = true;
        explanation = matchExpl[1].trim();
      } else if (matchOpt && options.length < 4) {
        readingQuestion = false;
        readingExplanation = false;
        const letter = normalizeOptionLetter(matchOpt[1]);
        const optText = matchOpt[2].trim();
        // Determine option id sequentially if matched is already present
        const expectedId = ['A', 'B', 'C', 'D'][options.length] || 'A';
        const finalId = ['A', 'B', 'C', 'D'].includes(letter) && !options.some(o => o.id === letter)
          ? letter
          : expectedId;

        options.push({
          id: finalId,
          text: optText || `Option ${finalId}`
        });
      } else {
        if (readingQuestion && options.length === 0) {
          questionText += ' ' + line;
        } else if (readingExplanation) {
          explanation += ' ' + line;
        } else if (options.length > 0 && options.length <= 4) {
          // Additional line of previous option
          options[options.length - 1].text += ' ' + line;
        }
      }
    }

    // Ensure we have 4 options
    const requiredOptionIds = ['A', 'B', 'C', 'D'];
    while (options.length < 4) {
      const missingId = requiredOptionIds[options.length];
      options.push({
        id: missingId,
        text: `Option ${missingId}`
      });
    }

    if (questionText.trim()) {
      questions.push({
        id: `q_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`,
        text: questionText.trim(),
        options: options.slice(0, 4),
        correctOption,
        explanation: explanation.trim()
      });
    }
  });

  return questions;
};
