# Assistant Panel UI Specification for Statistical Sampling Simulation System V2.0

## Overview

This document describes the UI specification for the Assistant Panel (助教端) based on Database Design V2.0. The Assistant Panel is a permission-restricted version of the Teacher Panel, focused on assignment grading.

### Key Features
- Login with account status check
- First-login password change
- View assigned classes and their tasks
- Grade student submissions (with draft save support)
- View announcements (with read tracking)

### Permission Restrictions

The Assistant Panel does **NOT** include:
- Topic management
- Task publishing
- Student management
- Assistant management
- Grade export
- Deadline extension

---

## Global Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Logo          System Name              🔔 (2)  Assistant Name    Logout │
├──────────────┬──────────────────────────────────────────────────────────┤
│ Navigation   │                                                          │
│              │                     Main Content Area                    │
│ • Dashboard  │                                                          │
│ • Classes    │                                                          │
│ • Grading    │                                                          │
│              │                                                          │
│              │                                                          │
└──────────────┴──────────────────────────────────────────────────────────┘
```

**Header Components:**
- Logo and system name on the left
- Notification bell with unread announcement count badge
- Assistant name and logout button on the right

---

## Page 0: Login

### Layout
Centered login card on a clean background

### Components

```
┌─────────────────────────────────────────────┐
│                                             │
│         Statistical Sampling                │
│       Virtual Simulation System             │
│                                             │
│   Teaching Assistant Login                  │
│                                             │
│   Account                                   │
│   ┌─────────────────────────────────────┐   │
│   │ ta_wang                             │   │
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

**Login Flow:**
1. Validate credentials against `assistant` table
2. Check account status (status = 1)
   - If disabled: Show error "Your account has been disabled. Please contact your teacher."
3. Check `is_first_login` flag
4. If first login: redirect to password change page
5. Record login to `login_log` (user_type = 3)
6. Redirect to Dashboard

**Error Messages:**
- "Invalid account or password"
- "Your account has been disabled. Please contact your teacher."

---

## Page 1: First Login Password Change

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
- On success: update password, set `is_first_login = 0`, redirect to Dashboard

---

## Page 2: Dashboard (首页概览)

### Layout
Statistics cards and recent activity

### Components

**Row 1: Statistics Cards (2 cards)**

```
┌────────────────────────────────┐  ┌────────────────────────────────┐
│ 📚 My Classes                  │  │ 📝 Pending Grading             │
│                                │  │                                │
│           3                    │  │           12                   │
│                                │  │                                │
│ Classes assigned to you        │  │ Submissions waiting for grade  │
└────────────────────────────────┘  └────────────────────────────────┘
```

