# Student Panel UI Specification for Statistical Sampling Simulation System V2.0

## Overview

This document describes the UI specification for the Student Panel (学生端) based on Database Design V2.0. Changes from V1.0 are marked with **【V2.0】**.

### Key V2.0 Changes for Student Panel
- Account status check on login (disabled accounts cannot login)
- Login logging
- Unread announcement badge and tracking (marks as read on view)

---

## Global Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Logo          System Name              🔔 (1)   Student Name    Logout  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                          Main Content Area                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Header Components:**
- Logo and system name on the left
- **【V2.0】** Notification bell with unread announcement count badge
- Student name and logout button on the right

---

## Page 1: Login

### Layout
Centered login card on a clean background

### Components

**Login Card:**
```
┌─────────────────────────────────────────────┐
│                                             │
│         Statistical Sampling                │
│       Virtual Simulation System             │
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
│   Forgot password? Contact your teacher.   │
│                                             │
└─────────────────────────────────────────────┘
```

**【V2.0】 Login Flow:**
1. Validate credentials
2. Check account status (status = 1)
   - If disabled: Show error "Your account has been disabled. Please contact the administrator."
3. Check first login flag
4. If first login: redirect to password change
5. **Record login to login_log**
6. Redirect to Task Hall

**Error Messages:**
- "Invalid student ID or password"
- **【V2.0】** "Your account has been disabled. Please contact the administrator."

---

## Page 2: First Login Password Change

### Trigger
When `is_first_login = 1`

### Layout
Centered card, cannot be skipped

### Components
```
┌─────────────────────────────────────────────┐
│                                             │
│       🔐 Welcome! Please Set Your Password  │
│                                             │
│   For security, please change your          │
│   password on first login.                  │
│                                             │
│   New Password                              │
│   ┌─────────────────────────────────────┐   │
│   │ ••••••••••                          │   │
│   └─────────────────────────────────────┘   │
│   ✓ At least 8 characters                   │
│   ✓ Contains letters                        │
│   ✓ Contains numbers                        │
│                                             │
│   Confirm Password                          │
│   ┌─────────────────────────────────────┐   │
│   │ ••••••••••                          │   │
│   └─────────────────────────────────────┘   │
│   ✓ Passwords match                         │
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │         Confirm Change              │   │
│   └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

**Validation:**
- Real-time validation as user types
- Button enabled only when all checks pass

---

## Page 3: Task Hall (Home)

### Layout
Main dashboard showing all assigned tasks

### Components

**【V2.0】 Announcement Banner (if unread announcements exist):**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📢 New Announcement: System Maintenance on March 20th...    [View All] │
└─────────────────────────────────────────────────────────────────────────┘
```
- Clicking "View All" opens announcement list
- Viewing an announcement marks it as read
- Banner disappears when all announcements are read

**Task Cards Grid (2-3 columns on desktop, 1 on mobile):**

```
┌────────────────────────────────────┐  ┌────────────────────────────────────┐
│ 📊 Consumer Behavior Survey        │  │ 📊 Market Research Methods         │
│                                    │  │                                    │
│ Study on consumer purchasing       │  │ Learn different sampling           │
│ behavior in urban areas...         │  │ techniques through practice...     │
│                                    │  │                                    │
│ ┌──────────────────────────────┐   │  │ ┌──────────────────────────────┐   │
│ │ 🔵 In Progress               │   │  │ │ ⚪ Not Started               │   │
│ └──────────────────────────────┘   │  │ └──────────────────────────────┘   │
│                                    │  │                                    │
│ 📅 Published: Mar 1, 2024          │  │ 📅 Published: Mar 10, 2024         │
│ ⏰ Deadline: Mar 31, 2024          │  │ ⏰ Deadline: Apr 15, 2024          │
│ 🕐 16 days remaining               │  │ 🕐 31 days remaining               │
│                                    │  │                                    │
│ [Continue Experiment] [History]    │  │ [Start Experiment] [History]       │
└────────────────────────────────────┘  └────────────────────────────────────┘

┌────────────────────────────────────┐  ┌────────────────────────────────────┐
│ 📊 Healthcare Access Survey        │  │ 📊 Education Quality Survey        │
│                                    │  │                                    │
│ Study on healthcare accessibility  │  │ Survey on educational resources... │
│ in rural communities...            │  │                                    │
│                                    │  │                                    │
│ ┌──────────────────────────────┐   │  │ ┌──────────────────────────────┐   │
│ │ 🟡 Submitted                 │   │  │ │ 🟢 Graded                    │   │
│ └──────────────────────────────┘   │  │ └──────────────────────────────┘   │
│                                    │  │                                    │
│ 📅 Published: Feb 15, 2024         │  │ 📅 Published: Feb 1, 2024          │
│ ⏰ Deadline: Mar 15, 2024          │  │ ⏰ Deadline: Feb 28, 2024          │
│ 🕐 Waiting for grading             │  │ 🕐 Score: 87 points                │
│                                    │  │                                    │
│ [View Submission] [History]        │  │ [View Score] [History]             │
└────────────────────────────────────┘  └────────────────────────────────────┘
```

