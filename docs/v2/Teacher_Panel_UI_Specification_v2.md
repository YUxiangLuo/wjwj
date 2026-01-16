# Teacher Panel UI Specification for Statistical Sampling Simulation System V2.0

## Overview

This document describes the UI specification for the Teacher Panel (教师端) based on Database Design V2.0. Changes from V1.0 are marked with **【V2.0】**.

### Key V2.0 Changes for Teacher Panel
- Account status check on login (disabled accounts cannot login)
- Login logging
- Unread announcement badge and tracking
- Grading draft status (save without submitting)
- Assistant status management (Enable/Disable)
- Student last login time display

---

## Global Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Logo          System Name                   🔔 (2)  Teacher Name  Logout│
├──────────────┬──────────────────────────────────────────────────────────┤
│ Navigation   │                                                          │
│              │                     Main Content Area                    │
│ • Dashboard  │                                                          │
│ • Classes    │                                                          │
│ • Topics     │                                                          │
│ • Tasks      │                                                          │
│ • Grading    │                                                          │
│ • Assistants │                                                          │
│ • Export     │                                                          │
│              │                                                          │
└──────────────┴──────────────────────────────────────────────────────────┘
```

**Header Components:**
- Logo and system name on the left
- **【V2.0】** Notification bell with unread announcement count
- Teacher name and logout button on the right

---

## Page 1: Dashboard (首页概览)

### Layout
Statistics cards, quick actions, and recent activity

### Components

**Row 1: Statistics Cards (4 cards)**
- Card 1: "My Classes" - number of classes assigned
- Card 2: "My Topics" - number of topics created
- Card 3: "Pending Grading" - number with orange/red highlight if > 0
- Card 4: "Active Tasks" - number of ongoing tasks

**Row 2: Quick Actions**
- Button: "Create New Topic" (primary)
- Button: "Go to Grading" (secondary, shows badge if pending > 0)

**【V2.0】 Row 3: Announcement Banner (if unread)**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📢 New: System will undergo maintenance on...           [View] [Close] │
└─────────────────────────────────────────────────────────────────────────┘
```
- Clicking "View" opens announcement and marks as read
- Auto-hides after marking as read

**Row 4: Recent Activity**
- List of recent student submissions (last 5)
- List of recent grading actions (last 5)

---

## Page 2: Class Management (班级管理)

### Layout
Card list of assigned classes

### Components

**Class Cards**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📚 Statistics 101 - Section A                                           │
│ Semester: 2024-Spring                                                   │
│ Students: 45                                                            │
├─────────────────────────────────────────────────────────────────────────┤
│ [Manage Students]  [View Details]                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 2.1: Student Management (学生管理)

### Layout
Data table with import/add/manage functions

### Components

**Header Section**
- Back button: "← Back to Classes"
- Page title: "Class: [Class Name] - Student Management"
- Buttons: "+ Add Student", "Batch Import"

**【V2.0】 Data Table**
Columns:
| Student ID | Name | Status | Last Login | Actions |
|------------|------|--------|------------|---------|
| 2024010001 | Wang Li | 🟢 Active | 2024-03-15 10:20 | Reset Password, Remove |
| 2024010002 | Zhang Wei | 🔴 Disabled | 2024-02-01 09:00 | Reset Password, Remove |

**【V2.0】 Last Login Column:**
- Shows date/time from login_log
- Shows "Never" if no login record

**Add Student Dialog (Modal)**
- Title: "Add New Student"
- Fields:
  - Student ID (required)
  - Name (required)
- Note: "Initial password will be set to the Student ID"
- Buttons: "Cancel", "Add Student"

**Batch Import Dialog (Modal)**
- Title: "Batch Import Students"
- Download template link: "Download CSV Template"
- File upload area: Drag & drop or click to select
- Preview table after file selection
- Validation messages (duplicates, format errors)
- Buttons: "Cancel", "Import"

---

## Page 3: Topic Management (课题管理)

### Layout
Card grid with filter and create options

### Components

**Header Section**
- Page title: "Topic Management"
- Filter: [All] [Draft] [Published]
- Primary button: "+ Create Topic"

