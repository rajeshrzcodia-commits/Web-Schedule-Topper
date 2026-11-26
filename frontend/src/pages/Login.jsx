import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/mainlogo.png';
import './Auth.css';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, loginWithGoogle, isAuthenticated, loading } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleScriptError, setGoogleScriptError] = useState('');
  const [googleReady, setGoogleReady] = useState(
    () => typeof window !== 'undefined' && Boolean(window.google?.accounts?.id)
  );
  const googleInitialized = useRef(false);
  const next = new URLSearchParams(location.search).get('next');

  useEffect(() => {
    if (isAuthenticated) navigate(next || '/dashboard', { replace: true });
  }, [isAuthenticated, navigate, next]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get('mode') === 'register') setMode('register');
  }, [location.search]);

  useEffect(() => {
    const script = document.getElementById('google-identity-services');
    const updateReady = () => setGoogleReady(Boolean(window.google?.accounts?.id));
    const onError = () => {
      setGoogleReady(false);
      setGoogleScriptError('Google Sign-In could not load. Check your connection and try again.');
    };
    script?.addEventListener('load', updateReady);
    script?.addEventListener('error', onError);
    updateReady();
    return () => {
      script?.removeEventListener('load', updateReady);
      script?.removeEventListener('error', onError);
    };
  }, []);

  const clearErrors = () => {
    setErrors({});
    setSubmitError('');
  };

  const handleSignIn = async (event) => {
    event.preventDefault();
    clearErrors();
    const nextErrors = {};
    if (!email.trim()) nextErrors.email = 'Email/Username is required';
    if (!password) nextErrors.password = 'Password is required';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(next || '/dashboard', { replace: true });
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : 'Sign in failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    clearErrors();
    const nextErrors = {};
    if (!name.trim()) nextErrors.name = 'Full name is required';
    if (!email.trim()) nextErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = 'Invalid email address';
    if (!password) nextErrors.password = 'Password is required';
    else if (password.length < 6) nextErrors.password = 'Password must be at least 6 characters';
    if (!confirmPassword) nextErrors.confirmPassword = 'Please confirm your password';
    else if (confirmPassword !== password) nextErrors.confirmPassword = 'Passwords do not match';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setIsSubmitting(true);
    try {
      await register({ name: name.trim(), email: email.trim(), password });
      navigate(next || '/dashboard', { replace: true });
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleCredential = useCallback(async (credential) => {
    if (!credential) {
      setSubmitError('Google did not return a sign-in credential. Please try again.');
      return;
    }
    setGoogleLoading(true);
    setSubmitError('');
    try {
      await loginWithGoogle(credential);
      navigate(next || '/dashboard', { replace: true });
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }, [loginWithGoogle, navigate, next]);

  const handleGoogleSignIn = () => {
    if (!googleLoading && window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    }
  };

  useEffect(() => {
    if (!googleReady || !import.meta.env.VITE_GOOGLE_CLIENT_ID || googleInitialized.current) return;
    try {
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: (response) => handleGoogleCredential(response?.credential),
      });
      googleInitialized.current = true;
    } catch (error) {
      setGoogleScriptError(error instanceof Error ? error.message : 'Google Sign-In could not be initialized.');
    }
  }, [googleReady, handleGoogleCredential]);

  const googleConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID && googleReady);

  return (
    <main className="login-page auth-page">
      <section className="login-card auth-card" aria-labelledby="login-title">
        {loading ? <div className="auth-loading">Loading...</div> : <>
          {logo && <img src={logo} alt="Web Schedule Topper" className="login-logo auth-logo" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
          <h1 id="login-title" className="login-title auth-title">Web Schedule Topper</h1>
          <p className="login-subtitle auth-subtitle">{mode === 'signin' ? 'Welcome Back' : 'Create your account'}</p>

          {submitError && <div className="auth-error-banner" role="alert">{submitError}</div>}

          {mode === 'signin' && <>
            {googleScriptError ? <p className="auth-google-note" role="status">{googleScriptError}</p>
              : googleConfigured ? (
                <button type="button" className="google-signin-btn auth-google-signin-btn" onClick={handleGoogleSignIn} disabled={googleLoading}>
                  <span className="google-icon auth-google-icon">
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-9.82z"/>
                    <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"/>
                    <path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"/>
                    <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0 7.565 0 3.515 2.7 1.545 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/>
                  </svg>
                  </span>
                  <span className="google-text auth-google-text">Sign in with Google</span>
                </button>
              )
                : <p className="auth-google-note">{import.meta.env.VITE_GOOGLE_CLIENT_ID ? 'Loading Google Identity Services…' : 'Google Sign-In is not configured.'}</p>}
            {googleLoading && <p className="auth-google-note" role="status">Signing in with Google…</p>}
            <div className="divider auth-divider"><span className="divider-line auth-divider-line" /><span className="divider-text auth-divider-text">or</span><span className="divider-line auth-divider-line" /></div>
          </>}

          {mode === 'signin' ? (
            <form onSubmit={handleSignIn} className="login-form auth-form" noValidate>
              <div className="field auth-field">
                <label className="field-label auth-field-label" htmlFor="login-email">Email/Username</label>
                <div className="input-wrapper auth-input-wrapper"><input id="login-email" type="email" placeholder="Email / Username" className={`field-input auth-field-input ${errors.email ? 'auth-field-input-error' : ''}`} value={email} onChange={(event) => { setEmail(event.target.value); if (errors.email) setErrors({ ...errors, email: '' }); }} autoComplete="email" autoCapitalize="none" spellCheck={false} /></div>
                {errors.email && <p className="error-message auth-field-error">{errors.email}</p>}
              </div>
              <div className="field auth-field">
                <label className="field-label auth-field-label" htmlFor="login-password">Password</label>
                <div className="input-wrapper auth-input-wrapper"><input id="login-password" type={showPassword ? 'text' : 'password'} placeholder="Password" className={`field-input auth-field-input ${errors.password ? 'auth-field-input-error' : ''}`} value={password} onChange={(event) => { setPassword(event.target.value); if (errors.password) setErrors({ ...errors, password: '' }); }} autoComplete="current-password" /><button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} strokeWidth={2.5} /> : <Eye size={18} strokeWidth={2.5} />}</button></div>
                {errors.password && <p className="error-message auth-field-error">{errors.password}</p>}
              </div>
              <div className="forgot-wrapper"><a href="#" className="forgot-link" onClick={(event) => event.preventDefault()}>Forgot Password?</a></div>
              <button type="submit" className="btn-signin auth-btn-signin" disabled={isSubmitting}>{isSubmitting ? 'Signing in...' : 'Sign In'}</button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="login-form auth-form" noValidate>
              <div className="field auth-field"><label className="field-label auth-field-label" htmlFor="register-name">Full Name</label><div className="input-wrapper auth-input-wrapper"><input id="register-name" type="text" placeholder="John Doe" className={`field-input auth-field-input ${errors.name ? 'auth-field-input-error' : ''}`} value={name} onChange={(event) => { setName(event.target.value); if (errors.name) setErrors({ ...errors, name: '' }); }} autoComplete="name" /></div>{errors.name && <p className="error-message auth-field-error">{errors.name}</p>}</div>
              <div className="field auth-field"><label className="field-label auth-field-label" htmlFor="register-email">Email Address</label><div className="input-wrapper auth-input-wrapper"><input id="register-email" type="email" placeholder="you@example.com" className={`field-input auth-field-input ${errors.email ? 'auth-field-input-error' : ''}`} value={email} onChange={(event) => { setEmail(event.target.value); if (errors.email) setErrors({ ...errors, email: '' }); }} autoComplete="email" autoCapitalize="none" spellCheck={false} /></div>{errors.email && <p className="error-message auth-field-error">{errors.email}</p>}</div>
              <div className="field auth-field"><label className="field-label auth-field-label" htmlFor="register-password">Password</label><div className="input-wrapper auth-input-wrapper"><input id="register-password" type={showPassword ? 'text' : 'password'} placeholder="Password" className={`field-input auth-field-input ${errors.password ? 'auth-field-input-error' : ''}`} value={password} onChange={(event) => { setPassword(event.target.value); if (errors.password) setErrors({ ...errors, password: '' }); }} autoComplete="new-password" /><button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} strokeWidth={2.5} /> : <Eye size={18} strokeWidth={2.5} />}</button></div>{errors.password && <p className="error-message auth-field-error">{errors.password}</p>}</div>
              <div className="field auth-field"><label className="field-label auth-field-label" htmlFor="register-confirm-password">Confirm Password</label><div className="input-wrapper auth-input-wrapper"><input id="register-confirm-password" type={showConfirmPassword ? 'text' : 'password'} placeholder="Confirm Password" className={`field-input auth-field-input ${errors.confirmPassword ? 'auth-field-input-error' : ''}`} value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' }); }} autoComplete="new-password" /><button type="button" className="password-toggle" onClick={() => setShowConfirmPassword(!showConfirmPassword)} aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>{showConfirmPassword ? <EyeOff size={18} strokeWidth={2.5} /> : <Eye size={18} strokeWidth={2.5} />}</button></div>{errors.confirmPassword && <p className="error-message auth-field-error">{errors.confirmPassword}</p>}</div>
              <button type="submit" className="btn-signin auth-btn-signin" disabled={isSubmitting}>{isSubmitting ? 'Creating account...' : 'Create Account'}</button>
            </form>
          )}

          <p className="footer-text auth-footer">{mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}<a href="#" className="signup-link auth-footer-link" onClick={(event) => { event.preventDefault(); setMode(mode === 'signin' ? 'register' : 'signin'); clearErrors(); }}>{mode === 'signin' ? 'Sign Up' : 'Sign In'}</a></p>
        </>}
      </section>
    </main>
  );
}
