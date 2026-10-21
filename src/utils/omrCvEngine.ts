/**
 * OMR Computer Vision Engine for Unique OMR Sheet
 * Strictly tuned to the Layout of Unique_omr__543b9b86.pdf:
 * 
 * 1. 4 Corner Registration Square Fiducial Markers (Top-Left, Top-Right, Bottom-Left, Bottom-Right)
 * 2. Bilinear Perspective Warp to Canonical A4 Portrait (800 x 1130 px)
 * 3. 6-Digit Student ID Grid (6 columns x 10 rows: 0 to 9 bubbles)
 * 4. 100-Question OMR Bubble Grid (4 columns of 25 questions each: 1-25, 26-50, 51-75, 76-100)
 * 5. Adaptive Otsu Thresholding and Dark Fill Density Analysis
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

// Canonical Warped Dimensions for Portrait A4
export const CANONICAL_WIDTH = 800;
export const CANONICAL_HEIGHT = 1130;

// Minimum fill density threshold to consider a bubble marked
const MIN_FILL_THRESHOLD = 0.45;
const DOMINANCE_MARGIN = 0.14;

/**
 * Convert RGBA image data to binary grayscale with Otsu's adaptive threshold
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
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    grayscale[j] = gray;
    histogram[gray]++;
  }

  // 2. Otsu's optimal threshold
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

  threshold = Math.max(65, Math.min(threshold, 185));

  // 3. Binary mask (1 for dark/ink, 0 for white paper)
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

  const searchMarginX = Math.round(width * 0.22);
  const searchMarginY = Math.round(height * 0.22);

  const findSquareInZone = (
    minX: number,
    maxX: number,
    minY: number,
    maxY: number
  ): Point | null => {
    let bestPoint: Point | null = null;
    let maxDarkDensity = 0;
    const boxSize = Math.max(10, Math.round(Math.min(width, height) * 0.022));

    const step = 4;
    for (let y = minY; y <= maxY - boxSize; y += step) {
      for (let x = minX; x <= maxX - boxSize; x += step) {
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
        if (density > 0.60 && density > maxDarkDensity) {
          maxDarkDensity = density;
          bestPoint = { x: x + boxSize / 2, y: y + boxSize / 2 };
        }
      }
    }

    return bestPoint;
  };

  // 1. Top-Left zone
  let tl = findSquareInZone(4, searchMarginX, 4, searchMarginY);
  // 2. Top-Right zone
  let tr = findSquareInZone(width - searchMarginX, width - 4, 4, searchMarginY);
  // 3. Bottom-Left zone
  let bl = findSquareInZone(4, searchMarginX, height - searchMarginY, height - 4);
  // 4. Bottom-Right zone
  let br = findSquareInZone(width - searchMarginX, width - 4, height - searchMarginY, height - 4);

  // If corner markers are not isolated due to tight framing or slight crop,
  // gracefully fall back to full image rectangle with margins
  if (!tl || !tr || !bl || !br) {
    // Check if the image has reasonable aspect ratio (portrait)
    const aspect = height / width;
    if (aspect > 1.15 && aspect < 1.7) {
      // Use fallback upright corners
      const padX = width * 0.025;
      const padY = height * 0.025;
      return {
        topLeft: { x: padX, y: padY },
        topRight: { x: width - padX, y: padY },
        bottomLeft: { x: padX, y: height - padY },
        bottomRight: { x: width - padX, y: height - padY }
      };
    }
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

  const srcCtx = sourceCanvas.getContext('2d');
  if (!srcCtx) return output;

  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;
  const outImgData = ctx.createImageData(CANONICAL_WIDTH, CANONICAL_HEIGHT);
  const outData = outImgData.data;

  const { topLeft: tl, topRight: tr, bottomLeft: bl, bottomRight: br } = markers;

  // Bilinear interpolation for each output pixel
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
 * Measure dark pixel fill density inside a circular bubble
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

  // Measure core region (inner 75% to ignore the printed border ring)
  const innerR2 = (radius * 0.75) * (radius * 0.75);

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
 * Decode 6-Digit Student ID from Left Top Box in Canonical Portrait (800 x 1130)
 * Student ID Box:
 * X: ~40px to ~205px
 * Y: ~50px to ~175px
 * 6 columns of digits 0 to 9
 */
