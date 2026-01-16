# Admin Panel UI Specification for Statistical Sampling Simulation System V2.0

## Overview

This document describes the UI specification for the Admin Panel (管理员端) based on Database Design V2.0. Changes from V1.0 are marked with **【V2.0】**.

### Key V2.0 Changes for Admin Panel
- Admin first-login password change requirement
- Teacher and Assistant status management (Enable/Disable)
- Login history tracking and last login time display
- System monitoring with persistent metrics
- Announcement read statistics

---

## Global Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Logo          System Name                    🔔 (3)    Admin    Logout  │
├──────────────┬──────────────────────────────────────────────────────────┤
│ Navigation   │                                                          │
│              │                     Main Content Area                    │
│ • Dashboard  │                                                          │
│ • Semesters  │                                                          │
│ • Teachers   │                                                          │
│ • Assistants │                                                          │
│ • Classes    │                                                          │
│ • Students   │                                                          │
│ • Monitoring │                                                          │
│ • Notices    │                                                          │
│              │                                                          │
└──────────────┴──────────────────────────────────────────────────────────┘
```

**Header Components:**
- Logo and system name on the left
- **【V2.0】** Notification bell with unread announcement count badge
- Admin name and logout button on the right

---

## Page 0: 【V2.0】 First Login Password Change

### Trigger
When `is_first_login = 1` for the admin account

### Layout
Centered modal or full-page card

### Components
```
┌─────────────────────────────────────────────┐
│                                             │
│       🔐 First Login - Password Change      │
│                                             │
│   For security, please set a new password   │
│                                             │
│   New Password                              │
│   ┌─────────────────────────────────────┐   │
│   │ ••••••••••                          │   │
│   └─────────────────────────────────────┘   │
│   ✓ At least 8 characters                   │
│   ✓ Contains letters and numbers            │
│                                             │
│   Confirm Password                          │
│   ┌─────────────────────────────────────┐   │
│   │ ••••••••••                          │   │
│   └─────────────────────────────────────┘   │
│   ✓ Passwords match                         │
│                                             │
│   ┌─────────────────────────────────────┐   │
│   │           Confirm Change            │   │
│   └─────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

**Validation:**
- Real-time validation as user types
- All checks must pass before button is enabled

---

## Page 1: Dashboard (首页概览)

### Layout
Grid of statistics cards and status panels

### Components

**Row 1: Statistics Cards (4 cards)**
- Card 1: "Current Semester" - displays semester name with "Active" badge
- Card 2: "Total Teachers" - number with teacher icon
- Card 3: "Total Classes" - number with class icon
- Card 4: "Total Students" - number with student icon

**Row 2: Additional Stats (3 cards)**
- Card 5: "Total Assistants" - number
- Card 6: **【V2.0】** "Today's Active Users" - number (from login_log)
- Card 7: **【V2.0】** "Today's Logins" - total login count

