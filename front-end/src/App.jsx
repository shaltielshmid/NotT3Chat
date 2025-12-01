import React, { useEffect } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import WebFont from 'webfontloader';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ChatProvider } from './contexts/ChatContext';
import { ModelsProvider } from './contexts/ModelsContext';
import { SignalRProvider } from './contexts/SignalRContext';
import LoginPage from './components/LoginPage';
import ChatRoom from './components/ChatRoom';
import ProtectedRoute from './components/ProtectedRoute';
import RegisterPage from './components/RegisterPage';
import { setNavigate } from './services/navigationService';
import { initGA } from './utils/analytics';

// Get custom font URL and family from environment
const customFontUrl = import.meta.env.VITE_CUSTOM_FONT_URL;
const customFontFamily = import.meta.env.VITE_CUSTOM_FONT_FAMILY;
const appTitle = import.meta.env.VITE_APP_TITLE || 'NotT3Chat';
const appIcon = import.meta.env.VITE_APP_ICON;

// Create theme with custom font family if provided
const createAppTheme = () => {
  const fontFamily = customFontFamily
    ? `"${customFontFamily}", "Inter", "Roboto", "Helvetica", "Arial", sans-serif`
    : '"Inter", "Roboto", "Helvetica", "Arial", sans-serif';

  return createTheme({
    palette: {
      mode: 'light',
      primary: {
        main: '#2563eb',
        contrastText: '#ffffff',
      },
      secondary: {
        main: '#7c3aed',
      },
      background: {
        default: '#f8fafc',
        paper: '#ffffff',
      },
      grey: {
        50: '#f8fafc',
        100: '#f1f5f9',
        200: '#e2e8f0',
      },
    },
    typography: {
      fontFamily: fontFamily,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 12,
            },
          },
        },
      },
    },
  });
};

const theme = createAppTheme();

const AppRoutes = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Initialize navigation service with React Router's navigate function
  React.useEffect(() => {
    setNavigate(navigate);
  }, [navigate]);

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/chat" replace /> : <LoginPage />
        }
      />
      <Route
        path="/register"
        element={
          isAuthenticated ? <Navigate to="/chat" replace /> : <RegisterPage />
        }
      />
      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <ModelsProvider>
              <ChatProvider>
                <SignalRProvider>
                  <ChatRoom />
                </SignalRProvider>
              </ChatProvider>
            </ModelsProvider>
          </ProtectedRoute>
        }
      />
      <Route
        path="/chat/:chatId"
        element={
          <ProtectedRoute>
            <ModelsProvider>
              <ChatProvider>
                <SignalRProvider>
                  <ChatRoom />
                </SignalRProvider>
              </ChatProvider>
            </ModelsProvider>
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
};

const App = () => {
  // Initialize Google Analytics
  useEffect(() => {
    initGA();
  }, []);

  // Set document title and favicon
  useEffect(() => {
    // Set page title
    document.title = appTitle;

    // Set favicon if provided
    if (appIcon) {
      const link =
        document.querySelector("link[rel~='icon']") ||
        document.createElement('link');
      link.type = 'image/x-icon';
      link.rel = 'icon';
      link.href = appIcon;
      if (!document.querySelector("link[rel~='icon']")) {
        document.head.appendChild(link);
      }
    }
  }, []);

  // Load custom font
  useEffect(() => {
    if (customFontFamily && customFontUrl) {
      const isFontFile = /\.(woff2?|ttf|otf)$/i.test(customFontUrl);

      if (isFontFile) {
        const style = document.createElement('style');
        const fontFormat = customFontUrl.match(/\.(woff2?|ttf|otf)$/i)?.[1];
        const format =
          fontFormat === 'woff2'
            ? 'woff2'
            : fontFormat === 'woff'
              ? 'woff'
              : fontFormat === 'ttf'
                ? 'truetype'
                : 'opentype';

        style.textContent = `
          @font-face {
            font-family: '${customFontFamily}';
            src: url('${customFontUrl}') format('${format}');
            font-weight: normal;
            font-style: normal;
            font-display: swap;
          }
        `;
        document.head.appendChild(style);

        if (document.fonts && document.fonts.load) {
          document.fonts.load(`16px "${customFontFamily}"`).catch(() => {});
        }
      } else {
        WebFont.load({
          custom: {
            families: [customFontFamily],
            urls: [customFontUrl],
          },
        });
      }
    }
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
