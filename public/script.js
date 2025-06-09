function navigate() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) {
    alert('Por favor, ingresa una URL válida');
    return;
  }
  const encoded = encodeURIComponent(url);
  document.getElementById('viewer').src = `/api/proxy?url=${encoded}`;
}