**Status Badges:**
| Status | Badge | Actions |
|--------|-------|---------|
| Not Started | ⚪ Gray | Start Experiment |
| In Progress | 🔵 Blue | Continue Experiment |
| Submitted | 🟡 Yellow | View Submission |
| Graded | 🟢 Green | View Score |
| Rejected | 🔴 Red | View Feedback |

---

## Page 3.1: Announcement List

### Trigger
Click notification bell or "View All" on banner

### Layout
Modal or slide-over panel

### Components
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📢 Announcements                                               [Close] │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 🔵 System Maintenance Notice                            Mar 15, 2024│ │
│ │ The system will undergo maintenance on March 20th...               │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ ⚪ Welcome to the New Semester                          Mar 1, 2024 │ │
│ │ Welcome back! This semester we have exciting new...                │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

**【V2.0】 Read Status:**
- 🔵 Blue dot: Unread
- ⚪ No dot: Already read
- Clicking an announcement opens detail and marks as read

---

## Page 3.2: History Dialog

### Trigger
Click "History" link on task card

### Layout
Modal showing all submission attempts

### Components
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📜 Submission History: Consumer Behavior Survey                [Close] │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Attempt #2 - Submitted: 2024-03-15 14:30             🟢 Graded     │ │
│ │ Score: 85 points                                                   │ │
│ │ [View Questionnaire PDF]  [View Report PDF]                        │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Attempt #1 - Submitted: 2024-03-10 09:15             🔴 Rejected   │ │
│ │ Reason: Questionnaire design lacks variety...                      │ │
│ │ [View Questionnaire PDF]  [View Report PDF]                        │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 4: Topic Detail

### Trigger
Click task card

### Layout
Full page with topic information and experiment entry

### Components
```
┌─────────────────────────────────────────────────────────────────────────┐
│ ← Back to Task Hall                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│ 📊 Consumer Behavior Survey                                             │
│                                                                         │
│ 📅 Deadline: March 31, 2024 (16 days remaining)                        │
│ 📊 Population Size: 10,000 individuals                                  │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│ Background                                                              │
│                                                                         │
│ This research aims to understand the purchasing behavior and           │
│ preferences of urban consumers. You will design a questionnaire,       │
│ determine the appropriate sample size, and execute three different     │
│ sampling methods to analyze which best represents the population.      │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│ Attachments                                                             │
│ 📄 research_background.pdf (2.5 MB)                    [Preview]       │
│ 🖼️ sample_demographics.png (450 KB)                    [Preview]       │
│ 🎬 introduction_video.mp4 (125 MB)                     [Download]      │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│ Your Progress                                                           │
│                                                                         │
│ [●]────────[○]────────[○]────────[○]                                   │
│  1          2          3          4                                     │
│ Questionnaire  Sample    Sampling  Analysis                             │
│   Design      Planning  Execution  & Report                             │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                    Continue Experiment →                           │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 5: Stage 1 - Questionnaire Design

### Layout
Multi-step wizard within the stage

### Step 1.1: Welcome Message
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Stage 1: Questionnaire Design                                           │
│ Step 1 of 4: Welcome Message                                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Questionnaire Title *                                                   │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Consumer Purchasing Behavior Survey                                 │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ 38/50 characters                                                        │
│                                                                         │
│ Welcome Message *                                                       │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ [B] [I] [U] [• List]                                               │ │
│ ├─────────────────────────────────────────────────────────────────────┤ │
│ │ Dear Respondent,                                                    │ │
│ │                                                                     │ │
│ │ Thank you for participating in this survey. This questionnaire     │ │
│ │ aims to understand consumer purchasing behavior...                  │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ 156/500 characters                                                      │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                          [Next Step →] │
└─────────────────────────────────────────────────────────────────────────┘
```

