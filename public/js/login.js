let mode = 'login';

const form = document.getElementById('authForm');
const errorBox = document.getElementById('errorBox');
const noteBox = document.getElementById('noteBox');
const submitBtn = document.getElementById('submitBtn');
const switchBtn = document.getElementById('switchBtn');
const switchPrompt = document.getElementById('switchPrompt');
const formTitle = document.getElementById('formTitle');
const formSub = document.getElementById('formSub');
const passwordInput = document.getElementById('password');

function showError(msg) {
  noteBox.classList.remove('show');
  errorBox.textContent = msg;
  errorBox.classList.add('show');
}

function clearMessages() {
  errorBox.classList.remove('show');
  noteBox.classList.remove('show');
}

switchBtn.addEventListener('click', () => {
  mode = mode === 'login' ? 'register' : 'login';
  clearMessages();
  if (mode === 'register') {
    formTitle.textContent = 'Create your space';
    formSub.textContent = 'Pick a username and password. Your own background, clock, timer, and to-do list will be waiting.';
    submitBtn.textContent = 'Create account';
    switchPrompt.textContent = 'Already have an account?';
    switchBtn.textContent = 'Sign in instead';
    passwordInput.setAttribute('autocomplete', 'new-password');
  } else {
    formTitle.textContent = 'Welcome back';
    formSub.textContent = "Sign in to reach your clock, timer, to-do list, and today's updates.";
    submitBtn.textContent = 'Sign in';
    switchPrompt.textContent = 'New here?';
    switchBtn.textContent = 'Create an account';
    passwordInput.setAttribute('autocomplete', 'current-password');
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessages();

  const username = document.getElementById('username').value.trim();
  const password = passwordInput.value;

  submitBtn.disabled = true;
  submitBtn.textContent = mode === 'login' ? 'Signing in…' : 'Creating account…';

  try {
    const resp = await fetch(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      showError(data.error || 'Something went wrong.');
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'login' ? 'Sign in' : 'Create account';
      return;
    }

    window.location.href = '/dashboard';
  } catch (err) {
    showError('Could not reach the server. Please try again.');
    submitBtn.disabled = false;
    submitBtn.textContent = mode === 'login' ? 'Sign in' : 'Create account';
  }
});
