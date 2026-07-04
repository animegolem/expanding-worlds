const statusEl = document.getElementById('status')

void window.ew.project.ping().then((response) => {
  if (statusEl) statusEl.textContent = JSON.stringify(response)
})
