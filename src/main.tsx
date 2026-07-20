import { createRoot } from 'react-dom/client'
import App from './App'
import { AppStoreProvider } from './app/AppStore'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <AppStoreProvider>
    <App />
  </AppStoreProvider>,
)
