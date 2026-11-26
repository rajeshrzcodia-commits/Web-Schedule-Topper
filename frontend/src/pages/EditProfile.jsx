import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { User, Mail, Lock, Key, Save, ArrowLeft } from 'lucide-react';
import './EditProfile.css';

export default function EditProfile() {
  const { user } = useOutletContext();
  const { updateProfile, loading: profileLoading } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState((user && user.name) || '');
  const email = user?.email || '';
  const isGoogleOnly = user?.authProvider === 'google' && !user?.hasPassword;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (user) {
      setFullName(user.name || '');
    }
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError('');
    setSaved(false);

    const updates = {};
    if (fullName.trim()) updates.name = fullName.trim();

    // Only attempt password change if newPassword is provided.
    if (newPassword) {
      if (!currentPassword) {
        setSaveError('Current password is required to change password.');
        return;
      }
      if (newPassword.length < 6) {
        setSaveError('New password must be at least 6 characters.');
        return;
      }
      updates.currentPassword = currentPassword;
      updates.newPassword = newPassword;
    }

    try {
      const data = await updateProfile(updates);
      setFullName(data.user.name || '');
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      setSaveError(err.message || 'Failed to save changes.');
    }
  };

  const handleCancel = () => {
    navigate('/dashboard');
  };

  return (
    <div className="edit-profile">
      <div className="edit-profile-page-header">
        <button type="button" className="edit-profile-btn-back" onClick={handleCancel}>
          <ArrowLeft size={16} strokeWidth={2} /> Back to Dashboard
        </button>

      </div>

      <div className="edit-profile-profile-form">
        <form onSubmit={handleSave} className="edit-profile-form" noValidate>
          <div className="edit-profile-field">
            <label className="edit-profile-field-label">Full Name</label>
            <div className="edit-profile-input-wrapper">
              <span className="edit-profile-input-addon"><User size={16} strokeWidth={1.8} /></span>
              <input
                type="text"
                placeholder="John Doe"
                className="edit-profile-field-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          </div>

          <div className="edit-profile-field">
            <label className="edit-profile-field-label">Email Address</label>
            <div className="edit-profile-input-wrapper">
              <span className="edit-profile-input-addon"><Mail size={16} strokeWidth={1.8} /></span>
              <input
                type="email"
                placeholder="john.doe@example.com"
                className="edit-profile-field-input"
                value={email}
                readOnly
                aria-readonly="true"
              />
            </div>
          </div>

          {!isGoogleOnly && (
            <>
              <div className="edit-profile-field">
                <label className="edit-profile-field-label">Current Password</label>
                <div className="edit-profile-input-wrapper">
                  <span className="edit-profile-input-addon"><Lock size={16} strokeWidth={1.8} /></span>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="edit-profile-field-input"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="edit-profile-field">
                <label className="edit-profile-field-label">New Password</label>
                <div className="edit-profile-input-wrapper">
                  <span className="edit-profile-input-addon"><Key size={16} strokeWidth={1.8} /></span>
                  <input
                    type="password"
                    placeholder="••••••••"
                    className="edit-profile-field-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {saved && (
            <p className="edit-profile-success-message">Changes saved successfully.</p>
          )}
          {saveError && (
            <p className="edit-profile-error-message">{saveError}</p>
          )}

          <div className="edit-profile-form-actions">
            <button type="button" className="edit-profile-btn-cancel" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="edit-profile-btn-save" disabled={profileLoading}>
              {profileLoading ? 'Saving...' : <><Save size={16} strokeWidth={2} /> Save Changes</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
