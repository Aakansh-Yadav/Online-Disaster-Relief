import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { BoardPage } from './pages/BoardPage'
import { PostNeedPage } from './pages/PostNeedPage'
import { PostOfferPage } from './pages/PostOfferPage'
import { AboutPage } from './pages/AboutPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/post/need" element={<PostNeedPage />} />
        <Route path="/post/offer" element={<PostOfferPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Route>
    </Routes>
  )
}
