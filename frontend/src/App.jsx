import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { QueueProvider } from './context/QueueContext';
import { ProtectedRoute, PublicOnly } from './routes/ProtectedRoute';
import DashboardLayout from './components/layout/DashboardLayout';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Dashboard from './pages/Dashboard';
import DailyPractice from './pages/DailyPractice';
import Questions from './pages/questions/Questions';
import QuestionFormPage from './pages/questions/QuestionFormPage';
import QuestionDetail from './pages/questions/QuestionDetail';
import ImportQuestions from './pages/questions/ImportQuestions';
import Revision from './pages/revision/Revision';
import RevisionSession from './pages/revision/RevisionSession';
import Roadmap from './pages/Roadmap';
import Habit from './pages/Habit';
import Interview from './pages/Interview';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <AuthProvider>
      <QueueProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/login"
              element={
                <PublicOnly>
                  <Login />
                </PublicOnly>
              }
            />
            <Route
              path="/register"
              element={
                <PublicOnly>
                  <Register />
                </PublicOnly>
              }
            />

            <Route
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/daily" element={<DailyPractice />} />
              <Route path="/questions" element={<Questions />} />
              <Route path="/questions/new" element={<QuestionFormPage />} />
              <Route path="/questions/import" element={<ImportQuestions />} />
              <Route path="/questions/:id" element={<QuestionDetail />} />
              <Route path="/questions/:id/edit" element={<QuestionFormPage />} />
              <Route path="/revision" element={<Revision />} />
              <Route path="/revision/session" element={<RevisionSession />} />
              <Route path="/roadmap" element={<Roadmap />} />
              <Route path="/habit" element={<Habit />} />
              <Route path="/interview" element={<Interview />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </BrowserRouter>
      </QueueProvider>
    </AuthProvider>
  );
}
