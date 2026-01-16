# Student Panel UI Specification for Statistical Sampling Simulation System

## Overview

This is the student panel for a university statistical sampling virtual simulation teaching platform. Students use this panel to complete sampling experiments: design questionnaires, plan sample sizes, execute three sampling methods, analyze results, and submit reports for grading.

**Tech Stack Preference:** React + Tailwind CSS + shadcn/ui components

**Design Style:** Clean, modern, student-friendly. Wizard-style flow with clear progress indicators. Similar to interactive learning platforms like Coursera or educational simulations.

---

## Global Layout

### Structure
- **Top Header:** System name/logo, student name, logout button
- **Main Content Area:** Full-width content, changes based on current page/stage
- **No Sidebar:** Students follow a linear flow, no need for navigation menu

### Header Component
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🎓 Statistical Sampling Simulation          Chen Xiaoming    [Logout]   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 1: Login

### Layout
Centered login card on a clean background.

### Components

**Login Card:**
```
┌─────────────────────────────────────────────┐
│                                             │
│        Statistical Sampling                 │
│        Virtual Simulation                   │
│                                             │
│   Student ID                                │
│   ┌─────────────────────────────────────┐   │
│   │ 2024010001                          │   │
│   └─────────────────────────────────────┘   │
│                                             │
│   Password                                  │
│   ┌─────────────────────────────────────┐   │
│   │ ••••••••                            │   │
│   └─────────────────────────────────────┘   │
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │             Login                   │   │
│   └─────────────────────────────────────┘   │
│                                             │
│   Forgot password? Contact your teacher     │
│                                             │
└─────────────────────────────────────────────┘
```

**Error States:**
- Invalid credentials: "Student ID or password is incorrect"
- Account disabled: "Your account has been disabled. Please contact your teacher."

---

## Page 2: First Login - Change Password

### Trigger
Shown automatically when `is_first_login = true`

### Layout
```
┌─────────────────────────────────────────────┐
│                                             │
│        Welcome! 👋                          │
│                                             │
│   For security, please set a new password   │
│   before continuing.                        │
│                                             │
│   New Password                              │
│   ┌─────────────────────────────────────┐   │
│   │                                     │   │
│   └─────────────────────────────────────┘   │
│   ℹ️ At least 8 characters, must include    │
│      letters and numbers                    │
│                                             │
│   Confirm Password                          │
│   ┌─────────────────────────────────────┐   │
│   │                                     │   │
│   └─────────────────────────────────────┘   │
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │         Set Password                │   │
│   └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

**Validation:**
- Real-time validation as user types
- ✓ At least 8 characters
- ✓ Contains letters
- ✓ Contains numbers
- ✓ Passwords match

---

## Page 3: Task Hall (Home)

### Layout
Main dashboard showing all assigned tasks.

### Components

**Announcement Banner (if any):**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📢 System Maintenance: March 20th 2-4 AM. Please save your work.    [✕] │
└─────────────────────────────────────────────────────────────────────────┘
```

**Page Header:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ My Experiments                                                          │
│ Complete the assigned sampling experiments before the deadline          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Task Cards Grid (2-3 columns on desktop, 1 on mobile):**

```
┌────────────────────────────────────┐  ┌────────────────────────────────────┐
│ Consumer Behavior Survey           │  │ Market Research Methods            │
│                                    │  │                                    │
│ This survey explores consumer      │  │ An introduction to various market  │
│ purchasing decisions in urban...   │  │ research sampling methodologies... │
│                                    │  │                                    │
│ 📅 Published: Mar 1, 2024          │  │ 📅 Published: Mar 15, 2024         │
│ ⏰ Deadline: Mar 31, 2024          │  │ ⏰ Deadline: Apr 15, 2024          │
│ 🕐 12 days remaining               │  │ 🕐 27 days remaining               │
│                                    │  │                                    │
│ ┌──────────────────────────────┐   │  │ ┌──────────────────────────────┐   │
│ │ 🔵 In Progress               │   │  │ │ ⚪ Not Started               │   │
│ └──────────────────────────────┘   │  │ └──────────────────────────────┘   │
│                                    │  │                                    │
│ [Continue Experiment]  [History]   │  │ [Start Experiment]                 │
└────────────────────────────────────┘  └────────────────────────────────────┘

┌────────────────────────────────────┐  ┌────────────────────────────────────┐
│ Social Media Usage Study           │  │ Employee Satisfaction Survey       │
│                                    │  │                                    │
│ Research on social media usage     │  │ A comprehensive study on workplace │
│ patterns among young adults...     │  │ satisfaction and productivity...   │
│                                    │  │                                    │
│ 📅 Published: Feb 15, 2024         │  │ 📅 Published: Feb 1, 2024          │
│ ⏰ Deadline: Mar 15, 2024          │  │ ⏰ Deadline: Feb 28, 2024          │
│ 🕐 Ended                           │  │ 🕐 Ended                           │
│                                    │  │                                    │
│ ┌──────────────────────────────┐   │  │ ┌──────────────────────────────┐   │
│ │ 🟢 Graded: 85 pts            │   │  │ │ 🔴 Rejected                  │   │
│ └──────────────────────────────┘   │  │ └──────────────────────────────┘   │
│                                    │  │                                    │
│ [View Results]  [History]          │  │ [View Feedback]  [Redo]  [History] │
└────────────────────────────────────┘  └────────────────────────────────────┘

┌────────────────────────────────────┐
│ Healthcare Access Survey           │
│                                    │
│ Study on healthcare accessibility  │
│ in rural communities...            │
│                                    │
│ 📅 Published: Mar 10, 2024         │
│ ⏰ Deadline: Mar 25, 2024          │
│ 🕐 Waiting for grading             │
│                                    │
│ ┌──────────────────────────────┐   │
│ │ 🟡 Submitted                 │   │
│ └──────────────────────────────┘   │
│                                    │
│ [View Submission]  [History]       │
└────────────────────────────────────┘
```

**Status Badge Colors:**
- ⚪ Not Started - Gray
- 🔵 In Progress - Blue
- 🟡 Submitted - Orange/Yellow
- 🟢 Graded - Green (shows score)
- 🔴 Rejected - Red

