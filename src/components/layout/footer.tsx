"use client";
import Link from "next/link";
import { GitBranchPlus, X, Mail } from "lucide-react";
import Logo from "../custom/Logo";
import { checkRole } from "@/utils/roles";
import { usePathname } from "next/navigation";
import { usePlatform } from "@/hooks/use-platform";

const currentYear = new Date().getFullYear();

interface FooterLink {
  label: string;
  href: string;
}

const footerLinks: FooterLink[] = [
  { label: "About", href: "/about" },
  // { label: "Contact", href: "/contact" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
];

const socialLinks = [
  { icon: GitBranchPlus, href: "https://github.com/frebbytech" },
  { icon: X, href: "https://x.com/frebbytech_" },
  // { icon: Linkedin, href: "https://linkedin.com/company/your-org" },
  { icon: Mail, href: "mailto:frebbytech@gmail.com" },
];

export default function Footer() {
  const pathname = usePathname();
  const { isDesktop } = usePlatform();

  if (isDesktop || pathname.startsWith("/sales")) {
    return null;
  }
  return (
    <footer className="border-t  mt-10">
      <div className="container mx-auto px-4 py-8">
        {/* Bottom bar */}
        <div className="mt-8 border-t pt-6 flex flex-col md:flex-row justify-between items-center gap-2 text-sm text-muted-foreground">
          <p>© {currentYear} | InventoryPro. All rights reserved.</p>
          <p className="text-sm">
            Crafted by{" "}
            <a
              href="https://nanaakwasi.dev/"
              className="text-primary hover:text-foreground transition-colors "
            >
              Frebbytech Solutions
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

//  <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
//         {/* Brand */}
//         <div className="space-y-3">
//           <Link
//             href={isAdmin ? "/admin" : "/"}
//             className="flex items-center gap-2"
//           >
//             <Logo />
//             <span className="text-lg font-bold tracking-tight">
//               InventoryPro
//             </span>
//           </Link>
//           {/* <h3 className="text-lg font-semibold">InventoryPro</h3> */}
//           <p className="text-sm text-muted-foreground max-w-xs">
//             Streamline your inventory and sales management with ease.
//           </p>
//         </div>

//         {/* Quick Links */}
//         <div className="space-y-3">
//           <h4 className="text-sm font-medium">Quick Links</h4>
//           <ul className="space-y-2 text-sm">
//             {footerLinks.map((link) => (
//               <li key={link.href}>
//                 <Link
//                   href={link.href}
//                   className="text-muted-foreground hover:text-foreground transition-colors"
//                 >
//                   {link.label}
//                 </Link>
//               </li>
//             ))}
//           </ul>
//         </div>

//         {/* Social & Contact */}
//         <div className="space-y-3">
//           <h4 className="text-sm font-medium">Connect</h4>
//           <div className="flex gap-4">
//             {socialLinks.map((social, index) => {
//               const Icon = social.icon;
//               return (
//                 <a
//                   key={index}
//                   href={social.href}
//                   target="_blank"
//                   rel="noopener noreferrer"
//                   className="text-muted-foreground hover:text-foreground transition-colors"
//                   aria-label={`Visit our ${social.icon.name} page`}
//                 >
//                   <Icon className="h-5 w-5" />
//                 </a>
//               );
//             })}
//           </div>
//           <p className="text-sm text-muted-foreground">
//             Have questions?{" "}
//             <Link
//               href="/contact"
//               className="hover:text-foreground transition-colors"
//             >
//               Get in touch
//             </Link>
//           </p>
//         </div>
//       </div>