**【V2.0】 Row 3: System Status Quick View**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ System Status                                            [View Details] │
├────────────────────┬────────────────────┬───────────────────────────────┤
│ 🟢 CPU: 45%        │ 🟢 Memory: 62%     │ 🟡 Disk: 78%                  │
└────────────────────┴────────────────────┴───────────────────────────────┘
```

Status indicators:
- 🟢 Green: < 70%
- 🟡 Yellow: 70-85%
- 🔴 Red: > 85%

**Row 4: Announcement Banner (if any unread)**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📢 New Announcement: System Maintenance Notice...        [View] [Close] │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Page 2: Semester Management (学期管理)

### Layout
A data table with CRUD operations

### Components

**Header Section**
- Page title: "Semester Management"
- Primary button: "+ Create Semester"

**Data Table**
Columns:
| Semester Name | Status | Classes | Created At | Actions |
|---------------|--------|---------|------------|---------|
| 2024-Spring | 🟢 Current | 12 | 2024-01-01 | Set as History |
| 2023-Fall | Historical | 10 | 2023-08-01 | Set as Current, Delete |

**Create Semester Dialog (Modal)**
- Title: "Create New Semester"
- Fields:
  - Semester Name (required): text input
  - Helper text: "Format: YYYY-Spring or YYYY-Fall"
  - Checkbox: "Set as current semester"
- Buttons: "Cancel" (secondary), "Create" (primary)

---

## Page 3: Teacher Management (教师管理)

### Layout
A searchable data table with CRUD operations

### Components

**Header Section**
- Page title: "Teacher Management"
- Search box: placeholder "Search by employee ID or name..."
- Primary button: "+ Add Teacher"

**【V2.0】 Data Table**
Columns:
| Employee ID | Name | Status | Classes | Last Login | Created At | Actions |
|-------------|------|--------|---------|------------|------------|---------|
| T2024001 | Zhang Wei | 🟢 Active | 3 | 2024-03-15 10:30 | 2024-01-01 | Edit, Reset Password, Disable |
| T2024002 | Li Ming | 🔴 Disabled | 2 | 2024-02-01 09:00 | 2024-01-01 | Edit, Reset Password, Enable |

**Status Badge:**
- 🟢 Active (green) - status = 1
- 🔴 Disabled (red) - status = 0

**Actions:**
- "Edit" - opens edit dialog
- "Reset Password" - opens confirmation dialog
- **【V2.0】** "Disable" / "Enable" - toggles account status

**Add Teacher Dialog (Modal)**
- Title: "Add New Teacher"
- Fields:
  - Employee ID (required): text input
  - Name (required): text input
  - Note: "Initial password will be set to Employee ID"
- Buttons: "Cancel", "Add Teacher"

**【V2.0】 Disable Teacher Confirmation Dialog**
- Title: "Disable Teacher Account"
- Message: "Are you sure you want to disable the account for [Teacher Name]? They will not be able to log in until re-enabled."
- Warning: "This will not affect any assistants created by this teacher."
- Buttons: "Cancel", "Disable" (destructive red)

**【V2.0】 Enable Teacher Confirmation Dialog**
- Title: "Enable Teacher Account"
- Message: "Are you sure you want to re-enable the account for [Teacher Name]?"
- Buttons: "Cancel", "Enable"

---

## Page 4: Teaching Assistant Management (助教管理)

### Layout
A searchable data table

### Components

**Header Section**
- Page title: "Teaching Assistant Management"
- Search box: placeholder "Search by account or name..."
- Note: "TAs are created by teachers, admin can manage existing accounts"

**【V2.0】 Data Table**
Columns:
| Account | Name | Status | Created By | Classes | Last Login | Created At | Actions |
|---------|------|--------|------------|---------|------------|------------|---------|
| ta_wang | Wang Fang | 🟢 Active | Zhang Wei | 2 | 2024-03-15 | 2024-02-01 | Reset Password, Disable, Delete |
| ta_li | Li Hua | 🔴 Disabled | Li Ming | 1 | 2024-01-15 | 2024-02-01 | Reset Password, Enable, Delete |

**Actions:**
- "Reset Password" - confirmation dialog
- **【V2.0】** "Disable" / "Enable" - toggles status
- "Delete" - confirmation dialog (with warning about data)

---

## Page 5: Class Management (班级管理)

### Layout
A filterable data table with CRUD operations

### Components

**Header Section**
- Page title: "Class Management"
- Filter dropdowns:
  - Semester: [All Semesters ▼]
  - Teacher: [All Teachers ▼]
- Primary button: "+ Create Class"

**Data Table**
Columns:
| Class Name | Semester | Teacher | Students | Created At | Actions |
|------------|----------|---------|----------|------------|---------|
| Statistics 101 - A | 2024-Spring | Zhang Wei | 45 | 2024-01-20 | Edit, View Students, Delete |

**Create Class Dialog (Modal)**
- Title: "Create New Class"
- Fields:
  - Class Name (required)
  - Semester (required): dropdown, default to current semester
  - Teacher (required): dropdown of active teachers only
- Buttons: "Cancel", "Create"

---

## Page 6: Student Management (学生管理)

### Layout
Search-first interface for finding specific students

### Components

**Search Section**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Student Management                                                      │
│                                                                         │
│ Enter Student ID to search:                                             │
│ ┌────────────────────────────────────┐  ┌────────────┐                  │
│ │ 2024010001                         │  │   Search   │                  │
│ └────────────────────────────────────┘  └────────────┘                  │
└─────────────────────────────────────────────────────────────────────────┘
```

