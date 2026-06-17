import './initLanguage'
import React from 'react'
import ReactDOM from 'react-dom/client'
import AuthApp from './AuthApp'

import '@ui5/webcomponents-icons/dist/AllIcons.js'
import '@ui5/webcomponents-react/dist/Assets.js'
import './index.css'

let rootInstance: any = null

export function mountReactApp(container: HTMLElement) {
  if (rootInstance) {
    try {
      rootInstance.unmount()
    } catch (e) {
      console.warn('Failed to unmount existing root:', e)
    }
  }
  rootInstance = ReactDOM.createRoot(container)
  rootInstance.render(
    <React.StrictMode>
      <AuthApp />
    </React.StrictMode>
  )
}

export function unmountReactApp() {
  if (rootInstance) {
    try {
      rootInstance.unmount()
    } catch (e) {
      console.warn('Failed to unmount root:', e)
    }
    rootInstance = null
  }
}

const standaloneRoot = document.getElementById('root')
if (standaloneRoot) {
  mountReactApp(standaloneRoot)
}

;(window as any).ZtblMaintenanceApp = {
  version: '20260617-1745',
  mount: mountReactApp,
  unmount: unmountReactApp
}
