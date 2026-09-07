import type { Metadata } from 'next';
import { Space_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
const sans = Space_Grotesk({ variable: '--font-geist-sans', subsets: ['latin'] });
const mono = IBM_Plex_Mono({ variable: '--font-geist-mono', subsets: ['latin'], weight: ['400', '500', '600'] });
export const metadata: Metadata = {title: 'Noobius — The Night Shift', description: 'Everyone is betting on AI. Noobius has to keep it running. Clock in, repair the data center, and earn your place on the night shift.', icons:{icon:'/favicon.svg'}};
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {return <html lang="en" className="dark"><body className={`${sans.variable} ${mono.variable}`}>{children}</body></html>;}