**Topic Cards**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📊 Consumer Behavior Survey                                             │
│ Status: 🟢 Published              Data: 10,000 rows                     │
│ Created: 2024-03-01                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│ [View]  [Edit]  [Delete]                                               │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ 📝 Market Research Methods (Draft)                                      │
│ Status: ⚫ Draft                   Data: Not uploaded                   │
│ Created: 2024-03-10                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│ [Edit]  [Publish]  [Delete]                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 3.1: Create/Edit Topic (Multi-step Wizard)

### Layout
Stepper navigation with 6 steps

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Create New Topic                                                        │
│                                                                         │
│ Step: ① Basic Info → ② Upload Data → ③ Field Mapping →                │
│       ④ Attachments → ⑤ Questions → ⑥ Weights                        │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│                         [Step Content Area]                             │
│                                                                         │
│ ─────────────────────────────────────────────────────────────────────── │
│                                        [← Back]  [Save Draft]  [Next →] │
└─────────────────────────────────────────────────────────────────────────┘
```

### Step 1: Basic Information
- Topic Name (required): max 200 characters
- Background Description (required): rich text editor, max 5000 characters

### Step 2: Upload Data
- File upload area (xlsx/xls only, max 100MB)
- Preview table after upload
- Row count display
- Error messages for invalid files

### Step 3: Field Mapping
- Table with all Excel columns
- Checkbox to include/exclude each column
- Dropdown for field type selection:
  - Stratification Variable (for stratified sampling)
  - Numeric Variable (for mean comparison)
  - Categorical Variable (for proportion comparison)
  - Identifier (excluded from analysis)
- Validation: At least 3 fields, 1 stratification, 1 numeric

### Step 4: Attachments (Optional)
- Multi-file upload area
- Supported: images, videos, documents
- File list with remove buttons

### Step 5: Recommended Questions (Optional)
- List of added questions
- Add question button
- Question types: True/False, Single Choice, Multiple Choice, Scale

### Step 6: Grading Weights
- Three sliders/inputs:
  - Questionnaire Design Weight: ___%
  - Experiment Process Weight: ___%
  - Report Writing Weight: ___%
- Validation: Total must equal 100%
- Buttons: "Save as Draft", "Save and Publish"

---

## Page 4: Task Management (任务管理)

### Layout
Data table with filters

### Components

**Header Section**
- Page title: "Task Management"
- Filters: Topic, Class, Status (Active/Expired)
- Primary button: "+ Publish Task"

**Data Table**
Columns:
| Topic | Class | Open Time | Deadline | Progress | Pending | Actions |
|-------|-------|-----------|----------|----------|---------|---------|
| Consumer Survey | Section A | Mar 1 | Mar 31 | 32/45 (71%) | 8 | View Progress, Extend, Go to Grading |

**Publish Task Dialog (Modal)**
- Title: "Publish New Task"
- Fields:
  - Select Topic: dropdown of published topics
  - Select Classes: multi-select checkboxes
  - Open Time: datetime picker (optional)
  - Deadline: datetime picker (optional)
- Buttons: "Cancel", "Publish"

---

## Page 4.1: Progress Monitoring (进度监控)

### Layout
Summary cards and student list

### Components

**Summary Section**
```
┌────────────────────────────────────────────────────────────────────────┐
│ Consumer Behavior Survey - Section A                                    │
│ Deadline: March 31, 2024 (16 days remaining)                           │
├──────────────┬──────────────┬──────────────┬───────────────────────────┤
│ Total: 45    │ Completed: 32│ In Progress: 8│ Not Started: 5          │
└──────────────┴──────────────┴──────────────┴───────────────────────────┘
```

**Stage Breakdown**
- Stage 1 Completed: X students
- Stage 2 Completed: X students
- Stage 3 Completed: X students
- Stage 4 Completed: X students

**Student Progress Table**
Columns:
| Student ID | Name | Status | Current Stage | Last Activity | Actions |
|------------|------|--------|---------------|---------------|---------|

---

## Page 5: Grading (作业批改)

### Layout
Filterable list of submissions

### Components

**Header Section**
- Page title: "Assignment Grading"
- Filters:
  - Class: [All ▼]
  - Topic: [All ▼]
  - **【V2.0】** Status: [Pending] [Draft] [Graded] [Rejected]
- Sort: [Newest First ▼]

**【V2.0】 Status Filter Options:**
- Pending (待批改) - status = 1
- Draft (批改草稿) - status = 0 **【V2.0】**
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
```

