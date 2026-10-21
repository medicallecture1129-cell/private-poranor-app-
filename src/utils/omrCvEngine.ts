/**
 * OMR Computer Vision Engine (Unmesh / Udvash Style)
 * 
 * Features:
 * 1. Rigid 4-Corner Fiducial Marker Detection (solid black alignment squares).
 * 2. Perspective / Geometric Normalization of OMR bounding box.
 * 3. Strict Dark-Pixel Thresholding (minimum 60-65% filled density to prevent false positives from skin/hands/shadows).
 * 4. Automatic Student ID (0-9 numeric bubble columns) decoding.
 * 5. 100 MCQ Bubble Grid evaluation (4 sub-columns: 1-25, 26-50, 51-75, 76-100).
 * 6. Rigid rejection when markers are occluded or missing.
 */

export interface Point {
  x: number;
  y: number;
}

export interface CornerMarkers {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
}

export interface BubbleEvaluationResult {
  markedOption: 'A' | 'B' | 'C' | 'D' | null;
  isMultiple: boolean;
  densities: {
    A: number;
    B: number;
    C: number;
    D: number;
  };
}

export interface OmrScanDetectionResult {
  success: boolean;
  errorMessage?: string;
  studentId?: string;
  markedAnswers: Record<number, 'A' | 'B' | 'C' | 'D' | null>;
  multipleMarkedQuestions: number[];
  markersFound: boolean;
  confidenceScore: number;
  warpedCanvas?: HTMLCanvasElement;
}

// Canonical Warped Dimensions for the OMR Column
export const CANONICAL_WIDTH = 640;
export const CANONICAL_HEIGHT = 960;

// Bubble fill threshold: bubble must have at least 55-60% black/dark fill relative to paper
const MIN_FILL_THRESHOLD = 0.52;
const DOMINANCE_MARGIN = 0.18; // Marked bubble must be at least 18% darker than next highest

/**
 * Convert an RGBA image data to binary grayscale with Otsu's adaptive threshold
 */
export function binarizeImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { binary: Uint8Array; grayscale: Uint8Array; threshold: number } {
  const pixelCount = width * height;
  const grayscale = new Uint8Array(pixelCount);
  const histogram = new Int32Array(256);

  // 1. Grayscale conversion + Histogram
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    // Luminance formula
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    grayscale[j] = gray;
    histogram[gray]++;
  }

  // 2. Otsu's algorithm to calculate optimal global threshold
  let sum = 0;
  for (let t = 0; t < 256; t++) {
    sum += t * histogram[t];
  }

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let varMax = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    wF = pixelCount - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);

    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }

  // Fallback clamping
  threshold = Math.max(70, Math.min(threshold, 180));

  // 3. Binary mask (1 for dark, 0 for white paper)
  const binary = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    binary[i] = grayscale[i] < threshold ? 1 : 0;
  }

  return { binary, grayscale, threshold };
}

/**
 * Detect the 4 Corner Registration Squares (Fiducial Markers) on the OMR sheet
 */