### Step 1.2: Question Design
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 2 of 4: Question Design                                            │
├─────────────────────┬───────────────────────────────────────────────────┤
│ My Questions (8)    │ Question Editor                                   │
│                     │                                                   │
│ [+ Add Question]    │ Editing Question #3                               │
│                     │                                                   │
│ ≡ 1. Your gender?   │ Question Type:                                    │
│ ≡ 2. Your age?      │ ○ True/False  ● Single Choice                    │
│ ≡ 3. Income level ← │ ○ Multiple Choice  ○ Satisfaction Scale          │
│ ≡ 4. Education      │                                                   │
│ ≡ 5. Shopping freq  │ Question Content *                                │
│ ...                 │ ┌───────────────────────────────────────────────┐ │
│                     │ │ What is your monthly income level?            │ │
│                     │ └───────────────────────────────────────────────┘ │
│                     │                                                   │
│                     │ Options                                           │
│                     │ ┌───────────────────────────────────────────────┐ │
│                     │ │ A. Less than ¥3,000                      [×] │ │
│                     │ │ B. ¥3,000 - ¥6,000                       [×] │ │
│                     │ │ C. ¥6,000 - ¥10,000                      [×] │ │
│                     │ │ D. More than ¥10,000                     [×] │ │
│                     │ │ [+ Add Option]                               │ │
│                     │ └───────────────────────────────────────────────┘ │
│                     │                                                   │
├─────────────────────┴───────────────────────────────────────────────────┤
│ Recommended Questions (from teacher)                          [Expand] │
├─────────────────────────────────────────────────────────────────────────┤
│                                        [← Previous]  [Next Step →]     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Step 1.3: Closing Message
Similar to welcome message, with closing text

### Step 1.4: Preview & Confirm
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 4 of 4: Preview & Confirm                                          │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                   Questionnaire Preview                             │ │
│ │                                                                     │ │
│ │ Consumer Purchasing Behavior Survey                                 │ │
│ │                                                                     │ │
│ │ Dear Respondent, Thank you for participating...                     │ │
│ │                                                                     │ │
│ │ 1. What is your gender?                                             │ │
│ │    ○ Male  ○ Female                                                │ │
│ │                                                                     │ │
│ │ 2. What is your age group?                                          │ │
│ │    ○ 18-25  ○ 26-35  ○ 36-45  ○ 46+                                │ │
│ │                                                                     │ │
│ │ ... (scrollable)                                                    │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Quality Check Results:                                                  │
│ ✓ Question count: 12 (recommended: 5-30)                               │
│ ✓ Question types: 4 different types                                    │
│ ✓ Welcome and closing messages are complete                            │
│                                                                         │
│ Machine Score: 85/100                                                   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                    [← Back to Edit]  [Confirm & Continue →]            │
└─────────────────────────────────────────────────────────────────────────┘
```

**Confirmation Dialog:**
"Once confirmed, the questionnaire design will be locked. To make changes, you'll need to return to this stage, which will clear all subsequent progress. Continue?"

---

## Page 6: Stage 2 - Sample Size Planning

### Layout
Information display, parameter input, calculation

### Components
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Stage 2: Sample Size Planning                                           │
├─────────────────────────────────────────────────────────────────────────┤
│ Population Size: N = 10,000                                             │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│ Statistical Parameters                                                  │
│                                                                         │
│ Confidence Level                                                        │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ ○ 90% (Z=1.645)   ● 95% (Z=1.96)   ○ 99% (Z=2.576)                │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Margin of Error                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ 1% ─────────────●───────────────────────────────────────────── 10% │ │
│ │                 5%                                                  │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│ Calculation                                                             │
│                                                                         │
│ Formula: n = (Z² × p × (1-p)) / E²                                     │
│                                                                         │
│ Where:                                                                  │
│ • Z = 1.96 (95% confidence level)                                      │
│ • p = 0.5 (maximum variance assumption)                                │
│ • E = 0.05 (5% margin of error)                                        │
│                                                                         │
│ Recommended Sample Size: n = 384                                        │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│ Your Decision                                                           │
│                                                                         │
│ Final Sample Size: [  400  ]                                           │
│                                                                         │
│ ℹ️ You may adjust based on practical considerations.                    │
│    (Min: 30, Max: 5,000)                                               │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                        [← Previous]  [Confirm & Next →]│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 7: Stage 3 - Sampling Execution

### Layout
Tab interface for three sampling methods

### Components
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Stage 3: Sampling Execution                                             │
│ Target Sample Size: n = 400    Population: N = 10,000                  │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐            │
│ │ Simple Random ✓ │ │ Systematic ✓    │ │ Stratified      │            │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Stratified Sampling                                                     │
│                                                                         │
│ Select a stratification variable to divide the population into groups. │
│                                                                         │
│ Stratification Variable: [Gender          ▼]                           │
│                                                                         │
│ Population Distribution:                                                │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Stratum      │ Population │ Proportion │ Sample Allocation          │ │
│ ├──────────────┼────────────┼────────────┼────────────────────────────┤ │
│ │ Male         │ 6,000      │ 60%        │ [  240  ]                  │ │
│ │ Female       │ 4,000      │ 40%        │ [  160  ]                  │ │
│ ├──────────────┴────────────┴────────────┼────────────────────────────┤ │
│ │                              Total:    │    400 / 400 ✓            │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Quick Allocation: [Proportional] [Equal]                               │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                    Execute Stratified Sampling                      │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ Progress: 2/3 methods complete                [Complete Stage →]       │
└─────────────────────────────────────────────────────────────────────────┘
```

