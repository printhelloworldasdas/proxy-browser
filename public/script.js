class ProxyBrowser {
  constructor() {
    this.tabs = [];
    this.currentTabId = null;
    this.initElements();
    this.initEventListeners();
    this.createNewTab('Nueva pestaña', true);
  }

  initElements() {
    this.elements = {
      newTabBtn: document.getElementById('newTab'),
      closeTabBtn: document.getElementById('closeTab'),
      goBackBtn: document.getElementById('goBack'),
      goForwardBtn: document.getElementById('goForward'),
      refreshBtn: document.getElementById('refresh'),
      urlInput: document.getElementById('urlInput'),
      goButton: document.getElementById('goButton'),
      tabsContainer: document.getElementById('tabsContainer'),
      pagesContainer: document.getElementById('pagesContainer'),
      newTabPage: document.getElementById('newTabPage'),
      quickSearch: document.getElementById('quickSearch'),
      quickGo: document.getElementById('quickGo'),
      bookmarksBtn: document.getElementById('bookmarks'),
      settingsBtn: document.getElementById('settings')
    };
  }

  initEventListeners() {
    this.elements.newTabBtn.addEventListener('click', () => this.createNewTab('Nueva pestaña'));
    this.elements.closeTabBtn.addEventListener('click', () => this.closeCurrentTab());
    this.elements.goBackBtn.addEventListener('click', () => this.navigateBack());
    this.elements.goForwardBtn.addEventListener('click', () => this.navigateForward());
    this.elements.refreshBtn.addEventListener('click', () => this.refreshPage());
    this.elements.goButton.addEventListener('click', () => this.navigateToUrl());
    this.elements.urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.navigateToUrl();
    });
    this.elements.quickGo.addEventListener('click', () => this.navigateFromNewTab());
    this.elements.quickSearch.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.navigateFromNewTab();
    });

    // Eventos para los enlaces rápidos
    document.querySelectorAll('.links-grid a').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const url = link.getAttribute('data-url');
        this.navigateTo(url);
      });
    });
  }

  createNewTab(title, isInitial = false) {
    const tabId = Date.now().toString();
    const tab = {
      id: tabId,
      title: title,
      url: '',
      canGoBack: false,
      canGoForward: false,
      favicon: null,
      isNewTab: true
    };

    this.tabs.push(tab);
    this.renderTab(tab);
    this.switchToTab(tabId);

    if (!isInitial) {
      this.elements.newTabPage.classList.remove('hidden');
    }
  }

  renderTab(tab) {
    const tabElement = document.createElement('div');
    tabElement.className = 'tab';
    tabElement.dataset.tabId = tab.id;
    
    const favicon = document.createElement('span');
    favicon.className = 'tab-favicon';
    if (tab.favicon) {
      favicon.innerHTML = `<img src="${tab.favicon}" width="16" height="16">`;
    }
    
    const titleElement = document.createElement('span');
    titleElement.className = 'tab-title';
    titleElement.textContent = tab.title;
    
    const closeBtn = document.createElement('span');
    closeBtn.className = 'tab-close';
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tab.id);
    });
    
    tabElement.appendChild(favicon);
    tabElement.appendChild(titleElement);
    tabElement.appendChild(closeBtn);
    
    tabElement.addEventListener('click', () => this.switchToTab(tab.id));
    
    this.elements.tabsContainer.appendChild(tabElement);
    return tabElement;
  }

  switchToTab(tabId) {
    // Actualizar pestaña anterior
    if (this.currentTabId) {
      const prevTab = this.tabs.find(t => t.id === this.currentTabId);
      if (prevTab) {
        const prevTabElement = document.querySelector(`.tab[data-tab-id="${prevTab.id}"]`);
        if (prevTabElement) prevTabElement.classList.remove('active');
      }
    }

    // Activar nueva pestaña
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;

    this.currentTabId = tabId;
    const tabElement = document.querySelector(`.tab[data-tab-id="${tab.id}"]`);
    if (tabElement) tabElement.classList.add('active');

    // Actualizar controles de navegación
    this.elements.goBackBtn.disabled = !tab.canGoBack;
    this.elements.goForwardBtn.disabled = !tab.canGoForward;

    // Actualizar barra de URL
    this.elements.urlInput.value = tab.url || '';

    // Mostrar la página correcta
    if (tab.isNewTab) {
      this.elements.newTabPage.classList.remove('hidden');
    } else {
      this.elements.newTabPage.classList.add('hidden');
    }
  }

  closeTab(tabId) {
    if (this.tabs.length <= 1) {
      alert("No puedes cerrar la última pestaña");
      return;
    }

    const tabIndex = this.tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    // Eliminar pestaña
    this.tabs.splice(tabIndex, 1);
    const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
    if (tabElement) tabElement.remove();

    // Cambiar a otra pestaña si cerramos la actual
    if (tabId === this.currentTabId) {
      const newTabToSelect = this.tabs[Math.max(0, tabIndex - 1)];
      this.switchToTab(newTabToSelect.id);
    }
  }

  closeCurrentTab() {
    if (this.currentTabId) {
      this.closeTab(this.currentTabId);
    }
  }

  navigateTo(url) {
    if (!url) return;

    // Añadir https:// si no está presente
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      // Verificar si es una búsqueda
      if (url.includes(' ') || !url.includes('.')) {
        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
      } else {
        url = `https://${url}`;
      }
    }

    const tab = this.tabs.find(t => t.id === this.currentTabId);
    if (!tab) return;

    tab.url = url;
    tab.isNewTab = false;
    this.elements.urlInput.value = url;
    this.elements.newTabPage.classList.add('hidden');

    // Actualizar título de la pestaña
    const tabElement = document.querySelector(`.tab[data-tab-id="${tab.id}"]`);
    if (tabElement) {
      const titleElement = tabElement.querySelector('.tab-title');
      if (titleElement) {
        titleElement.textContent = new URL(url).hostname.replace('www.', '');
      }
    }

    // Crear iframe si no existe
    let iframe = document.querySelector(`.page[data-tab-id="${tab.id}"] iframe`);
    if (!iframe) {
      const pageDiv = document.createElement('div');
      pageDiv.className = 'page';
      pageDiv.dataset.tabId = tab.id;
      
      iframe = document.createElement('iframe');
      pageDiv.appendChild(iframe);
      this.elements.pagesContainer.appendChild(pageDiv);
    }

    // Cargar URL a través del proxy
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
    iframe.src = proxyUrl;

    // Mostrar la página
    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active');
    });
    document.querySelector(`.page[data-tab-id="${tab.id}"]`).classList.add('active');
  }

  navigateToUrl() {
    const url = this.elements.urlInput.value.trim();
    this.navigateTo(url);
  }

  navigateFromNewTab() {
    const query = this.elements.quickSearch.value.trim();
    this.navigateTo(query);
  }

  navigateBack() {
    // Implementación básica - en un navegador real usaríamos el historial
    const tab = this.tabs.find(t => t.id === this.currentTabId);
    if (tab && tab.canGoBack) {
      // Lógica para ir atrás
    }
  }

  navigateForward() {
    // Implementación básica - en un navegador real usaríamos el historial
    const tab = this.tabs.find(t => t.id === this.currentTabId);
    if (tab && tab.canGoForward) {
      // Lógica para ir adelante
    }
  }

  refreshPage() {
    const tab = this.tabs.find(t => t.id === this.currentTabId);
    if (tab && tab.url) {
      this.navigateTo(tab.url);
    }
  }
}

// Inicializar el navegador cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  new ProxyBrowser();
});
