# Teacher Panel UI Specification for Statistical Sampling Simulation System

## Overview

This is the teacher panel for a university statistical sampling virtual simulation teaching platform. Teachers use this panel to create topics (experiments), upload population data, assign tasks to classes, and grade student submissions.

**Tech Stack Preference:** React + Tailwind CSS + shadcn/ui components

**Design Style:** Clean, professional, minimal. Similar to modern LMS (Learning Management System) interfaces.

---

## Global Layout

### Structure
- **Left Sidebar:** Fixed navigation menu (collapsible on mobile)
- **Top Header:** System name, teacher's name, notification bell, logout button
- **Main Content Area:** Dynamic content based on selected menu

### Sidebar Menu Items
1. Dashboard (icon: LayoutDashboard)
2. Class Management (icon: Users)
3. Topic Management (icon: FileText)
4. Task Management (icon: ClipboardList)
5. Grading (icon: CheckSquare) - with badge showing pending count
6. Teaching Assistants (icon: UserPlus)
7. Grade Export (icon: Download)

---

## Page 1: Dashboard

### Layout
Summary cards at top, followed by quick actions and recent activity.

### Components

**Row 1: Statistics Cards (4 cards)**
- Card 1: "My Classes" - number of classes assigned to this teacher
- Card 2: "My Topics" - number of topics created
- Card 3: "Pending Grading" - number with orange/red highlight if > 0
- Card 4: "Active Tasks" - number of ongoing tasks

**Row 2: Quick Actions**
- Button: "Create New Topic" (primary)
- Button: "Go to Grading" (secondary, shows badge if pending > 0)

**Row 3: Announcement Banner (if any)**
- Shows latest system announcement from admin
- Dismissible or collapsible

**Row 4: Recent Activity**
Section title: "Recent Activity"
A timeline-style list showing:
```
• Student Chen Xiaoming submitted assignment for "Consumer Survey"    2 hours ago
• Student Wang Li submitted assignment for "Consumer Survey"          3 hours ago
• You graded 5 assignments for "Market Research"                      Yesterday
• New class "Statistics 102-A" was assigned to you                    2 days ago
```

---

## Page 2: Class Management

### Layout
A read-only list of assigned classes with student management capabilities.

### Components

**Header Section**
- Page title: "My Classes"
- Filter: Semester dropdown (default: current semester)

**Class Cards or Table**

Display as cards for better visual hierarchy:
```
┌─────────────────────────────────────────────────────────────┐
│ Statistics 101 - Section A                                   │
│ Semester: 2024-Spring                                        │
│ Students: 45                                                 │
├─────────────────────────────────────────────────────────────┤
│ [Manage Students]  [View Tasks]                              │
└─────────────────────────────────────────────────────────────┘
```

Or as a table:
| Class Name | Semester | Students | Actions |
|------------|----------|----------|---------|
| Statistics 101 - Section A | 2024-Spring | 45 | Manage Students, View Tasks |

**Note:** Teachers cannot create or delete classes (admin responsibility), but can manage students within their classes.

---

## Page 2.1: Student Management (Sub-page)

### Layout
Accessed by clicking "Manage Students" on a class.

### Components

**Header Section**
- Breadcrumb: My Classes > Statistics 101 - Section A
- Page title: "Students in Statistics 101 - Section A"
- Buttons: "+ Add Student", "Batch Import"

**Student Table**
| Student ID | Name | Status | Last Login | Actions |
|------------|------|--------|------------|---------|
| 2024010001 | Chen Xiaoming | Active (green) | 2024-03-15 14:30 | Reset Password, Remove |
| 2024010002 | Wang Li | Active (green) | 2024-03-15 10:20 | Reset Password, Remove |
| 2024010003 | Zhang Wei | Disabled (red) | 2024-02-01 09:00 | Reset Password, Remove |

**Add Student Dialog (Modal)**
- Title: "Add New Student"
- Fields:
  - Student ID (required): text input
  - Name (required): text input
- Note: "Initial password will be set to the Student ID"
- Buttons: "Cancel", "Add Student"

