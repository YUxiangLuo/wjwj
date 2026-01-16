import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AssistantLayout } from '@/layouts/assistant-layout'
import {
    DashboardPage,
    ClassesPage,
    TaskProgressPage,
    GradingPage,
    GradingDetailPage,
} from '@/pages'

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route element={<AssistantLayout />}>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/classes" element={<ClassesPage />} />
                    <Route path="/classes/:classId/progress/:taskId" element={<TaskProgressPage />} />
                    <Route path="/grading" element={<GradingPage />} />
                    <Route path="/grading/:submissionId" element={<GradingDetailPage />} />
                </Route>
            </Routes>
        </BrowserRouter>
    )
}

export default App
