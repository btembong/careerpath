import {
  UserRole,
  ApprovalStatus,
  ClassStatus,
  ReviewStatus,
  WalletTxType,
  WalletTxSource,
  PayoutStatus,
  PayoutRecipientType,
} from './enums';

// ── Auth ──────────────────────────────────────────────────
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  wpUserId: number;
  onboardingCompleted: boolean;
  iat: number;
  exp: number;
}

export interface MeResponse {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: UserRole;
  approvalStatus: ApprovalStatus;
  countryId: string | null;
  levelId?: string | null;
  onboardingCompleted?: boolean;
  programmeInterestIds?: string[];
  activePackages: ActivePackage[];
  purchasedCourseIds?: string[];
  walletBalance?: number;
  walletCurrency?: string;
  agreementAcceptedAt?: string | null;
  agreementVersion?: string | null;
  /** Teachers only: false for WP tutors who haven't completed /teacher/onboarding yet */
  teacherProfileComplete?: boolean;
  /** Teachers only: an active orientation video exists that they haven't finished */
  onboardingVideoPending?: boolean;
}

export interface ActivePackage {
  id: string;
  name: string;
  expiresAt: string | null;
}

// ── Packages ──────────────────────────────────────────────
export interface PackageDto {
  id: string;
  name: string;
  description: string | null;
  priceAmount: number;
  currency: string;
  courseIds: string[];
  categoryTags: string[];
  validityDays: number | null;
  isPublished: boolean;
}

// ── Live class ────────────────────────────────────────────
export interface LiveClassDto {
  id: string;
  cohortId: string;
  title: string;
  scheduledAt: string;
  status: ClassStatus;
}

// ── Quiz ──────────────────────────────────────────────────
export interface QuizQuestionDto {
  id: string;
  courseId: string;
  questionText: string;
  type: 'MCQ' | 'WRITTEN';
  options: string[] | null;
  // correctAnswer is NEVER included in API responses
}

// ── Course review ─────────────────────────────────────────
export interface CourseAssignmentDto {
  courseId: string;
  teacherId: string | null;
  teacherCommissionPct: number | null;
  reviewerId: string | null;
  reviewerCommissionPct: number | null;
  reviewStatus: ReviewStatus;
  reviewNotes: string | null;
}

// ── Wallet ────────────────────────────────────────────────
export interface WalletDto {
  id: string;
  balance: number;
  currency: string;
  transactions: WalletTransactionDto[];
}

export interface WalletTransactionDto {
  id: string;
  type: WalletTxType;
  source: WalletTxSource;
  amount: number;
  currency: string;
  description: string | null;
  createdAt: string;
}

// ── Payout ────────────────────────────────────────────────
export interface PayoutStatementDto {
  id: string;
  recipientType: PayoutRecipientType;
  periodStart: string;
  periodEnd: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  generatedAt: string;
}