---

## Page 5.1: 【V2.0】 Grading Interface (批改页面)

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
│                                  │ 【V2.0】                             │
│                                  │ [Save Draft] [Reject] [Approve]      │
│                                  │               [Next Student →]       │
└──────────────────────────────────┴──────────────────────────────────────┘
```

**【V2.0】 Action Buttons:**
- **Save Draft**: Saves current scores/comments, status changes to "批改草稿"
  - Student sees "Waiting for grading" (draft status hidden from students)
  - Teacher can continue later
- **Reject**: Opens reject dialog
- **Approve**: Finalizes grading, status changes to "已批改"
- **Next Student →**: Saves and moves to next pending submission

**Reject Dialog**
- Title: "Reject Submission"
- Message: "Please provide a reason for the student to improve:"
- Textarea: required, max 500 characters
- Buttons: "Cancel", "Confirm Reject"

---

## Page 6: Assistant Management (助教管理)

### Layout
Data table with add/manage functions

### Components

**Header Section**
- Page title: "Teaching Assistant Management"
- Primary button: "+ Add Assistant"

**【V2.0】 Data Table**
Columns:
| Account | Name | Status | Assigned Classes | Created At | Actions |
|---------|------|--------|------------------|------------|---------|
| ta_wang | Wang Fang | 🟢 Active | Class A, B | 2024-02-01 | Edit, Bind Classes, Reset Password, Disable |
| ta_li | Li Hua | 🔴 Disabled | Class A | 2024-02-15 | Edit, Bind Classes, Reset Password, Enable |

**【V2.0】 Actions:**
- "Edit" - modify name
- "Bind Classes" - manage class assignments
- "Reset Password" - confirmation dialog
- "Disable" / "Enable" - toggle account status
- "Delete" - confirmation dialog (permanent)

**Add Assistant Dialog**
- Title: "Add Teaching Assistant"
- Fields:
  - Account (required): unique identifier
  - Name (required)
  - Note: "Initial password will be set to Account"
- Buttons: "Cancel", "Add"

**Bind Classes Dialog**
- Title: "Manage Class Assignments"
- Checkboxes for all teacher's classes
- Current assignments pre-checked
- Buttons: "Cancel", "Save"

**【V2.0】 Disable Assistant Dialog**
- Title: "Disable Assistant Account"
- Message: "Are you sure you want to disable [Account]? They will not be able to log in."
- Buttons: "Cancel", "Disable"

---

## Page 7: Grade Export (成绩导出)

### Layout
Filter selection and export options

### Components

**Filter Section**
- Select Class (required): dropdown
- Select Topic (optional): dropdown, "All Topics" default
- Preview button: "Preview Data"

**Preview Table**
Columns:
| Student ID | Name | Topic | Questionnaire | Process | Report | Total | Status | Submitted |

**Export Button**
- "Export to Excel"
- Downloads .xlsx file

---

## Responsive Design Notes

- Sidebar collapses on tablet/mobile
- Grading interface stacks vertically on mobile (content above, grading below)
- Tables become card lists on small screens

---

## Color Scheme

Same as Admin Panel for consistency.

---

## V2.0 Changes Summary

| Feature | Page | Description |
|---------|------|-------------|
| Unread Announcement Badge | Header | Shows unread count, marks as read on view |
| Student Last Login | Page 2.1 | Shows last login time from login_log |
| Grading Draft Status | Page 5, 5.1 | New status for work-in-progress grading |
| Save Draft Button | Page 5.1 | Save grading without submitting |
| Assistant Status | Page 6 | Enable/Disable assistant accounts |
| Status Filter Update | Page 5 | Added "Draft" filter option |

---

*End of specification*