**Batch Import Dialog (Modal)**
- Title: "Batch Import Students"
- Step 1: Download template
  - Link: "Download CSV Template"
  - Template format shown: "Student ID, Name"
- Step 2: Upload file
  - Drag & drop zone or file picker
  - Accepts: .csv files only
- Step 3: Preview (after upload)
  - Table showing parsed data
  - Error highlights if any (duplicate IDs, missing fields)
  - Summary: "Ready to import 25 students" or "3 errors found"
- Buttons: "Cancel", "Import" (disabled if errors)

**Remove Student Confirmation**
- Title: "Remove Student"
- Message: "Are you sure you want to remove [Student Name] from this class? The student's account will be disabled but their submission history will be preserved."
- Buttons: "Cancel", "Remove" (destructive)

---

## Page 3: Topic Management

### Layout
List of topics created by this teacher with full CRUD capabilities.

### Components

**Header Section**
- Page title: "My Topics"
- Filter: Status dropdown (All / Draft / Published)
- Primary button: "+ Create Topic"

**Topic Cards**
```
┌─────────────────────────────────────────────────────────────┐
│ 📊 Consumer Behavior Survey                                  │
│ Status: 🟢 Published              Data: 10,000 rows          │
│ Created: 2024-03-01                                          │
├─────────────────────────────────────────────────────────────┤
│ This survey explores consumer purchasing decisions in...     │
├─────────────────────────────────────────────────────────────┤
│ [View]  [Edit]  [Publish to Class]  [Delete]                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 📝 Market Research Methods (Draft)                           │
│ Status: ⚫ Draft                   Data: Not uploaded        │
│ Created: 2024-03-10                                          │
├─────────────────────────────────────────────────────────────┤
│ An introduction to various market research sampling...       │
├─────────────────────────────────────────────────────────────┤
│ [Edit]  [Delete]                                            │
└─────────────────────────────────────────────────────────────┘
```

- Published topics show "View" and "Publish to Class"
- Draft topics show "Edit" and "Delete"
- "Publish to Class" navigates to task creation

---

## Page 3.1: Create/Edit Topic (Multi-step Form)

### Layout
A wizard-style form with 6 steps. Show progress indicator at top.

### Progress Indicator
```
[1. Basic Info] → [2. Upload Data] → [3. Field Mapping] → [4. Attachments] → [5. Sample Questions] → [6. Grading Weights]
     ●                  ○                   ○                   ○                    ○                      ○
```

---

### Step 1: Basic Information

**Form Fields:**
- Topic Name (required)
  - Text input, max 200 characters
  - Placeholder: "e.g., Consumer Behavior Survey 2024"
  
- Background Description (required)
  - Rich text editor (bold, italic, lists, links)
  - Max 5000 characters
  - Character counter shown
  - Placeholder: "Describe the research background, objectives, and significance..."

**Buttons:** "Save Draft", "Next →"

---

### Step 2: Upload Population Data

**Upload Section:**
- Large drag & drop zone
- Text: "Drag and drop your Excel file here, or click to browse"
- Accepted formats: .xlsx, .xls
- Max file size: 100MB

**Upload States:**

*Before upload:*
- Empty drop zone with upload icon

*During upload:*
- Progress bar with percentage
- File name shown

*After successful upload:*
```
┌─────────────────────────────────────────────────────────────┐
│ ✅ File uploaded successfully                                │
│                                                              │
│ File: population_data_2024.xlsx                             │
│ Rows: 10,000                                                 │
│ Columns: 12                                                  │
│                                                              │
│ Preview:                                                     │
│ ┌─────────┬────────┬─────┬────────┬─────────┐              │
│ │ ID      │ Gender │ Age │ Income │ Region  │ ...          │
│ ├─────────┼────────┼─────┼────────┼─────────┤              │
│ │ 001     │ Male   │ 35  │ 8000   │ East    │              │
│ │ 002     │ Female │ 28  │ 6500   │ West    │              │
│ │ 003     │ Male   │ 42  │ 12000  │ North   │              │
│ └─────────┴────────┴─────┴────────┴─────────┘              │
│ Showing first 5 rows of 10,000                              │
│                                                              │
│ [Remove and Re-upload]                                       │
└─────────────────────────────────────────────────────────────┘
```

