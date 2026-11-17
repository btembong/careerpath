/**
 * The Tutor Offer Letter & Content Ownership Agreement: one text for the page at /legal/tutor-agreement and the
 * signed PDF each tutor is emailed. Change the version when the text changes, and keep the old text in
 * TUTOR_AGREEMENTS so a tutor's copy always shows the version they accepted.
 * `**words**` are printed in bold.
 */
export type AgreementBlock =
  | { kind: 'p'; text: string; muted?: boolean }
  | { kind: 'list'; items: string[] }
  | { kind: 'callout'; label?: string; text: string; note?: string; strong?: boolean };

export interface AgreementSection { num: string; title: string; blocks: AgreementBlock[] }

export interface TutorAgreementText {
  version: string;
  label: string;
  title: string;
  effective: string;
  preamble: AgreementBlock[];
  sections: AgreementSection[];
  contact: { email: string; phone: string; address: string };
}

const V1: TutorAgreementText = {
  version: 'v1.0',
  label: 'v1.0 · 2026',
  title: 'Tutor Offer Letter & Content Ownership Agreement',
  effective: 'Effective from date of countersignature',
  preamble: [
    { kind: 'p', text: 'We are pleased to offer you an engagement as a Tutor/Instructor with **CareerPath Africa – Online College & University** (“CareerPath Africa” or “the Institution”). This offer is subject to the terms of this Tutor Offer Letter & Content Ownership Agreement, the applicable tutor payment schedule, academic standards, and any country-specific addendum issued to you.' },
    { kind: 'p', muted: true, text: 'CareerPath Africa is building a pan-African digital learning platform designed to expand access to affordable, flexible, accessible, and career-focused education for students and professionals. As a Tutor, you will contribute subject expertise, digital lessons, assessments, and learner support within your approved course area(s).' },
  ],
  sections: [
    { num: '1', title: 'Purpose of This Agreement', blocks: [
      { kind: 'p', text: 'This Agreement defines the Tutor’s role, responsibilities, content development expectations, compensation principles, intellectual property obligations, confidentiality requirements, professional conduct, performance expectations, and the operational relationship between the Tutor and CareerPath Africa.' },
    ] },
    { num: '2', title: 'Engagement Status', blocks: [{ kind: 'list', items: [
      'The Tutor is engaged as an independent contractor / revenue-sharing academic contributor unless a separate written employment agreement expressly states otherwise.',
      'The engagement is non-exclusive. The Tutor may undertake other professional activities provided they do not create a conflict of interest, misuse CareerPath Africa intellectual property, interfere with agreed deliverables, or misrepresent the Tutor as having authority to bind CareerPath Africa.',
      'The Tutor is responsible for personal taxes, statutory obligations, internet access, recording equipment, and other ordinary costs of performing the engagement unless CareerPath Africa agrees otherwise in writing.',
      'Nothing in this Agreement guarantees a minimum number of learners, course sales, teaching hours, or minimum earnings.',
    ] }] },
    { num: '3', title: 'Key Tutor Responsibilities', blocks: [{ kind: 'list', items: [
      'Develop accurate, clear, engaging, curriculum-aligned lessons within the Tutor’s approved subject area(s).',
      'Prepare and upload appropriate learning materials, including lesson notes, text, Word documents, PDFs, PowerPoint presentations, videos, audio lessons, quizzes, assignments, assessments, worksheets, revision materials, and other approved resources.',
      'Use appropriate teaching methods, examples, language, and assessment approaches for the relevant learner level and curriculum.',
      'Meet content-development timelines and make reasonable academic corrections or updates requested by the Subject Reviewer.',
      'Participate in onboarding, orientation, curriculum-mapping, academic review, quality-assurance, and periodic tutor meetings when reasonably required.',
      'Support learners professionally through approved CareerPath Africa communication channels and maintain respectful, inclusive, and ethical conduct.',
      'Keep professional credentials, biography, profile information, and subject qualifications accurate and current.',
    ] }] },
    { num: '4', title: 'Course Development, Quality & Approval', blocks: [{ kind: 'list', items: [
      'All course materials are subject to academic review, technical review, branding review, and approval before or after publication.',
      'CareerPath Africa may require corrections, re-recording, restructuring, additional references, improved audio/video quality, or removal of inaccurate, outdated, inappropriate, or non-compliant content.',
      'CareerPath Africa may determine course titles, thumbnails, descriptions, categories, sequencing, pricing, discounts, bundles, question banks, subscriptions, publication dates, and promotional placement on the platform.',
      'Submitting or uploading content does not guarantee publication. CareerPath Africa may accept, defer, revise, unpublish, archive, or discontinue any course when reasonably necessary for quality, legal, operational, or business reasons.',
      'Where a curriculum, professional guideline, examination standard, or regulatory requirement changes, the Tutor may be asked to update affected lessons within a reasonable timeframe.',
      'Tutor reports to the Subject Reviewer and/or Chief Executive Officer. Your first point of contact is the Subject Reviewer.',
    ] }] },
    { num: '5', title: 'Intellectual Property & Ownership of Uploaded Content', blocks: [
      { kind: 'callout', strong: true, label: 'Core Ownership Rule',
        text: 'All lessons and learning materials created, recorded, submitted, delivered, or uploaded by the Tutor to CareerPath Africa in connection with this engagement **fully become the property of CareerPath Africa**, permitted by applicable law.',
        note: 'This includes, without limitation: text lessons, manuscripts, Word documents, PDFs, PowerPoint presentations and slide decks, images, graphics, diagrams, lesson plans, worksheets, quizzes, question banks, examinations, assignments, answer keys, videos, screen recordings, audio files, voice recordings, podcasts, demonstrations, course scripts, captions, transcripts, templates, summaries, revision materials, and derivative or updated versions.' },
      { kind: 'list', items: [
        'Except for materials specifically identified and approved in writing as pre-existing materials before upload, the Tutor irrevocably assigns to CareerPath Africa all right, title, and interest in the uploaded content, including copyright and related intellectual-property rights, to the extent legally transferable.',
        'CareerPath Africa may reproduce, edit, adapt, translate, subtitle, dub, brand, reformat, combine, update, distribute, publish, sell, license, sublicense, market, archive, repurpose, and make derivative works from such materials in any medium or technology, whether now known or later developed.',
        'CareerPath Africa may continue to host, use, sell, distribute, or repurpose uploaded course materials after the Tutor’s engagement ends. Termination does not reverse the ownership transfer.',
        'The Tutor may teach the same subject or general knowledge elsewhere, but may not copy, sell, license, distribute, re-upload, or commercially exploit CareerPath Africa-owned course files, recordings, branded materials, or substantially identical platform-specific materials without prior written authorization.',
        'Where applicable law recognizes moral rights that cannot be assigned, the Tutor agrees not to assert such rights against CareerPath Africa to the maximum extent legally permitted and consents to reasonable editing, adaptation, and branding of the content.',
        'If the Tutor wishes to use pre-existing proprietary material, it must be disclosed in writing before upload. Unless CareerPath Africa expressly agrees otherwise in writing, uploading that material grants CareerPath Africa a perpetual, worldwide, royalty-free, transferable, and sublicensable license to use as part of the course.',
      ] },
    ] },
    { num: '6', title: 'Originality, Copyright & Third-Party Materials', blocks: [{ kind: 'list', items: [
      'The Tutor warrants that the submitted content is original or lawfully used and does not infringe another person’s copyright, trademark, privacy, publicity, contractual, or other rights.',
      'The Tutor must not upload copied textbooks, paid course materials, publisher slides, examination banks, copyrighted videos, images, or other third-party resources without documented permission or a valid legal basis for use.',
      'Sources must be cited where academically appropriate. Quotations, images, tables, and other third-party content must comply with applicable copyright and licensing requirements.',
      'The Tutor is responsible for reviewing and fact-checking any content created with artificial-intelligence tools. AI-generated material must not be submitted as authoritative without verification, and confidential, learner-identifiable, or proprietary information must not be entered into unauthorized AI services.',
      'The Tutor shall promptly inform CareerPath Africa of any claim, complaint, or suspected infringement relating to the Tutor’s course materials and cooperate in resolving it.',
    ] }] },
    { num: '7', title: 'Compensation & Revenue-Sharing Principles', blocks: [
      { kind: 'callout', text: 'CareerPath Africa’s current startup revenue distribution model allocates **35% of distributable platform revenue** to the Tutor category. This 35% is a collective Tutor pool and does not mean that any individual Tutor automatically receives 35% of the platform or course revenue.' },
      { kind: 'list', items: [
        'Each Tutor’s actual compensation will be calculated under the applicable Tutor Payment Schedule or course-specific revenue-sharing formula communicated and accepted in writing.',
        'Payments may consider verified learner enrollments, course purchases, subscriptions attributable to the course, refunds, chargebacks, discounts, taxes, payment-processing costs, promotional campaigns, and other approved adjustments.',
        'Payments are subject to revenue verification, reporting completion, compliance with institutional policies, and the applicable financial reporting cycle.',
        'CareerPath Africa may periodically revise tutor rates, revenue-sharing formulas, pricing structures, or payment procedures for financial sustainability, platform growth, market conditions, or operational needs. Reasonable notice will be provided where applicable.',
        'No payment is due for fraudulent enrollments, reversed payments, unauthorized transactions, refunded purchases, or content that materially breaches this Agreement.',
      ] },
    ] },
    { num: '8', title: 'Tutor Profile, Name, Image & Marketing Permission', blocks: [{ kind: 'list', items: [
      'The Tutor grants CareerPath Africa permission to use the Tutor’s approved name, professional title, biography, photograph, voice, course excerpts, and approved profile information to identify, market, advertise, and promote the Tutor’s courses and CareerPath Africa programs.',
      'CareerPath Africa may create promotional clips, thumbnails, social media posts, course previews, email campaigns, website listings, and other marketing materials using approved course content and Tutor profile information.',
      'CareerPath Africa will not knowingly use the Tutor’s identity to endorse unrelated third-party products without separate permission.',
    ] }] },
    { num: '9', title: 'Learner Interaction, Safeguarding & Platform Conduct', blocks: [{ kind: 'list', items: [
      'All learner interactions must remain professional, respectful, educational, and appropriate to the learner’s age and program.',
      'Where learners are minors, the Tutor must follow CareerPath Africa safeguarding rules and must not initiate inappropriate private contact, request personal photographs, or arrange unapproved off-platform meetings.',
      'The Tutor must not solicit direct payments from CareerPath Africa learners, redirect learners to competing paid services, or use learner contact details for personal marketing without written authorization.',
      'Harassment, discrimination, bullying, sexual misconduct, exploitation, intimidation, falsification of credentials, bribery, or other unethical conduct is prohibited and may result in immediate suspension or termination.',
      'The Tutor must comply with reasonable platform security requirements and must not share login credentials or facilitate unauthorized access to paid content.',
    ] }] },
    { num: '10', title: 'Confidentiality, Data Protection & Security', blocks: [{ kind: 'list', items: [
      'The Tutor shall keep confidential all non-public information relating to CareerPath Africa strategies, financial information, pricing, technology, internal documents, partnership discussions, tutor information, learner records, assessments, unpublished materials, and operational processes.',
      'Learner personal information may be accessed and used only for authorized educational purposes and must not be downloaded, copied, shared, sold, or retained outside approved systems except as expressly authorized.',
      'The Tutor shall promptly report suspected data breaches, unauthorized account access, lost devices containing platform information, or accidental disclosure of confidential data.',
      'Confidentiality and data-protection obligations survive termination of this Agreement.',
    ] }] },
    { num: '11', title: 'Brand Representation & Authority', blocks: [{ kind: 'list', items: [
      'The Tutor shall represent CareerPath Africa professionally and avoid statements or conduct that falsely suggest authority to sign contracts, make financial commitments, appoint staff, or bind the Institution.',
      'CareerPath Africa logos, trademarks, branded templates, and promotional materials may be used only for authorized CareerPath Africa activities and in accordance with current brand guidelines.',
      'The Tutor may not create unofficial accounts, domains, payment links, certificates, or advertisements using the CareerPath Africa name without authorization.',
    ] }] },
    { num: '12', title: 'Performance Expectations', blocks: [{ kind: 'list', items: [
      'Quality and accuracy of course content.',
      'Timely completion and uploading of agreed lessons.',
      'Responsiveness to academic review and quality assurance feedback.',
      'Learner engagement, course completion, and reasonable student feedback indicators where available.',
      'Professional conduct, communication, and compliance with platform policies.',
      'Ongoing relevance of content to applicable curricula, examinations, professional standards, or learner needs.',
    ] }] },
    { num: '13', title: 'Term, Suspension & Termination', blocks: [
      { kind: 'callout', label: 'Initial Term', text: 'Two (2) years from the Start Date, renewable by mutual agreement or continued engagement unless otherwise stated in a country-specific addendum.' },
      { kind: 'list', items: [
        'Either party may end the active Tutor engagement by giving thirty (30) days’ written notice, unless a different notice period is required by applicable law or a country-specific addendum.',
        'CareerPath Africa may immediately suspend access or terminate the engagement for serious misconduct, academic fraud, copyright infringement, breach of confidentiality, safeguarding violations, misuse of learner data, unauthorized collection of payments, reputational harm, repeated non-performance, falsified credentials, or material breach of this Agreement.',
        'Upon termination, the Tutor must return or delete confidential institutional information in the Tutor’s possession when requested, but CareerPath Africa may retain and continue using course materials owned or licensed under this Agreement.',
        'Outstanding verified compensation earned before termination may be processed after reconciliation, subject to applicable refunds, chargebacks, policy compliance, and the Tutor Payment Schedule.',
      ] },
    ] },
    { num: '14', title: 'Policy Updates & Modification', blocks: [
      { kind: 'p', text: 'CareerPath Africa may update academic, operational, technology, safeguarding, payment, content, or platform policies from time to time. Material changes affecting the Tutor’s rights or compensation will be communicated in writing where reasonably practicable. A signed amendment is required for changes that applicable law requires to be executed mutually.' },
    ] },
    { num: '15', title: 'Dispute Resolution & Applicable Law', blocks: [
      { kind: 'p', text: 'The parties will first attempt, in good faith, to resolve disputes through written notice and management-level discussions. Any governing law, jurisdiction, mediation, or arbitration terms applicable to the Tutor will be stated in the relevant country-specific addendum or other written agreement, subject to mandatory local law.' },
    ] },
    { num: '16', title: 'Entire Agreement & Severability', blocks: [{ kind: 'list', items: [
      'This document, together with any signed Tutor Payment Schedule, country-specific addendum, academic standards, and referenced platform policies, constitutes the parties’ agreement concerning the Tutor engagement.',
      'If any provision is held invalid or unenforceable, the remaining provisions will continue to the fullest extent permitted by law.',
      'Failure to enforce a provision on one occasion does not waive the right to enforce it later.',
    ] }] },
    { num: '17', title: 'Acceptance', blocks: [
      { kind: 'p', text: 'By signing below (or by checking the acceptance box on the CareerPath Africa platform), the Tutor confirms that they have read, understood, and accepted this Tutor Offer Letter & Content Ownership Agreement, including the intellectual-property assignment and the conditions governing course creation, upload, compensation, confidentiality, learner protection, and professional conduct.' },
    ] },
  ],
  contact: { email: 'contact@careerpathafrica.com', phone: '+1 325-374-8335', address: '3104 Grimaldo Dr., Forney, Dallas, Texas 75126, USA' },
};

/** Every published version, by the version stored when a tutor accepts */
export const TUTOR_AGREEMENTS: Record<string, TutorAgreementText> = { 'v1.0': V1 };
export const TUTOR_AGREEMENT = V1;
export const TUTOR_AGREEMENT_VERSION = V1.version;

/** Splits "a **b** c" into runs, for printing the bold parts */
export function agreementRuns(text: string): { text: string; bold: boolean }[] {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(t => t.startsWith('**') ? { text: t.slice(2, -2), bold: true } : { text: t, bold: false });
}
