import logo from '../assets/logo.png';
import './Login.css'
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleGoogleSignIn = () => {
    // Placeholder for Google OAuth integration.
    console.log('Google login initiated');
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleSignIn = (e) => {
    e.preventDefault();
    let isValid = true;

    if (!email.trim()) {
      setEmailError('Email/Username is required');
      isValid = false;
    } else {
      setEmailError('');
    }

    if (!password.trim()) {
      setPasswordError('Password is required');
      isValid = false;
    } else {
      setPasswordError('');
    }

    if (isValid) {
      const userData = { name: email, email: email };
      localStorage.setItem('wst_user', JSON.stringify(userData));
      navigate('/dashboard', { replace: true });
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo: renders when src/assets/logo.png is present, gracefully skipped otherwise. */}
        {logo && (
          <img
            src={logo}
            alt="Web Schedule Topper"
            className="login-logo"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        )}

        <h1 className="login-title">Web Schedule Topper</h1>
        <p className="login-subtitle">Welcome Back</p>

        <button
          type="button"
          className="btn-google"
          onClick={handleGoogleSignIn}
          aria-label="Login with Google"
        >
        <svg xmlns="http://w3.org" viewBox="0 0 24 24" width="24" height="24">
          <path fill="#4285F4" d="M23.745 12.27c-.079-.834-.161-1.438-.288-2.107H12v4.573h6.56c-.33 1.758-1.928 4.398-6.56 4.398-3.961 0-7.21-3.265-7.21-7.284s3.249-7.284 7.21-7.284c2.256 0 3.768.966 4.632 1.793l3.615-3.564C17.919 1.954 15.26 1 12 1 5.925 1 1 5.925 1 12s4.925 11 11 11c6.335 0 10.5-4.444 10.5-10.67 0-.708-.074-1.248-.255-1.06z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
                
          <span>Login with Google</span>
        </button>

        <div className="divider">
          <span className="divider-line" />
          <span className="divider-text">or</span>
          <span className="divider-line" />
        </div>

        <form onSubmit={handleSignIn} className="login-form" noValidate>
          <div className="field">
            <label className="field-label">Email/Username</label>
            <div className="input-wrapper">
              <input
                type="text"
                placeholder="Email / Username"
                className="field-input"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError('');
                }}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
            {emailError && <p className="error-message">{emailError}</p>}
          </div>
          <div className="field">
            <label className="field-label">Password</label>
            <div className="input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                className="field-input"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError('');
                }}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={togglePasswordVisibility}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff size={18} strokeWidth={2.5} />
                ) : (
                  <Eye size={18} strokeWidth={2.5} />
                )}
              </button>
            </div>
            {passwordError && <p className="error-message">{passwordError}</p>}
          </div>
          <div className="forgot-wrapper">
            <a href="#" className="forgot-link" onClick={(e) => e.preventDefault()}>
              Forgot Password?
            </a>
          </div>
          <button type="submit" className="btn-signin">
            Sign In
          </button>
        </form>

        <p className="footer-text">
          Don't have an account?{' '}
          <a href="#" className="signup-link" onClick={(e) => e.preventDefault()}>
            Sign Up
          </a>
        </p>
      </div>
    </div>
  );
}