**Card Click Behavior:**
| Status | Primary Action | Goes To |
|--------|---------------|---------|
| Not Started | Start Experiment | Topic Detail Page |
| In Progress | Continue Experiment | Current Stage |
| Submitted | View Submission | Submission Preview (read-only) |
| Graded | View Results | Results Page |
| Rejected | View Feedback | Rejection Detail Page |

---

## Page 3.1: History Dialog/Page

### Trigger
Click "History" link on any task card

### Layout
Modal or slide-over panel showing all submission attempts

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Submission History - Consumer Behavior Survey                       [✕] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Attempt #2 (Latest)                              March 15, 2024    │ │
│ │ Status: ✅ Graded                                                   │ │
│ │ Score: 85 points                                                   │ │
│ │                                                                     │ │
│ │ [View Questionnaire PDF]  [View Report PDF]                        │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Attempt #1                                       March 8, 2024     │ │
│ │ Status: ❌ Rejected                                                 │ │
│ │ Reason: "The questionnaire lacks variety in question types.        │ │
│ │          Please include at least one scale-type question."         │ │
│ │                                                                     │ │
│ │ [View Questionnaire PDF]  [View Report PDF]                        │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 4: Topic Detail

### Layout
Information page before starting the experiment.

### Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ← Back to My Experiments                                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Consumer Behavior Survey                                                │
│ ════════════════════════                                                │
│                                                                         │
│ 📅 Deadline: March 31, 2024 (12 days remaining)                        │
│ 📊 Population Size: 10,000 individuals                                  │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Background                                                              │
│ ──────────                                                              │
│ This survey aims to understand consumer purchasing behavior in urban    │
│ areas. The study focuses on identifying key factors that influence     │
│ buying decisions, including demographic variables, income levels,       │
│ and lifestyle preferences.                                              │
│                                                                         │
│ Your task is to design a questionnaire, determine an appropriate       │
│ sample size, execute three different sampling methods, and analyze     │
│ the results to understand which method best represents the population. │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Attachments                                                             │
│ ───────────                                                             │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 📄 Research Background.pdf                    2.5 MB    [Download]  │ │
│ │ 🖼️ Sample Demographics.png                    450 KB    [Preview]   │ │
│ │ 🎬 Introduction Video.mp4                     125 MB    [Play]      │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Your Progress                                                           │
│ ─────────────                                                           │
│                                                                         │
│   ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐     │
│   │ Stage 1   │───▶│ Stage 2   │───▶│ Stage 3   │───▶│ Stage 4   │     │
│   │Questionnaire│   │Sample Size│    │ Sampling  │    │ Analysis  │     │
│   │  ⚪ Todo   │    │  ⚪ Todo   │    │  ⚪ Todo   │    │  ⚪ Todo   │     │
│   └───────────┘    └───────────┘    └───────────┘    └───────────┘     │
│                                                                         │
│                    ┌─────────────────────────┐                          │
│                    │    Start Experiment     │                          │
│                    └─────────────────────────┘                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Progress Indicator States:**
- ⚪ Todo (gray, outlined)
- 🔵 Current (blue, filled)
- ✅ Completed (green, with checkmark)

**For In-Progress experiments:**
- Show which stages are completed
- Button changes to "Continue Experiment"
- Goes directly to current stage

---

## Page 5: Experiment Flow - Stage Wrapper

### Layout
All four stages share a common wrapper with progress indicator.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Consumer Behavior Survey                                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   │  Stage 1    │────│  Stage 2    │────│  Stage 3    │────│  Stage 4    │
│   │Questionnaire│    │ Sample Size │    │  Sampling   │    │  Analysis   │
│   │     ●       │    │     ○       │    │     ○       │    │     ○       │
│   └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
│                                                                         │
│ ═══════════════════════════════════════════════════════════════════════ │
│                                                                         │
│                    [ STAGE CONTENT AREA ]                               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Clicking completed stages:**
- Shows confirmation dialog: "Going back will clear data from this stage and all subsequent stages. Continue?"
- If confirmed, clears data and returns to that stage

---

## Page 6: Stage 1 - Questionnaire Design

### Layout
4-step wizard within Stage 1.

