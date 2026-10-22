/**
 * Bộ kiểm tra quyền riêng tư, phân loại dữ liệu (Data Classification Matrix)
 * và chặn cứng dữ liệu hạn chế (Restricted Data Guard) cho AI Assistant
 * theo chuẩn OJT 2026 v2 (Mục 5.3, AI-07, DOD-FE-AI-07, FE-NEG-03, FE-NEG-04).
 *
 * Tuyệt đối KHÔNG áp dụng cho biểu mẫu Đăng nhập hoặc Đổi mật khẩu.
 */
export type PiiDetectionType =
  | 'EMAIL'
  | 'VIETNAM_PHONE'
  | 'PASSWORD_SECRET'
  | 'PIN'
  | 'BEARER_OR_JWT'
  | 'CREDIT_CARD'
  | 'RAW_CARD_UID'
  | 'BIOMETRIC_EMBEDDING';

export type DataRiskLevel = 'NONE' | 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';

export interface PiiDetection {
  type: PiiDetectionType;
  label: string;
  value: string;
  startIndex: number;
  endIndex: number;
  riskLevel: DataRiskLevel;
}

export interface PromptPrivacyInspection {
  allowed: boolean;
  riskLevel: DataRiskLevel;
  violations: string[];
  detections: PiiDetection[];
  requiresMasking: boolean;
  maskedPrompt: string;
  message: string | null;
}

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const VIETNAM_PHONE_REGEX = /(?:\+84|0)(?:3|5|7|8|9)\d{8}\b/g;

const RESTRICTED_RULES: ReadonlyArray<{
  type: PiiDetectionType;
  label: string;
  regex: RegExp;
}> = [
  {
    type: 'PASSWORD_SECRET',
    label: 'Mật khẩu hoặc thông tin xác thực (password/secret)',
    regex:
      /\b(?:password|passwd|pwd|mật\s*khẩu|mat\s*khau|secret_key|private_key|api[_-]?key|client_secret|secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*\S+/gi,
  },
  {
    type: 'PIN',
    label: 'Mã PIN bảo mật (PIN)',
    regex: /\b(?:pin|ma\s*pin|mã\s*pin)\s*[:=]\s*\d{4,8}\b/gi,
  },
  {
    type: 'BEARER_OR_JWT',
    label: 'Token truy cập hoặc chuỗi JWT (Bearer/eyJ...)',
    regex: /\b(?:bearer\s+[a-z0-9._~+/-]+=*|eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,})/gi,
  },
  {
    type: 'RAW_CARD_UID',
    label: 'Mã thẻ RFID thô chưa che (raw card_uid)',
    regex: /\b(?:card_uid|rfid_uid|uid_thẻ)\s*[:=]?\s*[0-9a-fA-F]{8,32}\b/gi,
  },
  {
    type: 'BIOMETRIC_EMBEDDING',
    label: 'Vector đặc trưng sinh trắc học (face_embedding)',
    regex: /\b(?:face_embedding|biometric_vector|embedding_vector)\b/gi,
  },
];

const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,19}\b/g;

/**
 * Kiểm tra số thẻ thanh toán hợp lệ theo thuật toán Luhn (Mục 5.3 & FE-NEG-04).
 */
export function isLikelyCreditCard(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  let sum = 0;
  let shouldDouble = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum > 0 && sum % 10 === 0;
}

function collectMatches(
  input: string,
  regex: RegExp,
  type: PiiDetectionType,
  label: string,
  riskLevel: DataRiskLevel,
): PiiDetection[] {
  const cloned = new RegExp(
    regex.source,
    regex.flags.includes('g') ? regex.flags : `${regex.flags}g`,
  );
  return Array.from(input.matchAll(cloned)).map((match) => ({
    type,
    label,
    value: match[0],
    startIndex: match.index ?? 0,
    endIndex: (match.index ?? 0) + match[0].length,
    riskLevel,
  }));
}

/**
 * Quét và phát hiện toàn bộ thực thể PII (Confidential) và dữ liệu cấm gửi (Restricted).
 */
export function detectPii(input: string): PiiDetection[] {
  const detections: PiiDetection[] = [
    ...collectMatches(input, EMAIL_REGEX, 'EMAIL', 'Địa chỉ Email cá nhân', 'CONFIDENTIAL'),
    ...collectMatches(
      input,
      VIETNAM_PHONE_REGEX,
      'VIETNAM_PHONE',
      'Số điện thoại cá nhân',
      'CONFIDENTIAL',
    ),
  ];

  for (const rule of RESTRICTED_RULES) {
    detections.push(...collectMatches(input, rule.regex, rule.type, rule.label, 'RESTRICTED'));
  }

  for (const match of input.matchAll(CREDIT_CARD_REGEX)) {
    const value = match[0];
    if (isLikelyCreditCard(value)) {
      detections.push({
        type: 'CREDIT_CARD',
        label: 'Số thẻ thanh toán hợp lệ (Credit Card)',
        value,
        startIndex: match.index ?? 0,
        endIndex: (match.index ?? 0) + value.length,
        riskLevel: 'RESTRICTED',
      });
    }
  }

  return detections.sort((left, right) => left.startIndex - right.startIndex);
}

/**
 * Tự động ẩn danh (mask) các dữ liệu cá nhân mức Confidential trong câu hỏi trước khi gửi.
 */
export function maskDetectedPii(input: string, detections: PiiDetection[]): string {
  const confidentialDetections = detections.filter((item) => item.riskLevel === 'CONFIDENTIAL');
  if (confidentialDetections.length === 0) {
    return input;
  }

  let result = '';
  let cursor = 0;

  for (const detection of confidentialDetections) {
    if (detection.startIndex < cursor) continue;
    result += input.slice(cursor, detection.startIndex);
    result += `[${detection.type}_MASKED]`;
    cursor = detection.endIndex;
  }

  result += input.slice(cursor);
  return result;
}

export function inspectPromptPrivacy(prompt: string): PromptPrivacyInspection {
  const detections = detectPii(prompt);
  const restrictedDetections = detections.filter((item) => item.riskLevel === 'RESTRICTED');
  const confidentialDetections = detections.filter((item) => item.riskLevel === 'CONFIDENTIAL');

  if (restrictedDetections.length > 0) {
    const violations = Array.from(new Set(restrictedDetections.map((item) => item.label)));
    return {
      allowed: false,
      riskLevel: 'RESTRICTED',
      violations,
      detections,
      requiresMasking: false,
      maskedPrompt: prompt,
      message: `Yêu cầu bị chặn bởi bộ lọc bảo mật dữ liệu (Restricted Data Guard): Không được đưa ${violations.join(', ')} vào nội dung câu hỏi AI Assistant.`,
    };
  }

  if (confidentialDetections.length > 0) {
    const piiLabels = Array.from(new Set(confidentialDetections.map((item) => item.label)));
    return {
      allowed: true,
      riskLevel: 'CONFIDENTIAL',
      violations: [],
      detections,
      requiresMasking: true,
      maskedPrompt: maskDetectedPii(prompt, detections),
      message: `Phát hiện dữ liệu cá nhân (${piiLabels.join(', ')}). Hệ thống khuyến nghị bật chế độ ẩn danh tự động (Masking) trước khi gửi lên AI.`,
    };
  }

  return {
    allowed: true,
    riskLevel: prompt.trim().length > 0 ? 'PUBLIC' : 'NONE',
    violations: [],
    detections: [],
    requiresMasking: false,
    maskedPrompt: prompt,
    message: null,
  };
}
