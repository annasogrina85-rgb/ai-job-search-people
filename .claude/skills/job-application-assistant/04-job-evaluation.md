---
framework_version: 1.2.2
---

# Job Evaluation Framework

<!-- SETUP: Skill match areas and career goals are personalized by running /setup -->

## Eligibility Gate — run before scoring

If the candidate is not a citizen or permanent resident of the country they are applying in, run this first. It is a hard filter, not a scoring dimension, and it is separate from work-permit *timing*: timing asks "can they work the required hours yet?", eligibility asks "are they permitted to hold this job at all?". A candidate can pass timing and still be categorically excluded.

Read the posting's eligibility / work rights / "who can apply" section **verbatim** and classify:

| Posting wording | Verdict |
|-----------------|---------|
| Names a **citizenship or permanent-residency requirement** ("must be a citizen of X", "permanent resident", "PR required", "full working rights" where the employer means citizen/PR) | **FAIL — hard stop.** Do not score, do not draft. Quote the exact wording back to the user. |
| Requires a **security clearance** at any level | **FAIL** in most countries, since clearance is normally gated on citizenship. Verify the specific scheme rather than assuming. |
| **Explicitly names** the candidate's permit class, or says "international applicants welcome", "visa holders considered", "we sponsor" | **PASS** — verified acceptance. Worth noting as a positive in the application. |
| **Silent** on citizenship or residency | **PROCEED, but mark unverified.** Check the employer's own careers or international-applicant page before drafting. |

**Two rules that are easy to get wrong:**

1. **Silence is not permission.** Large graduate programs frequently gate eligibility on their own website rather than in the job ad. Highest-risk categories: professional-services firms, government and defence, banking, telecommunications, and anything touching critical infrastructure.
2. **A company-wide "we accept international applicants" statement is not role-level permission.** The common pattern is a general welcome followed by a *named list* of the specific programs or service lines it covers. Confirm the **specific posting or stream** appears on that list before drafting.

**Report an eligibility failure to the user with the quoted source** rather than silently dropping the role. They may know something about their own status that the profile does not record.

If the candidate's permit also constrains *hours* or *start date* (a student visa with a term-time cap, a permit that begins on graduation), record that as a second gate under this section during `/setup`, with the specific dates. Do not merge it with the eligibility question above — they fail for different reasons and need different answers.

A role that fails this gate is not scored and not drafted. Everything below applies only to roles that pass it.

## Language Gate — run before scoring

