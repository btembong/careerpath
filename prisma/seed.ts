/**
 * CareerPath Africa — Database Seed
 * Seeds: education systems, countries, programmes, subjects
 * Run: pnpm db:seed
 */
import { PrismaClient, ProgrammeType, ProgrammeScope, SubjectCategory, EducationTier } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱  Seeding CareerPath Africa database...\n');

  // ── 1. Education Systems ──────────────────────────────────────────────────

  const [waec, cambridge, kcse, nsc, bac, uace, necta, zimsec, nesa, gceCameroon, lmdCameroon] = await Promise.all([
    upsertSystem('WAEC/WASSCE', [
      { name: 'BECE',   tier: EducationTier.JUNIOR_SECONDARY,  sortOrder: 1 },
      { name: 'WASSCE', tier: EducationTier.SENIOR_SECONDARY,  sortOrder: 2 },
    ]),
    upsertSystem('Cambridge', [
      { name: 'IGCSE (O-Level)',  tier: EducationTier.JUNIOR_SECONDARY,  sortOrder: 1 },
      { name: 'AS-Level',         tier: EducationTier.SENIOR_SECONDARY,  sortOrder: 2 },
      { name: 'A-Level',          tier: EducationTier.SENIOR_SECONDARY,  sortOrder: 3 },
    ]),
    upsertSystem('KCSE (Kenya)', [
      { name: 'KCPE (Primary)',   tier: EducationTier.PRIMARY,           sortOrder: 1 },
      { name: 'Form 1–2',         tier: EducationTier.JUNIOR_SECONDARY,  sortOrder: 2 },
      { name: 'Form 3–4 (KCSE)', tier: EducationTier.SENIOR_SECONDARY,  sortOrder: 3 },
    ]),
    upsertSystem('NSC (South Africa)', [
      { name: 'Grade 10',  tier: EducationTier.SENIOR_SECONDARY, sortOrder: 1 },
      { name: 'Grade 11',  tier: EducationTier.SENIOR_SECONDARY, sortOrder: 2 },
      { name: 'Grade 12 (Matric)', tier: EducationTier.SENIOR_SECONDARY, sortOrder: 3 },
    ]),
    upsertSystem('Baccalauréat (Francophone)', [
      { name: 'Troisième (BEPC)',  tier: EducationTier.JUNIOR_SECONDARY, sortOrder: 1 },
      { name: 'Seconde',           tier: EducationTier.SENIOR_SECONDARY, sortOrder: 2 },
      { name: 'Première',          tier: EducationTier.SENIOR_SECONDARY, sortOrder: 3 },
      { name: 'Terminale (BAC)',   tier: EducationTier.SENIOR_SECONDARY, sortOrder: 4 },
    ]),
    upsertSystem('UACE (Uganda)', [
      { name: 'UCE (O-Level)',  tier: EducationTier.JUNIOR_SECONDARY, sortOrder: 1 },
      { name: 'UACE (A-Level)', tier: EducationTier.SENIOR_SECONDARY, sortOrder: 2 },
    ]),
    upsertSystem('NECTA (Tanzania)', [
      { name: 'PSLE (Primary)',    tier: EducationTier.PRIMARY,           sortOrder: 1 },
      { name: 'CSEE (O-Level)',    tier: EducationTier.JUNIOR_SECONDARY,  sortOrder: 2 },
      { name: 'ACSEE (A-Level)',   tier: EducationTier.SENIOR_SECONDARY,  sortOrder: 3 },
    ]),
    upsertSystem('ZIMSEC (Zimbabwe)', [
      { name: 'O-Level',  tier: EducationTier.JUNIOR_SECONDARY, sortOrder: 1 },
      { name: 'A-Level',  tier: EducationTier.SENIOR_SECONDARY, sortOrder: 2 },
    ]),
    upsertSystem('NESA (Rwanda)', [
      { name: 'O-Level (S3)',  tier: EducationTier.JUNIOR_SECONDARY, sortOrder: 1 },
      { name: 'A-Level (S6)',  tier: EducationTier.SENIOR_SECONDARY, sortOrder: 2 },
    ]),
    // Cameroon — Anglophone subsystem (GCE Board)
    upsertSystem('GCE Board Cameroon', [
      { name: 'O-Level',  tier: EducationTier.JUNIOR_SECONDARY, sortOrder: 1 },
      { name: 'A-Level',  tier: EducationTier.SENIOR_SECONDARY, sortOrder: 2 },
    ]),
    // Cameroon — Higher education (LMD: Licence-Master-Doctorat, Bologna process)
    upsertSystem('LMD University (Cameroon)', [
      { name: 'Licence (L)',  tier: EducationTier.TERTIARY,  sortOrder: 1 },
      { name: 'Master (M)',   tier: EducationTier.TERTIARY,  sortOrder: 2 },
      { name: 'Doctorat (D)', tier: EducationTier.TERTIARY,  sortOrder: 3 },
    ]),
  ]);

  console.log('✅  Education systems');

  // ── 2. Countries ──────────────────────────────────────────────────────────

  const countries = await Promise.all([
    // WAEC bloc
    upsertCountry('GH', 'Ghana',        'GHS', waec.id),
    upsertCountry('NG', 'Nigeria',       'NGN', waec.id),
    upsertCountry('SL', 'Sierra Leone',  'SLL', waec.id),
    upsertCountry('GM', 'Gambia',        'GMD', waec.id),
    upsertCountry('LR', 'Liberia',       'LRD', waec.id),
    // Cambridge bloc
    upsertCountry('ZW', 'Zimbabwe',      'ZWL', zimsec.id),
    upsertCountry('ZM', 'Zambia',        'ZMW', cambridge.id),
    upsertCountry('MW', 'Malawi',        'MWK', cambridge.id),
    upsertCountry('BW', 'Botswana',      'BWP', cambridge.id),
    // East Africa
    upsertCountry('KE', 'Kenya',         'KES', kcse.id),
    upsertCountry('TZ', 'Tanzania',      'TZS', necta.id),
    upsertCountry('UG', 'Uganda',        'UGX', uace.id),
    upsertCountry('RW', 'Rwanda',        'RWF', nesa.id),
    // Southern Africa
    upsertCountry('ZA', 'South Africa',  'ZAR', nsc.id),
    upsertCountry('LS', 'Lesotho',       'LSL', cambridge.id),
    upsertCountry('NA', 'Namibia',       'NAD', nsc.id),
    // Francophone
    upsertCountry('CM', 'Cameroon',      'XAF', bac.id),
    upsertCountry('CI', "Côte d'Ivoire", 'XOF', bac.id),
    upsertCountry('SN', 'Senegal',       'XOF', bac.id),
    upsertCountry('BF', 'Burkina Faso',  'XOF', bac.id),
    upsertCountry('ML', 'Mali',          'XOF', bac.id),
    upsertCountry('TG', 'Togo',          'XOF', bac.id),
    upsertCountry('BJ', 'Benin',         'XOF', bac.id),
    upsertCountry('CD', 'DR Congo',      'CDF', bac.id),
  ]);

  console.log('✅  Countries');

  // Build country map for easy lookup
  const cm = Object.fromEntries(countries.map(c => [c.code, c]));

  // ── 3. Subjects (shared pool) ─────────────────────────────────────────────

  const subjects = await upsertSubjects([
    // Mathematics
    { name: 'Core Mathematics',           category: SubjectCategory.MATHEMATICS },
    { name: 'Elective Mathematics',       category: SubjectCategory.MATHEMATICS },
    { name: 'Statistics',                 category: SubjectCategory.MATHEMATICS },
    { name: 'Further Mathematics',        category: SubjectCategory.MATHEMATICS },
    // Sciences
    { name: 'Integrated Science',         category: SubjectCategory.SCIENCES },
    { name: 'Biology',                    category: SubjectCategory.SCIENCES },
    { name: 'Chemistry',                  category: SubjectCategory.SCIENCES },
    { name: 'Physics',                    category: SubjectCategory.SCIENCES },
    { name: 'Environmental Science',      category: SubjectCategory.SCIENCES },
    { name: 'Agricultural Science',       category: SubjectCategory.AGRICULTURE, isPractical: true },
    // Languages
    { name: 'English Language',           category: SubjectCategory.LANGUAGES },
    { name: 'French',                     category: SubjectCategory.LANGUAGES },
    { name: 'Kiswahili',                  category: SubjectCategory.LANGUAGES },
    { name: 'Literature in English',      category: SubjectCategory.LANGUAGES },
    { name: 'Arabic',                     category: SubjectCategory.LANGUAGES },
    // Humanities & Social Studies
    { name: 'Social Studies',             category: SubjectCategory.SOCIAL_STUDIES },
    { name: 'History',                    category: SubjectCategory.HUMANITIES },
    { name: 'Geography',                  category: SubjectCategory.HUMANITIES },
    { name: 'Government / Civics',        category: SubjectCategory.HUMANITIES },
    { name: 'Religious & Moral Education',category: SubjectCategory.HUMANITIES },
    // Business & Economics
    { name: 'Economics',                  category: SubjectCategory.BUSINESS },
    { name: 'Business Management',        category: SubjectCategory.BUSINESS },
    { name: 'Accounting',                 category: SubjectCategory.FINANCE },
    { name: 'Commerce',                   category: SubjectCategory.BUSINESS },
    // Technology
    { name: 'ICT / Computer Studies',     category: SubjectCategory.TECHNOLOGY },
    { name: 'Technical Drawing',          category: SubjectCategory.TECHNOLOGY, isPractical: true },
    // Arts
    { name: 'Visual Arts',                category: SubjectCategory.ARTS, isPractical: true },
    { name: 'Music',                      category: SubjectCategory.ARTS, isPractical: true },
    // Health
    { name: 'Physical Education',         category: SubjectCategory.HEALTH, isPractical: true },
    // International Exam subjects
    { name: 'SAT Math',                   category: SubjectCategory.MATHEMATICS },
    { name: 'SAT Evidence-Based Reading & Writing', category: SubjectCategory.LANGUAGES },
    { name: 'GRE Verbal Reasoning',       category: SubjectCategory.LANGUAGES },
    { name: 'GRE Quantitative Reasoning', category: SubjectCategory.MATHEMATICS },
    { name: 'GRE Analytical Writing',     category: SubjectCategory.LANGUAGES },
    { name: 'GMAT Verbal',                category: SubjectCategory.LANGUAGES },
    { name: 'GMAT Quantitative',          category: SubjectCategory.MATHEMATICS },
    { name: 'GMAT Data Insights',         category: SubjectCategory.MATHEMATICS },
    { name: 'LSAT Logical Reasoning',     category: SubjectCategory.LAW },
    { name: 'LSAT Analytical Reasoning',  category: SubjectCategory.LAW },
    { name: 'LSAT Reading Comprehension', category: SubjectCategory.LAW },
    // Language proficiency
    { name: 'IELTS Academic',             category: SubjectCategory.LANGUAGES },
    { name: 'IELTS General Training',     category: SubjectCategory.LANGUAGES },
    { name: 'TOEFL Reading',              category: SubjectCategory.LANGUAGES },
    { name: 'TOEFL Listening',            category: SubjectCategory.LANGUAGES },
    { name: 'TOEFL Speaking',             category: SubjectCategory.LANGUAGES },
    { name: 'TOEFL Writing',              category: SubjectCategory.LANGUAGES },
    { name: 'DELF / DALF French',         category: SubjectCategory.LANGUAGES },
    { name: 'TEF Canada French',          category: SubjectCategory.LANGUAGES },
    // Professional / Finance
    { name: 'Financial Reporting',        category: SubjectCategory.FINANCE },
    { name: 'Audit & Assurance',          category: SubjectCategory.FINANCE },
    { name: 'Taxation',                   category: SubjectCategory.FINANCE },
    { name: 'Financial Management',       category: SubjectCategory.FINANCE },
    { name: 'Corporate Reporting',        category: SubjectCategory.FINANCE },
    { name: 'Strategic Business Leader',  category: SubjectCategory.BUSINESS },
    { name: 'Ethics & Professional Skills',category: SubjectCategory.BUSINESS },
    { name: 'Equity Investments',         category: SubjectCategory.FINANCE },
    { name: 'Fixed Income',               category: SubjectCategory.FINANCE },
    { name: 'Derivatives',                category: SubjectCategory.FINANCE },
    { name: 'Alternative Investments',    category: SubjectCategory.FINANCE },
    { name: 'Portfolio Management',       category: SubjectCategory.FINANCE },
    { name: 'Project Scope & Schedule',   category: SubjectCategory.BUSINESS },
    { name: 'Project Risk Management',    category: SubjectCategory.BUSINESS },
    { name: 'Agile & Hybrid PM',          category: SubjectCategory.BUSINESS },
    // CPD
    { name: 'Classroom Management',       category: SubjectCategory.EDUCATION },
    { name: 'Inclusive Education',        category: SubjectCategory.EDUCATION },
    { name: 'Curriculum Design',          category: SubjectCategory.EDUCATION },
    { name: 'Medical Ethics & Law',       category: SubjectCategory.HEALTH },
    { name: 'Clinical Pharmacology',      category: SubjectCategory.HEALTH },
    { name: 'Engineering Project Mgmt',   category: SubjectCategory.ENGINEERING },
    { name: 'Health & Safety',            category: SubjectCategory.ENGINEERING },
    // Philosophy & Humanities (Francophone BAC)
    { name: 'Philosophy',                 category: SubjectCategory.HUMANITIES },
    { name: 'French Literature',          category: SubjectCategory.LANGUAGES },
    { name: 'Development Studies',        category: SubjectCategory.SOCIAL_STUDIES },
    { name: 'Technical & Vocational Studies', category: SubjectCategory.TECHNOLOGY, isPractical: true },
    { name: 'Food & Nutrition',           category: SubjectCategory.HEALTH, isPractical: true },
    { name: 'Commerce & Entrepreneurship',category: SubjectCategory.BUSINESS },
    // University
    { name: 'Calculus & Real Analysis',   category: SubjectCategory.MATHEMATICS },
    { name: 'Linear Algebra',             category: SubjectCategory.MATHEMATICS },
    { name: 'Discrete Mathematics',       category: SubjectCategory.MATHEMATICS },
    { name: 'Organic Chemistry',          category: SubjectCategory.SCIENCES },
    { name: 'Molecular Biology',          category: SubjectCategory.SCIENCES },
    { name: 'Macroeconomics',             category: SubjectCategory.BUSINESS },
    { name: 'Microeconomics',             category: SubjectCategory.BUSINESS },
    { name: 'Constitutional Law',         category: SubjectCategory.LAW },
    { name: 'Contract Law',               category: SubjectCategory.LAW },
    { name: 'Data Structures & Algorithms',category: SubjectCategory.TECHNOLOGY },
    { name: 'Machine Learning',           category: SubjectCategory.TECHNOLOGY },
    { name: 'Web Development',            category: SubjectCategory.TECHNOLOGY },
    { name: 'Database Systems',           category: SubjectCategory.TECHNOLOGY },
  ]);

  // Helper: subject by name
  const sub = (name: string) => subjects[name]!;

  console.log('✅  Subjects');

  // ── 4. Programmes ─────────────────────────────────────────────────────────

  // ── NATIONAL CURRICULUM ──

  // BECE (Junior Secondary, WAEC system — Ghana)
  await upsertProgramme({
    name: 'BECE — Basic Education Certificate Examination',
    shortName: 'BECE',
    description: 'Ghana\'s national examination at the end of Junior High School (JHS 3), conducted by WAEC.',
    type: ProgrammeType.NATIONAL_CURRICULUM,
    scope: ProgrammeScope.COUNTRY,
    educationSystemId: waec.id,
    countryCodes: ['GH'],
    levelNames: ['BECE'],
    subjectNames: ['Core Mathematics','English Language','Integrated Science','Social Studies','French','ICT / Computer Studies','Religious & Moral Education','Visual Arts','Agricultural Science'],
    systems: waec,
  });

  // WASSCE (Senior Secondary — WAEC bloc)
  await upsertProgramme({
    name: 'WASSCE — West Africa Senior School Certificate',
    shortName: 'WASSCE',
    description: 'Final senior secondary examination for Ghana, Nigeria, Sierra Leone, Gambia and Liberia.',
    type: ProgrammeType.NATIONAL_CURRICULUM,
    scope: ProgrammeScope.REGIONAL,
    educationSystemId: waec.id,
    countryCodes: ['GH', 'NG', 'SL', 'GM', 'LR'],
    levelNames: ['WASSCE'],
    subjectNames: ['Core Mathematics','Elective Mathematics','English Language','Integrated Science','Biology','Chemistry','Physics','Economics','Business Management','Accounting','History','Geography','Government / Civics','Literature in English','French','ICT / Computer Studies','Agricultural Science'],
    systems: waec,
  });

  // KCSE (Kenya — Senior Secondary)
  await upsertProgramme({
    name: 'KCSE — Kenya Certificate of Secondary Education',
    shortName: 'KCSE',
    description: 'Kenya\'s national high school exit examination for Form 4 students.',
    type: ProgrammeType.NATIONAL_CURRICULUM,
    scope: ProgrammeScope.COUNTRY,
    educationSystemId: kcse.id,
    countryCodes: ['KE'],
    levelNames: ['Form 3–4 (KCSE)'],
    subjectNames: ['English Language','Kiswahili','Core Mathematics','Biology','Chemistry','Physics','History','Geography','Business Management','Agricultural Science','ICT / Computer Studies','Religious & Moral Education'],
    systems: kcse,
  });

  // Cambridge IGCSE (Junior Secondary international)
  await upsertProgramme({
    name: 'Cambridge IGCSE',
    shortName: 'IGCSE',
    description: 'Cambridge International General Certificate of Secondary Education — globally recognised O-Level equivalent.',
    type: ProgrammeType.NATIONAL_CURRICULUM,
    scope: ProgrammeScope.GLOBAL,
    educationSystemId: cambridge.id,
    countryCodes: [],
    levelNames: ['IGCSE (O-Level)'],
    subjectNames: ['Core Mathematics','Elective Mathematics','English Language','Biology','Chemistry','Physics','History','Geography','Business Management','Accounting','ICT / Computer Studies','French','Literature in English'],
    systems: cambridge,
  });

  // Cambridge A-Level
  await upsertProgramme({
    name: 'Cambridge A-Level',
    shortName: 'A-Level',
    description: 'Cambridge International A-Level — university entrance qualification recognised worldwide.',
    type: ProgrammeType.NATIONAL_CURRICULUM,
    scope: ProgrammeScope.GLOBAL,
    educationSystemId: cambridge.id,
    countryCodes: [],
    levelNames: ['AS-Level', 'A-Level'],
    subjectNames: ['Core Mathematics','Further Mathematics','Biology','Chemistry','Physics','Economics','Business Management','Accounting','History','Geography','Literature in English','ICT / Computer Studies'],
    systems: cambridge,
  });

  // NSC Matric (South Africa)
  await upsertProgramme({
    name: 'NSC Matric — National Senior Certificate',
    shortName: 'Matric',
    description: 'South Africa\'s Grade 12 national senior certificate, required for university entrance.',
    type: ProgrammeType.NATIONAL_CURRICULUM,
    scope: ProgrammeScope.COUNTRY,
    educationSystemId: nsc.id,
    countryCodes: ['ZA', 'NA'],
    levelNames: ['Grade 10', 'Grade 11', 'Grade 12 (Matric)'],
    subjectNames: ['Core Mathematics','Elective Mathematics','English Language','Biology','Chemistry','Physics','Economics','Business Management','Accounting','History','Geography','Agricultural Science','ICT / Computer Studies'],
    systems: nsc,
  });

  // Baccalauréat (Francophone Africa)
  await upsertProgramme({
    name: 'Baccalauréat — Terminale',
    shortName: 'BAC',
    description: 'Francophone Africa\'s final secondary examination (Terminale), conducted in French.',
    type: ProgrammeType.NATIONAL_CURRICULUM,
    scope: ProgrammeScope.REGIONAL,
    educationSystemId: bac.id,
    countryCodes: ['CM', 'CI', 'SN', 'BF', 'ML', 'TG', 'BJ', 'CD'],
    levelNames: ['Seconde', 'Première', 'Terminale (BAC)'],
    subjectNames: ['Core Mathematics','Further Mathematics','Biology','Chemistry','Physics','History','Geography','Economics','French','Literature in English','Philosophy'],
    systems: bac,
  });

  // KCSE Form 1–2 (Junior Secondary Kenya)
  await upsertProgramme({
    name: 'Kenya Junior Secondary School (Form 1–2)',
    shortName: 'JSS Kenya',
    description: 'Kenya junior secondary curriculum for Form 1 and Form 2 students.',
    type: ProgrammeType.NATIONAL_CURRICULUM,
    scope: ProgrammeScope.COUNTRY,
    educationSystemId: kcse.id,
    countryCodes: ['KE'],
    levelNames: ['Form 1–2'],
    subjectNames: ['English Language','Kiswahili','Core Mathematics','Integrated Science','Social Studies','Business Management','Agricultural Science','ICT / Computer Studies','Physical Education'],
    systems: kcse,
  });

  // UACE (Uganda A-Level)
  await upsertProgramme({
    name: 'UACE — Uganda Advanced Certificate of Education',
    shortName: 'UACE',
    description: 'Uganda\'s A-Level university entrance examination.',
    type: ProgrammeType.NATIONAL_CURRICULUM,
    scope: ProgrammeScope.COUNTRY,
    educationSystemId: uace.id,
    countryCodes: ['UG'],
    levelNames: ['UACE (A-Level)'],
    subjectNames: ['Core Mathematics','Biology','Chemistry','Physics','Economics','History','Geography','ICT / Computer Studies','Literature in English'],
    systems: uace,
  });

  // ── CAMEROON ──────────────────────────────────────────────────────────────

  // BEPC — Francophone junior secondary (Troisième)
  await upsertProgramme({
    name: 'BEPC — Brevet d\'Études du Premier Cycle (Cameroun)',
    shortName: 'BEPC',
    description: 'Francophone Cameroon\'s junior secondary leaving certificate, taken at the end of Troisième (Form 3 equivalent). Conducted by the Office du Baccalauréat.',
    type: ProgrammeType.NATIONAL_CURRICULUM,
    scope: ProgrammeScope.COUNTRY,
    educationSystemId: bac.id,
    countryCodes: ['CM'],
    levelNames: ['Troisième (BEPC)'],
    subjectNames: ['Core Mathematics','French','Biology','Chemistry','Physics','History','Geography','English Language','ICT / Computer Studies','Agricultural Science'],
    systems: bac,
  });

  // BAC Terminale — Cameroon Francophone (already in regional BAC but Cameroon-specific variant)
  await upsertProgramme({
    name: 'Baccalauréat — Terminale (Cameroun Francophone)',
    shortName: 'BAC Cameroun',
    description: 'Cameroon\'s Francophone Baccalauréat (Terminale). Conducted by the Office du Baccalauréat du Cameroun. Tracks include Sciences (C, D), Arts & Humanities (A), Economics (G).',
    type: ProgrammeType.NATIONAL_CURRICULUM,
    scope: ProgrammeScope.COUNTRY,
    educationSystemId: bac.id,
    countryCodes: ['CM'],
    levelNames: ['Seconde', 'Première', 'Terminale (BAC)'],
    subjectNames: ['Core Mathematics','Further Mathematics','Biology','Chemistry','Physics','History','Geography','Economics','French','French Literature','Literature in English','Philosophy','ICT / Computer Studies','Agricultural Science'],
    systems: bac,
  });

  // GCE O-Level — Cameroon Anglophone
  await upsertProgramme({
    name: 'GCE O-Level — Cameroon',
    shortName: 'GCE O-Level',
    description: 'Cameroon\'s Anglophone Ordinary Level examination, administered by the Cameroon GCE Board (Buea). Equivalent to IGCSE; taken after Form 5.',
    type: ProgrammeType.NATIONAL_CURRICULUM,
    scope: ProgrammeScope.COUNTRY,
    educationSystemId: gceCameroon.id,
    countryCodes: ['CM'],
    levelNames: ['O-Level'],
    subjectNames: ['English Language','Core Mathematics','Biology','Chemistry','Physics','History','Geography','Economics','Business Management','Accounting','Commerce','ICT / Computer Studies','French','Religious & Moral Education','Agricultural Science','Food & Nutrition','Technical & Vocational Studies'],
    systems: gceCameroon,
  });

  // GCE A-Level — Cameroon Anglophone
  await upsertProgramme({
    name: 'GCE A-Level — Cameroon',
    shortName: 'GCE A-Level',
    description: 'Cameroon\'s Anglophone Advanced Level examination, administered by the GCE Board (Buea). University entrance qualification taken after Lower Sixth and Upper Sixth.',
    type: ProgrammeType.NATIONAL_CURRICULUM,
    scope: ProgrammeScope.COUNTRY,
    educationSystemId: gceCameroon.id,
    countryCodes: ['CM'],
    levelNames: ['A-Level'],
    subjectNames: ['Core Mathematics','Further Mathematics','Biology','Chemistry','Physics','Economics','Accounting','History','Geography','Literature in English','French','ICT / Computer Studies','Agricultural Science','Development Studies'],
    systems: gceCameroon,
  });

  // BTS / HND — Higher National Diploma (post-secondary technical)
  await upsertProgramme({
    name: 'BTS / HND — Higher National Diploma (Cameroon)',
    shortName: 'BTS/HND',
    description: 'Two-year post-secondary technical diploma offered in Cameroon (BTS in Francophone track, HND in Anglophone). Covers technology, business and applied sciences.',
    type: ProgrammeType.UNIVERSITY,
    scope: ProgrammeScope.COUNTRY,
    educationSystemId: lmdCameroon.id,
    countryCodes: ['CM'],
    levelNames: ['Licence (L)'],
    subjectNames: ['Core Mathematics','ICT / Computer Studies','Business Management','Accounting','Technical & Vocational Studies','Commerce & Entrepreneurship','Engineering Project Mgmt','Health & Safety','Food & Nutrition'],
    systems: lmdCameroon,
  });

  // Licence LMD — Cameroon universities
  await upsertProgramme({
    name: 'Licence (LMD) — University Cameroon',
    shortName: 'Licence LMD',
    description: 'Three-year undergraduate Licence under the Bologna LMD system, taught across Cameroon\'s state universities (Yaoundé I & II, Buea, Dschang, Ngaoundéré, Douala, Bamenda, Maroua).',
    type: ProgrammeType.UNIVERSITY,
    scope: ProgrammeScope.COUNTRY,
    educationSystemId: lmdCameroon.id,
    countryCodes: ['CM'],
    levelNames: ['Licence (L)'],
    subjectNames: ['Calculus & Real Analysis','Linear Algebra','Discrete Mathematics','Organic Chemistry','Molecular Biology','Data Structures & Algorithms','Machine Learning','Web Development','Database Systems','Macroeconomics','Microeconomics','Financial Reporting','Business Management','Accounting','Constitutional Law','Contract Law','Development Studies','Engineering Project Mgmt'],
    systems: lmdCameroon,
  });

  // Master LMD — Cameroon universities
  await upsertProgramme({
    name: 'Master (LMD) — University Cameroon',
    shortName: 'Master LMD',
    description: 'Two-year postgraduate Master under the LMD system. Research and professional tracks available across Cameroonian universities.',
    type: ProgrammeType.UNIVERSITY,
    scope: ProgrammeScope.COUNTRY,
    educationSystemId: lmdCameroon.id,
    countryCodes: ['CM'],
    levelNames: ['Master (M)'],
    subjectNames: ['Calculus & Real Analysis','Linear Algebra','Machine Learning','Web Development','Database Systems','Macroeconomics','Microeconomics','Financial Management','Portfolio Management','Constitutional Law','Contract Law','Development Studies','Engineering Project Mgmt','Health & Safety'],
    systems: lmdCameroon,
  });

  console.log('✅  Cameroon programmes (BEPC · BAC · GCE O/A-Level · BTS/HND · Licence · Master LMD)');
  console.log('✅  National curriculum programmes');

  // ── INTERNATIONAL EXAMS ──

  await upsertProgramme({
    name: 'SAT — Scholastic Assessment Test',
    shortName: 'SAT',
    description: 'US college admissions standardised test accepted by most universities globally.',
    type: ProgrammeType.INTERNATIONAL_EXAM,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['SAT Math', 'SAT Evidence-Based Reading & Writing'],
  });

  await upsertProgramme({
    name: 'GRE — Graduate Record Examination',
    shortName: 'GRE',
    description: 'Required for graduate school admission in the US and many international universities.',
    type: ProgrammeType.INTERNATIONAL_EXAM,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['GRE Verbal Reasoning', 'GRE Quantitative Reasoning', 'GRE Analytical Writing'],
  });

  await upsertProgramme({
    name: 'GMAT — Graduate Management Admission Test',
    shortName: 'GMAT',
    description: 'Business school entrance exam for MBA and management programmes worldwide.',
    type: ProgrammeType.INTERNATIONAL_EXAM,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['GMAT Verbal', 'GMAT Quantitative', 'GMAT Data Insights'],
  });

  await upsertProgramme({
    name: 'LSAT — Law School Admission Test',
    shortName: 'LSAT',
    description: 'Standardised exam for admission to law school in the US, Canada and beyond.',
    type: ProgrammeType.INTERNATIONAL_EXAM,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['LSAT Logical Reasoning', 'LSAT Analytical Reasoning', 'LSAT Reading Comprehension'],
  });

  await upsertProgramme({
    name: 'IB — International Baccalaureate Diploma',
    shortName: 'IB',
    description: 'Globally recognised two-year pre-university programme for high school students.',
    type: ProgrammeType.INTERNATIONAL_EXAM,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['Core Mathematics', 'Further Mathematics', 'Biology', 'Chemistry', 'Physics', 'Economics', 'History', 'Geography', 'Literature in English', 'French'],
  });

  await upsertProgramme({
    name: 'AP Exams — Advanced Placement',
    shortName: 'AP',
    description: 'College Board exams allowing US high school students to earn college credits.',
    type: ProgrammeType.INTERNATIONAL_EXAM,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['Calculus & Real Analysis', 'Statistics', 'Biology', 'Chemistry', 'Physics', 'Economics', 'History'],
  });

  console.log('✅  International exam programmes');

  // ── LANGUAGE PROFICIENCY ──

  await upsertProgramme({
    name: 'IELTS — International English Language Testing System',
    shortName: 'IELTS',
    description: 'World\'s most popular English proficiency test for study, work and immigration.',
    type: ProgrammeType.LANGUAGE_PROFICIENCY,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['IELTS Academic', 'IELTS General Training'],
  });

  await upsertProgramme({
    name: 'TOEFL iBT — Test of English as a Foreign Language',
    shortName: 'TOEFL',
    description: 'ETS English proficiency exam widely required by US and Canadian universities.',
    type: ProgrammeType.LANGUAGE_PROFICIENCY,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['TOEFL Reading', 'TOEFL Listening', 'TOEFL Speaking', 'TOEFL Writing'],
  });

  await upsertProgramme({
    name: 'DELF / DALF — French Proficiency Diplomas',
    shortName: 'DELF/DALF',
    description: 'Official French language diplomas issued by the French Ministry of Education.',
    type: ProgrammeType.LANGUAGE_PROFICIENCY,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['DELF / DALF French'],
  });

  await upsertProgramme({
    name: 'TEF Canada — Test d\'Évaluation de Français',
    shortName: 'TEF Canada',
    description: 'French language test required for Canadian permanent residency and citizenship.',
    type: ProgrammeType.LANGUAGE_PROFICIENCY,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['TEF Canada French'],
  });

  console.log('✅  Language proficiency programmes');

  // ── PROFESSIONAL LICENSURE ──

  await upsertProgramme({
    name: 'ACCA — Association of Chartered Certified Accountants',
    shortName: 'ACCA',
    description: 'Globally recognised professional accounting qualification in 180+ countries.',
    type: ProgrammeType.PROFESSIONAL_LICENSURE,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['Financial Reporting', 'Audit & Assurance', 'Taxation', 'Financial Management', 'Corporate Reporting', 'Strategic Business Leader', 'Ethics & Professional Skills'],
  });

  await upsertProgramme({
    name: 'CFA — Chartered Financial Analyst',
    shortName: 'CFA',
    description: 'Gold standard investment and finance credential, governed by CFA Institute.',
    type: ProgrammeType.PROFESSIONAL_LICENSURE,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['Equity Investments', 'Fixed Income', 'Derivatives', 'Alternative Investments', 'Portfolio Management', 'Financial Reporting', 'Economics'],
  });

  await upsertProgramme({
    name: 'ICAN — Institute of Chartered Accountants of Nigeria',
    shortName: 'ICAN',
    description: 'Nigeria\'s foremost professional accounting certification.',
    type: ProgrammeType.PROFESSIONAL_LICENSURE,
    scope: ProgrammeScope.COUNTRY,
    countryCodes: ['NG'],
    subjectNames: ['Financial Reporting', 'Audit & Assurance', 'Taxation', 'Financial Management', 'Ethics & Professional Skills'],
  });

  await upsertProgramme({
    name: 'ICAG — Institute of Chartered Accountants Ghana',
    shortName: 'ICAG',
    description: 'Ghana\'s professional accounting certification body.',
    type: ProgrammeType.PROFESSIONAL_LICENSURE,
    scope: ProgrammeScope.COUNTRY,
    countryCodes: ['GH'],
    subjectNames: ['Financial Reporting', 'Audit & Assurance', 'Taxation', 'Financial Management', 'Ethics & Professional Skills'],
  });

  await upsertProgramme({
    name: 'CIMA — Chartered Institute of Management Accountants',
    shortName: 'CIMA',
    description: 'Management accounting qualification globally recognised, especially in industry.',
    type: ProgrammeType.PROFESSIONAL_LICENSURE,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['Financial Reporting', 'Financial Management', 'Strategic Business Leader', 'Ethics & Professional Skills'],
  });

  await upsertProgramme({
    name: 'PMP — Project Management Professional',
    shortName: 'PMP',
    description: 'PMI\'s flagship project management certification recognised in 200+ countries.',
    type: ProgrammeType.PROFESSIONAL_LICENSURE,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['Project Scope & Schedule', 'Project Risk Management', 'Agile & Hybrid PM'],
  });

  console.log('✅  Professional licensure programmes');

  // ── CPD ──

  await upsertProgramme({
    name: 'Teaching CPD — Ghana Teaching Council',
    shortName: 'GTC CPD',
    description: 'Continuing Professional Development required by the Ghana Teaching Council for license renewal.',
    type: ProgrammeType.CPD,
    scope: ProgrammeScope.COUNTRY,
    countryCodes: ['GH'],
    cpdProfession: 'Teaching',
    cpdBody: 'Ghana Teaching Council',
    cpdHoursPerCycle: 100,
    subjectNames: ['Classroom Management', 'Inclusive Education', 'Curriculum Design', 'ICT / Computer Studies'],
  });

  await upsertProgramme({
    name: 'Teaching CPD — TRCN Nigeria',
    shortName: 'TRCN CPD',
    description: 'CPD required by the Teachers Registration Council of Nigeria.',
    type: ProgrammeType.CPD,
    scope: ProgrammeScope.COUNTRY,
    countryCodes: ['NG'],
    cpdProfession: 'Teaching',
    cpdBody: 'Teachers Registration Council of Nigeria (TRCN)',
    cpdHoursPerCycle: 80,
    subjectNames: ['Classroom Management', 'Inclusive Education', 'Curriculum Design'],
  });

  await upsertProgramme({
    name: 'Medical CPD — Africa',
    shortName: 'Medical CPD',
    description: 'Continuing medical education and professional development for healthcare practitioners.',
    type: ProgrammeType.CPD,
    scope: ProgrammeScope.GLOBAL,
    cpdProfession: 'Medicine',
    cpdBody: 'Medical & Dental Council',
    cpdHoursPerCycle: 50,
    subjectNames: ['Medical Ethics & Law', 'Clinical Pharmacology', 'Health & Safety'],
  });

  await upsertProgramme({
    name: 'Engineering CPD',
    shortName: 'Eng CPD',
    description: 'CPD for registered engineers across Africa.',
    type: ProgrammeType.CPD,
    scope: ProgrammeScope.GLOBAL,
    cpdProfession: 'Engineering',
    cpdBody: 'Engineering Council',
    cpdHoursPerCycle: 60,
    subjectNames: ['Engineering Project Mgmt', 'Health & Safety'],
  });

  console.log('✅  CPD programmes');

  // ── UNIVERSITY ──

  await upsertProgramme({
    name: 'University Foundation Programme',
    shortName: 'Foundation',
    description: 'Pre-university preparation bridging secondary school and undergraduate studies.',
    type: ProgrammeType.UNIVERSITY,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['Core Mathematics', 'Further Mathematics', 'Calculus & Real Analysis', 'English Language', 'Physics', 'Chemistry', 'Biology', 'Economics'],
  });

  await upsertProgramme({
    name: 'Undergraduate STEM',
    shortName: 'UG STEM',
    description: 'University-level Science, Technology, Engineering and Mathematics courses.',
    type: ProgrammeType.UNIVERSITY,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['Calculus & Real Analysis', 'Linear Algebra', 'Discrete Mathematics', 'Organic Chemistry', 'Molecular Biology', 'Data Structures & Algorithms', 'Machine Learning', 'Web Development', 'Database Systems', 'Engineering Project Mgmt'],
  });

  await upsertProgramme({
    name: 'Undergraduate Business & Economics',
    shortName: 'UG Business',
    description: 'University-level business, economics and management courses.',
    type: ProgrammeType.UNIVERSITY,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['Macroeconomics', 'Microeconomics', 'Financial Reporting', 'Business Management', 'Accounting', 'Statistics'],
  });

  await upsertProgramme({
    name: 'Undergraduate Law',
    shortName: 'UG Law',
    description: 'University-level law courses for LLB and legal studies students.',
    type: ProgrammeType.UNIVERSITY,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['Constitutional Law', 'Contract Law', 'Medical Ethics & Law'],
  });

  await upsertProgramme({
    name: 'Postgraduate / Masters Preparation',
    shortName: 'Postgraduate',
    description: 'Academic and skills preparation for postgraduate study and research.',
    type: ProgrammeType.UNIVERSITY,
    scope: ProgrammeScope.GLOBAL,
    subjectNames: ['GRE Verbal Reasoning', 'GRE Quantitative Reasoning', 'GRE Analytical Writing', 'GMAT Verbal', 'GMAT Quantitative'],
  });

  console.log('✅  University programmes');
  console.log('\n🎉  Seed complete!\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsertSystem(name: string, levels: { name: string; tier: EducationTier; sortOrder: number }[]) {
  const system = await prisma.educationSystem.upsert({
    where: { name },
    update: {},
    create: { name },
  });

  for (const level of levels) {
    await prisma.educationLevel.upsert({
      where: { educationSystemId_sortOrder: { educationSystemId: system.id, sortOrder: level.sortOrder } } as any,
      update: { name: level.name, tier: level.tier },
      create: { ...level, educationSystemId: system.id },
    });
  }

  return prisma.educationSystem.findUniqueOrThrow({ where: { name }, include: { levels: true } });
}

