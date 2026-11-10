# Projects, Calendar, Grades, Learn and the Coach (design, not built yet)

Pictures:
- `proj_g_study_project.png`: a study project (preparing a test)
- `proj_h_task_project.png`: a task project (a presentation)
- `proj_i_map.png`: how the parts connect

This builds on `SUBJECTS.md`.

## The idea

Everything shares three things:
- **dates**, which all show in the calendar
- **subjects**, which hold the grades
- **topics**, which Learn scores

The **coach** reads all of them and suggests the next steps. Only the coach adds anything to your plan, and only things you can see and undo.

There are two kinds of project:
- **Study project:** preparing a test. It's made automatically when you add a test to a subject (or in the calendar). It holds the pages and topics for the test and a plan of short sessions until the test date. When the date has passed, it asks for the grade, writes it into the subject, and closes with a short review.
- **Task project:** something you make (a presentation, a coding project). It has a board (to do / doing / done), deadlines and a timeline. Tasks can link to a page, Learn (flashcards for a talk) or the 3D studio. It can count as a grade in a subject. Coding projects also get a **logbook** tab: what was built each day, time spent, and links.

## Data

- `projects`:
  ```
  { items: [{ id, name, kind: 'study'|'task', subject: nbId|null, test: plannedTestId|null, due, goal, color, status: 'open'|'done', created, closed, review }] }
  ```
- `proj_<id>`:
  ```
  { tasks: [{ id, title, status: 'todo'|'doing'|'done', due, mins, page, topic, order, u }],
    plan: [{ id, date, start, mins, kind: 'quiz'|'read'|'summary'|'review'|'work', topic, page, done, result, by: 'you'|'coach' }],
    pages: [pageIds], log: [{ date, text, mins, links }] }
  ```
- `cal` (calendar):
  ```
  { events: [{ id, title, start, end, kind: 'class'|'event', subject, repeat: { weekly, until } }] }
  ```
  These are only the things typed into the calendar, such as the timetable. Tests (from `grades_<nb>.planned`), task deadlines and plan sessions are **not copied**. The calendar shows them straight from where they live, so they can never disagree.
- `learnlog`: `{ items: [{ t, nb, topic, page, kind, score, mins, project }] }`. Every Learn quiz or flashcard round writes one entry, which updates `mastery_<nb>` (see `SUBJECTS.md`) and counts as study time.

## How the parts feed each other

| From | To | What |
|---|---|---|
| Subjects & grades | Calendar | test dates |
| Subjects & grades | Projects | a planned test makes a study project; the grade needed for the goal |
| Projects | Calendar | study sessions, task deadlines |
| Projects | Subjects & grades | a task project's grade |
| Notes | Learn | pages become quizzes, flashcards, summaries |
| Notes | Projects | the pages a project is about |
| Learn | Projects | readiness per topic |
| Learn | Subjects & grades | quiz scores per subject (readiness) |
| Everything | Coach | facts: dates, grades, readiness, pages, missed sessions |
| Coach | Projects / Calendar | extra or moved sessions (marked “added by the coach”) |

## Planning (Cortex Scribe does this, not the AI)

- **“Plan it for me”:** take the days until the test, minus the time taken by classes and events in the calendar. Then:
  - Put 20–40 minute sessions in free time, weakest topics first.
  - Space each topic out, never two days in a row.
  - Make the last day a mixed quiz like the test.
- **After each quiz:** a topic above 80% loses a session; one below 50% gets an extra short one. If a session was missed, it moves to the next free slot.
- **Task projects:** “Break it into tasks” asks the AI for a task list from the project name and its pages (AI task `project.breakdown`, JSON with title, minutes and order). You check the list before it's added.

## The coach

Rules (Cortex Scribe) decide what matters. The AI only words it. Facts sent to the AI task `coach.feedback`:
- days until each test
- readiness per topic
- the grade needed for the goal
- tasks that are behind
- missed sessions
- pages without a summary
- free calendar slots

It answers in JSON with 2–4 tips, each with an action button. Actions:
- start quiz (topic)
- open page
- play a recording from a time
- add a calendar block
- move a session

Where it shows:
- in each project
- on the subject page
- on the home page, as “This week”

When it updates: after each Learn result, when a grade is entered, and once a day.

## Build order

1. Calendar (typed events and the timetable), showing tests and deadlines from the other parts.
2. Projects: task projects with board and deadlines; study projects made from planned tests.
3. Subjects & grades (`SUBJECTS.md`, steps 1–2).
4. Learn writes `learnlog` and `mastery`; readiness in projects and subjects.
5. “Plan it for me” and adjusting the plan (rules, no AI).
6. The coach (AI wording) and “Break it into tasks”.
7. The home page (`home_a_today.png`) that pulls it together.

Each step works on its own, and each later step makes the earlier ones smarter.