### Sub-progress Indicator
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Stage 1: Questionnaire Design                                           │
│                                                                         │
│    [1. Welcome]  ───  [2. Questions]  ───  [3. Closing]  ───  [4. Preview]
│        ●                   ○                   ○                  ○      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Step 1.1: Welcome Message

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 1: Welcome Message                                                 │
│                                                                         │
│ Set the title and welcome message for your questionnaire. This is the  │
│ first thing respondents will see.                                       │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Questionnaire Title *                                                   │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Consumer Purchasing Behavior Survey                                 │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ 42/50 characters                                                        │
│                                                                         │
│ Welcome Message *                                                       │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Dear Participant,                                                   │ │
│ │                                                                     │ │
│ │ Thank you for taking the time to complete this survey. Your        │ │
│ │ responses will help us understand consumer behavior patterns.      │ │
│ │                                                                     │ │
│ │ This survey takes approximately 5-10 minutes to complete.          │ │
│ │ All responses are anonymous and confidential.                      │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ 234/500 characters                                                      │
│                                                                         │
│ 💡 Tips for a good welcome message:                                     │
│    • State the purpose of the survey                                    │
│    • Mention estimated completion time                                  │
│    • Assure respondents about data confidentiality                     │
│                                                                         │
│                                          [Save Draft]  [Next Step →]    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Step 1.2: Question Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 2: Design Your Questions                                           │
│                                                                         │
│ Add questions to your questionnaire. Aim for 5-30 questions with a     │
│ variety of question types.                                              │
│                                                                         │
├────────────────────────────────┬────────────────────────────────────────┤
│                                │                                        │
│ Your Questions (5)             │ Edit Question                          │
│ ───────────────────            │ ────────────────                       │
│                                │                                        │
│ ┌────────────────────────────┐ │ Question Type                          │
│ │ ≡ 1. What is your gender?  │ │ ┌────────────────────────────────────┐ │
│ │    [Single Choice]     ✏️ 🗑️│ │ │ ○ True/False                      │ │
│ └────────────────────────────┘ │ │ ● Single Choice                    │ │
│ ┌────────────────────────────┐ │ │ ○ Multiple Choice                  │ │
│ │ ≡ 2. What is your age      │ │ │ ○ Satisfaction Scale (1-10)       │ │
│ │    group?                  │ │ └────────────────────────────────────┘ │
│ │    [Single Choice]     ✏️ 🗑️│ │                                        │
│ └────────────────────────────┘ │ Question Content *                     │
│ ┌────────────────────────────┐ │ ┌────────────────────────────────────┐ │
│ │ ≡ 3. Which platforms do    │ │ │ What is your gender?               │ │
│ │    you use for shopping?   │ │ └────────────────────────────────────┘ │
│ │    [Multiple Choice]   ✏️ 🗑️│ │                                        │
│ └────────────────────────────┘ │ Options                                │
│ ┌────────────────────────────┐ │ ┌────────────────────────────────────┐ │
│ │ ≡ 4. Do you prefer online  │ │ │ ≡ Male                         [✕] │ │
│ │    shopping?               │ │ │ ≡ Female                       [✕] │ │
│ │    [True/False]        ✏️ 🗑️│ │ │ ≡ Other                        [✕] │ │
│ └────────────────────────────┘ │ │ ≡ Prefer not to say            [✕] │ │
│ ┌────────────────────────────┐ │ └────────────────────────────────────┘ │
│ │ ≡ 5. Rate your overall     │ │ [+ Add Option]                         │
│ │    shopping satisfaction   │ │                                        │
│ │    [Scale 1-10]        ✏️ 🗑️│ │                                        │
│ └────────────────────────────┘ │ │                                        │
│                                │ ┌──────────────────────────────────┐   │
│ [+ Add Question]               │ │         Save Question            │   │
│                                │ └──────────────────────────────────┘   │
│ ─────────────────────────────  │                                        │
│                                │────────────────────────────────────────│
│ 📚 Recommended Questions       │                                        │
│    from your teacher           │                                        │
│ ┌────────────────────────────┐ │                                        │
│ │ What is your monthly       │ │                                        │
│ │ income range?              │ │                                        │
│ │ [Single Choice]     [Use]  │ │                                        │
│ └────────────────────────────┘ │                                        │
│ ┌────────────────────────────┐ │                                        │
│ │ How satisfied are you with │ │                                        │
│ │ your current lifestyle?    │ │                                        │
│ │ [Scale 1-10]        [Use]  │ │                                        │
│ └────────────────────────────┘ │                                        │
│                                │                                        │
├────────────────────────────────┴────────────────────────────────────────┤
│                                                                         │
│                              [← Back]  [Save Draft]  [Next Step →]      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Question List Features:**
- Drag handle (≡) to reorder questions
- Edit button (✏️) to select and edit in right panel
- Delete button (🗑️) with confirmation

**Question Type Specific Fields:**

*True/False:*
- Only question content, options are fixed: "Yes", "No"

*Single Choice:*
- Question content
- Options list (2-10 options, can add/remove/reorder)

*Multiple Choice:*
- Same as single choice
- Additional: Min selections, Max selections (optional)

*Satisfaction Scale:*
- Question content
- Min label (e.g., "Very Unsatisfied")
- Max label (e.g., "Very Satisfied")
- Scale is fixed 1-10

**Recommended Questions:**
- Collapsible section at bottom of left panel
- Clicking "Use" copies question to "Your Questions" list
- Student can then edit the copied question

---

### Step 1.3: Closing Message

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 3: Closing Message                                                 │
│                                                                         │
│ Set the closing message that respondents will see after completing     │
│ the questionnaire.                                                      │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Closing Message *                                                       │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Thank you for completing this survey!                               │ │
│ │                                                                     │ │
│ │ Your responses are valuable and will contribute to our research    │ │
│ │ on consumer behavior.                                               │ │
│ │                                                                     │ │
│ │ If you have any questions, please contact: research@example.com    │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ 189/500 characters                                                      │
│                                                                         │
│ 💡 Tips for a good closing message:                                     │
│    • Thank the respondent for their time                               │
│    • Briefly mention how their data will be used                       │
│    • Optionally provide contact information                            │
│                                                                         │
│                              [← Back]  [Save Draft]  [Next Step →]      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Step 1.4: Preview & Confirm

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 4: Preview & Confirm                                               │
│                                                                         │
│ Review your questionnaire before finalizing. Once confirmed, you'll    │
│ proceed to the next stage.                                              │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Quality Check                                                           │
│ ─────────────                                                           │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ ✅ Question count: 8 questions (recommended: 5-30)                  │ │
│ │ ✅ Question variety: 4 types used                                   │ │
│ │ ✅ Welcome message: Set                                             │ │
│ │ ✅ Closing message: Set                                             │ │
│ │ ⚠️ Suggestion: Consider adding more scale-type questions for       │ │
│ │    richer statistical analysis                                      │ │
│ │                                                                     │ │
│ │ Preliminary Score: 85/100                                           │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Questionnaire Preview                                                   │
│ ──────────────────────                                                  │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                                                                     │ │
│ │         Consumer Purchasing Behavior Survey                         │ │
│ │         ═══════════════════════════════════                         │ │
│ │                                                                     │ │
│ │ Dear Participant,                                                   │ │
│ │                                                                     │ │
│ │ Thank you for taking the time to complete this survey...           │ │
│ │                                                                     │ │
│ │ ─────────────────────────────────────────────────────────────────── │ │
│ │                                                                     │ │
│ │ 1. What is your gender? *                                          │ │
│ │    ○ Male                                                          │ │
│ │    ○ Female                                                        │ │
│ │    ○ Other                                                         │ │
│ │    ○ Prefer not to say                                             │ │
│ │                                                                     │ │
│ │ 2. What is your age group? *                                       │ │
│ │    ○ 18-24                                                         │ │
│ │    ○ 25-34                                                         │ │
│ │    ○ 35-44                                                         │ │
│ │    ○ 45-54                                                         │ │
│ │    ○ 55+                                                           │ │
│ │                                                                     │ │
│ │ 3. Which platforms do you use for shopping? * (Select all)         │ │
│ │    ☐ Taobao                                                        │ │
│ │    ☐ JD.com                                                        │ │
│ │    ☐ Pinduoduo                                                     │ │
│ │    ☐ Physical stores                                               │ │
│ │    ☐ Other                                                         │ │
│ │                                                                     │ │
│ │ ... (scrollable)                                                   │ │
│ │                                                                     │ │
│ │ ─────────────────────────────────────────────────────────────────── │ │
│ │                                                                     │ │
│ │ Thank you for completing this survey!...                           │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ ⚠️ After confirming, you will proceed to Stage 2. If you return to     │
│    modify the questionnaire later, all subsequent stage data will      │
│    be cleared.                                                          │
│                                                                         │
│                    [← Back to Edit]           [Confirm & Continue →]    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Confirm Dialog:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Confirm Questionnaire Design                                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Are you sure you want to finalize your questionnaire?                  │
│                                                                         │
│ ⚠️ After confirmation:                                                  │
│    • Your questionnaire will be locked for this stage                  │
│    • You will proceed to Stage 2 (Sample Size Planning)                │
│    • If you return to modify later, Stage 2-4 data will be cleared     │
│                                                                         │
│                                      [Cancel]    [Confirm & Continue]   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 7: Stage 2 - Sample Size Planning

