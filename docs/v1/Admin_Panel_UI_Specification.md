# Admin Panel UI Specification for Statistical Sampling Simulation System

## Overview

This is the admin panel for a university statistical sampling virtual simulation teaching platform. The admin is typically a school IT staff member who manages the foundational infrastructure of the system.

**Tech Stack Preference:** React + Tailwind CSS + shadcn/ui components

**Design Style:** Clean, professional, minimal. Similar to modern SaaS admin dashboards.

---

## Global Layout

### Structure
- **Left Sidebar:** Fixed navigation menu (collapsible on mobile)
- **Top Header:** System name, admin badge, logout button
- **Main Content Area:** Dynamic content based on selected menu

### Sidebar Menu Items
1. Dashboard (icon: LayoutDashboard)
2. Semester Management (icon: Calendar)
3. Teacher Management (icon: GraduationCap)
4. Teaching Assistant Management (icon: Users)
5. Class Management (icon: School)
6. Student Management (icon: UserSearch)
7. System Monitoring (icon: Activity)
8. Announcements (icon: Megaphone)

---

## Page 1: Dashboard

### Layout
A grid of summary cards at the top, followed by a system status section.

### Components

**Row 1: Statistics Cards (4 cards in a row)**
- Card 1: "Current Semester" - displays semester name (e.g., "2024-Spring"), with a badge "Active"
- Card 2: "Total Teachers" - number with a small teacher icon
- Card 3: "Total Classes" - number with a small class icon
- Card 4: "Total Students" - number with a small student icon

**Row 2: Additional Stats (2 cards)**
- Card 5: "Total Teaching Assistants" - number
- Card 6: "Today's Active Users" - number

**Row 3: System Status Alert**
- A status banner showing:
  - Green: "All systems operational"
  - Yellow: "Warning: [issue description]"
  - Red: "Critical: [issue description]"

---

## Page 2: Semester Management

### Layout
A page with a data table and action buttons.

### Components

**Header Section**
- Page title: "Semester Management"
- Primary button: "+ Create Semester" (top right)

**Data Table**
Columns:
| Semester Name | Status | Classes | Created At | Actions |
|---------------|--------|---------|------------|---------|
| 2024-Spring | Current (green badge) | 12 | 2024-01-15 | Set as History, Delete |
| 2023-Fall | History (gray badge) | 10 | 2023-08-20 | Set as Current, Delete |

- Status column shows a badge: green "Current" or gray "History"
- Delete button is disabled if the semester has classes (show tooltip on hover: "Cannot delete semester with existing classes")

**Create Semester Dialog (Modal)**
- Title: "Create New Semester"
- Input field: "Semester Name" with placeholder "e.g., 2024-Fall"
- Helper text: "Format: YYYY-Spring or YYYY-Fall"
- Checkbox: "Set as current semester"
- Buttons: "Cancel" (secondary), "Create" (primary)

---

## Page 3: Teacher Management

### Layout
A searchable data table with CRUD operations.

### Components

**Header Section**
- Page title: "Teacher Management"
- Search box: placeholder "Search by employee ID or name..."
- Primary button: "+ Add Teacher"

**Data Table**
Columns:
| Employee ID | Name | Classes | Created At | Actions |
|-------------|------|---------|------------|---------|
| T2024001 | Zhang Wei | 3 | 2024-01-15 | Edit, Reset Password, View Classes |
| T2024002 | Li Ming | 2 | 2024-01-16 | Edit, Reset Password, View Classes |

- "Classes" is a clickable number that opens a popover showing class names
- Actions are in a dropdown menu (three dots icon)

**Add Teacher Dialog (Modal)**
- Title: "Add New Teacher"
- Fields:
  - Employee ID (required): text input
  - Name (required): text input
  - Initial Password (optional): text input with placeholder "Leave empty to use Employee ID as password"
- Buttons: "Cancel", "Add Teacher"

**Reset Password Confirmation Dialog**
- Title: "Reset Password"
- Message: "Are you sure you want to reset the password for [Teacher Name]? The password will be reset to their Employee ID."
- Buttons: "Cancel", "Reset Password" (destructive style)

---

## Page 4: Teaching Assistant Management

### Layout
Similar to Teacher Management, but showing creator information.

### Components

**Header Section**
- Page title: "Teaching Assistant Management"
- Search box: placeholder "Search by account or name..."
- Note: TAs are created by teachers, admin can only manage existing accounts

**Data Table**
Columns:
| Account | Name | Created By | Assigned Classes | Created At | Actions |
|---------|------|------------|------------------|------------|---------|
| ta_wang | Wang Fang | Zhang Wei | Class A, Class B | 2024-02-01 | Reset Password, Delete |
| ta_liu | Liu Qiang | Li Ming | Class C | 2024-02-03 | Reset Password, Delete |

