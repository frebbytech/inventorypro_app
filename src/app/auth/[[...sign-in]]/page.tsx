import { Metadata } from "next";
import { getPageMetadata } from "@/lib/metadata";
import SignInForm from "@/components/auth/SignInForm";

export const metadata: Metadata = getPageMetadata("/auth/sign-in");

export default function SignInPage() {
  return <SignInForm />;
}