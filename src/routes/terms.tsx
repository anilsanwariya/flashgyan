import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Flashgyan" },
      {
        name: "description",
        content:
          "The terms governing your use of Flashgyan, operated by FLASHGYAN EDTECH LLP.",
      },
      { property: "og:title", content: "Terms of Service — Flashgyan" },
      { property: "og:url", content: "https://flashgyan.online/terms" },
    ],
    links: [{ rel: "canonical", href: "https://flashgyan.online/terms" }],
  }),
  component: Terms,
});

function Terms() {
  return (
    <div className="min-h-dvh bg-background">
      <div className="max-w-2xl mx-auto px-5 pt-10 pb-20">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>

        <article className="prose prose-neutral mt-6 max-w-none text-foreground [&_h1]:font-serif [&_h2]:font-serif">
          <h1 className="text-3xl font-extrabold tracking-tight">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Last updated: April 5, 2026</p>

          <p>
            These Terms of Service ("Terms") govern your use of the FlashGyan
            mobile application (the "App") operated by FLASHGYAN EDTECH LLP
            ("we", "our", or "us"). By using the App, you agree to these Terms.
          </p>

          <h2>1. Use of the App</h2>
          <p>
            FlashGyan is an educational platform that provides flashcards,
            quizzes, and learning materials for competitive exam preparation.
            You must be at least 13 years old to use the App. You are
            responsible for maintaining the confidentiality of your account
            credentials.
          </p>

          <h2>2. Accounts</h2>
          <p>
            You may create an account using your email address or Google
            Sign-In. You agree to provide accurate information and keep your
            account secure. We reserve the right to suspend or terminate
            accounts that violate these Terms.
          </p>

          <h2>3. Subscriptions and Payments</h2>
          <p>
            FlashGyan offers a free tier with advertisements and a Premium
            subscription that removes ads and unlocks additional features.
          </p>
          <ul>
            <li>
              Subscriptions are billed through Google Play on a recurring basis
              (monthly or annual)
            </li>
            <li>
              Payment is charged to your Google Play account at confirmation of
              purchase
            </li>
            <li>
              Subscriptions automatically renew unless cancelled at least 24
              hours before the end of the current period
            </li>
            <li>
              You can manage or cancel your subscription through Google Play
              Store settings
            </li>
            <li>Refunds are handled according to Google Play's refund policy</li>
          </ul>

          <h2>4. Intellectual Property</h2>
          <p>
            All content in the App, including flashcards, quizzes, text,
            graphics, and software, is owned by FLASHGYAN EDTECH LLP or its
            licensors and is protected by intellectual property laws. You may
            not reproduce, distribute, or create derivative works from our
            content without written permission.
          </p>

          <h2>5. User Conduct</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the App for any unlawful purpose</li>
            <li>Attempt to reverse-engineer, decompile, or disassemble the App</li>
            <li>Interfere with or disrupt the App's infrastructure</li>
            <li>Share your account credentials with others</li>
            <li>Scrape, copy, or redistribute App content</li>
          </ul>

          <h2>6. Disclaimer of Warranties</h2>
          <p>
            The App is provided "as is" without warranties of any kind. We do
            not guarantee that the App will be uninterrupted, error-free, or
            that content will be accurate or complete. Educational content is
            for study purposes and does not guarantee exam results.
          </p>

          <h2>7. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, FLASHGYAN EDTECH LLP shall
            not be liable for any indirect, incidental, special, or
            consequential damages arising from your use of the App, including
            loss of data or exam results.
          </p>

          <h2>8. Changes to Terms</h2>
          <p>
            We may update these Terms from time to time. Continued use of the
            App after changes constitutes acceptance of the updated Terms. We
            will notify users of material changes through the App.
          </p>

          <h2>9. Governing Law</h2>
          <p>
            These Terms are governed by the laws of India. Any disputes shall
            be subject to the exclusive jurisdiction of the courts in India.
          </p>

          <h2>10. Contact Us</h2>
          <p>For questions about these Terms, please contact us:</p>
          <p>
            FLASHGYAN EDTECH LLP
            <br />
            Email:{" "}
            <a href="mailto:flashgyanedtech@gmail.com">
              flashgyanedtech@gmail.com
            </a>
          </p>
        </article>
      </div>
    </div>
  );
}