- "Created By" shows the teacher who created this TA
- "Assigned Classes" shows as tags/badges, or "None" if not assigned
- Actions: Reset Password, Delete (with confirmation)

**Delete Confirmation Dialog**
- Title: "Delete Teaching Assistant"
- Message: "Are you sure you want to delete TA account '[Account]'? This action cannot be undone."
- Buttons: "Cancel", "Delete" (destructive red)

---

## Page 5: Class Management

### Layout
A filterable data table with class information.

### Components

**Header Section**
- Page title: "Class Management"
- Filter dropdowns:
  - Semester: dropdown with all semesters (default: current semester)
  - Teacher: dropdown with all teachers (default: all)
- Primary button: "+ Create Class"

**Data Table**
Columns:
| Class Name | Semester | Teacher | Students | Created At | Actions |
|------------|----------|---------|----------|------------|---------|
| Statistics 101 - Section A | 2024-Spring | Zhang Wei | 45 | 2024-01-20 | Edit, View Students, Delete |
| Statistics 101 - Section B | 2024-Spring | Li Ming | 42 | 2024-01-20 | Edit, View Students, Delete |

- "Students" is the count of active students in that class
- Delete is disabled if class has students (show tooltip)

**Create Class Dialog (Modal)**
- Title: "Create New Class"
- Fields:
  - Class Name (required): text input
  - Semester (required): dropdown, default to current semester
  - Assigned Teacher (required): dropdown with teacher list
- Buttons: "Cancel", "Create Class"

**Edit Class Dialog (Modal)**
- Title: "Edit Class"
- Fields:
  - Class Name: text input (pre-filled)
  - Assigned Teacher: dropdown (can change teacher)
- Note: Semester cannot be changed after creation
- Buttons: "Cancel", "Save Changes"

---

## Page 6: Student Management

### Layout
A search-first interface for finding and managing individual students.

### Components

**Header Section**
- Page title: "Student Management"
- Large search box with icon: placeholder "Enter student ID to search..."
- Helper text below: "Search by exact student ID to find and manage student accounts"

**Empty State (before search)**
- Icon: UserSearch (large, muted)
- Text: "Enter a student ID above to search"

**Search Results (after search)**

If found, show a student detail card:
```
┌─────────────────────────────────────────────────┐
│ Student Information                              │
├─────────────────────────────────────────────────┤
│ Student ID:    2024010001                       │
│ Name:          Chen Xiaoming                    │
│ Class:         Statistics 101 - Section A      │
│ Status:        ● Active  (green dot)            │
│                ○ Disabled (if disabled, red)   │
├─────────────────────────────────────────────────┤
│ Actions:                                        │
│ [Reset Password]  [Disable Account]             │
│ (or [Enable Account] if currently disabled)    │
└─────────────────────────────────────────────────┘
```

If not found:
- Message: "No student found with ID '[searched ID]'"

**Disable Account Confirmation Dialog**
- Title: "Disable Student Account"
- Message: "Are you sure you want to disable the account for [Student Name]? The student will not be able to log in, but their data will be preserved."
- Buttons: "Cancel", "Disable Account" (destructive)

**Enable Account Confirmation Dialog**
- Title: "Enable Student Account"
- Message: "Are you sure you want to re-enable the account for [Student Name]?"
- Buttons: "Cancel", "Enable Account"

---

## Page 7: System Monitoring

### Layout
A dashboard with real-time system metrics.

### Components

**Header Section**
- Page title: "System Monitoring"
- Last updated timestamp with refresh button: "Last updated: 2024-03-15 14:30:25 [Refresh]"
- Auto-refresh toggle: "Auto-refresh every 60 seconds"

**Row 1: Server Status Cards (3 cards)**

Card 1: CPU Usage
- Large circular progress indicator (gauge style)
- Percentage in center: "45%"
- Color: Green (<60%), Yellow (60-80%), Red (>80%)
- Label below: "CPU Usage"

Card 2: Memory Usage
- Same gauge style
- Percentage: "62%"
- Label: "Memory Usage"

Card 3: Disk Usage
- Same gauge style
- Percentage: "35%"
- Additional text: "350 GB / 1 TB"
- Label: "Disk Usage"

**Row 2: Application Metrics Cards (3 cards)**

Card 4: Online Users
- Large number: "127"
- Icon: Users
- Label: "Currently Online"

Card 5: Today's Logins
- Large number: "456"
- Icon: LogIn
- Label: "Today's Logins"

Card 6: API Requests Today
- Large number: "12,847"
- Icon: Activity
- Label: "API Requests Today"

**Row 3: Alerts Section**

Section title: "System Alerts"

