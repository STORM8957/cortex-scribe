# Subjects and grades (design, not built yet)

Pictures: `subj_f_subjects.png` (all subjects) and `subj_e_subject.png` (one subject).

## Idea

A **subject is a notebook with "This is a subject" switched on**. Nothing about its pages, subfolders, blocks or Learn changes. The notebook gets two more tabs next to its notes, **Grades & progress** and **Learn**. A new **Subjects & grades** overview lists every subject with its average, trend and next test. Any notebook can become a subject, and switching it off again keeps the grades.

## Data

- Top-level folder node (notebook) in `tree`: `subject: { color, teacher, goal, lessons, on: true }`
- `grades_<nbId>`:
  ```
  { terms: [{ id, name, from, to }],
    items: [{ id, date, title, kind: 'test'|'quiz'|'oral'|'project'|'homework', grade, weight, topic, page, term, note, u }],
    planned: [{ id, date, title, weight, topic, page }] }
  ```
  `page` links a grade to the notes it was about; `planned` are tests that haven't happened yet. When a planned test's date has passed, Cortex Scribe asks for the grade.
- `mastery_<nbId>` (filled by Learn later):
  ```
  { topics: { "<topic>": { score, n, last, history: [[time, score], …] } } }
  ```
- Settings (browser `prefs` key `grading`, can be overridden per subject):
  - scale: Swiss 1–6 (6 best, pass 4), German 1–6 (1 best), percent, or letters
  - rounding: none, 0.1, 0.5
  - pass mark
  - compensation rule: for example, each insufficient grade must be offset twice
  - how subjects count in the overall average: equal, or by lessons per week
- Backups: `notebooks[nbId].grades` and `.mastery` (still format 1; only new fields are added).

## Calculations (plain functions, tested on their own)

- **Weighted average:** Σ grade × weight / Σ weight, then rounded as the settings say.
- **Trend:** the last 3 grades against the ones before.
- **Needed on the next test** to reach the goal: g = (goal × (W + w) − S) / w, where S is Σ grade × weight so far, W is Σ weight so far, and w is the next test's weight. Show "not reachable with one test" when g > 6.
- **Pass and promotion status:** per term and per year, with the compensation rule.

Cortex Scribe does all the maths. The AI never calculates grades.

## Screens

- **All subjects:** overall average, promotion status, upcoming tests, study time, and one card per subject (average, sparkline, trend, next test, warnings such as "below your goal" or "needs 4.5 next").
- **One subject:** average, goal and needed grade, next test, Learn readiness.
  - A grade chart: dots sized by weight and coloured by pass or goal, a line for the running average, lines for the goal and the pass mark, and a dashed step to the next test.
  - A table of all grades, each with a link to its page.
  - Topics from Learn, a feedback card, and the notes in the subject.
- **Adding a grade:**
  - **Add a grade** (grade, weight, type, date, topic, page).
  - On a page's … menu: "Add a grade for this page".
  - From the calendar, once it exists.
  - Later: a photo of the marked test, where the AI reads the grade and the topics (new task `grades.photo`).

## Learn sync and feedback (later)

- Every Learn quiz writes its score per topic into `mastery_<nbId>`. A topic is a page name or one the AI tags.
- Readiness counts recent quizzes more (exponential decay).
- **Feedback:** a new AI task, `subject.feedback`, gets only numbers and facts (averages, the needed grade, weak topics, days to the next test, pages without a summary). It answers in JSON with 2–4 short tips. Those show on the subject page, are refreshed after each quiz or once a week, and can open Learn on the weak topic ("Practise Meiose").

## Where it goes

- `46_subjects.js`: data, calculations, the overview and the subject tab.
- Later `47_mastery.js`: Learn sync.
- Charts reuse `18_chart.js`, or small SVGs.
- Storage only through `Store`, and AI only through `AI` with tasks from `AI_TASKS`.
- New test: `test27`.

## Build order

1. Subjects, grades, averages, "needed on the next test", the overview (no AI).
2. The grade chart, links to pages, and planned tests (and the calendar, once it exists).
3. Learn sync (mastery) and AI feedback.
