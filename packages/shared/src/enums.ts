export enum UserRole {
  ADMIN = 'ADMIN',
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
  COUNTRY_REP = 'COUNTRY_REP',
  SUBJECT_REVIEWER = 'SUBJECT_REVIEWER',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  /** An approved teacher an admin has paused */
  SUSPENDED = 'SUSPENDED',
}

export enum ClassStatus {
  SCHEDULED = 'SCHEDULED',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
}

export enum QuestionType {
  MCQ = 'MCQ',
  WRITTEN = 'WRITTEN',
}

export enum SubmissionStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',
  GRADED = 'GRADED',
}

export enum ReviewStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum WalletTxType {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export enum WalletTxSource {
  COURSE_SALE = 'COURSE_SALE',
  COUNTRY_BONUS = 'COUNTRY_BONUS',
  REVIEW_COMMISSION = 'REVIEW_COMMISSION',
  PAYOUT = 'PAYOUT',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum PayoutStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
}

export enum PayoutRecipientType {
  TEACHER = 'TEACHER',
  SUBJECT_REVIEWER = 'SUBJECT_REVIEWER',
  COUNTRY_REP = 'COUNTRY_REP',
}
