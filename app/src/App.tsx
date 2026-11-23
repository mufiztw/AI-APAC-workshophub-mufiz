import { Link, Route, Routes } from 'react-router-dom'
import SessionDetailPage from './pages/SessionDetailPage'
import TrainingSessionsPage from './pages/TrainingSessionsPage'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <Link to="/" className="app-title-link">
            WorkshopHub
          </Link>
        </h1>
        <p className="app-tagline">Internal Training Registration System</p>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<TrainingSessionsPage />} />
          <Route path="/sessions/:id" element={<SessionDetailPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