### Layout
Single-page calculator with real-time updates.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Stage 2: Sample Size Planning                                           │
│                                                                         │
│ Determine the appropriate sample size for your survey based on         │
│ statistical parameters.                                                 │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Population Information                                                  │
│ ──────────────────────                                                  │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 👥 Total Population Size (N): 10,000 individuals                    │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Parameters                                                              │
│ ──────────                                                              │
│                                                                         │
│ Confidence Level                                                        │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ ○ 90%  (Z = 1.645)                                                  │ │
│ │ ● 95%  (Z = 1.96)    ← Recommended                                  │ │
│ │ ○ 99%  (Z = 2.576)                                                  │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Margin of Error (E)                                                     │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 1% ├────────────●────────────┤ 10%                                  │ │
│ │                                                                     │ │
│ │ Current: 5%                                                         │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Calculation                                                             │
│ ───────────                                                             │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                                                                     │ │
│ │ Formula:  n = (Z² × p × (1-p)) / E²                                 │ │
│ │                                                                     │ │
│ │ Where:                                                              │ │
│ │   • Z = 1.96 (for 95% confidence level)                            │ │
│ │   • p = 0.5 (maximum variance assumption)                          │ │
│ │   • E = 0.05 (5% margin of error)                                  │ │
│ │                                                                     │ │
│ │ Calculation:                                                        │ │
│ │   n = (1.96² × 0.5 × 0.5) / 0.05²                                  │ │
│ │   n = (3.8416 × 0.25) / 0.0025                                     │ │
│ │   n = 0.9604 / 0.0025                                              │ │
│ │   n = 384.16                                                        │ │
│ │                                                                     │ │
│ │ ┌─────────────────────────────────────────────────────────────┐     │ │
│ │ │        Suggested Sample Size: 385                           │     │ │
│ │ └─────────────────────────────────────────────────────────────┘     │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Your Decision                                                           │
│ ─────────────                                                           │
│                                                                         │
│ Final Sample Size (n)                                                   │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                          400                                        │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ ℹ️ You may adjust based on practical considerations.                    │
│    Valid range: 30 - 5,000 (max 50% of population)                     │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 📊 Your sample (400) is 3.9% higher than the suggested size (385)  │ │
│ │    This provides a slightly smaller margin of error.               │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│                    [← Back to Stage 1]        [Confirm & Continue →]    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Real-time Updates:**
- Changing confidence level or margin of error immediately recalculates suggested sample size
- Changing final sample size shows comparison with suggested value

**Validation:**
- Min: 30
- Max: 50% of population (5,000 for N=10,000)
- Show error if out of range

**Confirm Dialog:**
Same pattern as Stage 1.

---

## Page 8: Stage 3 - Sampling Execution

### Layout
Three tabs for three sampling methods. All three must be completed.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Stage 3: Sampling Execution                                             │
│                                                                         │
│ Execute all three sampling methods to collect your samples.            │
│ Target sample size: 400                                                 │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ┌─────────────────────┬─────────────────────┬─────────────────────┐    │
│ │ Simple Random  ✓    │ Systematic          │ Stratified          │    │
│ │                     │ Sampling            │ Sampling            │    │
│ └─────────────────────┴─────────────────────┴─────────────────────┘    │
│                                                                         │
│              [ TAB CONTENT - SEE BELOW ]                               │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Progress: 1/3 methods completed                                         │
│ ████░░░░░░░░                                                            │
│                                                                         │
│                    [← Back to Stage 2]        [Complete Stage 3 →]      │
│                                          (enabled when all 3 complete)  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Tab Header States:**
- ○ Not completed (no checkmark)
- ✓ Completed (green checkmark)

---

