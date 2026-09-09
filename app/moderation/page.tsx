import type { Metadata } from 'next';
import ReportConsole from './report-console';

export const metadata: Metadata = {
  title: 'Report review — Noobius',
  robots: { index: false, follow: false },
};

export default function ModerationPage() {
  return <ReportConsole />;
}
