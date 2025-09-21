// lib/fonts.ts
import localFont from 'next/font/local';

// Configure Inter Sans Font
export const fontSans = localFont({
  src: [
    {
      path: '../public/fonts/Inter-Regular.woff',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/Inter-Bold.woff',
      weight: '700',
      style: 'normal',
    },
    // Add other weights and styles if necessary
  ],
  variable: '--font-sans',
  display: 'swap', // Ensures text remains visible during font loading
});
