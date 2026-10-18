import { Question } from '../types';

/**
 * Smart Text Parser for Bulk MCQs
 * Supports formats like:
 * 1. What is the powerhouse of the cell?
 * A) Nucleus
 * B) Mitochondria
 * C) Ribosome
 * D) Golgi apparatus
 * Ans: B
 * Explanation: Mitochondria produces ATP through cellular respiration.
 */
export const parseBulkMCQText = (rawText: string): Question[] => {
  const questions: Question[] = [];
  if (!rawText || !rawText.trim()) return questions;

  // Split raw text into blocks based on numbered questions or double newlines
  const blocks = rawText
    .split(/\n(?=(?:Q(?:uestion)?\s*\d+[\.\:]|\d+[\.\)]\s+))/i)
    .map(b => b.trim())
    .filter(Boolean);

  blocks.forEach((block, index) => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 5) return; // Must have at least question line + 4 options

    // Extract Question text
    const firstLine = lines[0].replace(/^(?:Q(?:uestion)?\s*\d+[\.\:]|\d+[\.\)]\s*)/i, '').trim();
    let questionText = firstLine;

    const options: { id: string; text: string }[] = [];
    let correctOption = 'A';
    let explanation = '';

    // Regex matchers for options
    const optionARegex = /^[A|a][\.\)\:\-]\s*(.*)$/;
    const optionBRegex = /^[B|b][\.\)\:\-]\s*(.*)$/;
    const optionCRegex = /^[C|c][\.\)\:\-]\s*(.*)$/;
    const optionDRegex = /^[D|d][\.\)\:\-]\s*(.*)$/;
    const ansRegex = /^(?:Ans(?:wer)?|Correct(?:\s*Ans(?:wer)?)?)\s*[\:\-\=]\s*([A-Da-d])/i;
    const explRegex = /^(?:Explanation|Solution|Exp|Soln)\s*[\:\-\=]\s*(.*)$/i;

    let readingQuestion = true;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      const matchA = line.match(optionARegex);
      const matchB = line.match(optionBRegex);
      const matchC = line.match(optionCRegex);
      const matchD = line.match(optionDRegex);
      const matchAns = line.match(ansRegex);
      const matchExpl = line.match(explRegex);

      if (matchA) {
        readingQuestion = false;
        options.push({ id: 'A', text: matchA[1].trim() });
      } else if (matchB) {
        readingQuestion = false;
        options.push({ id: 'B', text: matchB[1].trim() });
      } else if (matchC) {
        readingQuestion = false;
        options.push({ id: 'C', text: matchC[1].trim() });
      } else if (matchD) {
        readingQuestion = false;
        options.push({ id: 'D', text: matchD[1].trim() });
      } else if (matchAns) {
        readingQuestion = false;
        correctOption = matchAns[1].toUpperCase();
      } else if (matchExpl) {
        readingQuestion = false;
        explanation = matchExpl[1].trim();
      } else {
        if (readingQuestion) {
          questionText += ' ' + line;
        } else if (explanation) {
          explanation += ' ' + line;
        }
      }
    }

    // Default 4 fallback options if missing
    if (options.length < 4) {
      const ids = ['A', 'B', 'C', 'D'];
      while (options.length < 4) {
        options.push({
          id: ids[options.length],
          text: `Option ${ids[options.length]}`
        });
      }
    }

    questions.push({
      id: `q_${Date.now()}_${index}`,
      text: questionText || `Question ${index + 1}`,
      options: options.slice(0, 4),
      correctOption: ['A', 'B', 'C', 'D'].includes(correctOption) ? correctOption : 'A',
      explanation: explanation || undefined
    });
  });

  return questions;
};