*Upload error:*
- Red error message with specific issue:
  - "Invalid file format. Please upload an Excel file (.xlsx or .xls)"
  - "File is empty"
  - "Error in row 156, column 'Age': Invalid value"
  - "Column 'Income' contains empty values in rows: 23, 45, 89"

**Buttons:** "← Back", "Save Draft", "Next →"

**Note for published topics:** This step shows read-only view with message "Data cannot be modified after publishing"

---

### Step 3: Field Mapping

**Layout:**
Two-column layout showing all Excel columns and their assigned types.

**Instructions at top:**
"Select which fields to include in the experiment and assign their types. You must select at least 3 fields, including at least 1 stratification variable and 1 numeric variable."

**Field List:**
```
┌─────────────────────────────────────────────────────────────┐
│ Excel Column    │ Include │ Field Type           │ Values   │
├─────────────────┼─────────┼─────────────────────┼──────────┤
│ ID              │ [✓]     │ [Identifier     ▼]  │ -        │
│ Gender          │ [✓]     │ [Stratification ▼]  │ Male, Female │
│ Age             │ [✓]     │ [Numeric        ▼]  │ 18-75    │
│ Income          │ [✓]     │ [Numeric        ▼]  │ 2000-50000 │
│ Region          │ [✓]     │ [Stratification ▼]  │ East, West, North, South │
│ Occupation      │ [✓]     │ [Categorical    ▼]  │ 8 unique values │
│ Education       │ [ ]     │ [Select type    ▼]  │ -        │
│ MaritalStatus   │ [ ]     │ [Select type    ▼]  │ -        │
└─────────────────────────────────────────────────────────────┘
```

**Field Type Dropdown Options:**
- Identifier - Unique ID, not used in analysis
- Stratification - For stratified sampling (must be categorical)
- Numeric - For statistical analysis (mean, distribution)
- Categorical - For frequency analysis

**Validation Messages:**
- "✓ 6 fields selected"
- "✓ 2 stratification variables"
- "✓ 2 numeric variables"
- Or error: "⚠ Please select at least 1 stratification variable"

**Buttons:** "← Back", "Save Draft", "Next →"

---

### Step 4: Attachments (Optional)

**Section Description:**
"Upload supplementary materials for students (images, videos, documents). These will be available for students to view before starting the experiment."

**Upload Area:**
- Drag & drop zone for multiple files
- Supported formats:
  - Images: jpg, png, gif (max 10MB each)
  - Videos: mp4 (max 500MB each)
  - Documents: pdf, doc, docx (max 50MB each)

**Uploaded Files List:**
```
┌─────────────────────────────────────────────────────────────┐
│ 📄 research_background.pdf          2.5 MB        [Remove]  │
│ 🖼️ survey_sample.png                 450 KB       [Remove]  │
│ 🎬 introduction_video.mp4           125 MB        [Remove]  │
└─────────────────────────────────────────────────────────────┘
```

**Buttons:** "← Back", "Save Draft", "Next →" (can skip if no files)

---

### Step 5: Recommended Questions (Optional)

**Section Description:**
"Add sample questions that students can reference when designing their questionnaires. Students can use these directly or modify them."

**Question List:**
```
┌─────────────────────────────────────────────────────────────┐
│ 1. What is your gender?                          [Single]   │
│    Options: Male, Female                                    │
│    [Edit] [Delete]                                          │
├─────────────────────────────────────────────────────────────┤
│ 2. Which social media platforms do you use?     [Multiple]  │
│    Options: WeChat, Weibo, Douyin, Xiaohongshu, Other      │
│    [Edit] [Delete]                                          │
├─────────────────────────────────────────────────────────────┤
│ 3. Are you satisfied with your current income?  [True/False]│
│    Options: Yes, No                                         │
│    [Edit] [Delete]                                          │
├─────────────────────────────────────────────────────────────┤
│ 4. Rate your overall life satisfaction          [Scale]     │
│    Scale: 1 (Very Unsatisfied) - 10 (Very Satisfied)       │
│    [Edit] [Delete]                                          │
└─────────────────────────────────────────────────────────────┘

[+ Add Question]
```

