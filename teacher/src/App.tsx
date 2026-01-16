import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { TeacherLayout } from '@/layouts/teacher-layout'
import {
    DashboardPage,
    ClassesPage,
    StudentsPage,
    TopicsPage,
    TasksPage,
    GradingPage,
    AssistantsPage,
    ExportPage,
} from '@/pages'

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route element={<TeacherLayout />}>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/classes" element={<ClassesPage />} />
                    <Route path="/classes/:classId/students" element={<StudentsPage />} />
                    <Route path="/topics" element={<TopicsPage />} />
                    <Route path="/tasks" element={<TasksPage />} />
                    <Route path="/grading" element={<GradingPage />} />
                    <Route path="/assistants" element={<AssistantsPage />} />
                    <Route path="/export" element={<ExportPage />} />
                </Route>
            </Routes>
        </BrowserRouter>
    )
}

export default App
