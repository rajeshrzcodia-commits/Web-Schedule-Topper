import { useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { User, Mail, Phone, Lock, Key, Save, ArrowLeft } from 'lucide-react';
import './EditProfile.css';

export default function EditProfile() {
  const { user, onUpdateUser } = useOutletContext();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState((user && user.name) || '');
  const [email, setEmail] = useState((user && user.email) || '');
  const [phone, setPhone] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    if (onUpdateUser) {
      onUpdateUser({ ...user, name: fullName, email: email });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
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
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="edit-profile-field">
            <label className="edit-profile-field-label">Phone Number</label>
            <div className="edit-profile-input-wrapper">
              <span className="edit-profile-input-addon"><Phone size={16} strokeWidth={1.8} /></span>
              <input
                type="tel"
                placeholder="+1 (555) 000-0000"
                className="edit-profile-field-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

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

          {saved && (
            <p className="edit-profile-success-message">Changes saved successfully.</p>
          )}

          <div className="edit-profile-form-actions">
            <button type="button" className="edit-profile-btn-cancel" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="edit-profile-btn-save">
              <Save size={16} strokeWidth={2} /> Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}