**Add/Edit Question Dialog:**
- Question Type: Radio buttons
  - ○ True/False
  - ○ Single Choice
  - ○ Multiple Choice
  - ○ Satisfaction Scale (1-10)
  
- Question Content: Text input (max 500 characters)

- Options (for Single/Multiple Choice):
  - Dynamic list of option inputs
  - [+ Add Option] button
  - Drag to reorder
  - Min 2, max 10 options

- Scale Labels (for Satisfaction Scale):
  - Min label: "e.g., Very Unsatisfied"
  - Max label: "e.g., Very Satisfied"

**Buttons:** "← Back", "Save Draft", "Next →"

---

### Step 6: Grading Weights

**Section Description:**
"Set the weight for each grading component. The total must equal 100%. You can also set this later when grading."

**Weight Inputs:**
```
┌─────────────────────────────────────────────────────────────┐
│ Questionnaire Design    [  30  ] %                          │
│ Experiment Process      [  40  ] %                          │
│ Analysis Report         [  30  ] %                          │
├─────────────────────────────────────────────────────────────┤
│ Total:                     100 %  ✓                         │
└─────────────────────────────────────────────────────────────┘
```

- Show error if total ≠ 100%: "⚠ Total must equal 100%"
- Slider or number input for each weight

**Buttons:** "← Back", "Save as Draft", "Save and Publish"

**Publish Confirmation Dialog:**
- Title: "Publish Topic"
- Message: "Once published, the Excel data and field mapping cannot be modified. Are you sure you want to publish?"
- Checkboxes showing what's been completed:
  - ✓ Basic information
  - ✓ Population data (10,000 rows)
  - ✓ Field mapping (6 fields)
  - ✓ Attachments (3 files) - or "No attachments"
  - ✓ Sample questions (4 questions) - or "No sample questions"
  - ✓ Grading weights configured
- Buttons: "Cancel", "Publish"

---

## Page 4: Task Management

### Layout
List of published tasks (topic + class combinations) with progress tracking.

### Components

**Header Section**
- Page title: "My Tasks"
- Filters:
  - Topic: dropdown
  - Class: dropdown
  - Status: All / In Progress / Ended
- Button: "+ Publish New Task"

**Task Table**
| Topic | Class | Open Time | Deadline | Progress | Pending | Actions |
|-------|-------|-----------|----------|----------|---------|---------|
| Consumer Survey | Stats 101-A | Mar 1 | Mar 31 | 32/45 (71%) | 8 | View Progress, Extend, Grade |
| Consumer Survey | Stats 101-B | Mar 1 | Mar 31 | 28/42 (67%) | 5 | View Progress, Extend, Grade |
| Market Research | Stats 102-A | Mar 15 | Apr 15 | 5/40 (12%) | 0 | View Progress, Extend, Grade |

- Progress shows: submitted / total students
- Pending shows count waiting for grading
- "Grade" button has badge if pending > 0

---

## Page 4.1: Publish Task Dialog

**Accessed from:** "+ Publish New Task" button or "Publish to Class" on topic card

**Dialog Content:**

**Step 1: Select Topic**
- Dropdown showing only published topics
- After selection, show topic summary:
  - Name, data rows, field count

**Step 2: Select Target Classes**
- Checkbox list of teacher's classes
- Can select multiple
- Show student count for each class
```
☑ Statistics 101 - Section A (45 students)
☑ Statistics 101 - Section B (42 students)
☐ Statistics 102 - Section A (40 students)
```

**Step 3: Set Schedule**
- Open Time:
  - Radio: ○ Immediately  ○ Schedule for later
  - Date-time picker (if scheduled)
- Deadline:
  - Radio: ○ No deadline  ○ Set deadline
  - Date-time picker (if set)

**Summary before confirm:**
"You are about to publish 'Consumer Survey' to 2 classes (87 students total)"

**Buttons:** "Cancel", "Publish Task"

---

## Page 4.2: Task Progress Detail

**Accessed from:** "View Progress" on task row