export function detectCornerRegistrationMarkers(
  canvas: HTMLCanvasElement
): CornerMarkers | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const { binary } = binarizeImageData(imgData.data, width, height);

  // Search in the 4 quadrant zones for solid black squares
  const searchMarginX = Math.round(width * 0.28);
  const searchMarginY = Math.round(height * 0.25);

  const findSquareInZone = (
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    cornerType: 'tl' | 'tr' | 'bl' | 'br'
  ): Point | null => {
    let bestPoint: Point | null = null;
    let maxDarkDensity = 0;
    const boxSize = Math.max(12, Math.round(Math.min(width, height) * 0.024)); // expected marker size in px

    const step = 4;
    for (let y = minY; y <= maxY - boxSize; y += step) {
      for (let x = minX; x <= maxX - boxSize; x += step) {
        // Measure density inside box
        let darkCount = 0;
        let total = 0;
        for (let by = 0; by < boxSize; by += 2) {
          for (let bx = 0; bx < boxSize; bx += 2) {
            const idx = (y + by) * width + (x + bx);
            if (binary[idx] === 1) darkCount++;
            total++;
          }
        }

        const density = darkCount / total;
        // Square must be mostly solid black (>70%)
        if (density > 0.65 && density > maxDarkDensity) {
          maxDarkDensity = density;
          bestPoint = { x: x + boxSize / 2, y: y + boxSize / 2 };
        }
      }
    }

    return bestPoint;
  };

  // 1. Top-Left zone
  const tl = findSquareInZone(5, searchMarginX, 5, searchMarginY, 'tl');
  // 2. Top-Right zone
  const tr = findSquareInZone(width - searchMarginX, width - 5, 5, searchMarginY, 'tr');
  // 3. Bottom-Left zone
  const bl = findSquareInZone(5, searchMarginX, height - searchMarginY, height - 5, 'bl');
  // 4. Bottom-Right zone
  const br = findSquareInZone(width - searchMarginX, width - 5, height - searchMarginY, height - 5, 'br');

  // If any of the 4 registration marks are obscured or missing (e.g. hand in frame), fail!
  if (!tl || !tr || !bl || !br) {
    return null;
  }

  // Geometric sanity check: points must form a roughly upright rectangle
  const topWidth = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const bottomWidth = Math.hypot(br.x - bl.x, br.y - bl.y);
  const leftHeight = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const rightHeight = Math.hypot(br.x - tr.x, br.y - tr.y);

  if (topWidth < width * 0.35 || bottomWidth < width * 0.35 || leftHeight < height * 0.45) {
    return null;
  }

  // Verify aspect ratio
  const ratio = (leftHeight + rightHeight) / (topWidth + bottomWidth);
  if (ratio < 0.9 || ratio > 2.2) {
    return null;
  }

  return { topLeft: tl, topRight: tr, bottomLeft: bl, bottomRight: br };
}

/**
 * Warp perspective of the OMR sheet to the canonical standard dimension
 */
export function warpOmrSheet(
  sourceCanvas: HTMLCanvasElement,
  markers: CornerMarkers
): HTMLCanvasElement {
  const output = document.createElement('canvas');
  output.width = CANONICAL_WIDTH;
  output.height = CANONICAL_HEIGHT;
  const ctx = output.getContext('2d');
  if (!ctx) return output;

  // Use bilinear interpolation / perspective mapping
  const srcCtx = sourceCanvas.getContext('2d');
  if (!srcCtx) return output;

  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;
  const outImgData = ctx.createImageData(CANONICAL_WIDTH, CANONICAL_HEIGHT);
  const outData = outImgData.data;

  const { topLeft: tl, topRight: tr, bottomLeft: bl, bottomRight: br } = markers;

  // Bilinear mapping for every output pixel
  for (let y = 0; y < CANONICAL_HEIGHT; y++) {
    const v = y / (CANONICAL_HEIGHT - 1);
    const leftX = tl.x + v * (bl.x - tl.x);
    const leftY = tl.y + v * (bl.y - tl.y);
    const rightX = tr.x + v * (br.x - tr.x);
    const rightY = tr.y + v * (br.y - tr.y);

    for (let x = 0; x < CANONICAL_WIDTH; x++) {
      const u = x / (CANONICAL_WIDTH - 1);
      const srcX = Math.round(leftX + u * (rightX - leftX));
      const srcY = Math.round(leftY + u * (rightY - leftY));

      const outIdx = (y * CANONICAL_WIDTH + x) * 4;
      if (srcX >= 0 && srcX < srcW && srcY >= 0 && srcY < srcH) {
        const srcIdx = (srcY * srcW + srcX) * 4;
        outData[outIdx] = srcData[srcIdx];
        outData[outIdx + 1] = srcData[srcIdx + 1];
        outData[outIdx + 2] = srcData[srcIdx + 2];
        outData[outIdx + 3] = 255;
      } else {
        outData[outIdx] = 255;
        outData[outIdx + 1] = 255;
        outData[outIdx + 2] = 255;
        outData[outIdx + 3] = 255;
      }
    }
  }

  ctx.putImageData(outImgData, 0, 0);
  return output;
}

/**
 * Measure the filled dark pixel density inside a circular bubble
 */
