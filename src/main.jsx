import React from 'react'
import ReactDOM from 'react-dom/client'
import AuthApp from './AuthApp'

import '@ui5/webcomponents-icons/dist/AllIcons.js'
import '@ui5/webcomponents-react/dist/Assets.js'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthApp />
  </React.StrictMode>
)