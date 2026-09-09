export const REPORT_FILTERS = ['open', 'dismissed', 'removed'] as const;
export type ReportStatus = (typeof REPORT_FILTERS)[number];
export type ReportDecision = Exclude<ReportStatus, 'open'>;
export type ModerationReport = {
  id: string;
  reporter: string;
  reporterName: string;
  author: string;
  authorName: string;
  message: string;
  reason: string;
  createdAt: number;
  status: ReportStatus;
  reviewedBy: string | null;
  reviewedAt: number | null;
  reviewNote: string | null;
};
export type ReportQueue = {
  operatorId: string;
  reports: ModerationReport[];
  nextCursor: string | null;
};
