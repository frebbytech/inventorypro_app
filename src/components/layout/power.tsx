'use client'
import { PowerIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
// Adjust this import based on your icon library

interface PowerButtonProps {
  isAdmin?: boolean;
}

export default function PowerButton({ isAdmin = false }: PowerButtonProps) {
  const pathname = usePathname();

  if (!pathname.startsWith("/sales")) {
    return null;
  }

  return (
    <div className="relative group w-fit">
      {/* Link Wrapper */}
      <Link href={isAdmin ? "/admin" : "/"}>
        <PowerIcon className="w-6 h-6 text-gray-500 transition-colors duration-200 hover:text-red-500 cursor-pointer" />
      </Link>

      {/* Tooltip */}
      <div className="absolute top-full right-1/2 translate-x-1/2 mb-2 hidden group-hover:block bg-gray-800 text-white text-sm rounded py-1 px-2 whitespace-nowrap shadow-md pointer-events-none">
        Exit
      </div>
    </div>
  );
}