Alert list (if any):
```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ Warning: Disk usage above 80%                   2 hrs ago │
│ ⚠️ Warning: High memory usage detected             5 hrs ago │
└─────────────────────────────────────────────────────────────┘
```

If no alerts:
- Green checkmark icon
- Text: "No active alerts. All systems are operating normally."

---

## Page 8: Announcements

### Layout
A list of announcements with create/edit functionality.

### Components

**Header Section**
- Page title: "Announcements"
- Primary button: "+ New Announcement"

**Announcements List**

Display as cards, newest first:
```
┌─────────────────────────────────────────────────────────────┐
│ System Maintenance Notice                                    │
│ Status: 🟢 Published                          Mar 15, 2024  │
├─────────────────────────────────────────────────────────────┤
│ The system will undergo scheduled maintenance on March 20th │
│ from 2:00 AM to 4:00 AM. Please save your work beforehand.  │
├─────────────────────────────────────────────────────────────┤
│ [Edit]  [Unpublish]  [Delete]                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Welcome to New Semester                                      │
│ Status: ⚫ Unpublished                        Mar 10, 2024  │
├─────────────────────────────────────────────────────────────┤
│ Welcome to the 2024 Spring semester! Please check your...   │
├─────────────────────────────────────────────────────────────┤
│ [Edit]  [Publish]  [Delete]                                 │
└─────────────────────────────────────────────────────────────┘
```

**Create/Edit Announcement Dialog (Modal or full page)**
- Title: "New Announcement" or "Edit Announcement"
- Fields:
  - Title (required): text input, max 100 characters, with character counter
  - Content (required): rich text editor or textarea, max 2000 characters
- Buttons: "Cancel", "Save as Draft", "Publish"

**Delete Confirmation Dialog**
- Title: "Delete Announcement"
- Message: "Are you sure you want to delete this announcement? This action cannot be undone."
- Buttons: "Cancel", "Delete" (destructive)

**Publish/Unpublish Confirmation**
- For Publish: "This announcement will be visible to all users immediately."
- For Unpublish: "This announcement will be hidden from all users."

---

## Common UI Patterns

### Toast Notifications
Use for action feedback:
- Success: "Teacher added successfully" (green)
- Error: "Failed to create class. Please try again." (red)
- Warning: "This action cannot be undone" (yellow)

### Empty States
For tables with no data:
- Relevant icon (muted)
- Message: "No [items] found"
- Call-to-action button if applicable

### Loading States
- Skeleton loaders for tables and cards
- Spinner for buttons during action processing

### Confirmation Dialogs
All destructive actions require confirmation:
- Delete operations
- Password resets
- Account status changes

### Responsive Behavior
- Sidebar collapses to hamburger menu on mobile
- Tables become card-based lists on small screens
- Dashboard cards stack vertically on mobile

---

## Color Scheme Suggestion

- Primary: Blue (#3B82F6)
- Success/Active: Green (#22C55E)
- Warning: Yellow/Amber (#F59E0B)
- Danger/Destructive: Red (#EF4444)
- Neutral/Disabled: Gray (#6B7280)
- Background: White (#FFFFFF) or very light gray (#F9FAFB)
- Text: Dark gray (#111827)

---

## Sample Prompt for AI Tools

You can use this prompt with bolt.new or v0.dev:

```
Create an admin dashboard for a university teaching management system with the following pages:

1. Dashboard - Summary cards showing current semester, total teachers (count), total classes, total students, total TAs, and today's active users. Include a system status banner.

2. Semester Management - A data table with columns: Semester Name, Status (Current/History badge), Classes count, Created At, Actions (Set as Current/History, Delete). Include a "Create Semester" button and modal.

3. Teacher Management - Searchable table with columns: Employee ID, Name, Classes count, Created At, Actions dropdown (Edit, Reset Password, View Classes). Include "Add Teacher" modal.

4. TA Management - Table showing Account, Name, Created By (teacher name), Assigned Classes (as tags), Created At, Actions (Reset Password, Delete).

5. Class Management - Filterable table (by semester and teacher) with columns: Class Name, Semester, Teacher, Students count, Created At, Actions. Include Create/Edit modals.

6. Student Management - Search-first interface. Enter student ID to find student, then show detail card with Name, Class, Status, and action buttons (Reset Password, Disable/Enable Account).

7. System Monitoring - Dashboard with 3 gauge charts (CPU, Memory, Disk usage), 3 metric cards (Online Users, Today's Logins, API Requests), and an alerts section.

8. Announcements - Card-based list of announcements with title, status badge, date, preview content, and actions (Edit, Publish/Unpublish, Delete). Include create/edit form with rich text editor.

Use React, Tailwind CSS, and shadcn/ui components. Clean, professional design with a collapsible sidebar navigation.
```

---

*End of specification*
