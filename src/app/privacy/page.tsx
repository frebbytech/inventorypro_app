import LegalLayout from "@/components/legal/LegalLayout";

export const metadata = {
  title: "Privacy Policy",
  description: "How we handle your data and protect your privacy.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      description="Your privacy matters to us. Here's how we protect your information."
      lastUpdated="June 2024"
    >
      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">1. Information We Collect</h2>
          <p>
            We collect information you provide directly, such as your name, email address,
            phone number, and business details. We also collect usage data to improve our
            services.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">2. How We Use Your Information</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>To provide and maintain our services</li>
            <li>To notify you about changes to our services</li>
            <li>To provide customer support</li>
            <li>To monitor usage and improve performance</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold">3. Data Security</h2>
          <p>
            We implement industry‑standard security measures to protect your data.
            All communication is encrypted using SSL/TLS, and we regularly review our
            security practices.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">4. Third‑Party Services</h2>
          <p>
            We may use trusted third‑party services (e.g., payment processors, email
            providers) to operate our platform. These parties are contractually bound
            to protect your data.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">5. Your Rights</h2>
          <p>
            You have the right to access, correct, or delete your personal data at any
            time. Contact us to exercise these rights.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">6. Changes to This Policy</h2>
          <p>
            We may update this policy from time to time. We'll notify you of any
            changes by posting the new policy on this page.
          </p>
        </div>
      </section>
    </LegalLayout>
  );
}