### Tab 8.1: Simple Random Sampling

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Simple Random Sampling                                                  │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 📖 What is Simple Random Sampling?                                  │ │
│ │                                                                     │ │
│ │ Each individual in the population has an equal probability of      │ │
│ │ being selected. This is the most basic form of probability         │ │
│ │ sampling and serves as a baseline for comparison.                  │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Configuration                                                           │
│ ─────────────                                                           │
│                                                                         │
│ Population size (N): 10,000                                             │
│ Sample size (n): 400                                                    │
│                                                                         │
│ 📋 400 individuals will be randomly selected from the population.      │
│                                                                         │
│                    ┌─────────────────────────┐                          │
│                    │    Execute Sampling     │                          │
│                    └─────────────────────────┘                          │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Results (after execution)                                               │
│ ───────────────────────────                                             │
│                                                                         │
│ ✅ Sampling completed! 400 individuals selected.                        │
│                                                                         │
│ Sample Preview:                                                         │
│ ┌─────────┬────────┬─────┬──────────┬────────┐                         │
│ │ ID      │ Gender │ Age │ Income   │ Region │                         │
│ ├─────────┼────────┼─────┼──────────┼────────┤                         │
│ │ 0472    │ Female │ 34  │ 7,500    │ East   │                         │
│ │ 2891    │ Male   │ 28  │ 5,200    │ West   │                         │
│ │ 1056    │ Female │ 45  │ 12,000   │ North  │                         │
│ │ 8234    │ Male   │ 31  │ 8,800    │ South  │                         │
│ │ 4521    │ Female │ 52  │ 15,000   │ East   │                         │
│ │ ...     │ ...    │ ... │ ...      │ ...    │                         │
│ └─────────┴────────┴─────┴──────────┴────────┘                         │
│ Showing 5 of 400 samples                                                │
│                                                                         │
│                    ┌─────────────────────────┐                          │
│                    │    Re-execute Sampling  │                          │
│                    └─────────────────────────┘                          │
│                    (This will replace current results)                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Tab 8.2: Systematic Sampling

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Systematic Sampling                                                     │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 📖 What is Systematic Sampling?                                     │ │
│ │                                                                     │ │
│ │ Select every K-th individual from the population after a random    │ │
│ │ starting point. This method is efficient and ensures even          │ │
│ │ distribution across the ordered population.                        │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Configuration                                                           │
│ ─────────────                                                           │
│                                                                         │
│ Population size (N): 10,000                                             │
│ Target sample size (n): 400                                             │
│                                                                         │
│ Sampling Interval (K)                                                   │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                          25                                         │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ 💡 Suggested K = N/n = 10,000/400 = 25                                  │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 📊 With K = 25, you will select approximately 400 samples.         │ │
│ │    (Starting from a random point, then every 25th individual)      │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ⚠️ Warning states (if applicable):                                      │
│    • "K is too large - sample size will be less than 400"              │
│    • "K is too small - sample size will exceed 400"                    │
│                                                                         │
│                    ┌─────────────────────────┐                          │
│                    │    Execute Sampling     │                          │
│                    └─────────────────────────┘                          │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Results (after execution)                                               │
│ ───────────────────────────                                             │
│                                                                         │
│ ✅ Sampling completed!                                                  │
│    Starting point: 7                                                    │
│    Interval (K): 25                                                     │
│    Actual samples: 400                                                  │
│                                                                         │
│ Sample Preview:                                                         │
│ ┌─────────┬────────┬─────┬──────────┬────────┐                         │
│ │ ID      │ Gender │ Age │ Income   │ Region │                         │
│ ├─────────┼────────┼─────┼──────────┼────────┤                         │
│ │ 0007    │ Male   │ 29  │ 6,200    │ West   │                         │
│ │ 0032    │ Female │ 41  │ 9,500    │ East   │                         │
│ │ 0057    │ Male   │ 35  │ 7,800    │ North  │                         │
│ │ ...     │ ...    │ ... │ ...      │ ...    │                         │
│ └─────────┴────────┴─────┴──────────┴────────┘                         │
│                                                                         │
│                    ┌─────────────────────────┐                          │
│                    │    Re-execute Sampling  │                          │
│                    └─────────────────────────┘                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Tab 8.3: Stratified Sampling

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Stratified Sampling                                                     │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 📖 What is Stratified Sampling?                                     │ │
│ │                                                                     │ │
│ │ Divide the population into distinct subgroups (strata) based on    │ │
│ │ a characteristic, then randomly sample from each stratum. This     │ │
│ │ ensures representation from all subgroups.                         │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Step 1: Select Stratification Variable                                  │
│ ──────────────────────────────────────                                  │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Stratify by:  [Gender                                          ▼]  │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Step 2: Population Strata Overview                                      │
│ ──────────────────────────────────                                      │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Stratum        │ Population │ Percentage │                          │ │
│ ├────────────────┼────────────┼────────────┤                          │ │
│ │ Male           │ 5,800      │ 58%        │ ████████████             │ │
│ │ Female         │ 4,200      │ 42%        │ █████████                │ │
│ ├────────────────┼────────────┼────────────┤                          │ │
│ │ Total          │ 10,000     │ 100%       │                          │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Step 3: Allocate Sample Size                                            │
│ ────────────────────────────                                            │
│                                                                         │
│ Target sample size: 400                                                 │
│                                                                         │
│ Quick allocation:                                                       │
│ ┌───────────────────────┐  ┌───────────────────────┐                   │
│ │ Proportional (58/42)  │  │ Equal (50/50)         │                   │
│ └───────────────────────┘  └───────────────────────┘                   │
│                                                                         │
│ Manual allocation:                                                      │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Stratum        │ Population │ Sample Size │                         │ │
│ ├────────────────┼────────────┼─────────────┤                         │ │
│ │ Male           │ 5,800      │ [   232   ] │ (58% of 400)            │ │
│ │ Female         │ 4,200      │ [   168   ] │ (42% of 400)            │ │
│ ├────────────────┼────────────┼─────────────┤                         │ │
│ │ Total          │ 10,000     │     400     │ ✓ Matches target        │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ⚠️ Warning (if total ≠ target):                                         │
│    "Total sample size (405) does not match target (400)"               │
│                                                                         │
│                    ┌─────────────────────────┐                          │
│                    │    Execute Sampling     │                          │
│                    └─────────────────────────┘                          │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Results (after execution)                                               │
│ ───────────────────────────                                             │
│                                                                         │
│ ✅ Sampling completed!                                                  │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Stratum        │ Target     │ Actual     │ Status                   │ │
│ ├────────────────┼────────────┼────────────┼──────────────────────────┤ │
│ │ Male           │ 232        │ 232        │ ✓                        │ │
│ │ Female         │ 168        │ 168        │ ✓                        │ │
│ ├────────────────┼────────────┼────────────┼──────────────────────────┤ │
│ │ Total          │ 400        │ 400        │ ✓                        │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Sample Preview:                                                         │
│ ┌─────────┬────────┬─────┬──────────┬────────┬──────────┐              │
│ │ ID      │ Gender │ Age │ Income   │ Region │ Stratum  │              │
│ ├─────────┼────────┼─────┼──────────┼────────┼──────────┤              │
│ │ 0234    │ Male   │ 33  │ 8,100    │ East   │ Male     │              │
│ │ 1892    │ Female │ 27  │ 5,900    │ West   │ Female   │              │
│ │ ...     │ ...    │ ... │ ...      │ ...    │ ...      │              │
│ └─────────┴────────┴─────┴──────────┴────────┴──────────┘              │
│                                                                         │
│                    ┌─────────────────────────┐                          │
│                    │    Re-execute Sampling  │                          │
│                    └─────────────────────────┘                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 9: Stage 4 - Analysis & Report

