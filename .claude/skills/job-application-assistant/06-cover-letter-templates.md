---
framework_version: 1.0.1
---

# Cover Letter Templates and Tailoring Guide

## Template: Custom cover.cls (XeLaTeX)

Cover letters use a custom LaTeX document class (`cover.cls`) with Lato/Raleway fonts.

**Output file:** `cover_letters/cover_<company>_<role>.tex`
**Compile with:** XeLaTeX (cover.cls requires fontspec)
**Font directory:** `cover_letters/OpenFonts/fonts/`

### Compile command

```bash
cd cover_letters && xelatex -interaction=nonstopmode cover_<company>_<role>.tex
```

Expected output: `Output written on cover_<company>_<role>.pdf (1 page, ...)`. Any page count other than 1 is a failure that must be fixed before presenting to the user.

## Compile-and-Inspect Loop (MANDATORY)

After writing the cover letter and before presenting to the user, always compile and visually inspect the PDF. Iterate until the layout is clean:

1. Run `xelatex -interaction=nonstopmode cover_<company>_<role>.tex`
2. Confirm page count is exactly 1 and compile succeeded
3. Read the PDF via the Read tool and visually check: signature fits at the bottom, no text cut off, bullet font matches body

### Known template pitfall: itemize inside `\lettercontent{}`

The `\lettercontent{}` macro appends `\\` to its argument. This breaks when the argument ends in `\end{itemize}` because `\\` has no line to break after the environment closes, producing `! LaTeX Error: There's no line here to end.` and no PDF output.

**Wrong (breaks compile):**
```latex
\lettercontent{Here is how my experience maps:
\begin{itemize}
    \item ...
\end{itemize}}
```

**Correct — close `\lettercontent{}` before the list and wrap the list in the matching Raleway-Medium font so typography stays consistent:**
```latex
\lettercontent{Here is how my experience maps:}

{\raggedright\fontspec[Path = OpenFonts/fonts/raleway/]{Raleway-Medium}\fontsize{11pt}{13pt}\selectfont
\begin{itemize}
    \item ...
\end{itemize}\par}
\vspace{6pt}

\lettercontent{[next paragraph]}
```

The font wrapper is mandatory — if you just move `\begin{itemize}` outside `\lettercontent{}` without the `\fontspec` block, bullets render in the default body font (Lato) and visually mismatch the rest of the letter.

## Document Structure

```latex
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
% Cover Letter - [Company], [Role]
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\documentclass[]{cover}
\usepackage{fancyhdr}

\pagestyle{fancy}
\fancyhf{}

\rfoot{Page \thepage \hspace{0pt}}
\thispagestyle{empty}
\renewcommand{\headrulewidth}{0pt}
\begin{document}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%     TITLE NAME
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\namesection{}{\Huge{[YOUR_NAME]}}{  \href{mailto:[YOUR_EMAIL]}{[YOUR_EMAIL]} | [YOUR_PHONE] |  \urlstyle{same}\href{[YOUR_LINKEDIN_URL]}{LinkedIn}
}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%     MAIN COVER LETTER CONTENT
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\currentdate{\today}
\lettercontent{Dear [Name/Team],}

\lettercontent{[Motivation: where the candidate comes from in one sentence, and why this kind of work / this shift interests them now]}

\lettercontent{[Why this vacancy: the specific line or mandate in the posting that they want, in their own voice]}

\lettercontent{[What they bring: ONE concrete anchor from their experience, tied to what they want to do for them]}

\lettercontent{[One-line close]}

\begin{flushright}
% No trailing \\ inside \closing{} - cover.cls appends its own \\, and a
% doubled break triggers "! LaTeX Error: There's no line here to end."
\closing{Kind regards,}

\signature{[YOUR_NAME]}
\end{flushright}
\end{document}
```

## Key Commands Reference

| Command | Purpose |
|---------|---------|
| `\namesection{}{Name}{contact info}` | Header with name and contact |
| `\currentdate{date}` | Date field (use `\today` or explicit date) |
| `\lettercontent{text}` | Body paragraph (adds spacing after) |
| `\closing{text}` | Closing line |
| `\signature{name}` | Printed name below signature |

## Tailoring Guidelines

### Salutation
- If you know the hiring manager's name: "Dear [First Last],"
- If you know the team: "Dear [Company] hiring team,"
- Generic: "Dear [Company]," (avoid "To whom it may concern")

### Length - Hard 1-Page Limit
- Target: 1 page including signature block
- Maximum: **never exceed 1 page**
- **Word budget: 150-200 words** of body text. The page holds ~300, but filling it is the failure, not the goal.
- **Count the words before compiling.** Over 200 means CV content has crept back in: cut it.
- When adding company-specific content, trim other content to compensate rather than adding net length