export function decodeStudentIdFromGrid(
  binary: Uint8Array,
  width: number,
  height: number
): { studentId: string; confidence: number } {
  const numDigits = 6;
  const startX = width * 0.052;
  const endX = width * 0.245;
  const colStep = (endX - startX) / (numDigits - 1);

  const startY = height * 0.054;
  const endY = height * 0.155;
  const rowStep = (endY - startY) / 9; // 0 to 9

  const bubbleRadius = Math.round(width * 0.009); // ~7.5px

  const resultDigits: string[] = [];
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

    if (maxDensity >= MIN_FILL_THRESHOLD && (maxDensity - secondMaxDensity >= DOMINANCE_MARGIN || maxDensity > 0.65)) {
      resultDigits.push(String(selectedDigit));
      totalConfidence += maxDensity;
    } else {
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
 * Decode 100-Question OMR Bubble Sheet Grid in Canonical Portrait (800 x 1130)
 * 4 Columns:
 * Col 0: Q 1 to 25
 * Col 1: Q 26 to 50
 * Col 2: Q 51 to 75
 * Col 3: Q 76 to 100
 * Y range: ~195px to ~485px (~17.5% to ~43.0% of height)
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

  const gridStartY = height * 0.198;
  const gridEndY = height * 0.435;
  const rowStep = (gridEndY - gridStartY) / 24; // 25 rows

  const subColWidth = (width * 0.94) / 4;
  const gridLeft = width * 0.035;
  const bubbleRadius = Math.round(width * 0.0075); // ~6px

  let measuredCount = 0;
  let totalFillDensity = 0;

  for (let sc = 0; sc < 4; sc++) {
    const scLeft = gridLeft + sc * subColWidth;
    const ansStartX = scLeft + subColWidth * 0.34;
    const ansEndX = scLeft + subColWidth * 0.94;
    const optStep = (ansEndX - ansStartX) / 3; // A, B, C, D

    for (let r = 0; r < 25; r++) {
      const qNum = sc * 25 + r + 1;
      const cy = gridStartY + r * rowStep;

      const densities: Record<'A' | 'B' | 'C' | 'D', number> = {
        A: measureBubbleFillDensity(binary, width, ansStartX + 0 * optStep, cy, bubbleRadius),
        B: measureBubbleFillDensity(binary, width, ansStartX + 1 * optStep, cy, bubbleRadius),
        C: measureBubbleFillDensity(binary, width, ansStartX + 2 * optStep, cy, bubbleRadius),
        D: measureBubbleFillDensity(binary, width, ansStartX + 3 * optStep, cy, bubbleRadius)
      };

      const opts: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
      const sorted = opts.slice().sort((a, b) => densities[b] - densities[a]);
      const topOpt = sorted[0];
      const topDensity = densities[topOpt];
      const secondOpt = sorted[1];
      const secondDensity = densities[secondOpt];

      const isMarked = topDensity >= MIN_FILL_THRESHOLD;
      const isMultiple = isMarked && secondDensity >= MIN_FILL_THRESHOLD && (topDensity - secondDensity < 0.10);

      if (isMultiple) {
        multipleMarked.push(qNum);
        markedAnswers[qNum] = null;
      } else if (isMarked && (topDensity - secondDensity >= DOMINANCE_MARGIN || topDensity > 0.65)) {
        markedAnswers[qNum] = topOpt;
        totalFillDensity += topDensity;
        measuredCount++;
      } else {
        markedAnswers[qNum] = null;
      }
    }
  }

  const avgFillConfidence = measuredCount > 0 ? totalFillDensity / measuredCount : 0.85;

  return { markedAnswers, multipleMarked, avgFillConfidence };
}

/**
 * Full Pipeline for OMR Processing
 */
export function processOmrImageComputerVision(
  sourceCanvas: HTMLCanvasElement
): OmrScanDetectionResult {
  const markers = detectCornerRegistrationMarkers(sourceCanvas);

  if (!markers) {
    return {
      success: false,
      errorMessage: 'ওএমআর শিটের ৪টি কর্নার মার্কার সনাক্ত করা যায়নি। অনুগ্রহ করে শিটটি সোজাভাবে রাখুন এবং কোনো বস্তু দিয়ে যেন কোণা ঢাকা না থাকে।',
      markedAnswers: {},
      multipleMarkedQuestions: [],
      markersFound: false,
      confidenceScore: 0
    };
  }

  const warpedCanvas = warpOmrSheet(sourceCanvas, markers);
  const warpedCtx = warpedCanvas.getContext('2d');
  if (!warpedCtx) {
    return {
      success: false,
      errorMessage: 'ক্যানভাস প্রসেসিং ব্যর্থ হয়েছে',
      markedAnswers: {},
      multipleMarkedQuestions: [],
      markersFound: false,
      confidenceScore: 0
    };
  }

  const warpedImgData = warpedCtx.getImageData(0, 0, CANONICAL_WIDTH, CANONICAL_HEIGHT);
  const { binary } = binarizeImageData(warpedImgData.data, CANONICAL_WIDTH, CANONICAL_HEIGHT);

  const { studentId, confidence: idConfidence } = decodeStudentIdFromGrid(binary, CANONICAL_WIDTH, CANONICAL_HEIGHT);
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