**【V2.0】 Student Detail Card (after search)**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Student Information                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│ Student ID:    2024010001                                               │
│ Name:          Wang Xiaoming                                            │
│ Class:         Statistics 101 - Section A                               │
│ Status:        🟢 Active                                                │
│ Last Login:    2024-03-15 14:30:25                                      │
│ Created:       2024-01-20                                               │
├─────────────────────────────────────────────────────────────────────────┤
│ [Reset Password]  [Disable Account]                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

For disabled students, show "Enable Account" button instead.

---

## Page 7: 【V2.0】 System Monitoring (系统监控)

### Layout
Dashboard with real-time and historical system metrics

### Components

**Header Section**
- Page title: "System Monitoring"
- Last updated timestamp: "Last updated: 2024-03-15 14:30:25"
- Refresh button: [🔄 Refresh]
- Auto-refresh indicator: "Auto-refresh: Every 1 minute"

**Row 1: Real-time Metrics (3 cards with mini charts)**
```
┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐
│ CPU Usage              │  │ Memory Usage           │  │ Disk Usage             │
│                        │  │                        │  │                        │
│    ╭──────────╮        │  │    ╭──────────╮        │  │    ╭──────────╮        │
│   ╱  45%      ╲        │  │   ╱  62%      ╲        │  │   ╱  78%      ╲        │
│  ╱            ╲       │  │  ╱            ╲       │  │  ╱            ╲       │
│ ╱──────────────╲      │  │ ╱──────────────╲      │  │ ╱──────────────╲      │
│ 🟢 Normal            │  │ 🟢 Normal            │  │ 🟡 Warning           │
│                        │  │                        │  │                        │
│ ▁▂▃▂▄▃▂▃▄▅ (trend)   │  │ ▁▂▃▄▅▄▃▄▅▆ (trend)   │  │ ▅▅▆▆▆▇▇▇▇▇ (trend)   │
└────────────────────────┘  └────────────────────────┘  └────────────────────────┘
```

**Row 2: Application Statistics (3 cards)**
```
┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐
│ 👥 Online Users        │  │ 🔑 Today's Logins      │  │ 📊 API Requests Today  │
│                        │  │                        │  │                        │
│        47              │  │        328             │  │       12,456           │
│                        │  │                        │  │                        │
│ Teachers: 12           │  │ Peak: 10:00 AM         │  │ Avg per user: 38       │
│ Students: 35           │  │                        │  │                        │
└────────────────────────┘  └────────────────────────┘  └────────────────────────┘
```

**Row 3: Historical Trend Charts**
- Tab selector: [1 Hour] [24 Hours] [7 Days] [30 Days]
- Line chart showing CPU, Memory, Disk trends over selected period