**Header:**
- Breadcrumb: Tasks > Consumer Survey > Statistics 101-A
- Task info: Topic name, Class name, Deadline with countdown

**Overall Progress Section:**
```
┌─────────────────────────────────────────────────────────────┐
│ Overall Progress                                             │
│                                                              │
│ ████████████████████░░░░░░░░░░  71% (32/45)                 │
│                                                              │
│ Not Started: 5    In Progress: 8    Submitted: 24           │
│ Graded: 16        Rejected: 3                               │
└─────────────────────────────────────────────────────────────┘
```

**Stage Breakdown:**
```
Stage Progress:
├── Stage 1 (Questionnaire): 40 completed
├── Stage 2 (Sample Size):   38 completed
├── Stage 3 (Sampling):      35 completed
└── Stage 4 (Report):        32 completed
```

**Student List Table:**
| Student ID | Name | Status | Current Stage | Last Activity | Actions |
|------------|------|--------|---------------|---------------|---------|
| 2024010001 | Chen Xiaoming | Submitted | - | Mar 15, 14:30 | View, Grade |
| 2024010002 | Wang Li | In Progress | Stage 3 | Mar 15, 10:20 | View |
| 2024010003 | Zhang Wei | Graded | - | Mar 14, 16:00 | View |
| 2024010004 | Liu Fang | Rejected | - | Mar 13, 09:00 | View, Re-grade |
| 2024010005 | Zhao Ming | Not Started | - | - | - |

**Status color coding:**
- Not Started: Gray
- In Progress: Blue
- Submitted: Orange
- Graded: Green
- Rejected: Red

---

## Page 4.3: Extend Deadline Dialog

**Dialog Content:**
- Title: "Extend Deadline"
- Current deadline shown: "Current: March 31, 2024 23:59"
- New deadline picker
- Must be after current deadline
- Buttons: "Cancel", "Update Deadline"

---

## Page 5: Grading

### Layout
Main grading interface with filters and submission list.

### Components

**Header Section**
- Page title: "Grading"
- Filters:
  - Class: dropdown
  - Topic: dropdown
  - Status: Pending / Graded / Rejected / All

**Submission List**
| Student ID | Name | Class | Topic | Submitted | Status | Score | Actions |
|------------|------|-------|-------|-----------|--------|-------|---------|
| 2024010001 | Chen Xiaoming | Stats 101-A | Consumer Survey | Mar 15 | Pending | - | Grade |
| 2024010002 | Wang Li | Stats 101-A | Consumer Survey | Mar 15 | Pending | - | Grade |
| 2024010006 | Li Hua | Stats 101-B | Consumer Survey | Mar 14 | Graded | 85 | View, Re-grade |
| 2024010007 | Zhou Yang | Stats 101-B | Consumer Survey | Mar 13 | Rejected | - | View |

- Sort by: Submitted time (newest first by default)
- Pending items highlighted or shown at top

---

## Page 5.1: Grading Interface

### Layout
Split-screen view: Left side for student submission, Right side for grading form.

### Left Panel: Student Submission View

**Tabs:**
- [Questionnaire] [Experiment Report]

**Questionnaire Tab:**
- Embedded PDF viewer or formatted preview
- Shows complete questionnaire: title, welcome message, all questions, closing message
- Toolbar: Zoom in/out, Download PDF

**Experiment Report Tab:**
- Shows the generated report including:
  - Sample size planning parameters
  - Three sampling method results (summary)
  - Auto-generated charts (embedded images):
    - Mean comparison bar chart
    - Distribution comparison curves
    - Proportion comparison chart
    - Error comparison table
  - Student's written analysis
- Download PDF button

### Right Panel: Grading Form

**Weight Configuration Alert (if not set):**
```
⚠️ Grading weights not configured for this topic.
[Set Weights] - opens modal to set weights
```