### Layout
Three sections: Charts, Data Export, Report Writing.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Stage 4: Analysis & Report                                              │
│                                                                         │
│ Review the automatically generated analysis charts, export data if     │
│ needed, and write your analysis report.                                │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ┌─────────────────────┬─────────────────────┬─────────────────────┐    │
│ │ 📊 Charts           │ 💾 Data Export      │ 📝 Report           │    │
│ └─────────────────────┴─────────────────────┴─────────────────────┘    │
│                                                                         │
│              [ TAB CONTENT - SEE BELOW ]                               │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                    [← Back to Stage 3]        [Preview & Submit →]      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Tab 9.1: Charts

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Analysis Charts                                                         │
│                                                                         │
│ These charts compare results across the three sampling methods and     │
│ the true population values.                                             │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Select Variable: [Income                                            ▼]  │
│                  [Age, Income, Satisfaction Score...]                   │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Chart A: Mean Comparison                                                │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                                                                     │ │
│ │     Income Mean Comparison                                          │ │
│ │                                                                     │ │
│ │  12,000 ┤                                                           │ │
│ │         │                                                           │ │
│ │  10,000 ┤    ████                                                   │ │
│ │         │    ████  ████  ████  ████                                 │ │
│ │   8,000 ┤    ████  ████  ████  ████                                 │ │
│ │         │    ████  ████  ████  ████                                 │ │
│ │   6,000 ┤    ████  ████  ████  ████                                 │ │
│ │         │    ████  ████  ████  ████                                 │ │
│ │   4,000 ┤    ████  ████  ████  ████                                 │ │
│ │         │    ████  ████  ████  ████                                 │ │
│ │   2,000 ┤    ████  ████  ████  ████                                 │ │
│ │         │    ████  ████  ████  ████                                 │ │
│ │       0 ┼────────────────────────────                               │ │
│ │           Population  Simple  Systematic  Stratified                │ │
│ │             9,850     9,723     9,891       9,834                   │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Chart B: Distribution Comparison                                        │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                                                                     │ │
│ │     Income Distribution                                             │ │
│ │                                                                     │ │
│ │         ╱╲                                                          │ │
│ │        ╱  ╲    ── Population                                        │ │
│ │       ╱    ╲   ── Simple Random                                     │ │
│ │      ╱      ╲  ── Systematic                                        │ │
│ │     ╱        ╲ ── Stratified                                        │ │
│ │    ╱          ╲                                                     │ │
│ │   ╱            ╲                                                    │ │
│ │  ╱              ╲                                                   │ │
│ │ ╱                ╲                                                  │ │
│ │╱                  ╲                                                 │ │
│ │────────────────────────────────                                     │ │
│ │ 0    5k    10k    15k    20k    25k                                │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Select Variable: [Gender                                            ▼]  │
│                  [Gender, Region, Occupation...]                        │
│                                                                         │
│ Chart C: Proportion Comparison (for categorical variables)              │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                                                                     │ │
│ │     Gender Proportion Comparison                                    │ │
│ │                                                                     │ │
│ │              Male                    Female                         │ │
│ │     ┌─────────────────────┐ ┌─────────────────────┐                │ │
│ │     │ ▓▓▓▓ ▓▓▓▓ ▓▓▓▓ ▓▓▓▓│ │ ░░░░ ░░░░ ░░░░ ░░░░│                │ │
│ │     │ 58%  57%  59%  58% │ │ 42%  43%  41%  42% │                │ │
│ │     │ Pop  SRS  Sys  Str │ │ Pop  SRS  Sys  Str │                │ │
│ │     └─────────────────────┘ └─────────────────────┘                │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Chart D: Error Summary Table                                            │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                                                                     │ │
│ │ Variable    │ Population │ Simple  │ Systematic │ Stratified │     │ │
│ │             │ True Value │ Random  │            │            │     │ │
│ ├─────────────┼────────────┼─────────┼────────────┼────────────┤     │ │
│ │ Income Mean │ 9,850      │ 9,723   │ 9,891      │ 9,834      │     │ │
│ │   Error     │ -          │ -1.29%  │ +0.42%     │ -0.16%     │     │ │
│ ├─────────────┼────────────┼─────────┼────────────┼────────────┤     │ │
│ │ Age Mean    │ 38.5       │ 37.9    │ 38.8       │ 38.4       │     │ │
│ │   Error     │ -          │ -1.56%  │ +0.78%     │ -0.26%     │     │ │
│ ├─────────────┼────────────┼─────────┼────────────┼────────────┤     │ │
│ │ Male %      │ 58.0%      │ 57.2%   │ 59.1%      │ 58.0%      │     │ │
│ │   Error     │ -          │ -0.80%  │ +1.10%     │ 0.00%      │     │ │
│ ├─────────────┼────────────┼─────────┼────────────┼────────────┤     │ │
│ │ Avg Error   │ -          │ 1.22%   │ 0.77%      │ 0.14%      │     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ 📊 Stratified sampling shows the lowest average error in this case.    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Chart Interactions:**
- Hover to see exact values
- Click to zoom/expand
- Variable selector to switch between different numeric/categorical variables

---

