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
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ChatProvider } from './contexts/ChatContext';
import { ModelsProvider } from './contexts/ModelsContext';
import { SignalRProvider } from './contexts/SignalRContext';
import LoginPage from './components/LoginPage';
import ChatRoom from './components/ChatRoom';
import ProtectedRoute from './components/ProtectedRoute';
import RegisterPage from './components/RegisterPage';
import { setNavigate } from './services/navigationService';

// Get custom font URL from environment
const customFontUrl = import.meta.env.VITE_CUSTOM_FONT_URL;
const customFontFamily = import.meta.env.VITE_CUSTOM_FONT_FAMILY || 'Inter';

const theme = createTheme({
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
    fontFamily: `"${customFontFamily}", "Inter", "Roboto", "Helvetica", "Arial", sans-serif`,
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
  // Load custom font if URL is provided
  useEffect(() => {
    if (customFontUrl) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = customFontUrl;
      document.head.appendChild(link);
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