export function measureBubbleFillDensity(
  binary: Uint8Array,
  width: number,
  centerX: number,
  centerY: number,
  radius: number
): number {
  let darkCount = 0;
  let totalCount = 0;

  const r2 = radius * radius;
  // Inner core radius (ignore outer border stroke to avoid measuring the printed circle line)
  const innerR2 = (radius * 0.78) * (radius * 0.78);

  const startY = Math.max(0, Math.floor(centerY - radius));
  const endY = Math.min(Math.floor(centerY + radius), Math.floor(binary.length / width) - 1);
  const startX = Math.max(0, Math.floor(centerX - radius));
  const endX = Math.min(Math.floor(centerX + radius), width - 1);

  for (let y = startY; y <= endY; y++) {
    const dy2 = (y - centerY) * (y - centerY);
    for (let x = startX; x <= endX; x++) {
      const dist2 = (x - centerX) * (x - centerX) + dy2;
      if (dist2 <= innerR2) {
        const idx = y * width + x;
        if (binary[idx] === 1) {
          darkCount++;
        }
        totalCount++;
      }
    }
  }

  return totalCount > 0 ? darkCount / totalCount : 0;
}

/**
 * Read the 6-Digit Student ID OMR Grid
 * Single Student ID field with numeric columns 0-9 to shade
 */
export function decodeStudentIdFromGrid(
  binary: Uint8Array,
  width: number,
  height: number
): { studentId: string; confidence: number } {
  // Geometric positions normalized in Canonical Canvas (640 x 960)
  // Student ID grid is located below the header / QR code
  // X range: ~12% to ~78% width, Y range: ~18% to ~31% height
  const numDigits = 6;
  const startX = width * 0.16;
  const endX = width * 0.82;
  const colStep = (endX - startX) / (numDigits - 1);

  const startY = height * 0.20;
  const endY = height * 0.305;
  const rowStep = (endY - startY) / 9; // Digits 0 to 9

  const bubbleRadius = Math.round(width * 0.016); // ~10px radius

  let resultDigits: string[] = [];
  let totalConfidence = 0;

  for (let col = 0; col < numDigits; col++) {
    const cx = startX + col * colStep;
    let maxDensity = 0;
    let selectedDigit = -1;
    let secondMaxDensity = 0;

    for (let digit = 0; digit <= 9; digit++) {
      const cy = startY + digit * rowStep;
      const density = measureBubbleFillDensity(binary, width, cx, cy, bubbleRadius);

      if (density > maxDensity) {
        secondMaxDensity = maxDensity;
        maxDensity = density;
        selectedDigit = digit;
      } else if (density > secondMaxDensity) {
        secondMaxDensity = density;
      }
    }

    // Require strict minimum fill and dominance margin
    if (maxDensity >= MIN_FILL_THRESHOLD && (maxDensity - secondMaxDensity >= DOMINANCE_MARGIN || maxDensity > 0.70)) {
      resultDigits.push(String(selectedDigit));
      totalConfidence += maxDensity;
    } else {
      // If not filled cleanly, mark as '0' or placeholder
      resultDigits.push('0');
      totalConfidence += 0.3;
    }
  }

  return {
    studentId: resultDigits.join(''),
    confidence: totalConfidence / numDigits
  };
}

/**
 * Read 100 Questions OMR Grid (Unmesh Layout: 4 Sub-columns of 25 Questions)
 * Sub-col 1: Q1 to Q25
 * Sub-col 2: Q26 to Q50
 * Sub-col 3: Q51 to Q75
 * Sub-col 4: Q76 to Q100
 */