**Row 2: Quick Actions**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Quick Actions                                                           │
│                                                                         │
│ ┌─────────────────────────────┐  ┌─────────────────────────────────┐   │
│ │    📝 Go to Grading (12)    │  │     📚 View My Classes          │   │
│ └─────────────────────────────┘  └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Row 3: Announcement Banner (if unread)**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📢 New: System will undergo maintenance on...           [View] [Close] │
└─────────────────────────────────────────────────────────────────────────┘
```

**Row 4: Recent Submissions**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Recent Submissions                                           [View All] │
├─────────────────────────────────────────────────────────────────────────┤
│ • Wang Li (2024010001) - Consumer Survey - Submitted 2 hours ago       │
│ • Zhang Wei (2024010002) - Consumer Survey - Submitted 5 hours ago     │
│ • Li Ming (2024010003) - Market Research - Submitted yesterday         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 3: My Classes (班级作业)

### Layout
Card list of assigned classes with task information

### Components

**Class Cards**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📚 Statistics 101 - Section A                                           │
│ Semester: 2024-Spring                  Teacher: Zhang Wei               │
├─────────────────────────────────────────────────────────────────────────┤
│ Active Tasks:                                                           │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Consumer Behavior Survey                                            │ │
│ │ Deadline: Mar 31, 2024    Progress: 32/45    Pending: 8            │ │
│ │                                              [View Progress]        │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Market Research Methods                                             │ │
│ │ Deadline: Apr 15, 2024    Progress: 15/45    Pending: 3            │ │
│ │                                              [View Progress]        │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 📚 Statistics 101 - Section B                                           │
│ Semester: 2024-Spring                  Teacher: Zhang Wei               │
├─────────────────────────────────────────────────────────────────────────┤
│ Active Tasks:                                                           │
│ No active tasks                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 3.1: Task Progress (进度查看)

### Layout
Summary and student progress list (view-only)

### Components

**Summary Section**

```
┌────────────────────────────────────────────────────────────────────────┐
│ ← Back to My Classes                                                    │
├────────────────────────────────────────────────────────────────────────┤
│ Consumer Behavior Survey - Section A                                    │
│ Deadline: March 31, 2024 (16 days remaining)                           │
├──────────────┬──────────────┬──────────────┬───────────────────────────┤
│ Total: 45    │ Completed: 32│ In Progress: 8│ Not Started: 5          │
└──────────────┴──────────────┴──────────────┴───────────────────────────┘
```

**Student Progress Table (View Only)**

| Student ID | Name | Status | Current Stage | Last Activity |
|------------|------|--------|---------------|---------------|
| 2024010001 | Wang Li | 🟡 Submitted | - | Mar 15, 14:30 |
| 2024010002 | Zhang Wei | 🔵 In Progress | Stage 3 | Mar 15, 10:20 |
| 2024010003 | Li Ming | ⚪ Not Started | - | - |

**Note:** Assistant cannot extend deadlines or manage students - only view progress.

---

## Page 4: Grading (作业批改)

### Layout
Filterable list of submissions

### Components

**Header Section**
- Page title: "Assignment Grading"
- Filters:
  - Class: [All ▼] (only shows assigned classes)
  - Topic: [All ▼]
  - Status: [Pending] [Draft] [Graded] [Rejected]
- Sort: [Newest First ▼]

**Status Filter Options:**
- Pending (待批改) - status = 1
- Draft (批改草稿) - status = 0
- Graded (已批改) - status = 2
- Rejected (被驳回) - status = 3

**Submission List**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📝 Wang Xiaoming (2024010001)                                           │
│ Class: Section A    Topic: Consumer Survey                              │
│ Submitted: 2024-03-15 14:30                 Status: 🟡 Pending          │
├─────────────────────────────────────────────────────────────────────────┤
│ [Grade Now]                                                             │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 📝 Li Ming (2024010002)                                                 │
│ Class: Section A    Topic: Consumer Survey                              │
│ Submitted: 2024-03-14 10:20                 Status: 📝 Draft            │
├─────────────────────────────────────────────────────────────────────────┤
│ [Continue Grading]                                                      │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 📝 Zhang Wei (2024010003)                                               │
│ Class: Section B    Topic: Market Research                              │
│ Submitted: 2024-03-13 09:15                 Status: 🟢 Graded           │
│ Score: 85 points                            Graded by: You              │
├─────────────────────────────────────────────────────────────────────────┤
│ [View Details]                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 4.1: Grading Interface (批改页面)

### Layout
Split view: left for content, right for grading

```
┌──────────────────────────────────┬──────────────────────────────────────┐
│ Student Submission               │ Grading Panel                        │
│                                  │                                      │
│ [Questionnaire] [Report]         │ Wang Xiaoming (2024010001)           │
│                                  │ ─────────────────────────────────── │
│ ┌──────────────────────────────┐ │ Questionnaire Design                │
│ │                              │ │ Machine Score: 85                   │
│ │    PDF Preview Area          │ │ Your Score: [___] / 100             │
│ │                              │ │                                      │
│ │    Zoom: [-] [100%] [+]      │ │ Experiment Process                  │
│ │    Page: [1] of 5            │ │ Your Score: [___] / 100             │
│ │                              │ │                                      │
│ └──────────────────────────────┘ │ Report Writing                       │
│                                  │ Your Score: [___] / 100             │
│                                  │ ─────────────────────────────────── │
│ [Download PDF]                   │ Total: __ × 30% + __ × 40% + __ × 30%│
│                                  │      = _____ points                 │
│                                  │ ─────────────────────────────────── │
│                                  │ Comments:                            │
│                                  │ ┌──────────────────────────────────┐ │
│                                  │ │                                  │ │
│                                  │ │                                  │ │
│                                  │ └──────────────────────────────────┘ │
│                                  │ ─────────────────────────────────── │
│                                  │ [Save Draft] [Reject] [Approve]      │
│                                  │               [Next Student →]       │
└──────────────────────────────────┴──────────────────────────────────────┘
```

**Action Buttons:**
- **Save Draft**: Saves current scores/comments, status changes to "批改草稿"
  - Student sees "Waiting for grading" (draft status hidden)
  - Assistant can continue later
  - Records `graded_by_type = 2`, `graded_by_id = assistant.id`
- **Reject**: Opens reject dialog
- **Approve**: Finalizes grading, status changes to "已批改"
- **Next Student →**: Saves and moves to next pending submission

**Reject Dialog**

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Reject Submission                                                [Close]│
├─────────────────────────────────────────────────────────────────────────┤
│ Please provide a reason for the student to improve:                     │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Your questionnaire design needs more variety. Please include       │ │
│ │ different question types (true/false, multiple choice, scale).     │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│ 156/500 characters                                                      │
│                                                                         │
│                                        [Cancel]  [Confirm Reject]       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 5: Announcements (公告)

### Trigger
Click notification bell in header

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

**Read Status:**
- 🔵 Blue dot: Unread
- ⚪ No dot: Already read
- Clicking an announcement opens detail and marks as read (writes to `announcement_read` with `user_type = 3`)

---

## Common Components

### Toast Notifications
- Success: Green background, checkmark icon
- Error: Red background, X icon
- Warning: Yellow background, warning icon
- Info: Blue background, info icon

### Empty States

**No Assigned Classes**
```
┌─────────────────────────────────────────────────────────────────────────┐
│                          📚                                             │
│                   No Classes Assigned                                   │
│                                                                         │
│      Please contact your teacher to be assigned to classes.             │
└─────────────────────────────────────────────────────────────────────────┘
```

**No Pending Submissions**
```
┌─────────────────────────────────────────────────────────────────────────┐
│                          ✓                                              │
│                   All Caught Up!                                        │
│                                                                         │
│           No submissions are waiting for grading.                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Responsive Design Notes

