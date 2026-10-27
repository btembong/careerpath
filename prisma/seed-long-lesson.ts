/**
 * CareerPath Africa — Long Lesson Seed
 * Adds a rich, very long TEXT lesson to the demo course to test the
 * lesson player UI: reading progress bar, table of contents, prose styling.
 *
 * Run:  pnpm ts-node prisma/seed-long-lesson.ts
 */

import { PrismaClient, LessonType } from '@prisma/client';

const prisma = new PrismaClient();

const COURSE_ID = 'dcf20d79-5dac-4d3f-877d-01bc40560dc3';

const LONG_CONTENT = `
<h2>Introduction to Algebraic Thinking</h2>
<p>Algebra is the language of mathematics. Rather than working with specific numbers, algebra lets us describe patterns, relationships, and rules in a general way using variables and expressions. Mastering algebra is the foundation for everything from trigonometry to calculus — and it is one of the highest-weighted topics in the WASSCE Core Mathematics paper.</p>
<p>In this lesson we will cover the major sub-topics systematically: from the basics of expressions and identities, through factorisation and equations, to sequences and functions. By the end, you should be comfortable tackling any algebra question that appears on the examination.</p>

<h2>Variables, Constants and Expressions</h2>
<p>A <strong>variable</strong> is a symbol (usually a letter like x, y, or n) that represents an unknown or changing quantity. A <strong>constant</strong> is a fixed value. An <strong>algebraic expression</strong> is a combination of variables, constants, and arithmetic operations.</p>
<h3>Examples of expressions</h3>
<ul>
<li><strong>3x + 7</strong> — linear expression in one variable</li>
<li><strong>2a² − 5ab + b²</strong> — quadratic expression in two variables</li>
<li><strong>(x + 3)(x − 2)</strong> — product form (factorised)</li>
<li><strong>4y³ − y + 12</strong> — cubic polynomial</li>
</ul>
<p>Note that an expression does <em>not</em> have an equals sign. Once you introduce an equals sign, it becomes an <strong>equation</strong>.</p>

<h3>Evaluating expressions</h3>
<p>To evaluate an expression, substitute the given values for each variable and simplify using BODMAS (Brackets, Orders, Division, Multiplication, Addition, Subtraction).</p>
<blockquote>
<p><strong>Example:</strong> If x = 3 and y = −2, find the value of 2x² − 3y + 1.<br/>
= 2(3)² − 3(−2) + 1 = 2(9) + 6 + 1 = 18 + 6 + 1 = <strong>25</strong></p>
</blockquote>

<h2>Laws of Indices (Exponents)</h2>
<p>The laws of indices allow us to simplify expressions involving powers. These come up constantly in algebra, so memorise them thoroughly.</p>
<h3>The six fundamental laws</h3>
<ol>
<li><strong>Product law:</strong> aᵐ × aⁿ = aᵐ⁺ⁿ — add the exponents when multiplying same base</li>
<li><strong>Quotient law:</strong> aᵐ ÷ aⁿ = aᵐ⁻ⁿ — subtract the exponents when dividing same base</li>
<li><strong>Power law:</strong> (aᵐ)ⁿ = aᵐⁿ — multiply exponents when raising a power to a power</li>
<li><strong>Zero index:</strong> a⁰ = 1 (for any a ≠ 0)</li>
<li><strong>Negative index:</strong> a⁻ⁿ = 1/aⁿ</li>
<li><strong>Fractional index:</strong> a^(1/n) = ⁿ√a (nth root)</li>
</ol>
<blockquote>
<p><strong>Common mistake:</strong> Students often write 2³ × 2⁴ = 4⁷. This is wrong! The base must stay the same: 2³ × 2⁴ = 2⁷ = 128.</p>
</blockquote>

<h2>Expanding and Simplifying</h2>
<p>Expanding means removing brackets by multiplying. Simplifying means collecting like terms afterwards.</p>
<h3>Single bracket expansion</h3>
<p>Multiply every term inside the bracket by the term outside:</p>
<pre><code>3(2x − 5)  =  6x − 15
−2(4y + 3) = −8y − 6
x(x + 4)   =  x² + 4x</code></pre>

<h3>Double bracket expansion (FOIL)</h3>
<p>For two brackets (a + b)(c + d), multiply each term in the first bracket by each term in the second:</p>
<pre><code>(x + 3)(x − 2)
= x·x + x·(−2) + 3·x + 3·(−2)
= x² − 2x + 3x − 6
= x² + x − 6</code></pre>

<h3>Perfect square identities</h3>
<ul>
<li>(a + b)² = a² + 2ab + b²</li>
<li>(a − b)² = a² − 2ab + b²</li>
<li>(a + b)(a − b) = a² − b² — difference of two squares</li>
</ul>
<p>These identities appear constantly in WASSCE questions. Learn to recognise them in both expanded and factorised forms.</p>

<h2>Factorisation</h2>
<p>Factorisation is the reverse of expansion — we rewrite an expression as a product of factors. There are several techniques, each suited to a different type of expression.</p>
<h3>Common factor</h3>
<p>Find the highest common factor (HCF) of all terms and take it outside the bracket:</p>
<pre><code>6x² + 9x   = 3x(2x + 3)
4a²b − 8ab² = 4ab(a − 2b)</code></pre>

<h3>Grouping</h3>
<p>Used when there are four or more terms. Group them in pairs, factor each pair, then factor the common bracket:</p>
<pre><code>ax + ay + bx + by
= a(x + y) + b(x + y)
= (a + b)(x + y)</code></pre>

<h3>Quadratic trinomials</h3>
<p>For ax² + bx + c, find two numbers that <strong>multiply to ac</strong> and <strong>add to b</strong>, then split the middle term and group:</p>
<pre><code>2x² + 7x + 3
→ ac = 6,  b = 7 → factors: 6 and 1
= 2x² + 6x + x + 3
= 2x(x + 3) + 1(x + 3)
= (2x + 1)(x + 3)</code></pre>

<h3>Difference of two squares</h3>
<pre><code>x² − 25   = (x + 5)(x − 5)
9a² − 16b² = (3a + 4b)(3a − 4b)</code></pre>

<h2>Linear Equations and Inequalities</h2>
<p>A <strong>linear equation</strong> is one where the variable appears to the power 1 only. The goal is to isolate the variable on one side.</p>
<h3>Solving linear equations</h3>
<ol>
<li>Expand all brackets</li>
<li>Move variable terms to one side, constants to the other</li>
<li>Collect like terms</li>
<li>Divide both sides by the coefficient of the variable</li>
</ol>
<blockquote>
<p><strong>Example:</strong> Solve 3(x − 2) = 2x + 7<br/>
3x − 6 = 2x + 7<br/>
3x − 2x = 7 + 6<br/>
x = 13</p>
</blockquote>

<h3>Linear inequalities</h3>
<p>Solving inequalities follows the same steps as equations, with one crucial rule: <strong>when you multiply or divide by a negative number, flip the inequality sign.</strong></p>
<pre><code>Solve: −2x + 5 > 1
−2x > −4
x < 2   ← sign flips because we divided by −2</code></pre>

<h2>Simultaneous Equations</h2>
<p>When two equations share the same two unknowns, we solve them simultaneously. There are two main methods.</p>
<h3>Elimination method</h3>
<p>Multiply one or both equations to make the coefficient of one variable the same, then add or subtract the equations to eliminate that variable.</p>
<pre><code>2x + 3y = 13  ... (1)
4x − y  = 5   ... (2)

Multiply (2) by 3:
12x − 3y = 15  ... (3)

Add (1) and (3):
14x = 28  →  x = 2
Substitute into (1): 4 + 3y = 13  →  y = 3</code></pre>

<h3>Substitution method</h3>
<p>Make one variable the subject in one equation, then substitute into the other:</p>
<pre><code>y = 2x − 1   ... (1)
3x + y = 14  ... (2)

Substitute (1) into (2):
3x + (2x − 1) = 14
5x = 15  →  x = 3
y = 2(3) − 1 = 5</code></pre>

<h2>Quadratic Equations</h2>
<p>A quadratic equation has the form <strong>ax² + bx + c = 0</strong>. There are three solution methods.</p>
<h3>Factorisation method</h3>
<p>Factorise the left side and set each factor to zero:</p>
<pre><code>x² − 5x + 6 = 0
(x − 2)(x − 3) = 0
x = 2  or  x = 3</code></pre>

<h3>Completing the square</h3>
<p>Rewrite the equation in the form (x + p)² = q, then take the square root of both sides:</p>
<pre><code>x² + 6x + 7 = 0
(x + 3)² − 9 + 7 = 0
(x + 3)² = 2
x + 3 = ±√2
x = −3 ± √2</code></pre>

<h3>Quadratic formula</h3>
<p>For any quadratic ax² + bx + c = 0:</p>
<blockquote>
<p><strong>x = (−b ± √(b² − 4ac)) / 2a</strong></p>
</blockquote>
<p>The expression under the square root, <strong>b² − 4ac</strong>, is called the <strong>discriminant (Δ)</strong>:</p>
<ul>
<li>Δ > 0 → two distinct real roots</li>
<li>Δ = 0 → one repeated real root (perfect square)</li>
<li>Δ &lt; 0 → no real roots (complex roots)</li>
</ul>

<h2>Sequences and Series</h2>
<p>A <strong>sequence</strong> is an ordered list of numbers following a pattern. The WASSCE syllabus focuses on two types.</p>
<h3>Arithmetic progressions (AP)</h3>
<p>Each term increases by a fixed <strong>common difference d</strong>:</p>
<ul>
<li>nth term: <strong>Tₙ = a + (n−1)d</strong></li>
<li>Sum of n terms: <strong>Sₙ = n/2 × (2a + (n−1)d)</strong></li>
</ul>
<blockquote>
<p><strong>Example:</strong> The 3rd term of an AP is 11 and the 7th term is 27. Find a and d.<br/>
T₃ = a + 2d = 11 ... (i)<br/>
T₇ = a + 6d = 27 ... (ii)<br/>
(ii) − (i): 4d = 16 → d = 4, a = 3</p>
</blockquote>

<h3>Geometric progressions (GP)</h3>
<p>Each term is multiplied by a fixed <strong>common ratio r</strong>:</p>
<ul>
<li>nth term: <strong>Tₙ = arⁿ⁻¹</strong></li>
<li>Sum of n terms: <strong>Sₙ = a(rⁿ − 1) / (r − 1)</strong> for r ≠ 1</li>
<li>Sum to infinity (|r| &lt; 1): <strong>S∞ = a / (1 − r)</strong></li>
</ul>

<h2>Functions and Graphs</h2>
<p>A <strong>function</strong> f maps each input x to exactly one output f(x). Understanding functions is critical for graph questions.</p>
<h3>Key function types</h3>
<ul>
<li><strong>Linear:</strong> f(x) = mx + c — straight line, gradient m, y-intercept c</li>
<li><strong>Quadratic:</strong> f(x) = ax² + bx + c — parabola (U-shape if a > 0)</li>
<li><strong>Reciprocal:</strong> f(x) = 1/x — hyperbola with asymptotes at x = 0, y = 0</li>
<li><strong>Exponential:</strong> f(x) = aˣ — rapid growth or decay</li>
</ul>

<h3>Finding the inverse function</h3>
<ol>
<li>Write y = f(x)</li>
<li>Swap x and y</li>
<li>Solve for y — this gives f⁻¹(x)</li>
</ol>
<pre><code>f(x) = 3x − 4
y = 3x − 4
x = 3y − 4
3y = x + 4
f⁻¹(x) = (x + 4) / 3</code></pre>

<h2>Exam Strategy and Common Mistakes</h2>
<p>Algebra questions account for roughly <strong>35–40%</strong> of the WASSCE Core Mathematics paper. Here is how to maximise your marks.</p>
<h3>Top mistakes to avoid</h3>
<ul>
<li>Forgetting to change the inequality sign when dividing by a negative</li>
<li>Expanding (a + b)² as a² + b² (missing the 2ab middle term)</li>
<li>Cancelling terms in a fraction instead of factors — e.g., (x² + 2x)/(x + 2) ≠ x</li>
<li>Stopping at the factorised form instead of finding the actual roots</li>
<li>Arithmetic errors when substituting into the quadratic formula</li>
</ul>
<h3>Time management</h3>
<p>Each Section A algebra question should take no more than <strong>3 minutes</strong>. If you are spending longer, move on and return — partial credit is available for correct working even with a wrong final answer. Always show your steps clearly.</p>
<blockquote>
<p>Practice at least <strong>50 past questions</strong> on each sub-topic before the exam. Pattern recognition is everything in algebra — the more questions you see, the faster you will identify the technique required.</p>
</blockquote>
`;

