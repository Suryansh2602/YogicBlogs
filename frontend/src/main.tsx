import '@fontsource-variable/fraunces';
import '@fontsource-variable/dm-sans';
import '@fontsource/tiro-devanagari-hindi/devanagari-400.css';
import { installGlobalErrorHandlers } from './services/errorReporting';
import { startApp } from './startApp';
import './styles/global.css';

// The global error handler: errors nothing else caught are reported, never lost (services/errorReporting.ts).
installGlobalErrorHandlers();

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing the #root element');

void startApp(container);