No dimension or gate anywhere in this framework currently checks a posting's language requirements against what the candidate actually speaks - it is not one of the five Scoring Dimensions below, not a field `/scrape` or `/rank` track, and not something `/apply`'s language detection (Step 1, which already extracts a posting's required language generically) has anywhere to report to. This gate adds that check, structured the same way as the Eligibility Gate above: read the posting, classify against profile data, and treat a hard mismatch as FAIL before scoring.

Read the posting's language requirements as stated for **the role itself** — not the language the ad happens to be written in. A posting written in a language you don't work in, for a role that only needs languages you do work in on the job, passes fine; only an explicit job-condition requirement ("fluent X required," "must communicate with the Y team in Z") triggers this check. For each language the posting requires as a job condition, compare it against your Languages table in CLAUDE.md / `01-candidate-profile.md`:

| Posting requirement vs. your Languages table | Verdict |
|---|---|
| Requires a language **not on your table at all** (e.g. "fluent Polish required," "must communicate with the Warsaw team in Russian," and you list no Polish/Russian row) | **FAIL — hard stop.** Do not score, do not draft. Quote the exact requirement line. |
| Requires a language you **do** list, but the posting's stated bar (as written — "fluent," "native," "C1+," "business-level") reads as plausibly **higher** than your declared level | **FLAG, then proceed.** Not a fail. Score and draft normally, but surface the gap explicitly in your report to the user (quote both the posting's requirement and your declared level) so they can judge it themselves — bars like "fluent" vary a lot by company and geography, and a recruiter may be flexible. Never silently drop the posting and never silently treat it as a clean pass. |
| Requires a language you list, at or below your declared level (or the posting doesn't specify a level at all — just names the language) | **PASS.** No note needed. |

Judge the level comparison the same way you judge everything else in this framework: read both sides as written and reason about it, don't force either into a rigid scale — CEFR letters, LinkedIn-style buckets ("professional working proficiency"), and plain-English words ("conversational," "fluent," "native") all appear in the wild and don't map onto each other precisely. When genuinely unsure whether a stated bar exceeds the candidate's level, prefer FLAG over a silent PASS — the human is meant to be the tiebreaker, not the gate.

**Worked example:** a candidate whose Languages table lists Spanish (Native) and English (B1/B2). A posting requiring "fluent Russian" → **FAIL**, Russian isn't declared at all. A posting requiring "fluent English" → **FLAG**, English is declared but "fluent" plausibly exceeds B1/B2 — score and draft the application, but tell the candidate this posting's bar may be a stretch and let them decide. A posting requiring "conversational English" or unspecified English → **PASS**, B1/B2 clears a "conversational" bar cleanly.

## Sector Gate — run before scoring

Some sectors are excluded on the candidate's own judgment, independently of how well the role fits. **The exclusion list lives in `01-candidate-profile.md`**; the rows below are example configuration. Treat this exactly like the other gates: read what the employer actually does, classify, and stop before scoring if it fails.

| Employer's actual business | Verdict |
|---|---|
| **Gambling / iGaming / betting / real-money gaming** — operators, the brands themselves, and the services, affiliate, platform or "advisory" groups whose revenue comes from them | **FAIL — hard stop** (example exclusion). Do not score, do not draft. Name the employer and the finding in one line and move on. |
| **Sanctioned, or credibly reported as facilitating sanctions evasion / sanctioned-regime financing** — the employer itself, its parent, or its core payment rails are named in an active government sanctions designation, a regulator has revoked its licence over ownership-transparency or fraud concerns, or credible investigative journalism ties it to moving money for a sanctioned entity | **FAIL — hard stop** (example exclusion), independent of how well the role itself fits. Do not score, do not draft. Precedent: a crypto-payments HRBP posting looked entirely ordinary; a one-minute search showed the employer had recently been placed on an EU member state's sanctions list for allegedly helping clients move funds around sanctions, and a national regulator had already revoked its operating licence over opaque ownership. |
| A sector the candidate has mixed feelings about (example: adult / dating products) | **FLAG, then proceed.** The candidate's call each time, not an exclusion. Surface it plainly and let them decide. |
| Everything else | **PASS.** |

**The corporate description is not the test — the revenue and the regulatory record are.** Precedent: one employer presented itself as "a leading business advisory and services group in iGaming and Entertainment", which was legally accurate and read almost neutral; research showed it was a rebranded betting operator launching and managing consumer betting brands. A full package was drafted before that surfaced. Another posting read as an ordinary crypto-payments HRBP role with nothing suspicious in the job text itself, while the employer was under active sanctions. **So, for every posting: (1) when it names iGaming, gaming, betting, casino, sportsbook, "entertainment" alongside any of those, or an unfamiliar holding/advisory group, establish what actually generates the money before drafting anything; (2) for crypto, payments, fintech, or any company with an opaque/offshore holding structure, run one quick search for "[company] sanctions" and "[company] regulator licence revoked" before drafting — this takes under a minute and catches these cases immediately.** Ownership, sub-brands, sanctions lists and regulator actions tell the truth faster than the About page.

**An undisclosed employer is an unverifiable sector, and that is a gate problem — not a question for the candidate.** Intermediary platforms (any "listed on behalf of a partner company" posting) keep the client anonymous until they shortlist you. That makes every check above impossible to run: you cannot establish what generates the revenue, and you cannot search a sanctions register for a company with no name. Treat it as `gate_fail_sector` unless the employer can be identified from the posting some other way (a named product, an office address, a distinctive benefits package). Do not draft a package against an employer whose business you could not establish, and do not hand the candidate the question — they cannot answer it either. Say plainly in the report that the sector could not be verified because the employer is undisclosed.

Report a FAIL briefly and without moralising: state what the company is, cite the source, and move to the next posting.

## Timezone & Working-Hours Gate — run before scoring

This search targets **remote roles workable from the candidate's timezone** (set during /setup; example: an EU timezone such as CET/CEST). Global/worldwide postings qualify **only if their working hours are compatible**: e.g. a candidate in Europe cannot work full US or Australian business hours. Like the gates above, this is a hard filter with a FLAG middle ground, not a scoring dimension.

Read the posting's location/timezone/working-hours wording **verbatim** and classify:

| Posting wording | Verdict |
|-----------------|---------|
| Remote with a compatible scope (example for an EU-based candidate): "Remote (EU)", "Europe", "EMEA", "CET/EET working hours", "UTC±0 to UTC+4", country lists that include EU states, or overlap windows satisfiable from CET/CEST (e.g. "4h overlap with US East Coast" — workable as a late-afternoon block) | **PASS.** |
| "Worldwide" / "fully remote, work from anywhere" with **no** stated timezone or overlap requirement | **PASS, but verify**: scan the description for team-location hints (HQ, "our team is in San Francisco", standup times). If the team looks US/APAC-concentrated, downgrade to FLAG with a note. |
| Requires **partial** overlap that is stretchable but uncomfortable (e.g. "6h overlap with PST", "must attend meetings in US Central mornings") | **FLAG, then proceed.** Quote the exact overlap wording and spell out what it means in the candidate's local time (e.g. "6h overlap with PST = working until ~23:00 CET") so they can judge it themselves. |
| Explicitly requires **full US, Canadian, LATAM, or Australian business hours** ("9-5 EST", "must work PST hours", "Australian Eastern Time business hours"), or restricts hiring to non-EU regions ("US only", "Americas only", "must be located in Australia") | **FAIL — hard stop.** Do not score, do not draft. Quote the exact wording. |

**Rules that are easy to get wrong:**

1. **"Remote" without a region is not "remote for you".** Many "remote" postings are US-remote with payroll restrictions. Check for "must be authorized to work in the US", state lists, or US-only benefits language (401k, "medical/dental/vision") — treat these as "US only" → FAIL even when the location field says just "Remote".
2. **Structured geo fields beat description prose.** Portal fields like Jobicy's `jobGeo` ("EMEA", "Europe") or Remotive-style `candidate_required_location` are the employer's declared scope — but still scan the description for a stricter overlap clause; the stricter statement wins.
3. **Report FAILs with the quoted source**, don't silently drop — the candidate may accept an unusual schedule for an exceptional role.

A role that fails this gate is not scored and not drafted. Everything below applies only to roles that pass it.

## Scoring Dimensions

Evaluate each job posting against these five dimensions:

### 1. Technical Skills Match (0-100)
How well do the required/preferred skills align with the candidate's capabilities?

| Score | Meaning |
|-------|---------|
| 80-100 | Core requirements are primary skills |
| 60-79 | Most requirements match, 1-2 gaps that are learnable |
| 40-59 | Partial match, significant upskilling needed |
| 0-39 | Fundamental mismatch |

**Strong match areas:** [YOUR_PRIMARY_SKILLS]
**Moderate match areas:** [YOUR_SECONDARY_SKILLS]
**Weak match areas:** [YOUR_WEAK_AREAS]

<!-- Example for a senior HR / People Partner profile:
Strong: organizational design, people systems architecture, performance management & grade reviews, competency frameworks, manager enablement, building People functions from scratch, AI-powered People Ops
Moderate: technical recruiting & hiring process design, compensation structures & salary bands, change management, facilitation, employer branding, workforce planning
Weak: country-specific labor law / payroll administration, HRIS administration at enterprise scale, union/works-council relations, deep compensation analytics -->

### 2. Experience Match (0-100)
Does work history align with what they're looking for?

| Score | Meaning |
|-------|---------|
| 80-100 | Direct experience in the same domain and role type |
| 60-79 | Related experience, transferable skills clear |
| 40-59 | Adjacent experience, would need to make the case |
| 0-39 | Unrelated experience |

**Strong:** [YOUR_STRONG_EXPERIENCE_AREAS]
**Moderate:** [YOUR_MODERATE_EXPERIENCE_AREAS]
**Entry-level:** [YOUR_ENTRY_LEVEL_AREAS]

<!-- Example for a senior HR / People Partner profile:
Strong: HRBP/People Partner and Head of People roles in tech (R&D/engineering orgs), OD and people-systems design, remote-first distributed teams, scaling from first-HR-hire, AI transformation (people side)
Moderate: talent acquisition leadership (not IC recruiting), L&D programme design, people analytics, agile coaching
Entry-level: pure C&B specialist roles, HR compliance/legal counsel roles, enterprise (5000+) HR machinery, HR in non-tech industries -->

### 3. Behavioral/Culture Fit (0-100)
Does the role and company culture match the behavioral profile?

| Score | Meaning |
|-------|---------|
| 80-100 | Culture strongly matches behavioral preferences |
| 60-79 | Mixed signals but mostly compatible |
| 40-59 | Some friction areas |
| 0-39 | Significant culture mismatch |

**Red flags to research:** Department disorganization, work dominated by maintenance over development, poor chemistry with leadership, culture mismatches. Check reviews, media coverage, LinkedIn connections, and network contacts for insider perspective.

### 4. Location & Logistics (Pass/Fail + Notes)
Timezone compatibility is already settled by the Timezone & Working-Hours Gate above; this dimension covers the rest:
- Fully remote, EU-compatible hours, no named office city: PASS
- Remote with occasional travel/offsites (a few times a year): PASS (note frequency)
- Hybrid requiring regular office presence, or requires relocation: FAIL (deal-breaker)
- **Hybrid pinned to a specific office city, even when attendance is described as flexible/optional/"recommended, not enforced": FLAG, not PASS.** Precedent: a candidate declined a strong-fit role (80/100, full package drafted) once they noticed the "2 days in the office are recommended but not enforced" hybrid policy was anchored to one office city in another country. A named office city reads as a real pull toward that city regardless of how the policy is worded. **On this FLAG, do not auto-draft a full package** — list it under "Worth a look" in the daily report with the quoted hybrid wording and ask the candidate first; only run the full `/apply` workflow after they confirm interest.
- Frequent international travel: FLAG (discuss with user)
- Employment form (EOR/B2B-contract/direct employment) and hiring-country payroll restrictions: NOTE — surface what the posting says; contract-via-EOR is acceptable

### 5. Career Alignment & Motivation (0-100)
Does this role advance career goals and contain tasks that energize?

| Score | Meaning |
|-------|---------|
| 80-100 | Strongly aligned with career direction, clear growth path |
| 60-79 | Good role but only partially aligned with long-term goals |
| 40-59 | Decent job but doesn't build toward career goals |
| 0-39 | Dead end or backwards step |

**Career goals:**
- [YOUR_CAREER_GOAL_1]
- [YOUR_CAREER_GOAL_2]
- [YOUR_CAREER_GOAL_3]

<!-- Example for a senior HR / People Partner profile: senior systems-level People roles in tech (Senior HRBP / People Partner, Head of People, OD / People Systems leadership); deepen the People Ops x AI specialisation; keep a "build systems, not administer" mandate (transformations, scale-ups, first-People-hire contexts; fractional/B2B also fits). -->

**Role-type preference (configured in `01-candidate-profile.md`).** Some candidates rank role types explicitly; when the profile does, apply it here. Example configuration — a candidate who prefers org design and change work over traditional HR and does not do HR operations:
1. **Organisational design, organisational development, change management, transformation, ways of working, operating model** — top preference. When org design or change management is a core responsibility (not one bullet among twenty), Career Alignment scores **85+**.
2. **Strategic People Partner / HRBP for engineering and product**, where org design, performance systems and leader coaching carry the role.
3. **Classic HR generalist / HRBP** without an org-design or change mandate — Career Alignment caps at **65**.
4. **HR operations** — payroll, contracts, benefits administration, HRIS administration, EOR/vendor administration, employment compliance, ticket queues, onboarding logistics. If the profile excludes this work and operations is the core of the role (most of the listed responsibilities), Career Alignment ≤ **40** and the role is not drafted; at most one line under "Gated out" with the reason. If operations is a minor part next to a design mandate, score normally and name the ops share in the report so the candidate can judge it.

**Target archetype (optional, configured in `01-candidate-profile.md`).** A candidate can name one posting that "looks exactly right" and ask for more like it; distil its signals into a checklist. Example archetype — a People Performance / org-design role at a flat, remote-first company — where any 3 of these signals qualify:
1. **Flat structure by design**: no management layers, player-coaches or hands-on leaders, "systems do the lifting", self-management, freedom and responsibility.
2. **Build the system, not run the admin**: the role co-designs performance standards, progression, evaluation or reward, "no finished playbook", "design for our shape, not the textbook".
3. **Automation and AI are expected of the role itself**: "automate the repeatable", "the operational layer runs itself", build tools or workflows (Notion, n8n, Claude, etc.).
4. **Partners leaders of engineering/product** (squads, tech teams), as a portfolio of leaders, not an HR generalist queue.
5. **Open to operators**: "HR experience welcome but not required", Chief of Staff or founder's-associate backgrounds named as fits; outcome- and impact-based language.
6. **Remote-first** with written, async culture.

How to apply it: Career Alignment scores **85+** when 3 or more signals are present, and Behavioral/Culture **80+** when signal 1 or 6 is present. These roles are often titled outside the classic HR vocabulary (People Performance Manager, Performance Partner, Organisation Designer, People Systems Lead, Chief of Staff for people/operating rhythm), so do not drop them at the title pre-filter. A **single-country remote tag is not an eligibility FAIL on its own** for this archetype when the company already hires through an EOR; score it, draft it, and note the location question in the report.

**Motivation filter:** Evaluate not just whether you *can* do the tasks, but whether the tasks will *energize* you. Consider (example values for a People profile; replace with the candidate's own via `/setup`):
- Tasks that energize: diagnosing org problems and designing systems from first principles, working directly with C-level/engineering leadership, facilitation, building AI-powered internal tools, running experiments (HADI)
- Tasks that drain: HR operations of any kind (payroll, contracts, benefits, HRIS administration, EOR administration, compliance queues — see Role-type preference above), pure HR administration/maintenance without a design mandate, high-volume transactional recruiting, KPI-theater without ownership of the system
- Non-task factors: leadership style, department culture, company values, degree of autonomy

**Life situation alignment:** Consider personal constraints recorded in `01-candidate-profile.md`, for example:
- **Security**: notice period / contract end date, any residence-permit income requirement, salary range (see Salary Check below)
- **Flexibility**: remote-only, timezone-compatible hours (see Timezone Gate); preference for autonomy over meeting-heavy cultures
- **Professional development**: the specialisation the candidate wants to deepen next

### 6. Salary Check (Pass/Flag + Notes)

**Salary stance lives in `01-candidate-profile.md`** (comfortable range, the figure the candidate states, currency, employee vs. contractor equivalence). Example configuration: a comfortable range of €X–Y gross/year, a stated figure inside that range, and an explicit preference *not* to inflate asks — over-market numbers can scare off employers the candidate would actually like to work for, so do not coach upward unless the profile says to. Postings clearly under the bottom of the range are a FLAG (the candidate's call, not an auto-reject). Fractional/B2B engagements are priced separately (day-rate logic, not annual salary). Market benchmarks below are context, not a floor.

Market anchors (example research, remote-EU tech, People/HR roles — refresh for your own market):
| Segment | Range (gross EUR/yr) |
|---------|----------------------|
| Remote HRBP, Europe-wide average | ~€61k (avg) |
| Senior HRBP, Germany | €65-92k, avg ~€76-78k |
| Senior HR leadership, Spain (8+ yrs) | €71-106k, avg ~€83k |
| Senior HRBP / People lead, remote-EU boards ceiling | €90k+ |
| People Ops at US/global remote-first companies | ~$90-124k |
| Head of People, EU scale-up | ~€90-130k (UK/DE/US-HQ top the band) |

Apply as:
- Posting discloses a range whose **top < the bottom of the candidate's comfortable range** → FLAG prominently ("below the candidate's comfortable range"), score the rest normally — the candidate decides
- Range top inside the comfortable range → in range, note the number, nothing else
- Range above it, or undisclosed at a well-funded/US-HQ company → positive note
- **Location-adjusted pay bands** (companies applying location multipliers to the candidate's city/country) can land well below headline bands for senior roles — flag when a company is known for location-based pay so the candidate can weigh it before investing effort
- Undisclosed salary is never a reason to skip; record "salary undisclosed" and probe at screening

## Output Format

Present the evaluation as:

```
## Job Fit Evaluation: [Role] at [Company]

| Dimension | Score | Notes |
|-----------|-------|-------|
| Technical Skills | XX/100 | [brief note] |
| Experience Match | XX/100 | [brief note] |
| Behavioral Fit | XX/100 | [brief note] |
| Location | PASS/FAIL | [brief note] |
| Career Alignment | XX/100 | [brief note] |

**Overall Score: XX/100** (weighted average of scored dimensions)

### Verdict: [Strong Fit / Good Fit / Moderate Fit / Weak Fit / Poor Fit]

### Key Strengths for This Role
- [bullet points]

### Gaps to Address
- [bullet points]

### Recommendation
[1-2 sentences: apply/skip/apply with caveats]

### Company Research Checklist
- [ ] Checked company website (mission, values, recent news)
- [ ] Checked review sites (Glassdoor, Jobindex, etc.)
- [ ] Checked LinkedIn for team size, recent hires, connections
- [ ] Checked media for restructuring, growth, or workplace issues
- [ ] Identified network contacts who may know the team/manager
```

## Weighting
- Technical Skills: 30%
- Experience Match: 25%
- Behavioral Fit: 15%
- Career Alignment: 30%

(Location is pass/fail, not weighted)

## Thresholds
- **Strong Fit** (75+): Definitely apply, tailor everything
- **Good Fit** (60-74): Apply, address gaps in cover letter
- **Moderate Fit** (45-59): Consider carefully, discuss with user
- **Weak Fit** (30-44): Probably skip unless strategic reasons
- **Poor Fit** (<30): Skip

## Pre-Application: Call the Employer (Best Practice)

Before writing the application, consider whether the candidate should call the contact person listed in the posting. **Only call if there are substantive questions** - never call just to "be remembered."

### When to Suggest Calling
- The posting has unclear or ambiguous requirements
- It's unclear which competencies are essential vs. nice-to-have
- The role description is vague about day-to-day tasks
- There's a named contact person who invites questions

### Good Questions to Ask
- "What are the primary challenges in this role?"
- "How is time typically divided across the listed responsibilities?"
- "Which competencies are most critical for success in this position?"
- "What does success look like in the first 6-12 months?"

### Rules for the Call
- Prepare a 30-second "elevator pitch" about your background in case they ask
- The call's purpose is **gathering information**, not delivering a pitch
- Take notes - use what you learn to tailor the application
- Reference the conversation naturally in the cover letter ("After speaking with [name], I was especially drawn to...")