**Row 4: Alerts Panel**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ ⚠️ System Alerts                                            [Clear All] │
├─────────────────────────────────────────────────────────────────────────┤
│ 🟡 Warning: Disk usage above 75%                           2 hours ago  │
│ 🟢 Resolved: High memory usage returned to normal          5 hours ago  │
└─────────────────────────────────────────────────────────────────────────┘
```

If no alerts:
- Green checkmark icon
- "All systems operating normally"

---

## Page 8: Announcement Management (公告管理)

### Layout
A data table with CRUD operations and statistics

### Components

**Header Section**
- Page title: "Announcement Management"
- Primary button: "+ New Announcement"

**【V2.0】 Data Table**
Columns:
| Title | Status | Published | Read Stats | Actions |
|-------|--------|-----------|------------|---------|
| System Maintenance | 🟢 Published | 2024-03-10 | 127/250 (51%) | Edit, View Stats, Unpublish, Delete |
| Welcome Message | ⚫ Unpublished | 2024-03-08 | 89/250 (36%) | Edit, Publish, Delete |

**Announcement Card (Alternative list view)**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📢 System Maintenance Notice                          🟢 Published      │
├─────────────────────────────────────────────────────────────────────────┤
│ The system will undergo maintenance on March 20th from 2:00 AM to       │
│ 4:00 AM. Please save your work before this time...                      │
├─────────────────────────────────────────────────────────────────────────┤
│ Published: 2024-03-10 09:00    Read: 127/250 (51%)                      │
│ [Edit]  [View Stats]  [Unpublish]  [Delete]                             │
└─────────────────────────────────────────────────────────────────────────┘
```

**Create/Edit Announcement Dialog (Modal or full page)**
- Title: "New Announcement" or "Edit Announcement"
- Fields:
  - Title (required): text input, max 100 characters
  - Content (required): rich text editor, max 2000 characters
- Buttons: "Cancel", "Save as Draft", "Publish"

**【V2.0】 View Read Statistics Dialog**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Read Statistics: System Maintenance Notice                              │
├─────────────────────────────────────────────────────────────────────────┤
│ Total Read: 127 / 250 users (51%)                                       │
│                                                                         │
│ By Role:                                                                │
│ ├── Administrators:     1/1   (100%) ████████████████████               │
│ ├── Teachers:          12/15  (80%)  ████████████████░░░░               │
│ ├── Teaching Assistants: 5/8  (63%)  ████████████░░░░░░░░               │
│ └── Students:         109/226 (48%)  ██████████░░░░░░░░░░               │
│                                                                         │
│                                                          [Close]        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Common Components

### Confirmation Dialogs

**Reset Password Confirmation**
- Title: "Reset Password"
- Message: "Are you sure you want to reset the password for [Name]? The new password will be set to their ID."
- Buttons: "Cancel", "Reset Password"

**Delete Confirmation**
- Title: "Confirm Delete"
- Message: "Are you sure you want to delete [Item]? This action cannot be undone."
- Buttons: "Cancel", "Delete" (destructive red)

### Toast Notifications
- Success: Green background, checkmark icon
- Error: Red background, X icon
- Warning: Yellow background, warning icon
- Info: Blue background, info icon

---

## Responsive Design Notes

- Sidebar collapses to hamburger menu on mobile
- Tables become card-based lists on small screens
- Dashboard cards stack vertically on mobile
- Monitoring charts resize or show simplified view on mobile

---

## Color Scheme

- Primary: Blue (#3B82F6)
- Success/Active: Green (#22C55E)
- Warning: Yellow/Amber (#F59E0B)
- Danger/Destructive/Disabled: Red (#EF4444)
- Neutral/Historical: Gray (#6B7280)
- Background: White (#FFFFFF) or light gray (#F9FAFB)
- Text: Dark gray (#111827)

---

## V2.0 Changes Summary

| Feature | Page | Description |
|---------|------|-------------|
| First Login Password Change | New Page 0 | Admin must change password on first login |
| Teacher Status Management | Page 3 | Enable/Disable accounts, show status and last login |
| Assistant Status Management | Page 4 | Enable/Disable accounts, show status and last login |
| Student Last Login | Page 6 | Display last login time in detail card |
| System Monitoring | Page 7 | Persistent metrics, historical trends, alerts |
| Announcement Read Stats | Page 8 | Track and display read statistics by role |
| Unread Badge | Global Header | Show count of unread announcements |
| Today's Active Users | Dashboard | New stat card from login_log |

---

*End of specification*