**After Execution - Sample Preview:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ ✓ Stratified Sampling Complete! (400 samples)                          │
│                                                                         │
│ Sample Preview (first 10 rows):                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ ID     │ Gender │ Age │ Income  │ Education │ Stratum              │ │
│ ├────────┼────────┼─────┼─────────┼───────────┼──────────────────────┤ │
│ │ 00123  │ Male   │ 32  │ ¥8,500  │ Bachelor  │ Male                 │ │
│ │ 00456  │ Female │ 28  │ ¥6,200  │ Master    │ Female               │ │
│ │ ...    │ ...    │ ... │ ...     │ ...       │ ...                  │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ [Re-execute Sampling] [View All Samples]                               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 8: Stage 4 - Analysis & Report

### Layout
Charts, export options, report editor

### Components
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Stage 4: Analysis & Report                                              │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Variable: [Income      ▼]     Chart: [Mean Comparison ▼]           │ │
│ ├─────────────────────────────────────────────────────────────────────┤ │
│ │                                                                     │ │
│ │     Income Mean Comparison                                          │ │
│ │                                                                     │ │
│ │  8500 ┤                                    ▓▓▓                      │ │
│ │  8000 ┤  ███   ▓▓▓   ▓▓▓                                           │ │
│ │  7500 ┤                                                             │ │
│ │  7000 ┤                                                             │ │
│ │       └──────────────────────────────────────────────              │ │
│ │        Population  Simple  Systematic  Stratified                   │ │
│ │                    Random                                           │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Error Summary Table:                                                    │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Variable    │ Simple Random │ Systematic │ Stratified              │ │
│ ├─────────────┼───────────────┼────────────┼─────────────────────────┤ │
│ │ Income Mean │ 2.3%          │ 1.8%       │ 0.9%                    │ │
│ │ Age Mean    │ 1.5%          │ 1.2%       │ 0.5%                    │ │
│ │ Average     │ 1.9%          │ 1.5%       │ 0.7%                    │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ Export Data: [Simple Random CSV] [Systematic CSV] [Stratified CSV]     │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│ Analysis Report                                                         │
│                                                                         │
│ Based on the charts above, analyze and compare the three sampling      │
│ methods. Discuss which method provides results closest to the          │
│ population parameters and explain possible reasons.                    │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ [B] [I] [U] [• List]                                               │ │
│ ├─────────────────────────────────────────────────────────────────────┤ │
│ │ Based on my analysis, stratified sampling provided the most        │ │
│ │ accurate estimates of the population parameters...                  │ │
│ │                                                                     │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ 245/2000 characters (minimum 100)                                       │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                    [← Previous]  [Complete & Preview →]│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 9: Submission Preview

### Layout
Full preview of questionnaire and report