- Sidebar collapses to hamburger menu on tablet/mobile
- Grading interface stacks vertically on mobile (content above, grading below)
- Class cards stack vertically on small screens

---

## Color Scheme

Same as other panels for consistency:

| Element | Color |
|---------|-------|
| Primary | Blue (#3B82F6) |
| Success/Graded | Green (#22C55E) |
| Warning/Pending | Yellow (#F59E0B) |
| Danger/Rejected | Red (#EF4444) |
| Neutral | Gray (#6B7280) |
| Draft | Blue (#3B82F6) |
| Background | White/Light Gray (#F9FAFB) |
| Text | Dark Gray (#111827) |

---

## Database Queries Reference

### Get Assistant's Assigned Classes
```sql
SELECT c.* FROM class c
JOIN assistant_class ac ON c.id = ac.class_id
WHERE ac.assistant_id = ?;
```

### Get Pending Submissions for Assistant
```sql
SELECT sub.*, s.student_id, s.name, tp.name AS topic_name, c.name AS class_name
FROM submission sub
JOIN experiment e ON sub.experiment_id = e.id
JOIN student s ON e.student_id = s.id
JOIN task t ON e.task_id = t.id
JOIN topic tp ON t.topic_id = tp.id
JOIN class c ON t.class_id = c.id
JOIN assistant_class ac ON c.id = ac.class_id
WHERE ac.assistant_id = ? AND sub.status = 1;
```

### Record Assistant Grading
```sql
UPDATE submission SET
  score_questionnaire = ?,
  score_process = ?,
  score_report = ?,
  total_score = ?,
  teacher_comment = ?,
  status = 2,  -- or 0 for draft, 3 for rejected
  graded_by_type = 2,  -- 2 = assistant
  graded_by_id = ?,
  graded_at = NOW()
WHERE id = ?;
```

---

## Feature Summary

| Feature | Available | Notes |
|---------|-----------|-------|
| Login | ✅ | With status check |
| First-login password change | ✅ | Same as other roles |
| View Dashboard | ✅ | Limited stats |
| View assigned classes | ✅ | Via assistant_class |
| View task progress | ✅ | Read-only |
| Grade submissions | ✅ | Full grading capability |
| Save grading draft | ✅ | V2.0 feature |
| Reject submissions | ✅ | With reason |
| View announcements | ✅ | With read tracking |
| Create/edit topics | ❌ | Teacher only |
| Publish tasks | ❌ | Teacher only |
| Manage students | ❌ | Teacher only |
| Export grades | ❌ | Teacher only |
| Extend deadlines | ❌ | Teacher only |

---

*End of specification*