### Tab 9.2: Data Export

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Data Export                                                             │
│                                                                         │
│ Download your sample data for further analysis in tools like SPSS,     │
│ R, or Excel.                                                            │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Available Downloads                                                     │
│ ───────────────────                                                     │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 📄 Simple Random Sampling Results                                   │ │
│ │    400 records • CSV format                                         │ │
│ │                                              [Download]              │ │
│ ├─────────────────────────────────────────────────────────────────────┤ │
│ │ 📄 Systematic Sampling Results                                      │ │
│ │    400 records • CSV format                                         │ │
│ │                                              [Download]              │ │
│ ├─────────────────────────────────────────────────────────────────────┤ │
│ │ 📄 Stratified Sampling Results                                      │ │
│ │    400 records • CSV format                                         │ │
│ │                                              [Download]              │ │
│ ├─────────────────────────────────────────────────────────────────────┤ │
│ │ 📦 All Samples (Combined)                                           │ │
│ │    1,200 records • CSV format • Includes method identifier column   │ │
│ │                                              [Download]              │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ 💡 Tip: Use these datasets for additional statistical analysis in      │
│    your preferred software. The combined file includes a "Method"      │
│    column to identify which sampling method each record came from.     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Tab 9.3: Report Writing

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Analysis Report                                                         │
│                                                                         │
│ Write your analysis based on the charts above. Explain which sampling  │
│ method performed best and why.                                          │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ 📝 Your Analysis                                                        │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                                                                     │ │
│ │ Based on the analysis of the three sampling methods, stratified    │ │
│ │ sampling produced results closest to the true population values.   │ │
│ │                                                                     │ │
│ │ The error analysis shows that:                                      │ │
│ │                                                                     │ │
│ │ 1. Stratified sampling achieved the lowest average error (0.14%), │ │
│ │    particularly for the gender proportion which matched exactly.   │ │
│ │                                                                     │ │
│ │ 2. Systematic sampling performed moderately well with 0.77%        │ │
│ │    average error, showing slight overestimation in some variables. │ │
│ │                                                                     │ │
│ │ 3. Simple random sampling had the highest error at 1.22%,          │ │
│ │    demonstrating more variance in the results.                     │ │
│ │                                                                     │ │
│ │ The superior performance of stratified sampling can be attributed  │ │
│ │ to its ability to ensure proportional representation of key        │ │
│ │ subgroups (gender in this case), reducing sampling bias...         │ │
│ │                                                                     │ │
│ │ |                                                                   │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Character count: 847 / 2000 (minimum: 100)                              │
│ ✅ Meets minimum requirement                                            │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ 💡 Writing tips:                                                        │
│    • Compare the three sampling methods' results                       │
│    • Identify which method best approximates the population            │
│    • Explain possible reasons for the differences                      │
│    • Discuss practical implications of your findings                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 10: Submission Preview

### Layout
Final review before submitting.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Review & Submit                                                         │
│                                                                         │
│ Please review your work before submitting. Once submitted, you cannot  │
│ make changes.                                                           │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ┌─────────────────────┬─────────────────────┐                          │
│ │ 📋 Questionnaire    │ 📊 Experiment Report│                          │
│ └─────────────────────┴─────────────────────┘                          │
│                                                                         │
│ [Preview Content Area - PDF-like view]                                 │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                                                                     │ │
│ │                    Consumer Behavior Survey                         │ │
│ │                    ─────────────────────────                        │ │
│ │                                                                     │ │
│ │ Student: Chen Xiaoming (2024010001)                                │ │
│ │ Class: Statistics 101 - Section A                                   │ │
│ │ Topic: Consumer Behavior Survey                                     │ │
│ │ Submission Date: March 15, 2024                                     │ │
│ │                                                                     │ │
│ │ ─────────────────────────────────────────────────────────────────── │ │
│ │                                                                     │ │
│ │ PART 1: QUESTIONNAIRE DESIGN                                        │ │
│ │                                                                     │ │
│ │ [Full questionnaire content...]                                     │ │
│ │                                                                     │ │
│ │ ─────────────────────────────────────────────────────────────────── │ │
│ │                                                                     │ │
│ │ PART 2: SAMPLE SIZE PLANNING                                        │ │
│ │                                                                     │ │
│ │ Population: 10,000                                                  │ │
│ │ Confidence Level: 95%                                               │ │
│ │ Margin of Error: 5%                                                 │ │
│ │ Final Sample Size: 400                                              │ │
│ │                                                                     │ │
│ │ [Continues...]                                                      │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Submission Checklist                                                    │
│ ────────────────────                                                    │
│ ✅ Questionnaire completed (8 questions)                                │
│ ✅ Sample size planned (n = 400)                                        │
│ ✅ All three sampling methods executed                                  │
│ ✅ Analysis report written (847 characters)                             │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│                    [← Back to Edit]           [Submit Experiment]       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Submit Confirmation Dialog:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Confirm Submission                                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Are you sure you want to submit your experiment?                       │
│                                                                         │
│ ⚠️ After submission:                                                    │
│    • You cannot modify your work                                        │
│    • Your submission will be sent to your teacher for grading          │
│    • You will receive a notification when grading is complete          │
│                                                                         │
│                                        [Cancel]    [Confirm Submit]     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**After Submission:**
- Success toast: "Submission successful! Your teacher will review your work."
- Redirect to Task Hall
- Task card now shows "Submitted" status

---

## Page 11: Results Page (After Grading)

### Layout
View grades and feedback after teacher completes grading.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ← Back to My Experiments                                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Consumer Behavior Survey - Results                                      │
│ ══════════════════════════════════                                      │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Overall Score                                                           │
│ ─────────────                                                           │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                                                                     │ │
│ │                         🎉                                          │ │
│ │                                                                     │ │
│ │                        85                                           │ │
│ │                       ─────                                         │ │
│ │                       points                                        │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Score Breakdown                                                         │
│ ───────────────                                                         │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Component              │ Weight │ Score    │ Weighted Score         │ │
│ ├────────────────────────┼────────┼──────────┼────────────────────────┤ │
│ │ Questionnaire Design   │ 30%    │ 88/100   │ 26.4                   │ │
│ │ Experiment Process     │ 40%    │ 82/100   │ 32.8                   │ │
│ │ Analysis Report        │ 30%    │ 86/100   │ 25.8                   │ │
│ ├────────────────────────┼────────┼──────────┼────────────────────────┤ │
│ │ Total                  │ 100%   │          │ 85.0                   │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Teacher's Comment                                                       │
│ ─────────────────                                                       │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Good work overall! Your questionnaire design was well-structured   │ │
│ │ with a nice variety of question types. The sampling execution was  │ │
│ │ correct, and your analysis correctly identified stratified         │ │
│ │ sampling as the best method for this dataset.                      │ │
│ │                                                                     │ │
│ │ For improvement: Consider discussing more about why stratified     │ │
│ │ sampling works better when there are significant subgroup          │ │
│ │ differences in the population.                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Submitted: March 15, 2024 14:30                                         │
│ Graded: March 18, 2024 09:15                                            │
│                                                                         │
│ ┌─────────────────────────┐  ┌─────────────────────────┐               │
│ │ View Questionnaire PDF  │  │ View Report PDF         │               │
│ └─────────────────────────┘  └─────────────────────────┘               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 12: Rejection Page

