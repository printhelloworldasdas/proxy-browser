function navigate() {
  const url = document.getElementById('urlInput').value;
  const encoded = encodeURIComponent(url);
  document.getElementById('viewer').src = `/api/proxy?url=${encoded}`;
}
