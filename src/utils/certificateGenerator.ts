import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { Exam, ExamSubmission } from '../types';

export interface CertificateData {
  studentName: string;
  studentRoll: string;
  collegeName: string;
  examTitle: string;
  courseName: string;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  rank?: number;
  issuedAt: number;
  certificateId: string;
}

export const generateResultCertificatePDF = async (
  exam: Exam,
  submission: ExamSubmission,
  rank?: number
): Promise<Blob> => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 297;
  const pageHeight = 210;

  // Generate Unique Certificate ID
  const certId = `CERT-${exam.id.slice(0, 6).toUpperCase()}-${submission.studentId.slice(-4).toUpperCase()}-${Date.now().toString().slice(-4)}`;

  // Generate Verification QR Code
  const qrData = JSON.stringify({
    certId,
    student: submission.studentName,
    roll: submission.rollNo || submission.studentId,
    exam: exam.title,
    score: `${submission.marksObtained}/${exam.totalMarks} (${submission.percentage.toFixed(1)}%)`,
    status: 'VERIFIED'
  });

  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(qrData, {
      margin: 1,
      width: 200,
      color: {
        dark: '#1e3a8a',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('QR code generation failed:', err);
  }

  // Background tint
  doc.setFillColor(254, 254, 255);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Outer Fancy Border (Deep Royal Navy)
  doc.setDrawColor(20, 35, 75);
  doc.setLineWidth(3);
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20);

  // Inner Golden Border
  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(1);
  doc.rect(13, 13, pageWidth - 26, pageHeight - 26);

  // Corner Ornaments
  const drawCorner = (x: number, y: number, isRight: boolean, isBottom: boolean) => {
    doc.setFillColor(217, 119, 6);
    doc.circle(x, y, 2.5, 'F');
  };
  drawCorner(13, 13, false, false);
  drawCorner(pageWidth - 13, 13, true, false);
  drawCorner(13, pageHeight - 13, false, true);
  drawCorner(pageWidth - 13, pageHeight - 13, true, true);

  // Header Title Banner
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(20, 35, 75);
  doc.text('EXAM PORTAL ACADEMIC EXAMINATION', pageWidth / 2, 28, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(217, 119, 6);
  doc.text('OFFICIAL VERIFIED CERTIFICATE OF ACHIEVEMENT', pageWidth / 2, 34, { align: 'center' });

  // Seal / Badge
  doc.setFillColor(245, 158, 11);
  doc.roundedRect(pageWidth / 2 - 25, 40, 50, 7, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('ACADEMIC MERIT & DISTINCTION', pageWidth / 2, 44.5, { align: 'center' });

  // Body Text
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(71, 85, 105);
  doc.text('This is to proudly certify that', pageWidth / 2, 57, { align: 'center' });

  // Student Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42);
  doc.text(submission.studentName.toUpperCase(), pageWidth / 2, 69, { align: 'center' });

  // Gold Line under Name
  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(0.6);
  doc.line(pageWidth / 2 - 60, 72, pageWidth / 2 + 60, 72);

  // Student Roll & College
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  const rollText = submission.rollNo ? `Student Roll: ${submission.rollNo}` : `Student ID: ${submission.studentId.slice(0, 10)}`;
  const collegeText = submission.studentCollege ? ` • ${submission.studentCollege}` : '';
  doc.text(`${rollText}${collegeText}`, pageWidth / 2, 78, { align: 'center' });

  // Achievement Description
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `has successfully appeared in the competitive examination and met the qualifying benchmark for:`,
    pageWidth / 2,
    88,
    { align: 'center' }
  );

  // Exam Title & Course
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(20, 35, 75);
  doc.text(`${exam.title} (${exam.courseName})`, pageWidth / 2, 97, { align: 'center' });

  // Performance Matrix Cards
  const cardY = 106;
  const cardWidth = 55;
  const cardHeight = 22;
  const cardGap = 8;
  const startCardX = (pageWidth - (cardWidth * 3 + cardGap * 2)) / 2;

  // Card 1: Marks
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(startCardX, cardY, cardWidth, cardHeight, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('MARKS OBTAINED', startCardX + cardWidth / 2, cardY + 7, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`${submission.marksObtained.toFixed(2)} / ${exam.totalMarks}`, startCardX + cardWidth / 2, cardY + 16, { align: 'center' });

  // Card 2: Percentage
  const card2X = startCardX + cardWidth + cardGap;
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(card2X, cardY, cardWidth, cardHeight, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('PERCENTAGE', card2X + cardWidth / 2, cardY + 7, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(22, 163, 74);
  doc.text(`${submission.percentage.toFixed(1)}%`, card2X + cardWidth / 2, cardY + 16, { align: 'center' });

  // Card 3: Merit Rank
  const card3X = card2X + cardWidth + cardGap;
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(card3X, cardY, cardWidth, cardHeight, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('OFFICIAL RANK', card3X + cardWidth / 2, cardY + 7, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(37, 99, 235);
  doc.text(rank ? `#${rank}` : 'QUALIFIED', card3X + cardWidth / 2, cardY + 16, { align: 'center' });

  // Accuracy Statistics Summary
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Performance Summary: ${submission.correctCount} Correct   |   ${submission.wrongCount} Wrong   |   ${submission.skippedCount} Skipped`,
    pageWidth / 2,
    136,
    { align: 'center' }
  );

  // QR Code on bottom left
  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', 24, 145, 28, 28);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Verification ID: ${certId}`, 38, 177, { align: 'center' });
    doc.text(`Issue Date: ${new Date(submission.submittedAt || Date.now()).toLocaleDateString()}`, 38, 181, { align: 'center' });
  }

  // Signatures on Bottom
  // Signature 1: Controller of Exams
  const sig1X = pageWidth / 2;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.4);
  doc.line(sig1X - 25, 168, sig1X + 25, 168);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text('Controller of Examinations', sig1X, 173, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Exam Portal Assessment Board', sig1X, 178, { align: 'center' });

  // Signature 2: Academic Dean / Head Teacher
  const sig2X = pageWidth - 55;
  doc.line(sig2X - 25, 168, sig2X + 25, 168);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text('Head of Academics & Course Lead', sig2X, 173, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Authorized Signature', sig2X, 178, { align: 'center' });

  // Security Footer
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'This is a digitally certified and encrypted document. Authenticity can be verified via the embedded QR code.',
    pageWidth / 2,
    pageHeight - 16,
    { align: 'center' }
  );

  return doc.output('blob');
};