### Layout
Shown when submission is rejected.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ← Back to My Experiments                                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Consumer Behavior Survey - Feedback                                     │
│ ═══════════════════════════════════                                     │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                                                                     │ │
│ │  ❌ Submission Rejected                                             │ │
│ │                                                                     │ │
│ │  Your submission requires revision. Please read the feedback       │ │
│ │  below and redo the experiment.                                    │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Teacher's Feedback                                                      │
│ ──────────────────                                                      │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Your questionnaire lacks variety in question types - all 10        │ │
│ │ questions are single-choice. Please include at least one           │ │
│ │ satisfaction scale question and one multiple-choice question.      │ │
│ │                                                                     │ │
│ │ Additionally, your analysis report is too brief and doesn't        │ │
│ │ adequately explain why the different sampling methods produced     │ │
│ │ different results.                                                  │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Previous Submission                                                     │
│ ───────────────────                                                     │
│                                                                         │
│ Submitted: March 10, 2024 16:45                                         │
│ Rejected: March 12, 2024 10:30                                          │
│                                                                         │
│ ┌─────────────────────────┐  ┌─────────────────────────┐               │
│ │ View Questionnaire PDF  │  │ View Report PDF         │               │
│ └─────────────────────────┘  └─────────────────────────┘               │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ ⚠️ Note: Redoing the experiment will start fresh from Stage 1.         │
│    Your previous work will be saved in the history.                    │
│                                                                         │
│                         ┌─────────────────────────────┐                │
│                         │   Start New Attempt         │                │
│                         └─────────────────────────────┘                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Start New Attempt Confirmation:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Start New Attempt                                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Are you sure you want to start a new attempt?                          │
│                                                                         │
│ • You will begin from Stage 1 (Questionnaire Design)                   │
│ • Your previous submission will be saved in History                    │
│ • You can reference the teacher's feedback while working               │
│                                                                         │
│                                      [Cancel]    [Start New Attempt]    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Common UI Patterns

### Stage Navigation Warning
When clicking on a completed stage to go back:
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Return to Previous Stage?                                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ⚠️ Warning: Going back to Stage 1 will clear all data from:            │
│                                                                         │
│    • Stage 2: Sample Size Planning                                     │
│    • Stage 3: Sampling Execution                                       │
│    • Stage 4: Analysis & Report                                        │
│                                                                         │
│ This action cannot be undone. Are you sure?                            │
│                                                                         │
│                                  [Cancel]    [Go Back & Clear Data]    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Auto-save Indicator
Show in corner during editing:
- "Saving..." (with spinner)
- "All changes saved" (with checkmark)
- "Save failed - click to retry" (with error icon)

### Progress Persistence
When user leaves and returns:
- Automatically restore to last position
- Show toast: "Welcome back! Continuing from Stage 2..."

### Toast Notifications
- Success: "Stage completed!", "Submission successful!"
- Info: "Draft saved", "Changes saved automatically"
- Warning: "Please fill in all required fields"
- Error: "Failed to save. Please try again."

### Loading States
- Full page spinner for initial load
- Skeleton loaders for content areas
- Button spinners during actions

### Mobile Responsiveness
- Single column layout on mobile
- Bottom navigation for stage progress
- Collapsible sections
- Touch-friendly buttons and inputs

---

## Color Scheme

### Primary Colors
- Primary: Blue (#3B82F6)
- Success: Green (#22C55E)
- Warning: Amber (#F59E0B)
- Error: Red (#EF4444)
- Neutral: Gray (#6B7280)

### Status Colors
- Not Started: Gray (#9CA3AF)
- In Progress: Blue (#3B82F6)
- Submitted: Orange (#F97316)
- Graded: Green (#22C55E)
- Rejected: Red (#EF4444)

### Stage Progress Colors
- Completed: Green (#22C55E)
- Current: Blue (#3B82F6)
- Upcoming: Gray (#D1D5DB)

---

## Sample Prompt for AI Tools

```
Create a student experiment interface for a statistical sampling simulation system with these features:

1. Login page with student ID/password, and first-login password change modal with validation (8+ chars, letters + numbers).

2. Task Hall - Grid of task cards showing: topic name, description preview, publish date, deadline, days remaining, status badge (Not Started/In Progress/Submitted/Graded/Rejected). Each card has action buttons based on status. Include history dialog showing past submission attempts.

3. Topic Detail page - Shows topic name, deadline, population size, full description, downloadable attachments, and a 4-stage progress indicator. "Start Experiment" button.

4. Stage 1: Questionnaire Design - 4-step wizard:
   - Step 1: Title and welcome message inputs
   - Step 2: Split view with question list (drag to reorder) on left, question editor on right. Support 4 types: True/False, Single Choice, Multiple Choice, 1-10 Scale. Include "Recommended Questions" from teacher.
   - Step 3: Closing message input
   - Step 4: Quality check display (question count, variety, preliminary score) and full questionnaire preview

5. Stage 2: Sample Size Planning - Show population size, confidence level radio (90/95/99%), margin of error slider (1-10%), formula display with calculation steps, suggested sample size, and final sample size input with validation.

6. Stage 3: Sampling Execution - 3 tabs that must all be completed:
   - Simple Random: Execute button, results preview table
   - Systematic: K value input with suggestion, execute button, results
   - Stratified: Variable selector dropdown, strata overview table, proportional/equal allocation buttons, manual allocation inputs, execute button, results by stratum

7. Stage 4: Analysis & Report - 3 tabs:
   - Charts: Variable selector, mean comparison bar chart, distribution curves, proportion comparison for categorical vars, error summary table
   - Data Export: Download buttons for each method's CSV and combined CSV
   - Report: Rich text editor with character count (100-2000), writing tips

8. Submission Preview - Tab view of questionnaire and report, submission checklist, confirm submit dialog

9. Results Page (after grading) - Large score display, breakdown table (3 components with weights), teacher's comment, PDF download buttons

10. Rejection Page - Rejection notice, teacher's feedback, previous submission links, "Start New Attempt" button

Include stage navigation with warning when going back (clears subsequent data). Use React, Tailwind, shadcn/ui. Clean educational interface with clear progress indicators. Status colors: gray (not started), blue (in progress), orange (submitted), green (graded), red (rejected).
```

---

*End of specification*