async function upsertCountry(code: string, name: string, currency: string, educationSystemId: string) {
  return prisma.country.upsert({
    where: { code },
    update: { name, currency, educationSystemId },
    create: { code, name, currency, educationSystemId },
  });
}

async function upsertSubjects(list: { name: string; category: SubjectCategory; isPractical?: boolean }[]) {
  const map: Record<string, { id: string; name: string }> = {};
  for (const s of list) {
    const subject = await prisma.subject.upsert({
      where: { name_category: { name: s.name, category: s.category } },
      update: {},
      create: { name: s.name, category: s.category, isPractical: s.isPractical ?? false },
    });
    map[s.name] = subject;
  }
  return map;
}

interface ProgrammeInput {
  name: string;
  shortName?: string;
  description?: string;
  type: ProgrammeType;
  scope: ProgrammeScope;
  educationSystemId?: string;
  countryCodes?: string[];
  levelNames?: string[];
  subjectNames: string[];
  cpdProfession?: string;
  cpdBody?: string;
  cpdHoursPerCycle?: number;
  systems?: { id: string; levels: { id: string; name: string }[] };
}

async function upsertProgramme(input: ProgrammeInput) {
  const {
    name, shortName, description, type, scope,
    educationSystemId, countryCodes = [], levelNames = [], subjectNames,
    cpdProfession, cpdBody, cpdHoursPerCycle, systems,
  } = input;

  // Resolve country IDs
  const countryIds: string[] = [];
  for (const code of countryCodes) {
    const c = await prisma.country.findUnique({ where: { code } });
    if (c) countryIds.push(c.id);
  }

  // Resolve level IDs from the education system
  const levelIds: string[] = [];
  if (systems && levelNames.length > 0) {
    for (const lname of levelNames) {
      const level = systems.levels.find((l: { name: string }) => l.name === lname);
      if (level) levelIds.push(level.id);
    }
  }

  // Resolve subject IDs
  const subjectIds: string[] = [];
  for (const sname of subjectNames) {
    const subj = await prisma.subject.findFirst({ where: { name: sname } });
    if (subj) subjectIds.push(subj.id);
  }

  await prisma.programme.upsert({
    where: { name },
    update: {
      shortName, description, type, scope,
      educationSystemId: educationSystemId ?? null,
      cpdProfession: cpdProfession ?? null,
      cpdBody: cpdBody ?? null,
      cpdHoursPerCycle: cpdHoursPerCycle ?? null,
      countries: { set: countryIds.map(id => ({ id })) },
      levels:    { set: levelIds.map(id => ({ id })) },
      subjects:  { set: subjectIds.map(id => ({ id })) },
    },
    create: {
      name, shortName, description, type, scope,
      educationSystemId: educationSystemId ?? null,
      cpdProfession: cpdProfession ?? null,
      cpdBody: cpdBody ?? null,
      cpdHoursPerCycle: cpdHoursPerCycle ?? null,
      countries: { connect: countryIds.map(id => ({ id })) },
      levels:    { connect: levelIds.map(id => ({ id })) },
      subjects:  { connect: subjectIds.map(id => ({ id })) },
    },
  });
}

// ── Runner ────────────────────────────────────────────────────────────────────

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