async function main() {
  console.log('\n📚  Adding long text lesson to demo course...\n');

  const course = await prisma.platformCourse.findUnique({
    where: { id: COURSE_ID },
    include: { modules: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!course) {
    console.error(`Course ${COURSE_ID} not found.`);
    process.exit(1);
  }

  // Add to Module 1 or create a dedicated module
  let mod = course.modules.find(m => m.title.includes('Number'));

  if (!mod) {
    mod = await prisma.courseModule.create({
      data: {
        courseId:  course.id,
        title:     'Module 1 — Algebra Deep Dive',
        sortOrder: 1,
      },
    });
  }

  // Find the highest sortOrder in this module
  const existing = await prisma.lesson.findMany({
    where: { moduleId: mod.id },
    orderBy: { sortOrder: 'desc' },
  });
  const nextOrder = (existing[0]?.sortOrder ?? 0) + 1;

  // Create the long lesson
  const lesson = await prisma.lesson.upsert({
    where: { id: 'long-text-lesson-test-001' },
    update: { content: LONG_CONTENT.trim(), title: 'Complete Algebra Reference — Full Deep Dive' },
    create: {
      id:         'long-text-lesson-test-001',
      moduleId:   mod.id,
      title:      'Complete Algebra Reference — Full Deep Dive',
      type:       LessonType.TEXT,
      content:    LONG_CONTENT.trim(),
      sortOrder:  nextOrder,
      isFree:     true,
    },
  });

  console.log(`Course : ${course.title} (${course.id})`);
  console.log(`Module : ${mod.title} (${mod.id})`);
  console.log(`Lesson : ${lesson.title} (${lesson.id})`);
  console.log(`\nOpen it at: /student/learn/${course.id}/lesson/${lesson.id}`);
  console.log('\nDone.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