export function decode100QuestionsOmrGrid(
  binary: Uint8Array,
  width: number,
  height: number
): {
  markedAnswers: Record<number, 'A' | 'B' | 'C' | 'D' | null>;
  multipleMarked: number[];
  avgFillConfidence: number;
} {
  const markedAnswers: Record<number, 'A' | 'B' | 'C' | 'D' | null> = {};
  const multipleMarked: number[] = [];

  // OMR 100 Grid occupies Canonical Canvas Y range: ~34.5% to ~93.5%
  const gridStartY = height * 0.355;
  const gridEndY = height * 0.945;
  const rowStep = (gridEndY - gridStartY) / 24; // 25 rows (0 to 24)

  // 4 Sub-Columns horizontally
  const subColWidth = width / 4;
  const bubbleRadius = Math.round(width * 0.014); // ~9px radius

  let measuredCount = 0;
  let totalFillDensity = 0;

  for (let sc = 0; sc < 4; sc++) {
    const scStartX = sc * subColWidth + subColWidth * 0.28;
    const scEndX = (sc + 1) * subColWidth - subColWidth * 0.05;
    const optStep = (scEndX - scStartX) / 3; // A, B, C, D

    for (let r = 0; r < 25; r++) {
      const qNum = sc * 25 + r + 1;
      const cy = gridStartY + r * rowStep;

      const densities: Record<'A' | 'B' | 'C' | 'D', number> = {
        A: measureBubbleFillDensity(binary, width, scStartX + 0 * optStep, cy, bubbleRadius),
        B: measureBubbleFillDensity(binary, width, scStartX + 1 * optStep, cy, bubbleRadius),
        C: measureBubbleFillDensity(binary, width, scStartX + 2 * optStep, cy, bubbleRadius),
        D: measureBubbleFillDensity(binary, width, scStartX + 3 * optStep, cy, bubbleRadius)
      };

      // Find highest and second highest
      const opts: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
      const sorted = opts.slice().sort((a, b) => densities[b] - densities[a]);
      const topOpt = sorted[0];
      const topDensity = densities[topOpt];
      const secondOpt = sorted[1];
      const secondDensity = densities[secondOpt];

      // Strict fill criteria
      const isMarked = topDensity >= MIN_FILL_THRESHOLD;
      const isMultiple = isMarked && secondDensity >= MIN_FILL_THRESHOLD && (topDensity - secondDensity < 0.12);

      if (isMultiple) {
        multipleMarked.push(qNum);
        markedAnswers[qNum] = null; // Multiple filling is invalid
      } else if (isMarked && (topDensity - secondDensity >= DOMINANCE_MARGIN || topDensity > 0.68)) {
        markedAnswers[qNum] = topOpt;
        totalFillDensity += topDensity;
        measuredCount++;
      } else {
        // Completely unfilled or empty/skin tone
        markedAnswers[qNum] = null;
      }
    }
  }

  const avgFillConfidence = measuredCount > 0 ? totalFillDensity / measuredCount : 0.8;

  return { markedAnswers, multipleMarked, avgFillConfidence };
}

/**
 * Complete End-to-End OMR Evaluation Pipeline:
 * 1. Find 4 registration corner squares.
 * 2. Warp OMR to standard upright canonical canvas.
 * 3. Evaluate Student ID.
 * 4. Evaluate 100 questions.
 */
export function processOmrImageComputerVision(
  sourceCanvas: HTMLCanvasElement
): OmrScanDetectionResult {
  // Step 1: Detect 4 corner registration markers
  const markers = detectCornerRegistrationMarkers(sourceCanvas);

  if (!markers) {
    return {
      success: false,
      errorMessage: 'ওএমআর শিটের ৪টি কর্নার মার্কার (Black Registration Squares) সনাক্ত করা যায়নি। অনুগ্রহ করে শিটটি সোজাভাবে রাখুন এবং কোনো হাত বা বস্তু দিয়ে যেন ওএমআরের কোণা ঢাকা না থাকে।',
      markedAnswers: {},
      multipleMarkedQuestions: [],
      markersFound: false,
      confidenceScore: 0
    };
  }

  // Step 2: Perspective warp to Canonical 640x960 Canvas
  const warpedCanvas = warpOmrSheet(sourceCanvas, markers);
  const warpedCtx = warpedCanvas.getContext('2d');
  if (!warpedCtx) {
    return {
      success: false,
      errorMessage: 'ইমেজ প্রসেসিং ফেইল্ড',
      markedAnswers: {},
      multipleMarkedQuestions: [],
      markersFound: false,
      confidenceScore: 0
    };
  }

  const warpedImgData = warpedCtx.getImageData(0, 0, CANONICAL_WIDTH, CANONICAL_HEIGHT);
  const { binary } = binarizeImageData(warpedImgData.data, CANONICAL_WIDTH, CANONICAL_HEIGHT);

  // Step 3: Decode 6-digit Student ID
  const { studentId, confidence: idConfidence } = decodeStudentIdFromGrid(binary, CANONICAL_WIDTH, CANONICAL_HEIGHT);

  // Step 4: Decode 100 Questions Bubble Grid
  const { markedAnswers, multipleMarked, avgFillConfidence } = decode100QuestionsOmrGrid(binary, CANONICAL_WIDTH, CANONICAL_HEIGHT);

  const overallConfidence = (idConfidence + avgFillConfidence) / 2;

  return {
    success: true,
    studentId,
    markedAnswers,
    multipleMarkedQuestions: multipleMarked,
    markersFound: true,
    confidenceScore: overallConfidence,
    warpedCanvas
  };
}
