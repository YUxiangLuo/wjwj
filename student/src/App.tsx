import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { StudentLayout } from '@/layouts/student-layout'
import {
    TaskHallPage,
    TopicDetailPage,
    QuestionnaireDesignPage,
    SampleSizePlanningPage,
    SamplingExecutionPage,
    AnalysisReportPage
} from '@/pages'

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route element={<StudentLayout />}>
                    <Route path="/" element={<TaskHallPage />} />
                    <Route path="/topic/:taskId" element={<TopicDetailPage />} />
                    <Route path="/experiment/:taskId/stage1" element={<QuestionnaireDesignPage />} />
                    <Route path="/experiment/:taskId/stage2" element={<SampleSizePlanningPage />} />
                    <Route path="/experiment/:taskId/stage3" element={<SamplingExecutionPage />} />
                    <Route path="/experiment/:taskId/stage4" element={<AnalysisReportPage />} />
                </Route>
            </Routes>
        </BrowserRouter>
    )
}

export default App
