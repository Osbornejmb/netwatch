import React from 'react'
import ReactDOM from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './styles.css'
import './dialogs.css'
import Access from './Access.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Access />
  </React.StrictMode>,
)