**Score Inputs:**
```
┌─────────────────────────────────────────────────────────────┐
│ Grading                                                      │
├─────────────────────────────────────────────────────────────┤
│ Questionnaire Design (30%)                                   │
│ Machine Score: 82                                            │
│ Your Score: [____85____] / 100                              │
│ Note (optional): [Good variety of question types_______]    │
├─────────────────────────────────────────────────────────────┤
│ Experiment Process (40%)                                     │
│ Your Score: [____80____] / 100                              │
│ Note (optional): [_________________________________]         │
├─────────────────────────────────────────────────────────────┤
│ Analysis Report (30%)                                        │
│ Your Score: [____78____] / 100                              │
│ Note (optional): [Could elaborate more on reasons___]       │
├─────────────────────────────────────────────────────────────┤
│ Total Score: 85 × 0.3 + 80 × 0.4 + 78 × 0.3 = 80.9         │
│ Final Score: 81                                              │
└─────────────────────────────────────────────────────────────┘
```

**Comment Section:**
- Label: "Overall Comment"
- Rich text editor or textarea
- Max 500 characters
- Optional: Quick comment buttons for common feedback
  - "Well done!" "Needs improvement in analysis" "Good methodology"

**Action Buttons:**
```
[Save Draft]  [Reject]  [Approve]  [Approve & Next →]
```

- **Save Draft:** Save scores without finalizing
- **Reject:** Opens rejection dialog
- **Approve:** Finalize grade, mark as graded
- **Approve & Next:** Finalize and move to next pending submission

**Rejection Dialog:**
- Title: "Reject Submission"
- Message: "The student will need to redo the entire experiment from Stage 1."
- Rejection reason (required): Textarea, max 500 characters
- Placeholder: "Please explain what needs to be improved..."
- Buttons: "Cancel", "Reject" (destructive)

---

## Page 6: Teaching Assistants

### Layout
Manage TAs created by this teacher.

### Components

**Header Section**
- Page title: "My Teaching Assistants"
- Button: "+ Add Teaching Assistant"

**TA List**
| Account | Name | Assigned Classes | Created | Actions |
|---------|------|------------------|---------|---------|
| ta_wang | Wang Fang | Stats 101-A, Stats 101-B | Mar 1 | Edit, Manage Classes, Reset Password, Delete |
| ta_liu | Liu Qiang | Stats 102-A | Mar 5 | Edit, Manage Classes, Reset Password, Delete |
| ta_zhang | Zhang Min | None | Mar 10 | Edit, Manage Classes, Reset Password, Delete |

**Add TA Dialog:**
- Title: "Add Teaching Assistant"
- Fields:
  - Account (required): Text input, used for login
  - Name (required): Text input
  - Initial Password (optional): Leave empty to use account as password
- Buttons: "Cancel", "Create"

**Manage Classes Dialog:**
- Title: "Assign Classes to [TA Name]"
- Checkbox list of teacher's classes:
```
☑ Statistics 101 - Section A
☑ Statistics 101 - Section B
☐ Statistics 102 - Section A
```
- Buttons: "Cancel", "Save"

---

## Page 7: Grade Export

### Layout
Export grades to Excel file.

### Components

**Header Section**
- Page title: "Export Grades"

**Filter Section:**
```
┌─────────────────────────────────────────────────────────────┐
│ Select Class: [Statistics 101 - Section A    ▼] (required)  │
│                                                              │
│ Select Topic: [All Topics                    ▼] (optional)  │
│               [Consumer Survey               ]              │
│               [Market Research               ]              │
└─────────────────────────────────────────────────────────────┘
```

**Preview Section:**
After selecting filters:
```
┌─────────────────────────────────────────────────────────────┐
│ Export Preview                                               │
│                                                              │
│ Class: Statistics 101 - Section A                           │
│ Topic: All Topics                                            │
│ Students: 45                                                 │
│ Graded: 40                                                   │
│ Not Graded: 5 (will show as "Not Submitted" in export)      │
│                                                              │
│ Columns to be exported:                                      │
│ • Student ID                                                 │
│ • Name                                                       │
│ • Topic Name (if multiple topics)                           │
│ • Questionnaire Score                                        │
│ • Process Score                                              │
│ • Report Score                                               │
│ • Total Score                                                │
│ • Submission Time                                            │
│ • Grading Time                                               │
│ • Status                                                     │
│ • Teacher Comment                                            │
└─────────────────────────────────────────────────────────────┘
```

**Export Button:**
- Primary button: "Export to Excel"
- Downloads .xlsx file with formatted data

