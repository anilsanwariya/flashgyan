import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Flashgyan" },
      {
        name: "description",
        content:
          "How FLASHGYAN EDTECH LLP collects, uses, and safeguards your information when you use Flashgyan.",
      },
      { property: "og:title", content: "Privacy Policy — Flashgyan" },
      { property: "og:url", content: "https://flashgyan.online/privacy-policy" },
    ],
    links: [{ rel: "canonical", href: "https://flashgyan.online/privacy-policy" }],
  }),
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
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
          <h1 className="text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: April 5, 2026</p>

          <p>
            FLASHGYAN EDTECH LLP ("we", "our", or "us") operates the FlashGyan
            mobile application (the "App"). This Privacy Policy explains how we
            collect, use, disclose, and safeguard your information when you use
            our App.
          </p>

          <h2>1. Information We Collect</h2>

          <h3>Account Information</h3>
          <p>
            When you create an account, we collect your email address and
            display name through Firebase Authentication. You may also sign in
            using Google Sign-In, in which case we receive your name, email
            address, and profile picture from Google.
          </p>

          <h3>Usage Data</h3>
          <p>
            We automatically collect certain information about how you interact
            with the App, including chapters accessed, quiz scores, study
            progress, and session duration. This data helps us improve the
            learning experience.
          </p>

          <h3>Device Information</h3>
          <p>
            We may collect device type, operating system version, unique device
            identifiers, and crash reports to diagnose issues and improve App
            stability.
          </p>

          <h3>Purchase Information</h3>
          <p>
            When you subscribe to FlashGyan Premium, your purchase is processed
            by Google Play. We do not collect or store your payment card
            details. We receive transaction confirmation and subscription
            status through our payment processor, RevenueCat.
          </p>

          <h2>2. How We Use Your Information</h2>
          <ul>
            <li>To provide and maintain the App and its educational content</li>
            <li>To manage your account and subscription status</li>
            <li>To track your learning progress and personalise your experience</li>
            <li>To display relevant advertisements (for free-tier users)</li>
            <li>To analyse usage patterns and improve our content and features</li>
            <li>To send important updates about the App or your account</li>
            <li>To detect, prevent, and address technical issues</li>
          </ul>

          <h2>3. Third-Party Services</h2>
          <p>
            We use the following third-party services, each governed by their
            own privacy policies:
          </p>
          <ul>
            <li>
              <strong>Firebase</strong> (Google LLC) — Authentication, database,
              analytics, and hosting
            </li>
            <li>
              <strong>Google AdMob</strong> (Google LLC) — Advertising for
              free-tier users. AdMob may use advertising identifiers and cookies
              to serve personalised ads
            </li>
            <li>
              <strong>RevenueCat</strong> — Subscription management and purchase
              validation
            </li>
            <li>
              <strong>Google Play Services</strong> — App distribution, in-app
              billing, and device security
            </li>
          </ul>

          <h2>4. Advertising</h2>
          <p>
            The free tier of FlashGyan displays advertisements served by Google
            AdMob. AdMob may collect and use data including your advertising
            ID, device information, and general location to serve relevant ads.
            Premium subscribers do not see advertisements. You can opt out of
            personalised advertising through your device settings under Google
            &gt; Ads &gt; "Opt out of Ads Personalisation."
          </p>

          <h2>5. Data Retention</h2>
          <p>
            We retain your account data and learning progress for as long as
            your account is active. If you delete your account, we will delete
            your personal data within 30 days, except where we are required to
            retain it for legal or legitimate business purposes.
          </p>

          <h2>6. Data Security</h2>
          <p>
            We implement appropriate technical and organisational measures to
            protect your personal data, including encryption in transit (TLS)
            and at rest. However, no method of electronic transmission or
            storage is 100% secure, and we cannot guarantee absolute security.
          </p>

          <h2>7. Children's Privacy</h2>
          <p>
            FlashGyan is an educational application. We do not knowingly
            collect personal information from children under 13 without
            parental consent. If you believe we have collected data from a
            child under 13, please contact us and we will promptly delete it.
          </p>

          <h2>8. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Withdraw consent for data processing</li>
            <li>Export your data in a portable format</li>
          </ul>
          <p>
            To exercise any of these rights, please contact us at the email
            address below.
          </p>

          <h2>9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify
            you of any material changes by posting the new policy within the
            App and updating the "Last updated" date above. Your continued use
            of the App after changes constitutes acceptance of the updated
            policy.
          </p>

          <h2>10. Contact Us</h2>
          <p>
            If you have questions or concerns about this Privacy Policy or our
            data practices, please contact us:
          </p>
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
