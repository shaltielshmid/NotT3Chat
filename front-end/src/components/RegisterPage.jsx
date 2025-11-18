import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Paper,
  TextField,
  Typography,
  Alert,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import './RegisterPage.css';

const RegisterPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/chat');
    }
  }, [isAuthenticated, navigate]);

  // Check if passwords match whenever either password field changes
  const passwordsMatch = useMemo(
    () => !confirmPassword || password === confirmPassword,
    [password, confirmPassword]
  );

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();

      // Client-side validation
      if (!email || !password || !confirmPassword) {
        setError('All fields are required');
        return;
      }

      if (!passwordsMatch) {
        setError('Passwords do not match');
        return;
      }

      setError('');
      setLoading(true);

      const result = await register(email, password);

      if (result.success) {
        navigate('/chat');
      } else {
        setError(result.error);
      }

      setLoading(false);
    },
    [email, password, confirmPassword, passwordsMatch, register, navigate]
  );

  return (
    <div className="register-page">
      <Container component="main" maxWidth="xs">
        <Box className="main-container">
          <Paper elevation={3} className="register-paper">
            <Typography component="h1" variant="h4" align="center" gutterBottom>
              Register
            </Typography>

            {error && (
              <Alert severity="error" className="error-alert">
                {error}
              </Alert>
            )}

            <Box
              component="form"
              onSubmit={handleSubmit}
              className="register-form"
            >
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
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <TextField
                margin="normal"
                required
                fullWidth
                name="confirmPassword"
                label="Confirm Password"
                type="password"
                id="confirmPassword"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={!passwordsMatch}
                helperText={!passwordsMatch ? "Passwords don't match" : ''}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                className="submit-button"
                disabled={loading || !passwordsMatch}
              >
                {loading ? 'Registering...' : 'Register'}
              </Button>

              <Box className="account-link-container">
                <Typography variant="body2">
                  Already have an account?{' '}
                  <Button
                    component={Link}
                    to="/login"
                    color="primary"
                    size="small"
                    className="account-link"
                  >
                    Login here
                  </Button>
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Box>
      </Container>
    </div>
  );
};

export default RegisterPage;
