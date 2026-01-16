import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AdminLayout } from '@/layouts/admin-layout'
import {
  DashboardPage,
  SemestersPage,
  TeachersPage,
  AssistantsPage,
  ClassesPage,
  StudentsPage,
  MonitoringPage,
  AnnouncementsPage,
} from '@/pages'
import { Toaster } from '@/components/ui/sonner'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="semesters" element={<SemestersPage />} />
          <Route path="teachers" element={<TeachersPage />} />
          <Route path="assistants" element={<AssistantsPage />} />
          <Route path="classes" element={<ClassesPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="monitoring" element={<MonitoringPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}

export default App
