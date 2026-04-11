import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.tsx'

// StrictMode is intentionally omitted: G6 is an imperative canvas library whose
// graph instance does not survive the deliberate double-mount that StrictMode
// performs in development, causing a blank canvas.
createRoot(document.getElementById('root')!).render(<App />)
