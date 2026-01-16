import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { StudentLayout } from '@/layouts/student-layout'
import { TaskHallPage, TopicDetailPage } from '@/pages'

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route element={<StudentLayout />}>
                    <Route path="/" element={<TaskHallPage />} />
                    <Route path="/topic/:taskId" element={<TopicDetailPage />} />
                </Route>
            </Routes>
        </BrowserRouter>
    )
}

export default App
