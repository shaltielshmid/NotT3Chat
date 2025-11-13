import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Paper,
  TextField,
  Typography,
  Alert,
  Divider,
} from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { useAuth } from '../contexts/AuthContext';
import './LoginPage.css';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const useGoogleAuth = import.meta.env.VITE_USE_GOOGLE_AUTH === 'true';
  const useIdentityAuth = import.meta.env.VITE_USE_IDENTITY_AUTH === 'true';
  const appTitle = import.meta.env.VITE_APP_TITLE || 'NotT3Chat';
  const appSlogan = import.meta.env.VITE_APP_SLOGAN || 'Your AI Chat Companion';

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      const result = await login(email, password);

      if (result.success) {
        navigate('/chat');
      } else {
        setError(result.error);
      }

      setLoading(false);
    },
    [email, password, login, navigate]
  );

  return (
    <div className="login-page">
      <div className="background-decoration">
        <div className="circle circle-1"></div>
        <div className="circle circle-2"></div>
        <div className="circle circle-3"></div>
      </div>
      <Container component="main" maxWidth="xs">
        <Box className="main-container">
          <Box className="brand-header">
            <Box className="brand-icon-wrapper">
              <ChatBubbleOutlineIcon className="brand-icon" />
            </Box>
            <Typography component="h1" variant="h3" className="brand-title">
              {appTitle}
            </Typography>
            <Typography variant="body1" className="brand-subtitle">
              {appSlogan}
            </Typography>
          </Box>
          <Paper elevation={6} className="login-paper">
            <Typography component="h2" variant="h5" align="center" gutterBottom className="login-title">
              Welcome Back
            </Typography>

            {error && (
              <Alert severity="error" className="error-alert">
                {error}
              </Alert>
            )}

            <Box
              component="form"
              onSubmit={handleSubmit}
              className="login-form"
            >
              {useIdentityAuth && (
                <>
                  <TextField
                    margin="normal"
                    required
                    fullWidth
                    id="email"
                    label="Email"
                    name="email"
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <TextField
                    margin="normal"
                    required
                    fullWidth
                    name="password"
                    label="Password"
                    type="password"
                    id="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <Button
                    type="submit"
                    fullWidth
                    variant="contained"
                    className="submit-button"
                    disabled={loading}
                  >
                    {loading ? 'Signing In...' : 'Sign In'}
                  </Button>
                </>
              )}

              {useIdentityAuth && useGoogleAuth && (
                <Divider className="divider">
                  <Typography variant="body2" color="text.secondary">
                    OR
                  </Typography>
                </Divider>
              )}

              {useGoogleAuth && (
                <Button
                  fullWidth
                  variant="outlined"
                  className="google-button"
                  startIcon={<GoogleIcon />}
                  onClick={loginWithGoogle}
                  disabled={loading}
                >
                  Continue with Google
                </Button>
              )}
              
              {useIdentityAuth && (
                <Box className="account-link-container">
                  <Typography variant="body2">
                    Don&apos;t have an account?{' '}
                    <Button
                      component={Link}
                      to="/register"
                      color="primary"
                      size="small"
                      className="account-link"
                    >
                      Register here
                    </Button>
                  </Typography>
                </Box>
              )}
            </Box>
          </Paper>
        </Box>
      </Container>
    </div>
  );
};

export default LoginPage;