---

## Page 8: View Historical Submissions

### Accessed from:
Task Progress page or Grading page when viewing a student

### Layout
Shows all submission attempts for a student on a specific task.

### Components

**Header:**
- Student info: Name, Student ID
- Task info: Topic name, Class

**Submission History Timeline:**
```
┌─────────────────────────────────────────────────────────────┐
│ Submission #2 (Current)                         Mar 15, 2024│
│ Status: ✅ Graded                                            │
│ Score: 85                                                    │
│ [View Questionnaire PDF]  [View Report PDF]                 │
├─────────────────────────────────────────────────────────────┤
│ Submission #1                                   Mar 10, 2024│
│ Status: ❌ Rejected                                          │
│ Reason: "Analysis section lacks depth. Please provide..."  │
│ [View Questionnaire PDF]  [View Report PDF]                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Common UI Patterns

### Toast Notifications
- Success: "Grade saved successfully", "Task published"
- Error: "Failed to upload file", "Please fill in required fields"
- Info: "Draft saved"

### Empty States
- No topics: "You haven't created any topics yet. [Create Your First Topic]"
- No pending grading: "All caught up! No submissions waiting for grading."
- No TAs: "You haven't added any teaching assistants yet."

### Loading States
- Skeleton loaders for lists and tables
- Progress indicator for file uploads
- Spinner on buttons during processing

### Responsive Design
- Sidebar collapses on tablet/mobile
- Grading split-view becomes tabbed view on mobile
- Tables become card lists on small screens

---

## Color Scheme

Same as admin panel for consistency:
- Primary: Blue (#3B82F6)
- Success: Green (#22C55E)
- Warning: Amber (#F59E0B)
- Danger: Red (#EF4444)
- Neutral: Gray (#6B7280)

### Status Colors
- Not Started: Gray (#9CA3AF)
- In Progress: Blue (#3B82F6)
- Submitted/Pending: Orange (#F97316)
- Graded/Approved: Green (#22C55E)
- Rejected: Red (#EF4444)

---

## Sample Prompt for AI Tools

```
Create a teacher dashboard for a university statistical sampling teaching system with these pages:

1. Dashboard - Cards showing: My Classes count, My Topics count, Pending Grading count (highlighted), Active Tasks count. Include quick action buttons and recent activity timeline.

2. Class Management - Card list of assigned classes showing class name, semester, student count. Each card has "Manage Students" button leading to student table with columns: Student ID, Name, Status, Last Login, Actions (Reset Password, Remove). Include "Add Student" form and "Batch Import" with CSV upload.

3. Topic Management - Card list of topics with status badge (Draft/Published), data row count, description preview, and action buttons. Include a 6-step wizard for creating topics:
   - Step 1: Name and description (rich text)
   - Step 2: Excel upload with preview table
   - Step 3: Field mapping - select columns and assign types (Identifier/Stratification/Numeric/Categorical)
   - Step 4: File attachments (images, videos, documents)
   - Step 5: Sample questions (True/False, Single Choice, Multiple Choice, 1-10 Scale)
   - Step 6: Grading weights (3 components totaling 100%)

4. Task Management - Table showing Topic, Class, Open Time, Deadline, Progress (submitted/total), Pending count, Actions. Include "Publish Task" dialog to select topic, choose classes (multi-select), and set schedule. Task detail page shows progress breakdown by stage and student list with status.

5. Grading - Split-screen interface. Left: PDF viewer with tabs for Questionnaire and Report. Right: Score inputs for 3 components (showing machine score for questionnaire), comment textarea, and buttons: Save Draft, Reject (with reason dialog), Approve, Approve & Next.

6. Teaching Assistants - Table with Account, Name, Assigned Classes (tags), Actions. Dialog for adding TA and assigning classes via checkboxes.

7. Grade Export - Select class and optionally topic, show preview of export contents, download Excel button.

Use React, Tailwind CSS, shadcn/ui. Professional LMS-style design with collapsible sidebar. Status colors: gray (not started), blue (in progress), orange (submitted), green (graded), red (rejected).
```

---

*End of specification*