### Content Structure - THREE THINGS ONLY

A cover letter is a **short personal message**, not a walk through the posting's
requirement list. **Three or four paragraphs**, covering exactly three things:

1. **The candidate's motivation** — what actually draws them to this kind of work.
2. **Why this specific vacancy/company is interesting** — the concrete thing
   about the org that fits, not flattery.
3. **What they can offer** — one concrete anchor from their experience.

Nothing else earns space. Working through the posting's requirements one by one
is the recurring failure, and **prose is not an exemption** — doing it in
paragraphs instead of bullets is the same mistake wearing a disguise. Bullet
lists in the letter are effectively retired; if the template's bullet guidance
below conflicts with this section, **this section wins**.

### Motivation first, not a CV retelling

The letter is **short and mostly motivation**. At least half of it says why the
candidate wants *this* work; facts already in the CV appear **at most once, as a
single anchor sentence**, never as a list of achievements (no metrics run, no
"three parts of my work map onto your brief"). No bullet lists at all.
Precedent: a draft that retold three CV projects in three bullets was sent back
with the note that a cover letter should be short and talk about motivation
more than about what the CV already lists.

What to write instead, the model for future letters:
- **Where the candidate comes from, framed as a direction**, e.g. "I have
  worked mostly with R&D teams and engineers; working with scientists on
  research that matters would be an interesting shift in my career." A
  career-shift sentence in a motivational voice is welcome; it is not a gap
  confession.
- **What in the posting they want**, e.g. "not operations, but organisational
  change".
- **Their current tool or angle**, e.g. "building AI into how we work with
  people is now my main tool".

### Gaps: never in the letter

**Zero gap clauses.** Not one per letter, not framed as "capability plus
readiness", not as a "fast ramp". No "I have not run X", "while I don't have
Y", "I would rather say so than imply otherwise", "is new to me too". Leaning on
where the candidate does *not* match the requirements does not sell their
experience; it does the opposite.

Why it kept happening: this section used to allow one gap clause per letter,
and `/apply` required every posting requirement to be "matched or honestly
gapped". An audit of ~30 letters found gap sentences in 12 of them (EOR
experience, hourly-workforce scale, a missing local language, a specific HRIS,
PMO, M&A). Both rules are now removed.

What to do instead: pick the requirements the candidate meets best and make
them vivid. A requirement they do not meet is not mentioned at all. The reader
has the CV; the letter's only job is to make the case. Career coaches commonly
call naming your own mismatch self-sabotage: the company invited the
application, so put the spotlight on what you bring.

**Before treating anything as a gap, check `01-candidate-profile.md`.** In one
letter, two "gaps" were in fact strengths the candidate had simply not been
asked about (security/compliance audits and quality-management audits run
end-to-end at previous employers). The full gap analysis still belongs in the
daily report and interview prep, where the candidate rehearses bridge answers
that lead with what they have done.

### Never raise work format, location or relocation
The CV header already states the candidate's location and timezone, so the
employer has the information. Raising it hands them a reason to stop reading.
Do not pre-emptively negotiate it and do not add availability logistics.

### Line Spacing
- Add `\usepackage{setspace}` and `\setstretch{1.0}` if the letter is long and needs to fit on one page
- Use `\vspace{.5cm}` between major sections for readability (only if space permits)

### Bullet Lists
- Place `\begin{itemize}...\end{itemize}` **outside** a `\lettercontent{}` block (see "Known template pitfall" above), wrapped in the matching Raleway-Medium `\fontspec` so the bullet font matches the body
- 3-5 bullets is ideal
- Start each bullet with bold label or action verb
- Use `\textbf{Label:}` for category-style bullets

### LaTeX Special Characters
- Underscore: `\_`
- Ampersand: `\&`

### Non-English Cover Letters
- Same template structure, just write content in the posting's language
- Adjust date format to local convention
- Adjust closing to local convention (e.g. "Med venlig hilsen," for Danish)

## Checklist Before Finalizing
- [ ] No em-dashes (use commas or periods instead)
- [ ] No cliches or empty filler
- [ ] 150-200 words, no bullet lists
- [ ] At least half is motivation; CV facts at most one anchor sentence
- [ ] No work-format, location or time-zone line
- [ ] Motivation section references this specific company's mission/values
- [ ] Company name and role are correct throughout
- [ ] Date is current
- [ ] Fits on one page
- [ ] Language matches the job posting language
- [ ] Salutation is appropriate (named person if possible)
- [ ] Headline is engaging and specific, not generic

## Submission Guidelines (Best Practice)
- Submit only the documents the employer requests
- Export as PDF to preserve formatting
- Name files clearly: "[Your Name] CV" and "[Your Name] Cover Letter"
- Follow all employer instructions regarding anonymity or specific materials
