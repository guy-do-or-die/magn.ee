import React from 'react';
import ReactDOM from 'react-dom/client';
import { Settings } from './features/Settings';
import './global.css';

const rootElement = document.getElementById('settings-root');
if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
        <React.StrictMode>
            <Settings />
        </React.StrictMode>
    );
}
