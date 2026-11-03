import Link from 'next/link';
import { BrandLogo } from '@/components/brand/BrandLogo';

export const metadata = { title: 'Tutor Offer Letter & Content Ownership Agreement — CareerPath Africa' };

const VERSION = 'v1.0 · 2026';

export default function TutorAgreementPage() {
  return (
    <div className="min-h-screen bg-surface">

      {/* Header */}
      <div className="bg-navy text-white">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="flex items-center gap-3 mb-6">
            <BrandLogo tone="onDark" href={null} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-2">Legal Document</p>
          <h1 className="text-2xl font-black leading-tight mb-2">
            Tutor Offer Letter &amp;<br />Content Ownership Agreement
          </h1>
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
              {VERSION}
            </span>
            <span className="text-xs text-white/40">Effective from date of countersignature</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">

        {/* Preamble */}
        <section className="rounded-2xl border border-cloud bg-white p-6 space-y-3">
          <p className="text-sm text-navy leading-relaxed">
            We are pleased to offer you an engagement as a Tutor/Instructor with{' '}
            <strong>CareerPath Africa – Online College &amp; University</strong> (&ldquo;CareerPath Africa&rdquo; or &ldquo;the
            Institution&rdquo;). This offer is subject to the terms of this Tutor Offer Letter &amp; Content Ownership
            Agreement, the applicable tutor payment schedule, academic standards, and any country-specific addendum
            issued to you.
          </p>
          <p className="text-sm text-navy/70 leading-relaxed">
            CareerPath Africa is building a pan-African digital learning platform designed to expand access to
            affordable, flexible, accessible, and career-focused education for students and professionals. As a Tutor,
            you will contribute subject expertise, digital lessons, assessments, and learner support within your
            approved course area(s).
          </p>
        </section>

        {/* Sections */}
        {[
          {
            num: '1', title: 'Purpose of This Agreement',
            body: 'This Agreement defines the Tutor\'s role, responsibilities, content development expectations, compensation principles, intellectual property obligations, confidentiality requirements, professional conduct, performance expectations, and the operational relationship between the Tutor and CareerPath Africa.',
          },
        ].map(s => (
          <AgreementSection key={s.num} num={s.num} title={s.title}>
            <p className="text-sm text-navy/80 leading-relaxed">{s.body}</p>
          </AgreementSection>
        ))}

        <AgreementSection num="2" title="Engagement Status">
          <BulletList items={[
            'The Tutor is engaged as an independent contractor / revenue-sharing academic contributor unless a separate written employment agreement expressly states otherwise.',
            'The engagement is non-exclusive. The Tutor may undertake other professional activities provided they do not create a conflict of interest, misuse CareerPath Africa intellectual property, interfere with agreed deliverables, or misrepresent the Tutor as having authority to bind CareerPath Africa.',
            'The Tutor is responsible for personal taxes, statutory obligations, internet access, recording equipment, and other ordinary costs of performing the engagement unless CareerPath Africa agrees otherwise in writing.',
            'Nothing in this Agreement guarantees a minimum number of learners, course sales, teaching hours, or minimum earnings.',
          ]} />
        </AgreementSection>

        <AgreementSection num="3" title="Key Tutor Responsibilities">
          <BulletList items={[
            'Develop accurate, clear, engaging, curriculum-aligned lessons within the Tutor\'s approved subject area(s).',
            'Prepare and upload appropriate learning materials, including lesson notes, text, Word documents, PDFs, PowerPoint presentations, videos, audio lessons, quizzes, assignments, assessments, worksheets, revision materials, and other approved resources.',
            'Use appropriate teaching methods, examples, language, and assessment approaches for the relevant learner level and curriculum.',
            'Meet content-development timelines and make reasonable academic corrections or updates requested by the Subject Reviewer.',
            'Participate in onboarding, orientation, curriculum-mapping, academic review, quality-assurance, and periodic tutor meetings when reasonably required.',
            'Support learners professionally through approved CareerPath Africa communication channels and maintain respectful, inclusive, and ethical conduct.',
            'Keep professional credentials, biography, profile information, and subject qualifications accurate and current.',
          ]} />
        </AgreementSection>

        <AgreementSection num="4" title="Course Development, Quality &amp; Approval">
          <BulletList items={[
            'All course materials are subject to academic review, technical review, branding review, and approval before or after publication.',
            'CareerPath Africa may require corrections, re-recording, restructuring, additional references, improved audio/video quality, or removal of inaccurate, outdated, inappropriate, or non-compliant content.',
            'CareerPath Africa may determine course titles, thumbnails, descriptions, categories, sequencing, pricing, discounts, bundles, question banks, subscriptions, publication dates, and promotional placement on the platform.',
            'Submitting or uploading content does not guarantee publication. CareerPath Africa may accept, defer, revise, unpublish, archive, or discontinue any course when reasonably necessary for quality, legal, operational, or business reasons.',
            'Where a curriculum, professional guideline, examination standard, or regulatory requirement changes, the Tutor may be asked to update affected lessons within a reasonable timeframe.',
            'Tutor reports to the Subject Reviewer and/or Chief Executive Officer. Your first point of contact is the Subject Reviewer.',
          ]} />
        </AgreementSection>

        <AgreementSection num="5" title="Intellectual Property &amp; Ownership of Uploaded Content">
          <div className="space-y-4">
            <div className="rounded-xl border border-azure/20 bg-azure/5 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-azure mb-1">Core Ownership Rule</p>
              <p className="text-sm text-navy leading-relaxed">
                All lessons and learning materials created, recorded, submitted, delivered, or uploaded by the Tutor to
                CareerPath Africa in connection with this engagement <strong>fully become the property of CareerPath Africa</strong>,
                permitted by applicable law.
              </p>
              <p className="text-xs text-navy/60 mt-2 leading-relaxed">
                This includes, without limitation: text lessons, manuscripts, Word documents, PDFs, PowerPoint
                presentations and slide decks, images, graphics, diagrams, lesson plans, worksheets, quizzes, question
                banks, examinations, assignments, answer keys, videos, screen recordings, audio files, voice recordings,
                podcasts, demonstrations, course scripts, captions, transcripts, templates, summaries, revision
                materials, and derivative or updated versions.
              </p>
            </div>
            <BulletList items={[
              'Except for materials specifically identified and approved in writing as pre-existing materials before upload, the Tutor irrevocably assigns to CareerPath Africa all right, title, and interest in the uploaded content, including copyright and related intellectual-property rights, to the extent legally transferable.',
              'CareerPath Africa may reproduce, edit, adapt, translate, subtitle, dub, brand, reformat, combine, update, distribute, publish, sell, license, sublicense, market, archive, repurpose, and make derivative works from such materials in any medium or technology, whether now known or later developed.',
              'CareerPath Africa may continue to host, use, sell, distribute, or repurpose uploaded course materials after the Tutor\'s engagement ends. Termination does not reverse the ownership transfer.',
              'The Tutor may teach the same subject or general knowledge elsewhere, but may not copy, sell, license, distribute, re-upload, or commercially exploit CareerPath Africa-owned course files, recordings, branded materials, or substantially identical platform-specific materials without prior written authorization.',
              'Where applicable law recognizes moral rights that cannot be assigned, the Tutor agrees not to assert such rights against CareerPath Africa to the maximum extent legally permitted and consents to reasonable editing, adaptation, and branding of the content.',
              'If the Tutor wishes to use pre-existing proprietary material, it must be disclosed in writing before upload. Unless CareerPath Africa expressly agrees otherwise in writing, uploading that material grants CareerPath Africa a perpetual, worldwide, royalty-free, transferable, and sublicensable license to use as part of the course.',
            ]} />
          </div>
        </AgreementSection>

        <AgreementSection num="6" title="Originality, Copyright &amp; Third-Party Materials">
          <BulletList items={[
            'The Tutor warrants that the submitted content is original or lawfully used and does not infringe another person\'s copyright, trademark, privacy, publicity, contractual, or other rights.',
            'The Tutor must not upload copied textbooks, paid course materials, publisher slides, examination banks, copyrighted videos, images, or other third-party resources without documented permission or a valid legal basis for use.',
            'Sources must be cited where academically appropriate. Quotations, images, tables, and other third-party content must comply with applicable copyright and licensing requirements.',
            'The Tutor is responsible for reviewing and fact-checking any content created with artificial-intelligence tools. AI-generated material must not be submitted as authoritative without verification, and confidential, learner-identifiable, or proprietary information must not be entered into unauthorized AI services.',
            'The Tutor shall promptly inform CareerPath Africa of any claim, complaint, or suspected infringement relating to the Tutor\'s course materials and cooperate in resolving it.',
          ]} />
        </AgreementSection>

        <AgreementSection num="7" title="Compensation &amp; Revenue-Sharing Principles">
          <div className="space-y-4">
            <div className="rounded-xl border border-cloud bg-cloud/30 px-4 py-3">
              <p className="text-sm text-navy leading-relaxed">
                CareerPath Africa&rsquo;s current startup revenue distribution model allocates <strong>35% of distributable
                platform revenue</strong> to the Tutor category. This 35% is a collective Tutor pool and does not mean that
                any individual Tutor automatically receives 35% of the platform or course revenue.
              </p>
            </div>
            <BulletList items={[
              'Each Tutor\'s actual compensation will be calculated under the applicable Tutor Payment Schedule or course-specific revenue-sharing formula communicated and accepted in writing.',
              'Payments may consider verified learner enrollments, course purchases, subscriptions attributable to the course, refunds, chargebacks, discounts, taxes, payment-processing costs, promotional campaigns, and other approved adjustments.',
              'Payments are subject to revenue verification, reporting completion, compliance with institutional policies, and the applicable financial reporting cycle.',
              'CareerPath Africa may periodically revise tutor rates, revenue-sharing formulas, pricing structures, or payment procedures for financial sustainability, platform growth, market conditions, or operational needs. Reasonable notice will be provided where applicable.',
              'No payment is due for fraudulent enrollments, reversed payments, unauthorized transactions, refunded purchases, or content that materially breaches this Agreement.',
            ]} />
          </div>
        </AgreementSection>

        <AgreementSection num="8" title="Tutor Profile, Name, Image &amp; Marketing Permission">
          <BulletList items={[
            'The Tutor grants CareerPath Africa permission to use the Tutor\'s approved name, professional title, biography, photograph, voice, course excerpts, and approved profile information to identify, market, advertise, and promote the Tutor\'s courses and CareerPath Africa programs.',
            'CareerPath Africa may create promotional clips, thumbnails, social media posts, course previews, email campaigns, website listings, and other marketing materials using approved course content and Tutor profile information.',
            'CareerPath Africa will not knowingly use the Tutor\'s identity to endorse unrelated third-party products without separate permission.',
          ]} />
        </AgreementSection>

        <AgreementSection num="9" title="Learner Interaction, Safeguarding &amp; Platform Conduct">
          <BulletList items={[
            'All learner interactions must remain professional, respectful, educational, and appropriate to the learner\'s age and program.',
            'Where learners are minors, the Tutor must follow CareerPath Africa safeguarding rules and must not initiate inappropriate private contact, request personal photographs, or arrange unapproved off-platform meetings.',
            'The Tutor must not solicit direct payments from CareerPath Africa learners, redirect learners to competing paid services, or use learner contact details for personal marketing without written authorization.',
            'Harassment, discrimination, bullying, sexual misconduct, exploitation, intimidation, falsification of credentials, bribery, or other unethical conduct is prohibited and may result in immediate suspension or termination.',
            'The Tutor must comply with reasonable platform security requirements and must not share login credentials or facilitate unauthorized access to paid content.',
          ]} />
        </AgreementSection>

        <AgreementSection num="10" title="Confidentiality, Data Protection &amp; Security">
          <BulletList items={[
            'The Tutor shall keep confidential all non-public information relating to CareerPath Africa strategies, financial information, pricing, technology, internal documents, partnership discussions, tutor information, learner records, assessments, unpublished materials, and operational processes.',
            'Learner personal information may be accessed and used only for authorized educational purposes and must not be downloaded, copied, shared, sold, or retained outside approved systems except as expressly authorized.',
            'The Tutor shall promptly report suspected data breaches, unauthorized account access, lost devices containing platform information, or accidental disclosure of confidential data.',
            'Confidentiality and data-protection obligations survive termination of this Agreement.',
          ]} />
        </AgreementSection>

        <AgreementSection num="11" title="Brand Representation &amp; Authority">
          <BulletList items={[
            'The Tutor shall represent CareerPath Africa professionally and avoid statements or conduct that falsely suggest authority to sign contracts, make financial commitments, appoint staff, or bind the Institution.',
            'CareerPath Africa logos, trademarks, branded templates, and promotional materials may be used only for authorized CareerPath Africa activities and in accordance with current brand guidelines.',
            'The Tutor may not create unofficial accounts, domains, payment links, certificates, or advertisements using the CareerPath Africa name without authorization.',
          ]} />
        </AgreementSection>

        <AgreementSection num="12" title="Performance Expectations">
          <BulletList items={[
            'Quality and accuracy of course content.',
            'Timely completion and uploading of agreed lessons.',
            'Responsiveness to academic review and quality assurance feedback.',
            'Learner engagement, course completion, and reasonable student feedback indicators where available.',
            'Professional conduct, communication, and compliance with platform policies.',
            'Ongoing relevance of content to applicable curricula, examinations, professional standards, or learner needs.',
          ]} />
        </AgreementSection>

        <AgreementSection num="13" title="Term, Suspension &amp; Termination">
          <div className="space-y-4">
            <div className="rounded-xl border border-cloud bg-cloud/30 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-royal/50 mb-1">Initial Term</p>
              <p className="text-sm text-navy">
                Two (2) years from the Start Date, renewable by mutual agreement or continued engagement unless otherwise
                stated in a country-specific addendum.
              </p>
            </div>
            <BulletList items={[
              'Either party may end the active Tutor engagement by giving thirty (30) days\' written notice, unless a different notice period is required by applicable law or a country-specific addendum.',
              'CareerPath Africa may immediately suspend access or terminate the engagement for serious misconduct, academic fraud, copyright infringement, breach of confidentiality, safeguarding violations, misuse of learner data, unauthorized collection of payments, reputational harm, repeated non-performance, falsified credentials, or material breach of this Agreement.',
              'Upon termination, the Tutor must return or delete confidential institutional information in the Tutor\'s possession when requested, but CareerPath Africa may retain and continue using course materials owned or licensed under this Agreement.',
              'Outstanding verified compensation earned before termination may be processed after reconciliation, subject to applicable refunds, chargebacks, policy compliance, and the Tutor Payment Schedule.',
            ]} />
          </div>
        </AgreementSection>

        <AgreementSection num="14" title="Policy Updates &amp; Modification">
          <p className="text-sm text-navy/80 leading-relaxed">
            CareerPath Africa may update academic, operational, technology, safeguarding, payment, content, or platform
            policies from time to time. Material changes affecting the Tutor&rsquo;s rights or compensation will be
            communicated in writing where reasonably practicable. A signed amendment is required for changes that
            applicable law requires to be executed mutually.
          </p>
        </AgreementSection>

        <AgreementSection num="15" title="Dispute Resolution &amp; Applicable Law">
          <p className="text-sm text-navy/80 leading-relaxed">
            The parties will first attempt, in good faith, to resolve disputes through written notice and
            management-level discussions. Any governing law, jurisdiction, mediation, or arbitration terms applicable
            to the Tutor will be stated in the relevant country-specific addendum or other written agreement, subject
            to mandatory local law.
          </p>
        </AgreementSection>

        <AgreementSection num="16" title="Entire Agreement &amp; Severability">
          <BulletList items={[
            'This document, together with any signed Tutor Payment Schedule, country-specific addendum, academic standards, and referenced platform policies, constitutes the parties\' agreement concerning the Tutor engagement.',
            'If any provision is held invalid or unenforceable, the remaining provisions will continue to the fullest extent permitted by law.',
            'Failure to enforce a provision on one occasion does not waive the right to enforce it later.',
          ]} />
        </AgreementSection>

        <AgreementSection num="17" title="Acceptance">
          <p className="text-sm text-navy/80 leading-relaxed">
            By signing below (or by checking the acceptance box on the CareerPath Africa platform), the Tutor confirms
            that they have read, understood, and accepted this Tutor Offer Letter &amp; Content Ownership Agreement,
            including the intellectual-property assignment and the conditions governing course creation, upload,
            compensation, confidentiality, learner protection, and professional conduct.
          </p>
        </AgreementSection>

        {/* Contact */}
        <div className="rounded-2xl border border-cloud bg-white p-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-3">CareerPath Africa</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-navy/70">
            <div>
              <p className="text-[10px] font-semibold text-royal/40 mb-0.5">Email</p>
              <a href="mailto:contact@careerpathafrica.com" className="text-azure hover:underline text-xs">contact@careerpathafrica.com</a>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-royal/40 mb-0.5">Phone</p>
              <p className="text-xs">+1 325-374-8335</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-royal/40 mb-0.5">Address</p>
              <p className="text-xs">3104 Grimaldo Dr., Forney, Dallas, Texas 75126, USA</p>
            </div>
          </div>
        </div>

        {/* Back link */}
        <div className="text-center pb-6">
          <Link href="/" className="text-xs text-royal/40 hover:text-azure transition">
            ← Back to CareerPath Africa
          </Link>
        </div>

      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AgreementSection({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-cloud bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-cloud bg-surface">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-azure text-[11px] font-black text-white">
          {num}
        </span>
        <h2 className="text-sm font-bold text-navy" dangerouslySetInnerHTML={{ __html: title }} />
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-azure" />
          <span className="text-sm text-navy/80 leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}
