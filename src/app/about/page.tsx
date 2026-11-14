import LegalLayout from "@/components/legal/LegalLayout";

export const metadata = {
  title: "About Us",
  description: "Learn more about our company and mission.",
};

export default function AboutPage() {
  return (
    <LegalLayout
      title="About Us"
      description="We're on a mission to simplify inventory and sales management."
      lastUpdated="June 2024"
    >
      <section className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Our Story</h2>
          <p>
            Founded in 2024, our platform was built to empower small and medium businesses
            with powerful, easy‑to‑use tools for managing inventory, sales, and customer
            relationships. We believe that great software should be accessible, intuitive,
            and truly helpful.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Our Mission</h2>
          <p>
            To provide business owners with a seamless experience that saves time,
            reduces errors, and helps them grow. We're committed to continuous
            improvement and listening to our users.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Our Values</h2>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Simplicity</strong> – Clean interfaces that anyone can use.</li>
            <li><strong>Reliability</strong> – Your data is safe and always available.</li>
            <li><strong>Innovation</strong> – We constantly evolve with modern technology.</li>
            <li><strong>Customer‑first</strong> – Your feedback drives our roadmap.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Meet the Team</h2>
          <p>
            We're a small, passionate team of developers, designers, and business
            enthusiasts spread across the globe. We believe in remote work, healthy
            collaboration, and building something meaningful.
          </p>
        </div>
      </section>
    </LegalLayout>
  );
}