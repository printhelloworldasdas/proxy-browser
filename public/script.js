function navigate() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) {
    alert('Por favor, ingresa una URL válida');
    return;
  }
  const encoded = encodeURIComponent(url);
  const proxyUrl = `/api/proxy?url=${encoded}`;

  // Abrir en nueva pestaña
  window.open(proxyUrl, '_blank');
}
