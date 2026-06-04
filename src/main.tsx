import './initLanguage'
import React from 'react'
import ReactDOM from 'react-dom/client'
import AuthApp from './AuthApp'

import '@ui5/webcomponents-icons/dist/AllIcons.js'
import '@ui5/webcomponents-react/dist/Assets.js'
import './index.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Failed to find the root element')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AuthApp />
  </React.StrictMode>
)
