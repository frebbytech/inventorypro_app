import LegalLayout from "@/components/legal/LegalLayout";

export const metadata = {
  title: "Terms of Service",
  description: "Understand the rules and guidelines for using our platform.",
};

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      description="Please read these terms carefully before using our services."
      lastUpdated="June 2024"
    >
      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">1. Acceptance of Terms</h2>
          <p>
            By using our platform, you agree to be bound by these Terms of Service.
            If you do not agree, please do not use our services.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">2. User Accounts</h2>
          <p>
            You are responsible for maintaining the security of your account and
            password. We cannot be held liable for any loss or damage arising from
            your failure to comply with this security obligation.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">3. Acceptable Use</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>You may not use the platform for any illegal or unauthorised purpose.</li>
            <li>You must not attempt to disrupt or harm the platform.</li>
            <li>You may not share your credentials with unauthorised users.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold">4. Intellectual Property</h2>
          <p>
            The platform and its original content, features, and functionality are
            owned by us and are protected by international copyright and trademark laws.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">5. Termination</h2>
          <p>
            We may terminate or suspend your account immediately, without prior notice,
            if you breach these terms. Upon termination, your right to use the platform
            will cease immediately.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">6. Limitation of Liability</h2>
          <p>
            In no event shall we be liable for any indirect, incidental, special,
            consequential, or punitive damages arising out of your use of the platform.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">7. Changes to Terms</h2>
          <p>
            We reserve the right to update these terms at any time. Your continued use
            of the platform constitutes acceptance of the updated terms.
          </p>
        </div>
      </section>
    </LegalLayout>
  );
}