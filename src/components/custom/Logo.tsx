"use client";
import { useSettings } from "@/providers/SettingsProvider";
import Image from "next/image";

// 1. Extract the fallback SVG into a clean, reusable sub-component
const FallbackLogo = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    // stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-6 w-6 shrink-0"
    width={92}
    height={97}
  >
    <path fill="#FFFFFF00" d="M0 0h92v97H0V0Z" />
    <path
      fill="#063B7A"
      d="M67.824 21.676c7.04 4.29 13.05 10.14 15.78 18.09 1.55 8.77 1.66 18.27-2.99 26.05-4.57 6.18-10 12.04-17.61 14.18-3.37.29-6.64.25-10 0v9h-7v-24c3.03.1 3.03.1 6.12.19 6.93.03 6.93.03 12.88-3.19 3.08-3.66 4.83-6.79 5.5-11.56-.97-6.67-3.37-11.07-8.5-15.44-5.26-1.75-10.55-1.79-16-1-3.29 1.86-5.53 4.2-8 7-1.27 1.03-1.27 1.03-2.57 2.07-3.32 4-3.17 6.9-3.14 11.95-.02.86-.03 1.72-.05 2.61-.04 2.73-.05 5.46-.06 8.19-.02 1.85-.05 3.71-.07 5.57-.07 4.53-.1 9.07-.11 13.61-6.86-3.34-10.09-7.04-13-14-3.04-9.09-3.37-23.88.65-32.59 2.29-2.48 4.64-4.39 7.35-6.41 1.72-1.79 3.43-3.6 5.12-5.43 9.08-9.53 24.04-10.47 35.7-4.89Z"
    />
    <path
      fill="#0CB8F6"
      d="m18 42 1 4h13v39c-6.97-3.48-10.05-6.95-13-14-1.08-3.24-1.11-5.58-1.1-8.98.01-1.16.01-2.33.01-3.53l.03-3.68c0-1.22.01-2.45.01-3.71.01-3.04.03-6.07.05-9.1Z"
    />
    <path
      fill="#0979B6"
      d="M36 24c.28 2.92.52 5.83.75 8.75.08.83.16 1.65.25 2.5.43 6.02.43 6.02-1.53 9.31-3.38 1.97-5.84 1.83-9.72 1.69-1.26-.04-2.53-.07-3.83-.11L19 46c.05-4.95.92-7.34 4.34-10.96 1.37-1.34 2.76-2.67 4.16-3.98l2.13-2.07C34.8 24 34.8 24 36 24Z"
    />
    <path
      fill="#1051D6"
      d="M54.063 43.25c2.94.75 2.94.75 4.94 2.75.37 3.44.37 3.44 0 7-1.63 2-1.63 2-4 3-3.13-.13-3.13-.13-6-1-2-3-2-3-1.82-6.56 1.06-4.48 2.24-5.57 6.88-5.19Z"
    />
    <path
      fill="#135EE5"
      d="M31 21c-.57 3.63-1.92 5.26-4.56 7.75l-1.94 1.86c-.74.69-.74.69-1.5 1.39l-3-1c-.48-6.4-.48-6.4 1.56-8.94C24.8 20.65 27.51 20.8 31 21Z"
    />
    <path
      fill="#EBF0FA"
      d="M31.266 25.285c.57.24 1.14.47 1.73.71-.9 1.16-1.82 2.3-2.75 3.44-.51.64-1.02 1.28-1.54 1.94-1.93 1.84-3.06 2.41-5.71 2.62l-2-2a315.2 315.2 0 0 1 3.75-3.56c.7-.66 1.4-1.32 2.11-2 2.14-1.44 2.14-1.44 4.41-1.15Z"
    />
    <path
      fill="#3A6090"
      d="M58 30h3v4l-12-1v-1c2.05-.23 4.1-.46 6.15-.68 1.86-.14 1.86-.14 2.85-1.32Z"
    />
  </svg>
  // <svg
  //   xmlns="http://www.w3.org/2000/svg"
  //   viewBox="0 0 24 24"
  //   fill="none"
  //   stroke="currentColor"
  //   strokeWidth="2"
  //   strokeLinecap="round"
  //   strokeLinejoin="round"
  //   className="h-6 w-6 shrink-0"
  // >
  //   <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
  // </svg>
);

export default function Logo() {
  const { settings } = useSettings();
  return (
    <div className="relative h-6 w-6 shrink-0 flex items-center justify-center">
      {settings?.logo ? (
        <Image
          src={settings.logo}
          alt="Company Logo"
          fill
          sizes="24px"
          className="object-contain"
          priority
        />
      ) : (
        <Image
          src="/images/logo.png"
          alt="Company Logo"
          fill
          sizes="24px"
          className="object-contain"
          priority
        />
      )}
    </div>
  );
}