### Components
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Submission Preview                                                      │
├─────────────────────────────────────────────────────────────────────────┤
│ [Questionnaire Preview]  [Report Preview]                               │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                                                                     │ │
│ │                    ~ Scrollable Preview ~                           │ │
│ │                                                                     │ │
│ │   Experiment Report                                                 │ │
│ │                                                                     │ │
│ │   Student: Wang Xiaoming (2024010001)                               │ │
│ │   Topic: Consumer Behavior Survey                                   │ │
│ │   Date: March 15, 2024                                              │ │
│ │                                                                     │ │
│ │   Part 1: Questionnaire Design                                      │ │
│ │   ...                                                               │ │
│ │                                                                     │ │
│ │   Part 2: Sample Size Planning                                      │ │
│ │   ...                                                               │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│ ⚠️ Once submitted, you cannot make changes.                             │
│                                                                         │
│                    [← Back to Edit]  [Confirm Submit]                  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 10: Score View

### Trigger
Click "View Score" on graded task card

### Components
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📊 Experiment Results                                                   │
│ Consumer Behavior Survey                                                │
├─────────────────────────────────────────────────────────────────────────┤
│ Submitted: 2024-03-15 14:30         Graded: 2024-03-18 09:20           │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│ Score Breakdown                                                         │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Questionnaire Design (30%)          │  82 × 30% = 24.6              │ │
│ │ Experiment Process (40%)            │  90 × 40% = 36.0              │ │
│ │ Report Writing (30%)                │  78 × 30% = 23.4              │ │
│ ├─────────────────────────────────────┼───────────────────────────────┤ │
│ │                        Total Score: │  84.0 points                  │ │
│ └─────────────────────────────────────┴───────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│ Teacher's Comments                                                      │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Good work on the questionnaire design! Your analysis of the        │ │
│ │ stratified sampling results was particularly insightful. For       │ │
│ │ future improvement, consider discussing the practical              │ │
│ │ implications of your findings in more depth.                       │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│ [View Questionnaire PDF]  [View Report PDF]  [← Back to Task Hall]     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 11: Rejection View

### Trigger
Click "View Feedback" on rejected task card

### Components
```
┌─────────────────────────────────────────────────────────────────────────┐
│ ❌ Submission Rejected                                                  │
│ Consumer Behavior Survey                                                │
├─────────────────────────────────────────────────────────────────────────┤
│ Submitted: 2024-03-10 09:15         Rejected: 2024-03-12 14:30         │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│ Rejection Reason                                                        │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Your questionnaire design needs improvement:                        │ │
│ │                                                                     │ │
│ │ 1. All questions are single-choice type. Please add variety        │ │
│ │    (true/false, multiple choice, scale questions).                  │ │
│ │                                                                     │ │
│ │ 2. The analysis report lacks depth. Please provide more detailed   │ │
│ │    comparison and explanation of why different sampling methods    │ │
│ │    produce different results.                                       │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ [View Questionnaire PDF]  [View Report PDF]                            │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│ Ready to try again?                                                     │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │                    Start New Attempt                                │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ⚠️ Starting over will begin from Stage 1 (Questionnaire Design).        │
│                                                                         │
│                                        [← Back to Task Hall]           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Responsive Design Notes

- Task cards: 3 columns → 2 columns → 1 column as screen narrows
- Questionnaire editor: side-by-side → stacked on mobile
- Charts: resize or simplify on small screens
- Stage navigation: horizontal steps → vertical steps on mobile

---

## Color Scheme

| Element | Color |
|---------|-------|
| Primary | Blue (#3B82F6) |
| Success/Graded | Green (#22C55E) |
| Warning/Submitted | Yellow (#F59E0B) |
| Danger/Rejected | Red (#EF4444) |
| Neutral/Not Started | Gray (#6B7280) |
| In Progress | Blue (#3B82F6) |
| Background | White/Light Gray |
| Text | Dark Gray (#111827) |

---

## V2.0 Changes Summary

| Feature | Page | Description |
|---------|------|-------------|
| Account Status Check | Login | Disabled accounts see error message |
| Login Logging | Login | Each login is recorded for tracking |
| Unread Announcement Badge | Header | Shows count of unread announcements |
| Announcement Read Tracking | Announcements | Marks as read when viewed |

---

*End of specification*
